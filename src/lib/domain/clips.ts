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
import { actionFloor, spokenSeconds } from "./duration";

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
  /** The panel's storyboard picture, drawn on the fixed set from the floor plan (D119). */
  imageAssetId?: string;
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
  /**
   * The storyboard pictures to add to the job, in this order (D119): picture 1 is shot 1's panel,
   * and so on. Kling stages each shot from its picture; words alone it treats as a suggestion.
   */
  pictures: { shot: number; panel: number; assetId: string }[];
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

/**
 * A shot's time inside a multi-shot clip (D120): only what it needs, never more than its panel.
 * Panels were timed as clips of their own, at least Kling's 3 s each; inside one clip a silent beat
 * needs 2 s and a line its speaking time and half a second. Clip 3 ran 10 s where 8 flowed better.
 */
export function shotSeconds(p: ClipPanel): number {
  const words = p.dialogue.map((d) => d.text).join(" ");
  const talk = words.trim() ? Math.ceil(spokenSeconds(words) + 0.5) : 0;
  const need = Math.max(2, talk, actionFloor(p.description));
  return Math.max(1, Math.min(p.durationSec, need));
}

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

  // The storyboard pictures, one for each shot that has one (D119). Words alone gave Kling the floor
  // plan as a suggestion: clip 3 put Marcus and Nina behind Jade, away from the table.
  // A single-shot clip keeps its panel's time; Kling makes nothing shorter than 3 s.
  const times = panels.length > 1 ? panels.map(shotSeconds) : panels.map((p) => Math.max(1, p.durationSec));
  while (times.reduce((a, b) => a + b, 0) < 3) times[times.length - 1]++;
  const pictures = panels.flatMap((p, k) => p.imageAssetId ? [{ shot: k + 1, panel: p.order, assetId: p.imageAssetId }] : []);
  const build = (ref: (key: string, plain: string) => string, pic: (n: number) => string) => {
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
    // Round the table, one small circle (D118): a left-to-right line beside "face each other across
    // the table" read as a row, and Kling stood Marcus and Nina behind Jade, away from the table.
    const ring = anchor && a0 ? roundOrder(i.plan, a0.at, order) : [];
    const gap = anchor && a0 && ring.length > 2 ? openSide(i.plan, a0.at, ring) : undefined;
    const names = (ids: string[]) => ids.map((id) => first(nameOf(id)));
    const and = (xs: string[]) => xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs.join("");
    if (anchor && ring.length > 2) L.push(`${and(names(ring))} stand together in one small circle round the ${anchor.name}, each close enough to rest a hand on it, in this order going round it: ${names(ring).join(", ")}${gap ? `; the side of the ${anchor.name} between ${first(nameOf(gap[0]))} and ${first(nameOf(gap[1]))} is open, nobody stands there` : ""}. Anyone arriving takes their place in that circle; nobody changes places or steps back from the ${anchor.name}.`);
    else if (anchor && ring.length === 2) L.push(`${and(names(ring))} stand at the ${anchor.name}, each close enough to rest a hand on it. Anyone arriving takes their place there; nobody changes places.`);
    else if (order.length > 1) L.push(`Their places, left to right as seen from the room: ${names(order).join(", ")}. Anyone arriving takes their place there; nobody changes places.`);
    // The floor plan itself, which no camera changes (D117): who faces whom across the table, and
    // which part of the venue is behind each person. With only the order, Kling put the bar beside
    // Jade and had Chase come round the table.
    const plan = floorPlanLines(i.plan, inClip, (id) => first(nameOf(id)), anchor?.name);
    if (plan) L.push(plan);
    const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
    if (pictures.length) L.push(cap(`${pictures.length === 1 ? `${pic(1)} is the storyboard picture for shot ${pictures[0].shot}` : `${pictures.map((x, n) => pic(n + 1)).join(", ")} are the storyboard pictures for shots ${pictures.map((x) => x.shot).join(", ")} in turn`}: each shot keeps its picture's camera angle, framing, background and who stands where. Faces, clothes${pieces.length ? `, the ${pieces.map((f) => f.name).join(" and ")}` : ""} and the venue come from their Elements, not from the pictures.`));
    // Each line said once, in its own shot (D115): with two lines for Jade in shots 3 and 4, Kling
    // had her say the first one twice and never the second.
    const lines = panels.flatMap((p) => p.dialogue);
    let lineNo = 0;
    let t = 0;
    panels.forEach((p, k) => {
      const d = times[k];
      const words = shotWords(p, i.plan, (id) => first(nameOf(id)));
      const speech = p.dialogue.length
        // Said with the panel's feeling, in a natural voice (D116): line 2 came out flat and robotic
        // with the feeling only on the action before it.
        ? p.dialogue.map((x) => `${lines.length > 1 ? `Line ${++lineNo}, ` : ""}${first(nameOf(x.characterId))} says${p.emotion ? `, ${p.emotion.trim().replace(/\.$/, "")}, naturally, never flat` : ""}: "${x.text.trim()}"`).join(" Then ")
        : "No one speaks.";
      // On the way in (D115): someone arriving or crossing hasn't reached the group yet, so the
      // group is ahead of them. Kling had Jade walk past them, then turn back to greet them.
      const onTheWay = Object.entries(p.spec.at ?? {}).filter(([, m]) => /^(?:arriving|crossing|approaching)$/.test(m)).map(([id]) => id).filter((id) => inClip.includes(id));
      const way = onTheWay.map((id) => `${first(nameOf(id))} has not reached ${anchor ? `the ${anchor.name}` : "the others"} yet: ${anchor ? "it is" : "they are"} ahead of ${first(nameOf(id))}, further into the room, and ${first(nameOf(id))} walks towards ${anchor ? "it" : "them"}, never past.`).join(" ");
      const pn = pictures.findIndex((x) => x.shot === k + 1);
      L.push(`Shot ${k + 1} (${t}–${t + d} s)${words ? `, ${words}` : ""}${pn >= 0 ? `, as in ${pic(pn + 1)}` : ""}: ${p.description.trim().replace(/\.$/, "")}${p.emotion ? ` (${p.emotion.trim().replace(/\.$/, "")})` : ""}.${way ? ` ${way}` : ""} ${speech}`);
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
      // One of each, always at the table (D118): Kling cut to closer shots with Marcus and Nina
      // somewhere else, and dressed guests like them, so they showed twice.
      inClip.length > 1 ? `${and(names(inClip))} each appear once in the picture, never twice; no guest looks or dresses like any of them.` : "",
      anchor && inClip.length > 1 ? `Every shot is of this same group at the ${anchor.name}: a closer shot frames part of it, and whoever is out of frame is still standing in their place at the ${anchor.name}.` : "",
      pieces.length ? `${pieces.map((f) => `The ${f.name}`).join(" and ")} and everything on ${pieces.length === 1 ? "it" : "them"} stay exactly the same throughout.` : "",
      "No text, no logos.",
    ].filter(Boolean).join(" "));
    return L.join("\n");
  };
  const seconds = times.reduce((a, b) => a + b, 0);
  return { panels: panels.map((p) => p.order), seconds, prompt: build(api, (n) => `图片${n}`), webPrompt: build(web, (n) => `picture ${n}`), elements: used, missing, credits: seconds * (i.creditsPerSecond ?? 10), pictures };
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

/**
 * Who stands where going round the anchor, from the floor plan (D118), started from the main
 * view's leftmost person and turned the way that best keeps the main view's left-to-right order.
 */
export function roundOrder(plan: GeometryPlanData, at: { x: number; y: number }, order: string[]): string[] {
  const ang = new Map<string, number>();
  for (const id of order) {
    const p = plan.actors.find((x) => x.characterId === id)?.position;
    if (p) ang.set(id, Math.atan2(p.y - at.y, p.x - at.x));
  }
  const ids = order.filter((id) => ang.has(id));
  if (ids.length < 2) return ids;
  const start = ang.get(ids[0])!;
  const turn = (dir: 1 | -1) => [...ids].sort((a, b) => {
    const d = (id: string) => { let x = dir * (ang.get(id)! - start); while (x < 0) x += 2 * Math.PI; return x; };
    return d(a) - d(b);
  });
  const swaps = (xs: string[]) => { let n = 0; for (let a = 0; a < xs.length; a++) for (let b = a + 1; b < xs.length; b++) if (ids.indexOf(xs[a]) > ids.indexOf(xs[b])) n++; return n; };
  const cw = turn(1), ccw = turn(-1);
  return swaps(cw) <= swaps(ccw) ? cw : ccw;
}

/** The widest empty side going round the anchor, if wider than a third of the way round: who is either side of it. */
export function openSide(plan: GeometryPlanData, at: { x: number; y: number }, ring: string[]): [string, string] | undefined {
  const a = ring.map((id) => { const p = plan.actors.find((x) => x.characterId === id)!.position; return Math.atan2(p.y - at.y, p.x - at.x); });
  const T = 2 * Math.PI, mod = (x: number) => ((x % T) + T) % T;
  // The ring goes one way round: the steps that add up to one turn are its steps.
  const steps = (dir: 1 | -1) => a.map((v, k) => mod(dir * (a[(k + 1) % a.length] - v)));
  const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0);
  const st = Math.abs(sum(steps(1)) - T) < 1e-6 ? steps(1) : steps(-1);
  const k = st.indexOf(Math.max(...st));
  return st[k] > T / 3 ? [ring[k], ring[(k + 1) % ring.length]] : undefined;
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
    // Both of them in the picture (D117): Kling cut from one face to the other, Paul wants the two
    // together, the listener's shoulder and the side of their head in the foreground.
    return `${size ? `${size} ` : ""}over ${other ? `${name(other)}'s` : "the listener's"} shoulder on ${name(subj)}, both of them in the picture: ${other ? `${name(other)}'s` : "the listener's"} shoulder and the side of their head in the foreground`.trim();
  }
  if (/two-shot/.test(shot) && p.spec.visibleIds.length === 2) return `${shot} on ${name(p.spec.visibleIds[0])} and ${name(p.spec.visibleIds[1])}`;
  if (subj && /close-up|close up|medium shot|single/.test(shot) && p.spec.visibleIds.length <= 2) return `${shot} on ${name(subj)}`;
  return shot;
}

/** A voice in a sentence or two (D113): the whole voice lock ran a clip's request past 3,000 characters. */
export function voiceShort(v: string, max = 320): string {
  const sentences = v.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  let out = "";
  for (const x of sentences) { if (out && (out + " " + x).length > max) break; out = out ? `${out} ${x}` : x; }
  return out.replace(/[.!?]$/, "");
}

/** Who faces whom across the anchor, and the venue view behind each person, from the floor plan. */
export function floorPlanLines(plan: GeometryPlanData, ids: string[], name: (id: string) => string, anchorName?: string): string {
  const a = sceneAnchor(plan);
  if (!a) return "";
  const out: string[] = [];
  const line = (plan.lineOfAction ?? []) as string[];
  if (line.length === 2 && line.every((x) => ids.includes(x))) out.push(`${name(line[0])} and ${name(line[1])} face each other${anchorName ? ` across the ${anchorName}` : ""}.`);
  const views = plan.views ?? [];
  if (views.length) {
    const behind = ids.flatMap((id) => {
      const p = plan.actors.find((x) => x.characterId === id)?.position;
      if (!p || Math.hypot(p.x - a.at.x, p.y - a.at.y) < 0.2) return [];
      const ang = (Math.atan2(p.y - a.at.y, p.x - a.at.x) * 180) / Math.PI;
      const off = (d: number) => Math.abs(((d - ang + 540) % 360) - 180);
      const v = [...views].sort((x, y) => off(x.directionDeg) - off(y.directionDeg))[0];
      return v ? [`behind ${name(id)}, the ${v.name}`] : [];
    });
    if (behind.length) out.push(`Seen from across the ${anchorName ?? "group"}: ${behind.join("; ")}.`);
  }
  return out.length ? `From the floor plan: ${out.join(" ")}` : "";
}
