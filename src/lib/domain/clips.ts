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
import { CLIP_MAX_SEC, groupByTime } from "./clipCameras";

export interface KlingElement { id: string; name: string }
/** Elements by what they stand for: "char:<slug>", "venue:<id>", "prop:<name in lower case>". */
export type KlingElements = Record<string, KlingElement>;

export const elementKey = {
  character: (slug: string) => `char:${slug}`,
  venue: (id: string) => `venue:${id}`,
  prop: (name: string) => `prop:${name.trim().toLowerCase()}`,
  /** A character's voice sample (D146): an audio file, kept as an asset; its id is the "Element" id. */
  voice: (slug: string) => `voice:${slug}`,
};

export interface ClipPanel {
  order: number;
  durationSec: number;
  description: string;
  emotion?: string;
  dialogue: { characterId: string; text: string; delivery?: string }[];
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
  /**
   * Finished takes kept for some panels (D130): those panels get no clip, and the clip after a kept
   * take opens on the take's chosen frame, so new footage carries straight on from the good footage.
   */
  kept?: KeptTake[];
  /**
   * Start and end frames by clip (D164), keyed by its panels ("3-4"). With frames, Kling chooses the
   * shots: no storyboard pictures or shot list go with the clip, only its start frame (and end
   * frame), the Elements, the voices, the starting positions and what happens.
   */
  frames?: Record<string, ClipFrames>;
}

export interface KeptTake { from: number; to: number; frameAssetId?: string }

/** A clip's start frame (needed, and approved before it's made) and its optional end frame (D164). */
export interface ClipFrames { start?: string; startApproved?: boolean; end?: string }

/** A clip's key: its panels, "3-4". */
export const clipKey = (panels: number[]) => panels.join("-");

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
  pictures: { shot: number; panel: number; assetId: string; continuity?: boolean }[];
  /** Voice samples for who speaks (D146), in order: audio N is 音频N. Kling 4.0 takes up to 3. */
  audios: { n: number; characterId: string; assetId: string }[];
  /** The kept take this clip carries on from (D130). */
  continues?: { from: number; to: number };
  /**
   * The start frame (D164): the one picked for this clip, or else the last frame of the take it
   * carries on from, offered until another is picked. Needs approving before the clip is made.
   */
  start?: { assetId: string; from: "chosen" | "previous clip"; approved: boolean };
  /** The end frame, when the clip has to finish somewhere particular (D164). */
  end?: { assetId: string };
}

/** Kling Omni-Ref takes up to this many Elements in one clip. */
export const MAX_ELEMENTS = 7;
export { CLIP_MAX_SEC, CLIP_MAX_SHOTS } from "./clipCameras";

/**
 * Consecutive panels in clips of up to 15 s and 4 shots, and at most two camera angles (D121): a
 * panel that would bring a third starts the next clip. A panel longer than that is a clip alone.
 */
export function groupClips(panels: ClipPanel[], plan?: GeometryPlanData): ClipPanel[][] {
  const angle = (p: ClipPanel) => plan?.cameras.find((x) => x.id === p.spec.cameraId);
  return groupByTime([...panels].sort((a, b) => a.order - b.order), (p) => p.durationSec, plan ? angle : undefined);
}

const first = (name: string) => name.split(/\s+/)[0];

/**
 * A shot's time inside a multi-shot clip (D120): only what it needs, never more than its panel.
 * Panels were timed as clips of their own, at least Kling's 3 s each; inside one clip a silent beat
 * needs 2 s and a line its speaking time and half a second. Clip 3 ran 10 s where 8 flowed better.
 */
export function shotSeconds(p: ClipPanel): number {
  const words = p.dialogue.map((d) => d.text).join(" ");
  const handle = handlingSeconds(p.description);
  const talk = words.trim() ? Math.ceil(spokenSeconds(words) + 0.5 + handle) : 0;
  const need = Math.max(2, talk, words.trim() ? 0 : Math.ceil(1 + handle), actionFloor(p.description));
  // Walking off (D148) is seen in full: its time comes on top, even past the panel's own time,
  // which was set by the line alone.
  const exit = exitSeconds(p.description);
  return Math.max(1, Math.min(p.durationSec + exit, need + exit));
}

/**
 * Someone walking off in a shot (D148): Jade's "turns away to walk off" was given the 2 s of her
 * one-word line, and the clip ended as she turned. Three seconds more (D160: two weren't enough), so the walk away is seen.
 */
const EXIT = /\b(?:walks?|walked|walking|storms?|stormed|storming|heads?|headed|marches|marched|strides?|strode)\s+(?:straight\s+)?(?:off|away|out)\b|\b(?:leaves|left\s+the|exits?|exited)\b/i;
export const EXIT_SECONDS = 3;
export function exitSeconds(text: string | undefined): number {
  return text && EXIT.test(text) ? EXIT_SECONDS : 0;
}

/**
 * Things handled in a shot (D140): taking, handing over, pulling out, dropping in, glancing at.
 * Each takes time on top of a line: "Chase takes the contract, glances at it, drops it into the
 * ice bucket" and his line were given the line's 3 s alone. Three quarters of a second each.
 */
const HANDLING = /\b(?:takes?|took|taking|pulls?\s+(?:\w+\s+){0,3}out|pulled\s+(?:\w+\s+){0,3}out|hands?\s+(?:it|him|her|them|over)|handed|holds?\s+(?:it\s+|\w+\s+)?out|drops?\s+(?:it|\w+)\s+in(?:to)?|dropped\s+(?:it|\w+)\s+in(?:to)?|puts?\s+(?:it|\w+)\s+down|picks?\s+(?:it\s+|\w+\s+)?up|picked\s+(?:it\s+|\w+\s+)?up|gives?|gave|glances?\s+at|looks?\s+at|reads?|signs?|pours?|opens?|tears?|toss(?:es)?|flicks?)\b/gi;
export function handlingSeconds(text: string | undefined): number {
  return Math.min(3, 0.75 * (text?.match(HANDLING)?.length ?? 0));
}

/** What sits on a set piece, from its detail (D153): "…, with 2 candles and an ice bucket; see …". */
export function itemsOn(detail: string | undefined): string {
  const m = /,\s*with\s+([^;]+)/i.exec(detail ?? "");
  return m ? m[1].replace(/\s*\bsee (?:the )?reference image\b.*$/i, "").trim().replace(/[.,]$/, "") : "";
}

/**
 * Something a shot leaves in or on something else (D153): "drops it into the ice bucket on the
 * table" → the contract, in, the ice bucket. "It" is the last thing the shot names before it.
 */
export function leftIn(text: string | undefined): { thing: string; how: "in" | "on"; into: string } | null {
  if (!text) return null;
  const re = /\b(?:drops?|dropped|puts?|places?|placed|flicks?|flicked|tosses|tossed|throws?|threw|stuffs?|stuffed|sets?|leaves|left)\s+(it|(?:the|a|an|her|his|their)\s+[a-z]+(?:\s+[a-z]+)?)\s+(into|in|onto|on)\s+(?:the|a|her|his)\s+([a-z]+(?:\s+(?!on\b|in\b|at\b|by\b|and\b|of\b|with\b|beside\b|next\b)[a-z]+)?)/i;
  const m = re.exec(text);
  if (!m) return null;
  let thing = m[1].replace(/^(?:the|a|an|her|his|their)\s+/i, "").replace(/\s+(?:on|in|at|and|of|with)$/i, "");
  if (/^it$/i.test(m[1])) {
    const before = [...text.slice(0, m.index).matchAll(/\b(?:the|her|his|their)\s+([a-z]+)/gi)].pop();
    if (!before) return null;
    thing = before[1];
  }
  return { thing: thing.toLowerCase(), how: /^in/i.test(m[2]) ? "in" : "on", into: m[3].toLowerCase() };
}

/** The request for one clip. */
export function clipPrompt(panels: ClipPanel[], i: ClipInput, after?: KeptTake): Clip {
  if (i.frames) return framesPrompt(panels, i, after);
  const nameOf = (id: string) => i.cast.find((c) => c.id === id)?.name ?? id;
  // Only people in this scene's floor plan (D159): panel 13, added later, listed the project's
  // whole cast, and Gary and Samantha were told to stand at the table.
  const inScene = (id: string) => !i.plan.actors?.length || i.plan.actors.some((a) => a.characterId === id);
  const inClip = [...new Set(panels.flatMap((p) => [...p.spec.visibleIds, ...p.dialogue.map((d) => d.characterId)]))].filter((id) => i.cast.some((c) => c.id === id) && inScene(id));
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
  // A walk off before another shot (D154) carries on in that shot, so it gets no extra time of its own.
  const walkOn = (k: number) => k < panels.length - 1 && exitSeconds(panels[k].description) > 0;
  const times = panels.length > 1 ? panels.map((p, k) => shotSeconds(p) - (walkOn(k) ? EXIT_SECONDS : 0)) : panels.map((p) => Math.max(1, p.durationSec));
  const walker = (p: ClipPanel) => p.dialogue[0]?.characterId ?? (p.spec as { subjectId?: string }).subjectId ?? p.spec.visibleIds[0];
  while (times.reduce((a, b) => a + b, 0) < 3) times[times.length - 1]++;
  // Never past Kling's 15 s (D148): the longest shot gives way first.
  while (times.reduce((a, b) => a + b, 0) > CLIP_MAX_SEC) { const k = times.indexOf(Math.max(...times)); if (times[k] <= 2) break; times[k]--; }
  // After a kept take (D130), shot 1 opens on the take's chosen frame instead of its storyboard
  // picture: the footage already made is what the new clip has to match.
  const cont = after?.frameAssetId ? { shot: 1, panel: panels[0].order, assetId: after.frameAssetId, continuity: true } : undefined;
  const pictures: Clip["pictures"] = [
    ...(cont ? [cont] : []),
    ...panels.flatMap((p, k) => p.imageAssetId && !(cont && k === 0) ? [{ shot: k + 1, panel: p.order, assetId: p.imageAssetId }] : []),
  ];
  const speakersAll = [...new Set(panels.flatMap((p) => p.dialogue.map((x) => x.characterId)))];
  const audios: Clip["audios"] = speakersAll.flatMap((id) => { const e = i.elements[elementKey.voice(id)]; return e?.id ? [{ characterId: id, assetId: e.id }] : []; }).slice(0, 3).map((x, k) => ({ n: k + 1, ...x }));
  const build = (ref: (key: string, plain: string) => string, pic: (n: number) => string, aud: (n: number) => string) => {
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
    if (cont) L.push(`${cap(pic(1))} is the last moment of the clip before this one, already made: this clip follows straight on from it, a moment later, with the same place, light, ${pieces.length ? `${pieces.map((f) => f.name).join(" and ")}, ` : ""}people, clothes and positions. Where ${pic(1)} and anything else here differ, ${pic(1)} is right.`);
    const board = pictures.map((x, n) => ({ ...x, n: n + 1 })).filter((x) => !x.continuity);
    if (board.length) L.push(cap(`${board.length === 1 ? `${pic(board[0].n)} is the storyboard picture for shot ${board[0].shot}` : `${board.map((x) => pic(x.n)).join(", ")} are the storyboard pictures for shots ${board.map((x) => x.shot).join(", ")} in turn`}: each shot keeps its picture's camera angle, framing, background and who stands where. Faces, clothes${pieces.length ? `, the ${pieces.map((f) => f.name).join(" and ")}` : ""} and the venue come from their Elements, not from the pictures.`));
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
        // With its delivery when it has one (D138): who they are in the moment, how it comes out,
        // the face and one small action, as Paul's best take was directed.
        ? p.dialogue.map((x) => `${lines.length > 1 ? `Line ${++lineNo}, ` : ""}${x.delivery?.trim() ? `${first(nameOf(x.characterId))}: ${x.delivery.trim().replace(/\.$/, "")}. ` : ""}${first(nameOf(x.characterId))} says${p.emotion ? `, ${p.emotion.trim().replace(/\.$/, "")}` : ""}, naturally, never flat, in a spontaneous conversational rhythm, the face expressive but restrained, accurate lip-sync: "${x.text.trim()}"`).join(" Then ")
        : "No one speaks.";
      // On the way in (D115): someone arriving or crossing hasn't reached the group yet, so the
      // group is ahead of them. Kling had Jade walk past them, then turn back to greet them.
      const onTheWay = Object.entries(p.spec.at ?? {}).filter(([, m]) => /^(?:arriving|crossing|approaching)$/.test(m)).map(([id]) => id).filter((id) => inClip.includes(id));
      const way = onTheWay.map((id) => `${first(nameOf(id))} has not reached ${anchor ? `the ${anchor.name}` : "the others"} yet: ${anchor ? "it is" : "they are"} ahead of ${first(nameOf(id))}, further into the room, and ${first(nameOf(id))} walks towards ${anchor ? "it" : "them"}, never past.`).join(" ");
      const pn = pictures.findIndex((x) => x.shot === k + 1);
      L.push(`Shot ${k + 1} (${t}–${t + d} s)${words ? `, ${words}` : ""}${pn >= 0 ? (pictures[pn].continuity ? `, following straight on from ${pic(pn + 1)}` : `, as in ${pic(pn + 1)}`) : ""}: ${p.description.trim().replace(/\.$/, "")}${p.emotion ? ` (${p.emotion.trim().replace(/\.$/, "")})` : ""}.${way ? ` ${way}` : ""} ${speech}${exitSeconds(p.description) ? `${p.dialogue.length ? "." : ""} ${walkOn(k) ? "The walk away carries on into the next shot." : "The walk away is seen in full: head up, eyes ahead, never looking down, still walking away and well on the way out of the picture when the shot ends."}` : ""}${k > 0 && walkOn(k - 1) && walker(panels[k - 1]) ? ` In the background, ${nameOf(walker(panels[k - 1])!)} carries on walking away, getting smaller, and doesn't come back.` : ""}`);
      t += d;
    });
    const speakers = [...new Set(panels.flatMap((p) => p.dialogue.map((x) => x.characterId)))];
    // Each speaker's own voice sample when they have one (D146): without it Kling 4.0 made both
    // voices up, American, though the words said British.
    const voices = speakers.map((id) => {
      const v = voiceShort(i.cast.find((c) => c.id === id)?.voiceLock ?? "");
      const a = audios.find((x) => x.characterId === id);
      const heard = a ? `exactly the voice in ${aud(a.n)}: the same person, accent, pitch and tone, saying this clip's words` : "";
      return heard || v ? `${first(nameOf(id))}: ${[heard, v].filter(Boolean).join(". ")}` : "";
    }).filter(Boolean);
    if (voices.length) L.push(`Voices. ${voices.join(". ")}.`);
    L.push([
      lines.length > 1 ? `Each line is said once, in its own shot, word for word: ${lines.length} different lines in all.` : "",
      // Acting and the room, as in Paul's best take (D133): natural, subtle acting; only the cast
      // speak words anyone can make out; the guests a soft-focus murmur behind them.
      speakers.length ? `Only the speaker talks in each shot; the others listen with mouths closed. Only ${and(names(speakers))} ${speakers.length > 1 ? "have" : "has"} words anyone can make out; the guests' chatter stays a murmur. No repeated words, no extra speech.` : "",
      // Eyes on the conversation (D149): after "it's 90 days, love" Chase looked at Marcus, then
      // vacantly off to the right.
      "Natural, subtle acting, no exaggerated gestures. Whoever speaks looks at the person they are speaking to and keeps looking at them after the line; the others watch the speaker. Nobody glances round at the others or stares blankly away unless the shot says so. Guests behind the group stay in soft focus.",
      // Sound under the voices (D115): Jade's heels were louder than the party. No music (D131): the
      // music and the room sound run as one bed under the whole scene in the edit; each clip's own
      // music jumped at every cut.
      // Silent gestures, nothing after the line (D160): Jade's raised finger came with a click,
      // and a huff came at the very end of the clip, after her line, as she walked off.
      "Sound: the voices, clear, over a low, steady room murmur at the same level throughout; no music at all, it is added in the edit; footsteps and movement quiet, never louder than speech. Gestures make no sound: no clicks, snaps or claps unless a shot says so. A scoff, sigh or laugh a shot asks for comes with that person's line, never after it; once someone has said their last line, they make no more sounds.",
      // Held things change hands only when a shot says so (D132): "anything they carry throughout"
      // and "the table stays exactly the same" forbade the contract beat, Jade handing it over and
      // Chase dropping it in the ice bucket.
      "Each person keeps their own face and clothes throughout; anything they carry stays in the same hand until a shot says it is handed over or put down, then stays where that shot leaves it.",
      // A feeling held to the last frame (D122): furious Jade smiled as she turned to walk off.
      "Each person keeps the feeling their shot gives them to its very last frame, walking off included: nobody smiles or softens unless the shot says so.",
      // One of each, always at the table (D118): Kling cut to closer shots with Marcus and Nina
      // somewhere else, and dressed guests like them, so they showed twice.
      inClip.length > 1 ? `${and(names(inClip))} each appear once in the picture, never twice; no guest looks or dresses like any of them.` : "",
      // Only the group at its table (D132): a stranger in a dark suit stood at the group's table as
      // Jade arrived and had to be cropped out in the edit.
      anchor && inClip.length > 1 ? `Every shot is of this same group at the ${anchor.name}: a closer shot frames part of it, and whoever is out of frame is still standing in their place at the ${anchor.name}. Only ${and(names(inClip))} stand at the ${anchor.name}; other guests stay at their own tables, a few metres away.` : "",
      // Named, and in every shot (D153): in Paul's clip 2 the ice bucket was gone from the table in
      // shot 3, and the contract Chase dropped in it was gone by the wide.
      pieces.length ? `${pieces.map((f) => `The ${f.name}`).join(" and ")} and everything on ${pieces.length === 1 ? "it" : "them"}${(() => { const on = pieces.map((f) => itemsOn(f.detail)).filter(Boolean); return on.length ? ` (${on.join("; ")})` : ""; })()} stay exactly the same in every shot, wide shots included, except what a shot puts on, takes off or drops in; that stays as the shot leaves it.` : "",
      ...panels.map((p, k) => { const m = k < panels.length - 1 ? leftIn(p.description) : null; return m ? `From shot ${k + 1} to the end of the clip, the ${m.thing} stays ${m.how} the ${m.into}, in every shot, wide shots included, even where a storyboard picture doesn't show it.` : ""; }),
      "No text, no logos.",
    ].filter(Boolean).join(" "));
    return L.join("\n");
  };
  const seconds = times.reduce((a, b) => a + b, 0);
  return { panels: panels.map((p) => p.order), seconds, prompt: build(api, (n) => `图片${n}`, (n) => `音频${n}`), webPrompt: build(web, (n) => `picture ${n}`, (n) => `audio ${n}`), audios, elements: used, missing, credits: seconds * (i.creditsPerSecond ?? 10), pictures, ...(after ? { continues: { from: after.from, to: after.to } } : {}) };
}

/** The scene's clips. */
export function sceneClips(i: ClipInput): Clip[] {
  const master = i.master ?? [...i.panels].sort((a, b) => b.spec.visibleIds.length - a.spec.visibleIds.length || a.order - b.order)[0];
  // Panels a kept take covers get no clip (D130); the clip right after one carries on from it.
  const kept = i.kept ?? [];
  const covered = (o: number) => kept.some((k) => o >= k.from && o <= k.to);
  const left = i.panels.filter((p) => !covered(p.order));
  const sorted = [...i.panels].sort((a, b) => a.order - b.order);
  const next = (k: KeptTake) => sorted.find((p) => p.order > k.to && !covered(p.order))?.order;
  // A clip never runs across a kept take: the panels either side of one are apart in time.
  const runs: ClipPanel[][] = [];
  for (const p of [...left].sort((a, b) => a.order - b.order)) {
    const last = runs[runs.length - 1]?.[runs[runs.length - 1].length - 1];
    const between = last && sorted.some((q) => q.order > last.order && q.order < p.order && covered(q.order));
    if (!last || between) runs.push([p]); else runs[runs.length - 1].push(p);
  }
  // Two kept takes in a row (panels 1–6, then 7–8): the clip after them follows the later one (D145).
  const before = (o: number) => kept.filter((k) => next(k) === o).sort((a, b) => b.to - a.to)[0];
  return runs.flatMap((r) => groupClips(r, i.plan)).map((g) => clipPrompt(g, { ...i, master }, before(g[0].order)));
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

/**
 * The request when the clip has a start frame (D164): Kling chooses the shots. Paul, after a week
 * of the app's own cameras failing scene by scene: "let Kling decide on the camera shots; we just
 * need the floor plan and positioning correct." Tried on scene 4 (17 Nov): with three pictures of
 * the scene, the Elements and the voice, Kling cut from side-on along the bar to a close shot from
 * behind it, with Jade in the crowd behind Chase, first time. So: the start frame is picture 1 and
 * the clip opens on it; an end frame, when given, is the last picture and the clip ends on it; the
 * Elements keep faces, the venue and the props; where everyone starts comes from the panel words;
 * what happens runs in time order with the exact lines, how they're said, and the voices.
 */
export function framesPrompt(panels: ClipPanel[], i: ClipInput, after?: KeptTake): Clip {
  const nameOf = (id: string) => i.cast.find((c) => c.id === id)?.name ?? id;
  const key = clipKey(panels.map((p) => p.order));
  const f = i.frames?.[key] ?? {};
  const inScene = (id: string) => !i.plan.actors?.length || i.plan.actors.some((a) => a.characterId === id);
  const inClip = [...new Set(panels.flatMap((p) => [...p.spec.visibleIds, ...p.dialogue.map((d) => d.characterId)]))].filter((id) => i.cast.some((c) => c.id === id) && inScene(id));
  const pieces = (i.plan.furniture ?? []).filter((x) => isSetPiece(x));
  const held = [...new Set(panels.flatMap((p) => (p.spec.props ?? []).map((x) => x.name)))].filter((n) => !pieces.some((x) => x.name === n));
  const wanted: { key: string; what: string }[] = [
    ...inClip.map((id) => ({ key: elementKey.character(id), what: nameOf(id) })),
    { key: elementKey.venue(i.venue.id), what: i.venue.name },
    ...pieces.map((x) => ({ key: elementKey.prop(x.name), what: x.name })),
    ...held.map((n) => ({ key: elementKey.prop(n), what: n })),
  ];
  const used: Clip["elements"] = [];
  const missing: string[] = [];
  for (const w of wanted) {
    const e = i.elements[w.key];
    if (e?.id && used.length < MAX_ELEMENTS) used.push({ key: w.key, id: e.id, name: e.name, what: w.what });
    else missing.push(w.what);
  }
  // The start frame: the one picked, or the last frame of the take before, offered (chained).
  const start: Clip["start"] = f.start ? { assetId: f.start, from: "chosen", approved: !!f.startApproved }
    : after?.frameAssetId ? { assetId: after.frameAssetId, from: "previous clip", approved: !!f.startApproved } : undefined;
  const end: Clip["end"] = f.end ? { assetId: f.end } : undefined;
  const pictures: Clip["pictures"] = [
    ...(start ? [{ shot: 1, panel: panels[0].order, assetId: start.assetId, continuity: true }] : []),
    ...(end ? [{ shot: panels.length, panel: panels[panels.length - 1].order, assetId: end.assetId }] : []),
  ];
  const walkOn = (k: number) => k < panels.length - 1 && exitSeconds(panels[k].description) > 0;
  const times = panels.length > 1 ? panels.map((p, k) => shotSeconds(p) - (walkOn(k) ? EXIT_SECONDS : 0)) : panels.map((p) => Math.max(1, p.durationSec + exitSeconds(p.description)));
  while (times.reduce((a, b) => a + b, 0) < 3) times[times.length - 1]++;
  while (times.reduce((a, b) => a + b, 0) > CLIP_MAX_SEC) { const k = times.indexOf(Math.max(...times)); if (times[k] <= 2) break; times[k]--; }
  const speakers = [...new Set(panels.flatMap((p) => p.dialogue.map((x) => x.characterId)))];
  const audios: Clip["audios"] = speakers.flatMap((id) => { const e = i.elements[elementKey.voice(id)]; return e?.id ? [{ characterId: id, assetId: e.id }] : []; }).slice(0, 3).map((x, k) => ({ n: k + 1, ...x }));
  const and = (xs: string[]) => xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs.join("");
  const build = (ref: (key: string, plain: string) => string, pic: (n: number) => string, aud: (n: number) => string) => {
    const L: string[] = [];
    const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
    L.push(`In ${ref(elementKey.venue(i.venue.id), i.venue.name)}${i.crowd ? `: ${i.crowd.replace(/\.$/, "")}` : ""}.`);
    const chars = inClip.filter((id) => used.some((u) => u.key === elementKey.character(id)));
    if (chars.length) L.push(`${chars.map((id) => `${first(nameOf(id))} is ${ref(elementKey.character(id), first(nameOf(id)))}`).join("; ")}.`);
    // Props: each with its Element when it has one; its own words only when it has none.
    const props = [...pieces.map((x) => ({ name: x.name, detail: x.detail })), ...held.map((n) => ({ name: n, detail: undefined as string | undefined }))];
    const propLines = props.map((x) => { const has = used.some((u) => u.key === elementKey.prop(x.name)); return has ? `the ${x.name} is ${ref(elementKey.prop(x.name), x.name)}` : `the ${x.name}${x.detail ? ` (${x.detail.replace(/;\s*see (?:the )?reference image.*$/i, "")})` : ""}`; });
    if (propLines.length) L.push(`Props in the scene: ${propLines.join("; ")}.`);
    if (start) L.push(`${cap(pic(1))} is the first frame of this clip${start.from === "previous clip" ? ", the last moment of the clip before it" : ""}: the clip opens exactly on it, with the same place, light, people, clothes, positions and props, and carries on from there. Where ${pic(1)} and anything else here differ, ${pic(1)} is right.`);
    if (end) L.push(`${cap(pic(pictures.length))} is the last frame: the clip ends exactly on it, with everyone where it shows them.`);
    // Where everyone starts, in the panel's own words (from the scene's floor plan).
    const where = panels[0].spec.where ?? {};
    const starts = inClip.map((id) => where[id] ? `${first(nameOf(id))} ${where[id].trim().replace(/\.$/, "")}` : "").filter(Boolean);
    if (starts.length) L.push(`Where everyone is at the start: ${starts.join("; ")}.`);
    L.push("Choose the camera shots yourself to tell this moment well, cutting between angles where it helps; whatever the angle, everyone stays where they are unless what happens moves them, and the place and props stay the same.");
    L.push("What happens, in order:");
    const lines = panels.flatMap((p) => p.dialogue);
    let t = 0;
    panels.forEach((p, k) => {
      const d = times[k];
      const speech = p.dialogue.length
        ? p.dialogue.map((x) => `${x.delivery?.trim() ? `${first(nameOf(x.characterId))}: ${x.delivery.trim().replace(/\.$/, "")}. ` : ""}${first(nameOf(x.characterId))} says${p.emotion ? `, ${p.emotion.trim().replace(/\.$/, "")}` : ""}, naturally, never flat, in a spontaneous conversational rhythm, accurate lip-sync: "${x.text.trim()}"`).join(" Then ")
        : "No one speaks.";
      const exit = exitSeconds(p.description) ? ` ${walkOn(k) ? "The walk away carries on after this." : "The walk away is seen in full: head up, eyes ahead, never looking down, still walking away and well on the way out of the picture at the end."}` : "";
      L.push(`${t}–${t + d} s: ${p.description.trim().replace(/\.$/, "")}${p.emotion ? ` (${p.emotion.trim().replace(/\.$/, "")})` : ""}. ${speech}${exit}`);
      t += d;
    });
    const voices = speakers.map((id) => {
      const v = voiceShort(i.cast.find((c) => c.id === id)?.voiceLock ?? "");
      const a = audios.find((x) => x.characterId === id);
      const heard = a ? `exactly the voice in ${aud(a.n)}: the same person, accent, pitch and tone, saying these words` : "";
      return heard || v ? `${first(nameOf(id))}: ${[heard, v].filter(Boolean).join(". ")}` : "";
    }).filter(Boolean);
    if (voices.length) L.push(`Voices. ${voices.join(". ")}.`);
    const names = (ids: string[]) => ids.map((id) => first(nameOf(id)));
    L.push([
      lines.length > 1 ? `Each line is said once, word for word, in this order: ${lines.length} different lines in all.` : lines.length ? "The line is said once, word for word." : "",
      speakers.length ? `Only ${and(names(speakers))} ${speakers.length > 1 ? "have" : "has"} words anyone can make out, and only when it's their line; everyone else listens with their mouth closed; the guests' chatter stays a murmur. No repeated words, no extra speech.` : "No one says anything anyone can make out; the guests' chatter stays a murmur.",
      "Natural, subtle acting, no exaggerated gestures. Whoever speaks looks at the person they are speaking to, unless what happens says otherwise. Guests behind them stay in soft focus.",
      "Sound: the voices, clear, over a low, steady room murmur at the same level throughout; no music at all, it is added in the edit; footsteps and movement quiet, never louder than speech. Gestures make no sound: no clicks, snaps or claps. A scoff, sigh or laugh comes with that person's line, never after it; once someone has said their last line, they make no more sounds.",
      "Each person keeps their own face and clothes throughout; anything they carry stays in the same hand until what happens says it is handed over or put down, then stays where it is left.",
      "Each person keeps the feeling they're given to the very last frame: nobody smiles or softens unless what happens says so.",
      inClip.length > 1 ? `${and(names(inClip))} each appear once in the picture, never twice; no guest looks or dresses like any of them.` : "",
      ...panels.map((p, k) => { const m = k < panels.length - 1 ? leftIn(p.description) : null; return m ? `Once the ${m.thing} is ${m.how} the ${m.into}, it stays there to the end of the clip.` : ""; }),
      "No text, no logos.",
    ].filter(Boolean).join(" "));
    return L.join("\n");
  };
  const seconds = times.reduce((a, b) => a + b, 0);
  return {
    panels: panels.map((p) => p.order), seconds, credits: seconds * (i.creditsPerSecond ?? 10), pictures, audios, elements: used, missing,
    prompt: build((k, plain) => { const e = used.find((u) => u.key === k); return e ? `<<<${e.id}>>>` : plain; }, (n) => `图片${n}`, (n) => `音频${n}`),
    webPrompt: build((k, plain) => { const e = used.find((u) => u.key === k); return e ? `@${e.name}` : plain; }, (n) => `picture ${n}`, (n) => `audio ${n}`),
    ...(after ? { continues: { from: after.from, to: after.to } } : {}),
    ...(start ? { start } : {}), ...(end ? { end } : {}),
  };
}
