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
/** A key prop (D19): kept identical in every picture and clip, and placed on the floor plan. */
export interface KeyProp {
  name: string;
  /** Size, height and colour in words. */
  detail: string;
  /** A reference picture of the prop (D19c). */
  imageAssetId?: string;
}

export type CrowdLevel = "none" | "few" | "busy";

/** The scene setting (D18c, D19): kept the same in every picture and clip of the scene. */
export interface SceneStaging {
  /** Where the characters are, and whether they stand or sit. */
  spot: string;
  /** Who else is there and what they are doing; empty for no one. */
  crowd: string;
  /** How many other people: none, a few, or a busy crowd. */
  crowdLevel: CrowdLevel;
  props: KeyProp[];
}

/** "busy" for crowds, parties and big numbers; "few" for a handful; "none" for no one. */
export function crowdLevelOf(text: string, given?: unknown): CrowdLevel {
  if (given === "none" || given === "few" || given === "busy") return given;
  const t = text.trim();
  if (!t || NONE.test(t)) return "none";
  const n = Number(t.match(/\b(\d{1,4})\b/)?.[1] ?? 0);
  return n >= 12 || /\b(busy|crowd(ed)?|packed|bustling|party|full|throng|dozens|hundreds|lots of)\b/i.test(t) ? "busy" : "few";
}

export function asStaging(v: unknown): SceneStaging {
  const o = (v ?? {}) as Record<string, unknown>;
  const clean = (x: unknown) => (typeof x === "string" && !NONE.test(x.trim()) ? stripQuotes(x).trim() : "");
  const crowd = clean(o.crowd);
  const props = (Array.isArray(o.props) ? o.props : [])
    .map((p) => {
      const img = (p as KeyProp)?.imageAssetId;
      return { name: clean((p as KeyProp)?.name), detail: clean((p as KeyProp)?.detail), ...(typeof img === "string" && img ? { imageAssetId: img } : {}) };
    })
    .filter((p) => p.name);
  const level = crowdLevelOf(crowd, o.crowdLevel);
  return { spot: clean(o.spot), crowd: level === "none" ? "" : crowd, crowdLevel: level, props };
}

/**
 * Height in metres from words like "chest-high", "110 cm tall" or "coffee table" (D19), so a
 * prop is drawn at the same height in every camera view.
 */
/** What shape a prop is (D19b): drawn and placed by kind. */
export type PropKind = "table" | "flat" | "column";
export function propKind(text: string, name?: string): PropKind {
  // The name decides first: a "cocktail table with a pedestal base" is still a table.
  if (name !== undefined) {
    const byName = /\b(table|counter|bar|desk|island|bench|sofa|couch)\b/i.test(name) ? "table" : undefined;
    if (byName) return byName;
    const fromName = propKind(name);
    if (fromName !== "table") return fromName;
  }
  if (/\b(backdrop|banner|sign|signage|screen|wall|poster|neon|logo|billboard|curtain|board)\b/i.test(text)) return "flat";
  if (/\b(pedestal|plinth|podium|lectern|column|display stand|display case|statue|sculpture|lamp|tree|plant)\b/i.test(text)) return "column";
  return "table";
}

/** Width in metres from words like "3 m wide" or "180 cm wide". */
export function propWidth(text: string, kind: PropKind): number {
  const m = text.match(/(\d+(?:\.\d+)?)\s?m\s*(?:wide|across|long)/i) ?? text.match(/(?:width|wide)[^\d]{0,12}(\d+(?:\.\d+)?)\s?m\b/i);
  if (m) return Math.min(8, Number(m[1]));
  const cm = text.match(/(\d{2,3})\s?cm\s*(?:wide|across|long)/i);
  if (cm) return Number(cm[1]) / 100;
  return kind === "flat" ? 2 : kind === "column" ? 0.5 : 0.7;
}

export function propHeight(text: string): number {
  // The prop is described before the things on it ("chest-high at 110 cm, … a glass 15 cm
  // tall"), so the first height mentioned is the prop's own (D19c).
  const found: { at: number; m: number }[] = [];
  const scan = (re: RegExp, toM: (x: RegExpExecArray) => number) => { for (const x of text.matchAll(new RegExp(re, "gi"))) found.push({ at: x.index ?? 0, m: toM(x as RegExpExecArray) }); };
  scan(/(\d{2,3})\s?cm\s*(?:tall|high|height)/, (x) => Math.min(2.5, Number(x[1]) / 100));
  scan(/(?:height|tall|high)[^\d]{0,12}(\d{2,3})\s?cm/, (x) => Math.min(2.5, Number(x[1]) / 100));
  scan(/(\d(?:\.\d+)?)\s?m\s*(?:tall|high)/, (x) => Math.min(4, Number(x[1])));
  scan(/\d+(?:\.\d+)?\s?m\s*(?:wide|across)?\s*[x×]\s*(\d(?:\.\d+)?)\s?m\s*(?:tall|high)/, (x) => Math.min(4, Number(x[1])));
  if (found.length) return found.sort((a, b) => a.at - b.at)[0].m;
  if (propKind(text) === "flat") return 2.2;
  if (/\b(chest[- ]high|bar[- ]height|poseur|cocktail|high[- ]top|tall|high)\b/i.test(text)) return 1.1;
  if (/\bwaist[- ]high|counter\b/i.test(text)) return 0.95;
  if (/\b(coffee|low|side)\s+table\b|\bottoman\b/i.test(text)) return 0.45;
  if (/\b(sofa|couch|bench|chair)\b/i.test(text)) return 0.45;
  if (/\bbar\b/i.test(text)) return 1.1;
  return 0.75; // a desk or dining table
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
    ...SCENE_FORMAT,
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

const GATHER = /\b(table|bar|counter|desk|sofa|couch|bench|stall|stand|fire ?pit|island)\b/i;

/**
 * Key props on the floor plan (D19). The one the group gathers around (named in the spot, or
 * the first gathering-type prop) stands in the middle of the group; the others stand a few
 * metres away on the far side, as a first proposal to adjust on the floor plan.
 */
/** The key props as the scene setting lists them, from the floor plan's furniture. */
export function propsFromFurniture(furniture: { name: string; detail?: string; imageAssetId?: string }[] | undefined): KeyProp[] {
  return (furniture ?? []).map((f) => ({ name: f.name, detail: f.detail ?? "", ...(f.imageAssetId ? { imageAssetId: f.imageAssetId } : {}) }));
}

export function planProps(staging: SceneStaging | undefined, group: boolean, C: { x: number; y: number }) {
  if (!staging) return [];
  const props = staging.props.length ? staging.props
    : GATHER.test(staging.spot) ? [{ name: (staging.spot.match(/\b(?:[\w-]+\s+){0,3}(table|bar|counter|desk|sofa|couch|bench|stall|stand)\b/i)?.[0] ?? "table").replace(/^(?:(?:standing|sitting|around|at|by|near|on|in|beside|behind|next|to|a|an|the)\s+)+/i, ""), detail: staging.spot }] : [];
  const spotText = staging.spot.toLowerCase();
  const centre = props.find((p) => spotText.includes(p.name.toLowerCase().split(/\s+/).at(-1) ?? "~")) ?? props.find((p) => GATHER.test(p.name));
  const far = [60, 120, 30, 150, 90];
  let k = 0;
  return props.map((p, i) => {
    const centred = p === centre;
    const text = `${p.name} ${p.detail}`;
    const kind = propKind(text, p.name);
    // Flat things (backdrops, signs, screens) stand back towards the room's edge; others nearer.
    const dist = kind === "flat" ? 4.2 : 2.4;
    const ang = far[k % far.length];
    // With one person the prop stands beside them, not under their feet.
    const pos = centred ? (group ? C : { x: 0.65, y: 5 }) : { x: +(C.x + dist * Math.cos((ang * Math.PI) / 180)).toFixed(2), y: +(C.y + dist * Math.sin((far[k++ % far.length] * Math.PI) / 180)).toFixed(2) };
    const width = propWidth(text, kind);
    return { id: i === 0 && centred ? "spot" : `prop-${i + 1}`, name: p.name, detail: p.detail, position: pos, radiusM: centred ? 0.35 : +(width / 2).toFixed(2), heightM: propHeight(text), ...(p.imageAssetId ? { imageAssetId: p.imageAssetId } : {}) };
  });
}

/** The scene block GPT returns first (D19): the spot, the key props and the other people. */
const SCENE_FORMAT = [
  "SCENE",
  "SPOT: where the characters are and whether they stand or sit (for example: standing around the cocktail table, near the bar)",
  "PROP: name - size, height and colour, so it is drawn the same way every time (for example: cocktail table - round, about 70 cm across, chest-high at 110 cm, white floor-length cloth). One PROP line for each object that matters to the story or that the characters gather around; leave out ordinary furniture.",
  "OTHER PEOPLE: none, few or busy - who they are and what they are doing (for example: busy - about 40 well-dressed industry guests mingling with drinks)",
];

/** Events, parties and busy places need people in the background, or every picture comes out empty. */
const CROWD_RULE = "If the story is at an event, party, launch, bar, restaurant, street or any busy place, or mentions other people being there, OTHER PEOPLE must describe them: roughly how many, how they are dressed and what they are doing.";

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
    ...SCENE_FORMAT,
    "",
    "Scene:",
    "<<<",
    i.story.trim(),
    ">>>",
  ].join("\n");
}

/** Read SPOT and BACKGROUND lines (from a story reply's preamble or a setting-only reply). */
/**
 * A suggestion fills gaps; it never replaces what the user wrote or attached (D19c). Spot and
 * other people are taken only where empty; a prop already listed keeps its description and
 * picture (an empty description is filled from a same-named suggestion); suggested props not
 * yet listed are added unless the props are locked with the positions.
 */
export function mergeSuggestion(current: SceneStaging, suggested: SceneStaging, propsLocked = false): SceneStaging {
  const key = (s: string) => s.trim().toLowerCase();
  const props = current.props.map((p) => {
    if (p.detail.trim()) return p;
    const s = suggested.props.find((x) => key(x.name) === key(p.name));
    return s ? { ...p, detail: s.detail } : p;
  });
  if (!propsLocked) for (const s of suggested.props) if (!props.some((p) => key(p.name) === key(s.name))) props.push(s);
  const crowdEmpty = !current.crowd.trim();
  return {
    spot: current.spot.trim() ? current.spot : suggested.spot,
    crowd: crowdEmpty ? suggested.crowd : current.crowd,
    crowdLevel: crowdEmpty ? suggested.crowdLevel : current.crowdLevel,
    props,
  };
}

export function parseStaging(text: string): SceneStaging {
  const scene: Record<string, unknown> = {};
  const props: KeyProp[] = [];
  for (const raw of cleanReply(text).split(/^\s*[#*_\s]*PANEL\s*\d+[^\n]*$/im)[0].split(/\r?\n/)) {
    const m = raw.replace(/\*\*|__/g, "").replace(/^\s*[-*•]\s*/, "").trim().match(/^(SPOT|WHERE|BACKGROUND|CROWD|EXTRAS|OTHER PEOPLE|PROP|KEY PROP)\s*:\s*(.*)$/i);
    if (!m) continue;
    const k = m[1].toUpperCase();
    if (k === "SPOT" || k === "WHERE") scene.spot = m[2];
    else if (k === "PROP" || k === "KEY PROP") {
      const [name, ...rest] = m[2].split(/\s+[—–-]\s+|:\s+/);
      if (name && !NONE.test(name.trim())) props.push({ name: name.trim(), detail: rest.join(" - ").trim() });
    } else {
      // "busy — about 40 guests", or just the description.
      const lv = m[2].match(/^(none|few|a few|busy)\b\s*[—–:-]?\s*(.*)$/i);
      if (lv) { scene.crowdLevel = /none/i.test(lv[1]) ? "none" : /few/i.test(lv[1]) ? "few" : "busy"; scene.crowd = lv[2] || (scene.crowdLevel === "none" ? "" : m[2]); }
      else scene.crowd = m[2];
    }
  }
  return asStaging({ ...scene, props });
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
export function shotSpecFor(p: DraftPanel, i: { code: string; venueName: string; castIds: string[]; staging?: Partial<SceneStaging> }): ShotSpec {
  const visible = p.inFrame.filter((id) => i.castIds.includes(id));
  const st = i.staging ? asStaging(i.staging) : undefined;
  return {
    spot: st?.spot || undefined, crowd: st?.crowd || undefined, props: st?.props.length ? st.props : undefined,
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
export function defaultPlan(castIds: string[], panels: DraftPanel[], views: PlanView[], stagingIn?: Partial<SceneStaging>, aspect?: "9:16" | "16:9"): GeometryPlanData {
  const staging = stagingIn ? asStaging(stagingIn) : undefined;
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
    furniture: planProps(staging, actors.length > 1, C),
    actors, cameras: [],
    views: views.map((v) => ({ name: v.name, directionDeg: v.directionDeg })),
    lineOfAction: line,
    aspect,
  };
}

// ---------- Movement marks (D19b) ----------

const ARRIVING = /\b(enters?|entering|walks? (in|into|through)|walking (in|into|through)|arriv(es?|ing)|comes? in|makes? (her|his|their) way (in|through))\b/i;
const APPROACHING = /\b(approach(es|ing)?|walks? (up|over) to|heads? (over|towards?))\b/i;
/**
 * Props stay where the floor plan puts them (D20) unless a panel says someone moves one:
 * "picks up the glass", "pushes the table aside". Returns the prop names each panel moves.
 */
export function propMoves(action: string, propNames: string[]): string[] {
  const verbs = "(pick(s|ing)? up|lift(s|ing)?|mov(es?|ing)|push(es|ing)?|pull(s|ing)?|drag(s|ging)?|carr(y|ies|ying)|knock(s|ing)? over|tip(s|ping)? over|grab(s|bing)?|shov(es?|ing)|slid(es?|ing)|turn(s|ing)? over)";
  return propNames.filter((n) => {
    const words = n.trim().toLowerCase().split(/\s+/);
    const last = words[words.length - 1].replace(/[^a-z]/g, "");
    if (!last) return false;
    return new RegExp(`\\b${verbs}\\b[^.]{0,30}\\b${last}s?\\b`, "i").test(action);
  });
}

/** Already there by the end of the panel (D19e): "as she reaches them", "joins the group". */
const REACHED = /\b(reach(es|ing)? (them|the (group|table|others))|joins? (them|the (group|table|others))|arriv(es|ing) at (the )?(table|group))\b/i;

/**
 * Give people a second spot for panels where they arrive (D19b): "arriving" a few metres out
 * from the group, or "approaching" just short of it. The panel's shot is put on that mark, so
 * the camera, the sketch, the picture and the check all show them on their way in rather than
 * already standing with the group. Anything the user has placed is kept.
 */
export function addMovementMarks(plan: GeometryPlanData, panels: { action: string; subjectId?: string }[]): { plan: GeometryPlanData; at: (Record<string, string> | undefined)[]; from: (Record<string, string> | undefined)[] } {
  const actors = plan.actors.map((a) => ({ ...a, marks: [...(a.marks ?? [])] }));
  const centre = actors.length
    ? { x: actors.reduce((s, a) => s + a.position.x, 0) / actors.length, y: actors.reduce((s, a) => s + a.position.y, 0) / actors.length }
    : { x: 0, y: 5 };
  const b = plan.bounds ?? { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 };
  const clampX = (x: number) => Math.min(b.maxX - 0.3, Math.max(b.minX + 0.3, x));
  const clampY = (y: number) => Math.min(b.maxY - 0.3, Math.max(b.minY + 0.3, y));
  // The open side (D19b): people off the line of action stand beyond it, facing the camera, so
  // someone arriving comes in from the camera's side of the group, where the camera can stand
  // behind them and still be in the room.
  const count = new Map<string, number>();
  for (const p of panels) if (p.subjectId) count.set(p.subjectId, (count.get(p.subjectId) ?? 0) + 1);
  const line = plan.lineOfAction ?? ([...count.entries()].sort((x, y) => y[1] - x[1]).slice(0, 2).map((e) => e[0]) as [string, string]);
  let openDir: { x: number; y: number } | undefined;
  const l0 = actors.find((x) => x.characterId === line?.[0])?.position, l1 = actors.find((x) => x.characterId === line?.[1])?.position;
  const off = actors.filter((x) => !line?.includes(x.characterId));
  if (l0 && l1 && off.length) {
    const lx = l1.x - l0.x, ly = l1.y - l0.y, ll = Math.hypot(lx, ly) || 1;
    const nrm = { x: -ly / ll, y: lx / ll };
    const side = off.reduce((s, x) => s + ((x.position.x - l0.x) * nrm.x + (x.position.y - l0.y) * nrm.y), 0);
    if (Math.abs(side) > 0.01) openDir = side > 0 ? { x: -nrm.x, y: -nrm.y } : nrm;
  }
  const ensure = (a: (typeof actors)[number], kind: "arriving" | "approaching") => {
    if (!a.marks.some((m) => m.id === kind)) {
      // Outwards from the group, through the person's own place, turned towards the open side:
      // the turn that lets them start furthest back (up to 5 m) while leaving room behind them
      // for a camera. The approach follows the same path.
      let ox = a.position.x - centre.x, oy = a.position.y - centre.y;
      const l = Math.hypot(ox, oy) || 1;
      ox /= l; oy /= l;
      const room = 2.2; // space behind them for a camera a couple of metres back (D19e)
      const reach = (ux: number, uy: number) => {
        for (let d = 5; d >= 2.5; d -= 0.25) {
          const x = a.position.x + ux * d, y = a.position.y + uy * d;
          if (x > b.minX + room && x < b.maxX - room && y > b.minY + room && y < b.maxY - room) return d;
        }
        return 0;
      };
      let best = { ux: ox, uy: oy, d: reach(ox, oy) };
      for (const t of openDir ? [0.5, 0.65, 0.8, 1] : []) {
        const vx = ox * (1 - t) + openDir!.x * t, vy = oy * (1 - t) + openDir!.y * t;
        const vl = Math.hypot(vx, vy) || 1;
        const d = reach(vx / vl, vy / vl);
        if (t === 0.5 || d > best.d + 0.4) best = { ux: vx / vl, uy: vy / vl, d };
      }
      const dist = kind === "arriving" ? best.d || 2.5 : 1.4;
      a.marks.push({
        id: kind,
        label: kind === "arriving" ? "arriving, still well back across the room from the group, not yet with them" : "approaching, a step or two from the group",
        position: { x: +clampX(a.position.x + best.ux * dist).toFixed(2), y: +clampY(a.position.y + best.uy * dist).toFixed(2) },
      });
    }
  };
  // Start and finish (D20): each person is where the previous panel left them. A panel that moves
  // someone records where they start (`from`); the still picture shows where they end (`at`, or
  // their own place). "Reaches them" / "joins the group" ends at their place.
  const last = new Map<string, string>(); // character id → mark id, or "place"
  const from: (Record<string, string> | undefined)[] = [];
  const at = panels.map((p) => {
    const reached = REACHED.test(p.action);
    const kind = reached ? undefined : ARRIVING.test(p.action) ? "arriving" : APPROACHING.test(p.action) ? "approaching" : undefined;
    const a = p.subjectId ? actors.find((x) => x.characterId === p.subjectId) : undefined;
    if (!a || (!kind && !reached)) {
      if (a) last.set(a.characterId, "place");
      from.push(undefined);
      return undefined;
    }
    const prev = last.get(a.characterId);
    if (reached) {
      // Walked up to the group: from wherever they were, or from a step or two away.
      const start = prev && prev !== "place" ? prev : (ensure(a, "approaching"), "approaching");
      from.push({ [a.characterId]: start });
      last.set(a.characterId, "place");
      return undefined;
    }
    ensure(a, kind!);
    from.push(prev && prev !== kind ? { [a.characterId]: prev } : undefined);
    last.set(a.characterId, kind!);
    return { [a.characterId]: kind! };
  });
  return { plan: { ...plan, actors }, at, from };
}
