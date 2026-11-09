// Story to storyboard (D18). The creator tells the scene in their own words; GPT (or the
// creator in ChatGPT) breaks it into panels; the app checks every panel against the guide
// rails before anything is saved: one speaker per clip, a line short enough for one clip,
// clip lengths Kling can make, and a total close to the target length.

import { countWords, deriveDuration, LEAD_SECONDS, WORDS_PER_SECOND } from "./duration";
import { cleanReply } from "./describe";
import { hasQuotes, stripQuotes } from "./text";
import { KLING_OMNI_PRESET, type GeometryPlanData, type PlanView, type ShotSpec } from "./types";

export const TARGET_LENGTHS = [30, 60, 90] as const;
export const MIN_CLIP_SEC = KLING_OMNI_PRESET.minDurationSec;
export const MAX_CLIP_SEC = KLING_OMNI_PRESET.maxDurationSec;
/** The most words one person can say in a single clip (with the lead-in second). */
export const MAX_LINE_WORDS = Math.floor((MAX_CLIP_SEC - LEAD_SECONDS) * WORDS_PER_SECOND);
/** Rough time to allow for each action or reaction beat with no talking. */
export const SILENT_BEAT_SEC = 3;

export interface StoryCharacter {
  /** Slug used across plans and shots, e.g. "jade". */
  id: string;
  name: string;
  role?: string;
}

/** The scene setting (D18c): kept the same in every picture and clip of the scene. */
export interface SceneStaging {
  /** Where the characters are and what they stand or sit around. */
  spot: string;
  /** Who else is there and what they are doing; empty for no one. */
  crowd: string;
}

export function asStaging(v: unknown): SceneStaging {
  const o = (v ?? {}) as Record<string, unknown>;
  const clean = (x: unknown) => (typeof x === "string" && !NONE.test(x.trim()) ? stripQuotes(x).trim() : "");
  return { spot: clean(o.spot), crowd: clean(o.crowd) };
}

export interface DraftPanel {
  action: string;
  /** Character ids seen in the panel. */
  inFrame: string[];
  speakerId?: string;
  /** Exact spoken words, no quote marks; empty for a silent panel. */
  line: string;
  emotion: string;
  /** Clip length: derived from the line, or the silent length. */
  seconds: number;
}

// ---------- The request to GPT ----------

/** The project brief from New project: what it is, who it's for, the whole story in outline. */
export interface ProjectBrief {
  /** Kind of video: advert, mini drama, short film… */
  format?: string;
  /** How many parts (scenes or episodes) and roughly how long each is. */
  parts?: number;
  partSec?: number;
  audience?: string;
  outline?: string;
  /** Genre label, e.g. "Comedy". */
  genre?: string;
}

export function storyPrompt(i: { story: string; characters: StoryCharacter[]; venue: string; targetSec: number; brief?: ProjectBrief; sceneTitle?: string }): string {
  const names = i.characters.map((c) => (c.role?.trim() ? `${c.name} (${c.role.trim()})` : c.name)).join(", ");
  const b = i.brief ?? {};
  const about = [
    (b.format?.trim() || b.parts) && `What it is: ${shapeLine(b)}`,
    b.genre?.trim() && `Genre: ${b.genre.trim()}`,
    b.audience?.trim() && `Who it's for: ${b.audience.trim()}`,
    b.outline?.trim() && `The whole story in outline: ${b.outline.trim()}`,
  ].filter(Boolean) as string[];
  return [
    "You are a storyboard artist for a short AI-generated video. Break the scene's story below into storyboard panels. Each panel becomes one video clip.",
    "",
    ...(about.length ? ["About the video (for tone and context; storyboard only this scene):", ...about.map((x) => `- ${x}`), ""] : []),
    "Rules:",
    `- The whole scene should run about ${i.targetSec} seconds.`,
    "- Each panel is one moment: one action, and at most one person speaking.",
    `- A spoken line belongs to one person. If a line would take more than about ${MAX_LINE_WORDS} words, split it across two panels.`,
    "- Words in quote marks are used exactly as written; only correct the spelling. Where the story only reports what someone says, write a short, natural line in their voice.",
    `- Silent panels (arrivals, reactions, gestures) last ${MIN_CLIP_SEC} to 6 seconds.`,
    `- The characters are: ${names}. Use these names only. Anyone else (guests, crowd, staff) is background and is not named.`,
    `- The setting is: ${i.venue}.`,
    "- Keep the story's order and do not add new plot.",
    "- Give no camera directions; the app chooses the cameras.",
    "- Describe gestures precisely: which hand, which way the palm faces and how it moves (for example: flicks the back of his hand outwards to shoo her away, not just a dismissive wave).",
    `- ${CROWD_RULE}`,
    "",
    "Reply with plain text only, with no drawings or code, in exactly this format. First the scene setting, which stays the same in every panel:",
    "",
    "SCENE",
    "SPOT: where the characters are, whether they stand or sit, and what they gather around, with its size, height and colour so it is drawn the same way every time (for example: standing around a chest-high round cocktail table, about 70 cm across, with a white floor-length cloth, near the bar)",
    "BACKGROUND: who else is there and what they are doing (for example: about 30 well-dressed guests mingling with drinks), or none if the characters are alone",
    "",
    "Then every panel:",
    "",
    "PANEL 1",
    "ACTION: what we see, in one or two sentences",
    "IN FRAME: the characters we see, separated by commas",
    "SPEAKER: the one character who speaks, or none",
    "LINE: the exact spoken words without quote marks, or none",
    "EMOTION: one to three words",
    "SECONDS: the length in seconds",
    "",
    `Scene${i.sceneTitle?.trim() ? `: ${i.sceneTitle.trim()}` : ""}`,
    "<<<",
    i.story.trim(),
    ">>>",
  ].join("\n");
}

export const FORMATS = ["Advert", "Mini drama", "Short film", "Series episode", "Social content", "Music video", "Other"] as const;

/** "Mini drama, 4 parts of about 30 s, about 2 min in total". */
export function shapeLine(b: ProjectBrief): string {
  const parts = b.parts && b.parts > 0 ? b.parts : 0;
  const each = b.partSec && b.partSec > 0 ? b.partSec : 0;
  const total = parts * each;
  const len = (s: number) => (s >= 120 && s % 60 === 0 ? `${s / 60} min` : s >= 60 ? `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ""}`.trim() : `${s} s`);
  const shape = parts === 1 ? (each ? `one part of about ${len(each)}` : "one part")
    : parts ? `${parts} parts${each ? ` of about ${len(each)}` : ""}${total ? `, about ${len(total)} in total` : ""}` : "";
  return [b.format?.trim(), shape].filter(Boolean).join(", ");
}

/** Events, parties and busy places need people in the background, or every picture comes out empty. */
const CROWD_RULE = "If the story is at an event, party, launch, bar, restaurant, street or any busy place, or mentions other people being there, BACKGROUND must describe them: roughly how many, how they are dressed and what they are doing.";

/** For a scene saved before the setting existed: ask GPT for the setting only (D18c). */
export function stagingPrompt(i: { story: string; venue: string; characters: StoryCharacter[] }): string {
  return [
    "You are a storyboard artist. Read the scene below and describe its setting, which stays the same in every picture and video clip of the scene.",
    "",
    `The setting is: ${i.venue}. The characters are: ${i.characters.map((c) => c.name).join(", ")}.`,
    CROWD_RULE,
    "",
    "Reply with plain text only, in exactly this format:",
    "",
    "SCENE",
    "SPOT: where the characters are, whether they stand or sit, and what they gather around, with its size, height and colour so it is drawn the same way every time",
    "BACKGROUND: who else is there and what they are doing, or none",
    "",
    "Scene:",
    "<<<",
    i.story.trim(),
    ">>>",
  ].join("\n");
}

/** Read SPOT and BACKGROUND lines (from a story reply's preamble or a setting-only reply). */
export function parseStaging(text: string): SceneStaging {
  const scene: Record<string, string> = {};
  for (const raw of cleanReply(text).split(/^\s*[#*_\s]*PANEL\s*\d+[^\n]*$/im)[0].split(/\r?\n/)) {
    const m = raw.replace(/\*\*|__/g, "").replace(/^\s*[-*•]\s*/, "").trim().match(/^(SPOT|WHERE|BACKGROUND|CROWD|EXTRAS)\s*:\s*(.*)$/i);
    if (m) scene[/^(SPOT|WHERE)$/i.test(m[1]) ? "spot" : "crowd"] = m[2];
  }
  return asStaging(scene);
}

// ---------- Reading the reply ----------

const FIELD = /^(ACTION|IN FRAME|INFRAME|SPEAKER|LINE|DIALOGUE|EMOTION|SECONDS|LENGTH|DURATION)\s*:\s*(.*)$/i;
const NONE = /^(none|no one|nobody|n\/a|-+|—|silent|\(none\)|\(silent\))\.?$/i;

export interface StoryReply {
  staging: SceneStaging;
  panels: DraftPanel[];
  /** Names GPT used that aren't characters in this scene. */
  unknownNames: string[];
}

export function parseStoryReply(text: string, characters: StoryCharacter[]): StoryReply {
  const unknown = new Set<string>();
  const find = (raw: string): string | undefined => {
    const n = stripQuotes(raw).replace(/[.()*]/g, "").trim().toLowerCase();
    if (!n || NONE.test(n)) return undefined;
    const c = characters.find((x) => x.name.toLowerCase() === n || x.id === n || x.name.toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0]);
    if (!c) unknown.add(stripQuotes(raw).trim());
    return c?.id;
  };
  const parts = cleanReply(text).split(/^\s*[#*_\s]*PANEL\s*\d+[^\n]*$/im);
  const blocks = parts.slice(1);
  const panels: DraftPanel[] = [];
  for (const block of blocks) {
    const v: Record<string, string> = {};
    let current: string | undefined;
    for (const raw of block.split(/\r?\n/)) {
      const line = raw.replace(/\*\*|__/g, "").replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
      if (!line) continue;
      const m = line.match(FIELD);
      if (m) {
        const k = m[1].toUpperCase().replace(/\s/g, "");
        current = k === "INFRAME" ? "frame" : k === "DIALOGUE" ? "line" : k === "LENGTH" || k === "DURATION" ? "seconds" : k.toLowerCase();
        v[current] = m[2].trim();
      } else if (current && current !== "seconds") {
        v[current] = `${v[current]} ${line}`.trim();
      }
    }
    const lineText = NONE.test((v.line ?? "").trim()) ? "" : stripQuotes(v.line ?? "").trim();
    const speakerId = v.speaker ? find(v.speaker) : undefined;
    const inFrame = (v.frame ?? "").split(/,|\band\b|&/i).map((x) => x.trim()).filter((x) => x && !NONE.test(x)).map(find).filter((x): x is string => !!x);
    if (speakerId && !inFrame.includes(speakerId)) inFrame.unshift(speakerId);
    const asked = Number.parseFloat((v.seconds ?? "").replace(/[^\d.]/g, ""));
    panels.push({
      action: stripQuotes(v.action ?? "").trim(),
      inFrame: [...new Set(inFrame)],
      speakerId: lineText ? speakerId : undefined,
      line: lineText,
      emotion: stripQuotes(v.emotion ?? "").replace(/[.]$/, "").trim(),
      seconds: panelSeconds(lineText, asked),
    });
  }
  return { staging: parseStaging(parts[0] ?? ""), panels, unknownNames: [...unknown] };
}

/** A spoken panel is sized to its line (D10); a silent one is kept inside Kling's range. */
export function panelSeconds(line: string, asked?: number): number {
  if (line.trim()) return deriveDuration(line);
  const s = Number.isFinite(asked) && asked! > 0 ? Math.round(asked!) : 4;
  return Math.min(MAX_CLIP_SEC, Math.max(MIN_CLIP_SEC, s));
}

// ---------- Guide rails ----------

export interface PanelIssue { panel: number; text: string; }

export interface StoryCheck {
  totalSec: number;
  issues: PanelIssue[];
  /** About the total against the target; empty when it is close enough. */
  lengthNote: string;
}

export function checkStoryboard(panels: DraftPanel[], targetSec: number): StoryCheck {
  const issues: PanelIssue[] = [];
  panels.forEach((p, i) => {
    const n = i + 1;
    if (!p.action.trim()) issues.push({ panel: n, text: "Say what happens in this panel." });
    if (p.line.trim() && !p.speakerId) issues.push({ panel: n, text: "Choose who says this line." });
    if (hasQuotes(p.line)) issues.push({ panel: n, text: "Remove the quote marks from the line." });
    const words = countWords(p.line);
    if (words > MAX_LINE_WORDS) issues.push({ panel: n, text: `The line is ${words} words, too long for one ${MAX_CLIP_SEC}-second clip. Split it into two panels.` });
  });
  const totalSec = panels.reduce((s, p) => s + p.seconds, 0);
  let lengthNote = "";
  if (panels.length && totalSec > targetSec * 1.25) lengthNote = `About ${totalSec} s, longer than your ${targetSec} s target. Trim lines or remove panels.`;
  else if (panels.length && totalSec < targetSec * 0.6) lengthNote = `About ${totalSec} s, well short of your ${targetSec} s target. That's fine if the story is told.`;
  return { totalSec, issues, lengthNote };
}

// ---------- Live estimate while typing ----------

export interface StoryEstimate {
  /** Spoken lines found in quote marks. */
  lines: number;
  /** Seconds of talking, including the lead-in second per line. */
  talkSec: number;
  /** Quoted lines too long for one clip. */
  longLines: number;
}

/** Lines in "double", “curly” or 'single' quote marks; apostrophes inside words are ignored. */
export function quotedLines(story: string): string[] {
  const out: string[] = [];
  for (const m of story.matchAll(/["“”]([^"“”]+)["“”]|(?:^|[\s(—–-])['‘]([^'‘’\n]+?)['’](?=[\s.,!?;:)—–-]|$)/gm)) out.push((m[1] ?? m[2]).trim());
  return out.filter((x) => countWords(x) > 0);
}

export function estimateStory(story: string): StoryEstimate {
  const lines = quotedLines(story);
  return {
    lines: lines.length,
    talkSec: Math.round(lines.reduce((s, l) => s + countWords(l) / WORDS_PER_SECOND + LEAD_SECONDS, 0)),
    longLines: lines.filter((l) => countWords(l) > MAX_LINE_WORDS).length,
  };
}

// ---------- From panels to shots and a first floor plan ----------

/** The draft shot for a panel: who is seen, who speaks, the locked line and its length. */
export function shotSpecFor(p: DraftPanel, i: { code: string; venueName: string; castIds: string[]; staging?: SceneStaging }): ShotSpec {
  const visible = p.inFrame.filter((id) => i.castIds.includes(id));
  return {
    spot: i.staging?.spot || undefined, crowd: i.staging?.crowd || undefined,
    code: i.code, venueName: i.venueName, sceneContext: p.action, presentIds: i.castIds,
    // In a group scene (a spot is set) the others are nearby, not banned: a camera that sees them
    // shows them at the edge of frame (D18d). Without a setting they are kept out.
    visibleIds: visible, excludedIds: i.staging?.spot ? [] : i.castIds.filter((id) => !visible.includes(id)),
    speakerId: p.line ? p.speakerId : undefined, dialogue: p.line || undefined,
    subjectId: p.line ? undefined : visible[0],
    actions: p.action, emotion: p.emotion || undefined, durationSec: p.seconds,
    audioMode: p.line ? "native-on" : "off", intensity: "natural",
  };
}

/**
 * A first floor plan so the app can choose cameras straight away: the character with the
 * most lines faces the rest of the group across a small gap. People can be moved on the
 * floor plan later; the app then shows which shots a move affects.
 */
export function defaultPlan(castIds: string[], panels: DraftPanel[], views: PlanView[], staging?: SceneStaging): GeometryPlanData {
  const said = (id: string) => panels.filter((p) => p.speakerId === id).length + panels.filter((p) => p.inFrame.includes(id)).length / 100;
  const order = [...castIds].sort((a, b) => said(b) - said(a));
  const talkers = order.filter((id) => panels.some((p) => p.speakerId === id));
  const [main] = order;
  // The person the main talker faces: the second talker, else the next most seen.
  const partner = talkers.find((id) => id !== main) ?? order[1];
  const others = order.filter((id) => id !== main && id !== partner);
  // Around a small table (D18d): the two talkers face each other across it, everyone else
  // stands on the far side, so no one is ever between the two talkers and the cameras.
  const C = { x: 0.25, y: 4.85 };
  const at = (deg: number, r: number) => ({ x: +(C.x + r * Math.cos((deg * Math.PI) / 180)).toFixed(2), y: +(C.y + r * Math.sin((deg * Math.PI) / 180)).toFixed(2) });
  const actors = !main ? [] : !partner
    ? [{ characterId: main, position: { x: 0, y: 5 } }]
    : [
      { characterId: main, position: at(0, 1.0) },
      { characterId: partner, position: at(180, 1.0) },
      ...others.map((id, k) => ({ characterId: id, position: at(others.length === 1 ? 90 : 50 + (80 * k) / (others.length - 1), 0.95) })),
    ];
  const line: [string, string] | undefined = partner ? [partner, main] : undefined;
  return {
    bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
    // The thing the group stands around, between them, so the floor plan shows it.
    furniture: staging?.spot && actors.length > 1 && /\b(table|bar|counter|desk|sofa|bench|stall|stand)\b/i.test(staging.spot)
      ? [{ id: "spot", name: (staging.spot.match(/\b(?:[\w-]+\s+){0,3}(table|bar|counter|desk|sofa|bench|stall|stand)\b/i)?.[0] ?? "table").replace(/^(?:(?:around|at|by|near|on|in|beside|behind|next|to|a|an|the)\s+)+/i, ""), position: C, radiusM: 0.35 }]
      : [],
    actors, cameras: [],
    views: views.map((v) => ({ name: v.name, directionDeg: v.directionDeg })),
    lineOfAction: line,
  };
}
