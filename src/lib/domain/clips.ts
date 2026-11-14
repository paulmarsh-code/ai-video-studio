// Clips from Kling Elements (D113), worked back from what Kling needs (Paul). A scene's panels are
// grouped into multi-shot clips; each clip's request binds the characters, the venue and the fixed
// props as Kling Elements (their one look, kept the same in every clip) and says, from the plan:
// who stands where, each shot in turn with its time and size, what happens, the one speaker's exact
// line, and the voices. The first such clip (D112) held characters, table and venue across three
// shots with no start frame and no retake.

import type { CastMember, GeometryPlanData, PlanCamera, ShotSpec } from "./types";
import { planForShot, pictureXY } from "./geometry";
import { sceneAnchor } from "./director";
import { isSetPiece } from "./setRender";

export interface KlingElement { id: string; name: string }
/** Elements by what they stand for: "char:<slug>", "venue:<id>", "prop:<name in lower case>". */
export type KlingElements = Record<string, KlingElement>;

export const elementKey = {
  character: (slug: string) => `char:${slug}`,
  venue: (id: string) => `venue:${id}`,
  prop: (name: string) => `prop:${name.trim().toLowerCase()}`,
};

export interface ClipPanel {
  order: number;
  durationSec: number;
  description: string;
  emotion?: string;
  dialogue: { characterId: string; text: string }[];
  spec: ShotSpec;
}

export interface ClipInput {
  panels: ClipPanel[];
  cast: CastMember[];
  plan: GeometryPlanData;
  venue: { id: string; name: string };
  crowd?: string;
  elements: KlingElements;
  /** The panel whose camera sets everyone's places for every clip: the scene's widest (most people). */
  master?: ClipPanel;
  /** Credits a second at the chosen quality (Kling 4.0 at 720p with sound: 10, D112). */
  creditsPerSecond?: number;
}

export interface Clip {
  panels: number[];
  seconds: number;
  /** For the API and for Claude: elements as <<<id>>>. */
  prompt: string;
  /** For the Kling web app: elements as @Name, picked from your Elements. */
  webPrompt: string;
  elements: { key: string; id: string; name: string; what: string }[];
  /** What the clip shows that has no Element yet: drawn from words, so it may not match. */
  missing: string[];
  credits: number;
}

/** Kling Omni-Ref takes up to this many Elements in one clip. */
export const MAX_ELEMENTS = 7;
/** A clip runs at most this long here, and at most this many shots, so each shot keeps its time. */
export const CLIP_MAX_SEC = 15;
export const CLIP_MAX_SHOTS = 4;

/** Consecutive panels in clips of up to 15 s and 4 shots; a panel longer than that is a clip alone. */
export function groupClips(panels: ClipPanel[], maxSec = CLIP_MAX_SEC, maxShots = CLIP_MAX_SHOTS): ClipPanel[][] {
  const out: ClipPanel[][] = [];
  let cur: ClipPanel[] = [], sec = 0;
  for (const p of [...panels].sort((a, b) => a.order - b.order)) {
    const d = Math.max(1, p.durationSec);
    if (cur.length && (sec + d > maxSec || cur.length >= maxShots)) { out.push(cur); cur = []; sec = 0; }
    cur.push(p); sec += d;
  }
  if (cur.length) out.push(cur);
  return out;
}

const first = (name: string) => name.split(/\s+/)[0];

/** The request for one clip. */
export function clipPrompt(panels: ClipPanel[], i: ClipInput): Clip {
  const nameOf = (id: string) => i.cast.find((c) => c.id === id)?.name ?? id;
  const inClip = [...new Set(panels.flatMap((p) => [...p.spec.visibleIds, ...p.dialogue.map((d) => d.characterId)]))].filter((id) => i.cast.some((c) => c.id === id));
  const pieces = (i.plan.furniture ?? []).filter((f) => isSetPiece(f));
  const held = [...new Set(panels.flatMap((p) => (p.spec.props ?? []).map((x) => x.name)))].filter((n) => !pieces.some((f) => f.name === n));

  // The Elements this clip uses, characters first, then the venue, then the props, up to Kling's 7.
  const wanted: { key: string; what: string; label: string }[] = [
    ...inClip.map((id) => ({ key: elementKey.character(id), what: nameOf(id), label: first(nameOf(id)) })),
    { key: elementKey.venue(i.venue.id), what: i.venue.name, label: "the venue" },
    ...pieces.map((f) => ({ key: elementKey.prop(f.name), what: f.name, label: `the ${f.name}` })),
    ...held.map((n) => ({ key: elementKey.prop(n), what: n, label: `the ${n}` })),
  ];
  const used: Clip["elements"] = [];
  const missing: string[] = [];
  for (const w of wanted) {
    const e = i.elements[w.key];
    if (e?.id && used.length < MAX_ELEMENTS) used.push({ key: w.key, id: e.id, name: e.name, what: w.what });
    else missing.push(w.what);
  }
  const api = (key: string, plain: string) => { const e = used.find((u) => u.key === key); return e ? `<<<${e.id}>>>` : plain; };
  const web = (key: string, plain: string) => { const e = used.find((u) => u.key === key); return e ? `@${e.name}` : plain; };

  const build = (ref: (key: string, plain: string) => string) => {
    const who = (id: string) => ref(elementKey.character(id), first(nameOf(id)));
    const L: string[] = [];
    const venue = ref(elementKey.venue(i.venue.id), i.venue.name);
    L.push(`In ${venue}${i.crowd ? `: ${i.crowd.replace(/\.$/, "")}` : ""}.`);
    // Who is who, once: the prompt can then use plain names.
    const chars = inClip.filter((id) => used.some((u) => u.key === elementKey.character(id)));
    if (chars.length) L.push(`${chars.map((id) => `${first(nameOf(id))} is ${who(id)}`).join("; ")}.`);
    const a0 = sceneAnchor(i.plan);
    const anchor = a0 && a0.what.startsWith("the ") && a0.what !== "the middle of the group" ? { name: a0.what.slice(4) } : undefined;
    // A prop with an Element is its Element's look alone: its words ("2 tumbler candles") could
    // disagree with the picture (three), as they did on the storyboard (D108).
    for (const f of pieces) {
      const has = used.some((u) => u.key === elementKey.prop(f.name));
      L.push(`${anchor && anchor.name === f.name ? "In the middle of the group stands" : "On the floor stands"} ${ref(elementKey.prop(f.name), `the ${f.name}`)}${!has && f.detail ? ` (${f.detail})` : ""}.`);
    }
    // Their places, the same in every clip of the scene: left to right as the scene's main view
    // (its widest panel) sees them on the floor plan. Each clip's own first camera gave a different
    // order from clip to clip.
    const order = leftToRight(i.master ?? panels[0], i.plan, inClip);
    if (order.length > 1) L.push(`Their places${anchor ? ` around the ${anchor.name}` : ""}, left to right as seen from the room: ${order.map((id) => first(nameOf(id))).join(", ")}. Anyone arriving takes their place there; nobody changes places.`);
    // Each line said once, in its own shot (D115): with two lines for Jade in shots 3 and 4, Kling
    // had her say the first one twice and never the second.
    const lines = panels.flatMap((p) => p.dialogue);
    let lineNo = 0;
    let t = 0;
    panels.forEach((p, k) => {
      const d = Math.max(1, p.durationSec);
      const words = shotWords(p, i.plan, (id) => first(nameOf(id)));
      const speech = p.dialogue.length
        ? p.dialogue.map((x) => `${lines.length > 1 ? `Line ${++lineNo}, ` : ""}${first(nameOf(x.characterId))} says: "${x.text.trim()}"`).join(" Then ")
        : "No one speaks.";
      // On the way in (D115): someone arriving or crossing hasn't reached the group yet, so the
      // group is ahead of them. Kling had Jade walk past them, then turn back to greet them.
      const onTheWay = Object.entries(p.spec.at ?? {}).filter(([, m]) => /^(?:arriving|crossing|approaching)$/.test(m)).map(([id]) => id).filter((id) => inClip.includes(id));
      const way = onTheWay.map((id) => `${first(nameOf(id))} has not reached ${anchor ? `the ${anchor.name}` : "the others"} yet: ${anchor ? "it is" : "they are"} ahead of ${first(nameOf(id))}, further into the room, and ${first(nameOf(id))} walks towards ${anchor ? "it" : "them"}, never past.`).join(" ");
      L.push(`Shot ${k + 1} (${t}–${t + d} s)${words ? `, ${words}` : ""}: ${p.description.trim().replace(/\.$/, "")}${p.emotion ? ` (${p.emotion.trim().replace(/\.$/, "")})` : ""}.${way ? ` ${way}` : ""} ${speech}`);
      t += d;
    });
    const speakers = [...new Set(panels.flatMap((p) => p.dialogue.map((x) => x.characterId)))];
    const voices = speakers.map((id) => { const v = voiceShort(i.cast.find((c) => c.id === id)?.voiceLock ?? ""); return v ? `${first(nameOf(id))}: ${v}` : ""; }).filter(Boolean);
    if (voices.length) L.push(`Voices. ${voices.join(". ")}.`);
    L.push([
      lines.length > 1 ? `Each line is said once, in its own shot, word for word: ${lines.length} different lines in all.` : "",
      "Only the speaker talks in each shot; the others listen with mouths closed.",
      // Sound under the voices (D115): Jade's heels were louder than the party.
      "Sound: the room's low murmur and soft music under the voices; footsteps and movement quiet, never louder than speech.",
      "Each person keeps their own face, clothes and anything they carry throughout.",
      pieces.length ? `${pieces.map((f) => `The ${f.name}`).join(" and ")} and everything on ${pieces.length === 1 ? "it" : "them"} stay exactly the same throughout.` : "",
      "No text, no logos.",
    ].filter(Boolean).join(" "));
    return L.join("\n");
  };
  const seconds = panels.reduce((s, p) => s + Math.max(1, p.durationSec), 0);
  return { panels: panels.map((p) => p.order), seconds, prompt: build(api), webPrompt: build(web), elements: used, missing, credits: seconds * (i.creditsPerSecond ?? 10) };
}

/** The scene's clips. */
export function sceneClips(i: ClipInput): Clip[] {
  const master = i.master ?? [...i.panels].sort((a, b) => b.spec.visibleIds.length - a.spec.visibleIds.length || a.order - b.order)[0];
  return groupClips(i.panels).map((g) => clipPrompt(g, { ...i, master }));
}

function cameraOf(p: ClipPanel, plan: GeometryPlanData): { sp: GeometryPlanData; cam?: PlanCamera } {
  const sp = planForShot(plan, p.spec);
  return { sp, cam: sp.cameras.find((c) => c.id === p.spec.cameraId) };
}

function leftToRight(p: ClipPanel, plan: GeometryPlanData, ids: string[]): string[] {
  const { sp, cam } = cameraOf(p, plan);
  if (!cam) return ids;
  const xs = ids.map((id) => {
    const a = sp.actors.find((x) => x.characterId === id);
    const xy = a ? pictureXY(sp, cam, a.position, 1.5) : null;
    return { id, x: xy ? xy.x : undefined };
  });
  return xs.filter((x) => x.x !== undefined).sort((a, b) => a.x! - b.x!).map((x) => x.id);
}

/** The shot in words: its size, and for an over-the-shoulder, whose shoulder and on whom. */
function shotWords(p: ClipPanel, plan: GeometryPlanData, name: (id: string) => string): string {
  const shot = (p.spec.shot ?? "").trim().replace(/\.$/, "").toLowerCase();
  const subj = p.spec.speakerId ?? p.spec.subjectId;
  if (/over[-\s]the[-\s]shoulder/.test(shot) && subj) {
    const line: string[] = plan.lineOfAction ?? [];
    const other = line.includes(subj) ? line.find((x) => x !== subj) : p.spec.visibleIds.find((x) => x !== subj);
    const size = shot.replace(/,?\s*over[-\s]the[-\s]shoulder( shot)?/, "").trim();
    return `${size ? `${size} ` : ""}over ${other ? `${name(other)}'s` : "the listener's"} shoulder on ${name(subj)}`.trim();
  }
  if (subj && /close-up|close up|medium shot|single/.test(shot) && p.spec.visibleIds.length <= 2) return `${shot} on ${name(subj)}`;
  return shot;
}

/** A voice in a sentence or two (D113): the whole voice lock ran a clip's request past 3,000 characters. */
export function voiceShort(v: string, max = 240): string {
  const sentences = v.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  let out = "";
  for (const x of sentences) { if (out && (out + " " + x).length > max) break; out = out ? `${out} ${x}` : x; }
  return out.replace(/[.!?]$/, "");
}
