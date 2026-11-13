// Positions from the panel's words (D36). The app reads what each panel says people do and
// sets their per-panel positions (D35) the same way a user would on the floor plan's panel
// stepper: walking off (and gone from later panels until they're back), going to a place or a
// prop, sitting or lying on something, turning to someone, picking a prop up or putting it
// down. Everything here is general: names come from the cast, places from the venue's views
// and the scene's props. Whatever the user sets on a panel wins over this, and arrival marks
// from the words (D19b) are left to do their job.

import type { GeometryPlanData, PanelBlock, PlanFurniture, PlanLevel, PlanView, Point, Pose, PoseEntry } from "./types";
import { insideLevel, isIn } from "./levels";

export type AppBlock = Omit<PanelBlock, "by"> & { by: "app"; why: string };

export interface WordsPanel {
  action: string;
  subjectId?: string;
  visibleIds: string[];
  /** Arrival marks this panel puts people on (D19b). */
  at?: Record<string, string>;
  /** What the user has set on this panel (by "you"). */
  own?: Record<string, PanelBlock>;
  /** Where each person is, in the panel writer's words (D80): "in the skate bowl". */
  places?: Record<string, string>;
}

export const EXIT_RE = /\b(entrance|exit|door|doors|doorway|way out|lobby|foyer|hall|hallway|corridor|stairs|staircase|landing)\b/i;
// Up to three words naming a thing, stopping at the next clause ("his bed and takes out…").
const STOP = String.raw`(?:and|or|but|then|as|while|before|after|with|to|from|at|on|in|into|for|of|by|so|when|who|which|that|he|she|they|his|her|their|its|the|a|an)`;
const PHRASE = String.raw`([a-z][\w'-]*(?:\s+(?!${STOP}\b)[a-z][\w'-]*){0,2})`;
const TGT = String.raw`(?:(?:the|a|an|his|her|their|its|my|our)\s+)?${PHRASE}`;
const NAME = String.raw`([A-Z][a-z]+)`;
const MOVE = String.raw`(?:walk(?:s|ed|ing)?|go(?:es|ing)?|went|head(?:s|ed|ing)?|wander(?:s|ed|ing)?|mov(?:e|es|ed|ing)|cross(?:es|ed|ing)?|step(?:s|ped|ping)?|stroll(?:s|ed|ing)?|hurr(?:y|ies|ied|ying)|rush(?:es|ed|ing)?|run(?:s|ning)?|ran|dash(?:es|ed|ing)?|march(?:es|ed|ing)?|strid(?:e|es|ing)|strode|mak(?:e|es|ing)\s+(?:her|his|their)\s+way|made\s+(?:her|his|their)\s+way|retreat(?:s|ed|ing)?|back(?:s|ed|ing)?\s+away|drop(?:s|ped|ping)?(?:\s+in)?|rid(?:e|es|ing)|rode|skat(?:e|es|ed|ing)|swim(?:s|ming)?|swam|div(?:e|es|ed|ing)|dove|jump(?:s|ed|ing)?|leap(?:s|t|ing)?|slid(?:e|es|ing)?|climb(?:s|ed|ing)?|wad(?:e|es|ed|ing)|cycl(?:e|es|ed|ing)|paddl(?:e|es|ed|ing)|carv(?:e|es|ed|ing)|plung(?:e|es|ed|ing)|fall(?:s|ing)?|fell)`;
const ADV = String.raw`(?:\s+(?:slowly|quickly|briskly|calmly|angrily|nervously|confidently|purposefully|casually|back|over|across|straight|up|down|off|round|around|upstairs|downstairs|inside))*`;

type Rule = { kind: "downhill" | "leave" | "goto" | "gotoPerson" | "closer" | "turn" | "turnAway" | "face" | "at" | "pick" | "put" | "part"; re: RegExp };
const RULES: Rule[] = [
  // A part of an area (D82): "at the near rim of the bowl", "toward the far lip of the bowl",
  // "to the top of the slope", "up the far wall". Read by `readPlace`.
  { kind: "part", re: new RegExp(String.raw`\b(?:(?:on|at|to|onto|towards?|up\s+to|up|by|along)\s+)(?:the\s+)?(?:(?:near|far|other|opposite)\s+)?(?:rim|lip|edge|side|wall|bank|shore|top|bottom|foot|head|crest)\s+of\s+${TGT}|\b(?:on|at|to|onto|towards?|up)\s+the\s+(?:far|other|opposite)\s+(?:rim|lip|edge|side|wall|bank|shore)\b`, "g") },
  // Down a slope (D86): "pushes off and starts down the slope", "shuffles forward and follows
  // after Elin down the run". Read only where the scene has a slope; "walks down the street"
  // on the flat moves nobody.
  { kind: "downhill", re: new RegExp(String.raw`\b(?:${MOVE}|start(?:s|ed|ing)?|push(?:es|ed|ing)?\s+off|set(?:s|ting)?\s+off|ski(?:s|ed|ing)?|shuffl(?:e|es|ed|ing)|sledg?(?:e|es|ed|ing)|roll(?:s|ed|ing)?|follow(?:s|ed|ing)?|head(?:s|ed|ing)?|snowboard(?:s|ed|ing)?|board(?:s|ed|ing)?)\b[^.;!?]{0,90}?\b(?:down(?:hill)?\s+(?:the|a)\s+([a-z][\w-]*(?:\s+[a-z][\w-]*)?)|downhill)\b`, "g") },
  // A step towards someone: "steps closer", "moves in on Chase", "edges nearer to Mia".
  { kind: "closer", re: new RegExp(String.raw`\b(?:step(?:s|ped|ping)?|mov(?:e|es|ed|ing)|edg(?:e|es|ed|ing)|inch(?:es|ed|ing)?|draw(?:s|ing)?|drew|press(?:es|ed|ing)?)\s+(?:a\s+(?:step|little|bit)\s+)?(?:closer|nearer|forward|in\s+on|in)\b(?:\s+(?:to(?:wards?)?|on)\s+${NAME})?`, "g") },
  // Leaving: "walks off", "storms out", "leaves the kitchen", "heads for the door", "goes upstairs".
  { kind: "leave", re: new RegExp(String.raw`\b(?:walk(?:s|ed|ing)?|storm(?:s|ed|ing)?|strid(?:e|es|ing)|strode|march(?:es|ed|ing)?|stomp(?:s|ed|ing)?|head(?:s|ed|ing)?|go(?:es|ing)?|went|rush(?:es|ed|ing)?|hurr(?:y|ies|ied|ying)|slip(?:s|ped|ping)?|sneak(?:s|ing)?|snuck|wander(?:s|ed|ing)?)(?:\s+(?:straight|quickly|slowly|angrily|quietly))?\s+(?:off|out|away)\b(?!\s+(?:to|towards?|from\s+(?:him|her|them|[A-Z])|into|across|over))|\b(?:leav(?:es|ing)|left|exit(?:s|ed|ing)?|quit(?:s|ting)?)\s+(?:the\s+)?(room|kitchen|bar|party|house|flat|office|building|lounge|club|restaurant|pub|venue|hall|stage|scene|table|group|others|area|lobby|garden|bedroom|bathroom)\b|\b(?:leav(?:es|ing)|exit(?:s|ing))\b(?=\s*(?:[,.;!?]|$|\s+(?:and|as|without|through|via|by|with|in\s+a)\b))|\bheads?\s+(?:out|for\s+the\s+(?:door|exit|way\s+out|stairs|lift|elevator|car\s+park|street))\b|\bmak(?:es|ing)\s+(?:her|his|their)\s+way\s+out\b|\bdisappear(?:s|ed|ing)?\b|\bturn(?:s|ed|ing)?\s+to\s+(?:leave|go)\b|\b(?:go(?:es|ing)?|went|head(?:s|ed|ing)?|run(?:s|ning)?|ran|rush(?:es|ed|ing)?)\s+(?:upstairs|downstairs|outside|home)\b`, "g") },
  // Going somewhere: "walks over to the window", "heads to the bar", "crosses to the sofa".
  { kind: "goto", re: new RegExp(String.raw`\b${MOVE}${ADV}\s+(?:to|towards?|into|onto|up\s+to|over\s+to|across\s+to|back\s+to|for)\s+${TGT}`, "g") },
  { kind: "gotoPerson", re: new RegExp(String.raw`\b(?:${MOVE}${ADV}\s+(?:to|towards?|up\s+to|over\s+to|across\s+to|back\s+to)|join(?:s|ed|ing)?|approach(?:es|ed|ing)?|catch(?:es|ing)?\s+up\s+with)\s+${NAME}`, "g") },
  // Turning: "turns to Chase", "swings round to face the window", "turns away (from Ben)".
  { kind: "turn", re: new RegExp(String.raw`\b(?:turn(?:s|ed|ing)?|swing(?:s|ing)?|swung|spin(?:s|ning)?|spun|twist(?:s|ed|ing)?|swivel(?:s|led|ling)?|pivot(?:s|ed|ing)?|wheel(?:s|ed|ing)?)(?:\s+(?:round|around|back|sharply|slowly|quickly|suddenly))*\s+(?:to\s+face|to(?:wards?)?)\s+(?:${NAME}|(?:the|a|an|his|her|their)\s+${PHRASE})`, "g") },
  { kind: "turnAway", re: new RegExp(String.raw`\bturn(?:s|ed|ing)?\s+(?:(?:her|his|their)\s+back\s+(?:on|to)\s+${NAME}|away\s+from\s+${NAME}|(?:her|his|their)\s+back\b|away\b)`, "g") },
  { kind: "face", re: new RegExp(String.raw`\bfac(?:es|ing)\s+(?:${NAME}|(?:the|a|an)\s+${PHRASE})`, "g") },
  // Being somewhere: "sits on the sofa", "lies on his bed", "stands by the window", "gets into bed".
  { kind: "at", re: new RegExp(String.raw`\b(?:sit(?:s|ting)?|sat|perch(?:es|ed|ing)?|lie(?:s)?|lying|lay|lays?|lounge(?:s|d)?|lounging|sprawl(?:s|ed|ing)?|curl(?:s|ed|ing)?\s+up|slump(?:s|ed|ing)?|settl(?:e|es|ed|ing)|collaps(?:e|es|ed|ing)|flop(?:s|ped|ping)?|climb(?:s|ed|ing)?|get(?:s|ting)?|got|stand(?:s|ing)?|stood|lean(?:s|ed|ing)?|wait(?:s|ed|ing)?|stay(?:s|ed|ing)?|kneel(?:s|ing)?|knelt|crouch(?:es|ed|ing)?|hover(?:s|ed|ing)?|linger(?:s|ed|ing)?|hid(?:e|es|ing)|hid)(?:\s+(?:down|back|up|alone|quietly|still|there))*\s+(on|onto|on\s+to|at|by|beside|next\s+to|near|against|in|into|behind|in\s+front\s+of|under|over)\s+${TGT}`, "g") },
  // Props in hand: "picks up the glass", "takes out his phone"; "puts the glass down on the bar".
  { kind: "pick", re: new RegExp(String.raw`\b(?:pick(?:s|ed|ing)?\s+up|tak(?:es|ing)\s+out|took\s+out|pull(?:s|ed|ing)?\s+out|grab(?:s|bed|bing)?|lift(?:s|ed|ing)?|snatch(?:es|ed|ing)?|reach(?:es|ed|ing)?\s+for|answer(?:s|ed|ing)?|hold(?:s|ing)?\s+up|collect(?:s|ed|ing)?|tak(?:es|ing)|took|check(?:s|ed|ing)?|scroll(?:s|ed|ing)?\s+(?:through|on))\s+${TGT}`, "g") },
  { kind: "put", re: new RegExp(String.raw`\b(?:put(?:s|ting)?|set(?:s|ting)?|plac(?:e|es|ed|ing)|drop(?:s|ped|ping)?|leav(?:e|es|ing)|left|slam(?:s|med|ming)?|toss(?:es|ed|ing)?|throw(?:s|ing)?|threw|lay(?:s|ing)?|laid)\s+(?:(?:the|his|her|their|its)\s+([a-z][\w'-]*(?:\s+[a-z][\w'-]*){0,1})|it)\s+(?:back\s+)?(?:down\s+)?(?:on|onto|on\s+to|in|into|by|beside|next\s+to)\s+${TGT}`, "g") },
];

const SKIP_HEADS = new Set(["camera", "lens", "viewer", "audience", "floor", "ground", "room", "group", "others", "moment", "way", "side", "left", "right", "front", "back", "end", "middle", "centre", "center", "corner", "one", "other", "each", "them", "him", "her", "it", "face", "eyes", "head", "hand", "hands", "feet", "seat", "place", "spot", "time", "pace", "call", "conversation", "breath", "look", "glance", "step", "turn", "lead", "chance"]);
const singular = (w: string) => w.replace(/(?:ies)$/, "y").replace(/(?:es)$/, (m) => (/(?:ch|sh|ss|x)es$/.test(w) ? "" : m)).replace(/s$/, "");
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(Boolean).map(singular);

type Target = { kind: "prop"; f: PlanFurniture } | { kind: "view"; v: PlanView } | { kind: "area"; l: PlanLevel };

/** A prop, an area (D80) or a part of the venue named by some words: the longest match from the front. */
function resolve(text: string | undefined, props: PlanFurniture[], views: PlanView[], areas: PlanLevel[] = []): Target | undefined {
  if (!text) return undefined;
  const ws = text.toLowerCase().split(/\s+/);
  for (let n = ws.length; n >= 1; n--) {
    const head = singular(ws[n - 1]);
    if (SKIP_HEADS.has(head) || /^(and|or|but|then|with|while|as|to|of|for)$/.test(head)) continue;
    const before = ws.slice(0, n - 1).map(singular);
    const score = (name: string) => { const nw = words(name); return nw.includes(head) ? 2 + before.filter((w) => nw.includes(w)).length : 0; };
    const fp = props.map((f) => ({ f, s: score(f.name) })).filter((x) => x.s).sort((a, b) => b.s - a.s)[0];
    if (fp) return { kind: "prop", f: fp.f };
    const ap = areas.map((l) => ({ l, s: score(l.name) })).filter((x) => x.s).sort((a, b) => b.s - a.s)[0];
    if (ap) return { kind: "area", l: ap.l };
    const vp = views.map((v) => ({ v, s: score(v.name) })).filter((x) => x.s).sort((a, b) => b.s - a.s)[0];
    if (vp) return { kind: "view", v: vp.v };
  }
  return undefined;
}

const r2 = (p: Point): Point => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) });
const degTo = (from: Point, to: Point) => Math.round((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI);

/** How someone is placed by an area (D80): in it, at its edge, at its far edge, at its top or foot. */
export type AreaHow = "in" | "edge" | "far" | "top" | "bottom" | "farWall" | "mid";

/**
 * Where someone stands for an area (D80). In it: on their own side of its middle. At its edge:
 * on the rim nearest them, outside a hollow or water, inside anything else. Its far edge: the
 * rim across from them. A slope's top or foot: along the way it falls.
 */
export function areaSpot(l: PlanLevel, how: AreaHow, from: Point, others?: Point): Point {
  const c = { x: l.x + l.w / 2, y: l.y + l.d / 2 };
  const rx = l.w / 2, ry = l.d / 2;
  const rim = (v: Point): Point => {
    const n = Math.hypot(v.x, v.y) || 1, u = { x: v.x / n, y: v.y / n };
    const t = l.round ? 1 / Math.sqrt((u.x / rx) ** 2 + (u.y / ry) ** 2) : Math.min(Math.abs(u.x) > 1e-6 ? rx / Math.abs(u.x) : Infinity, Math.abs(u.y) > 1e-6 ? ry / Math.abs(u.y) : Infinity);
    return { x: u.x * t, y: u.y * t };
  };
  let toward = { x: from.x - c.x, y: from.y - c.y };
  if (Math.hypot(toward.x, toward.y) < 0.05) toward = { x: 0, y: -1 };
  // "Far" is far from the others (D80): the lip across the bowl from where the rest stand, not
  // from wherever this person happens to be.
  const awayFrom = others && Math.hypot(others.x - c.x, others.y - c.y) > 0.05 ? { x: others.x - c.x, y: others.y - c.y } : toward;
  // Partway down a slope, or out in the middle of anything else (D81).
  if (how === "mid") {
    if (l.dropM) {
      const u = { x: Math.cos(((l.fallDeg ?? 90) * Math.PI) / 180), y: Math.sin(((l.fallDeg ?? 90) * Math.PI) / 180) };
      const top = rim({ x: -u.x, y: -u.y });
      // About 8 m on from the top, or a third of the way down a short one.
      const run = Math.min(8, (Math.hypot(top.x, top.y) * 2) / 3);
      return r2({ x: c.x + top.x + u.x * (run + 0.6), y: c.y + top.y + u.y * (run + 0.6) });
    }
    return r2(c);
  }
  if (how === "top" || how === "bottom") {
    if (l.dropM) {
      const u = { x: Math.cos(((l.fallDeg ?? 90) * Math.PI) / 180), y: Math.sin(((l.fallDeg ?? 90) * Math.PI) / 180) };
      const e = rim(how === "top" ? { x: -u.x, y: -u.y } : u);
      const k = Math.max(0, 1 - 0.6 / (Math.hypot(e.x, e.y) || 1));
      return r2({ x: c.x + e.x * k, y: c.y + e.y * k });
    }
    how = "in";
  }
  // On the far wall of a hollow (D80): inside it, up near the rim across from them.
  if (how === "farWall") {
    const e = rim({ x: -awayFrom.x, y: -awayFrom.y });
    return r2({ x: c.x + e.x * 0.75, y: c.y + e.y * 0.75 });
  }
  if (how === "in") {
    if (insideLevel(l, from)) return r2(from);
    const e = rim(toward);
    return r2({ x: c.x + e.x * 0.35, y: c.y + e.y * 0.35 });
  }
  const e = rim(how === "far" ? { x: -awayFrom.x, y: -awayFrom.y } : toward);
  const n = Math.hypot(e.x, e.y) || 1;
  const out = isIn(l) ? 0.4 : -0.4; // beside a hollow or water; just inside anything else
  return r2({ x: c.x + e.x * (1 + out / n), y: c.y + e.y * (1 + out / n) });
}

/** "in the skate bowl", "on the far lip of the bowl", "beside Ava" (D80): how, and what. */
export function readPlace(words: string): { how: AreaHow | "beside"; what: string } {
  const t = words.trim().replace(/[.]$/, "").replace(/^(?:(?:standing|sitting|riding|skating|swimming|waiting|kneeling|crouching|lying|still|now|back)\s+)+/i, "");
  const forms: [RegExp, AreaHow | "beside"][] = [
    [/^(?:(?:on|up|at|to|onto|up\s+on|up\s+to)\s+)?(?:the\s+)?(?:far|other|opposite)\s+(?:wall|face)\s+of\s+/i, "farWall"],
    [/^(?:(?:on|up|at|to|onto)\s+)?(?:the\s+)?(?:near\s+)?(?:wall|face)\s+of\s+/i, "in"],
    [/^(?:(?:part|half|mid)[-\s]?way|further|some\s+way|a\s+(?:little|short)\s+way)\s+(?:down|up|along|across|into)\s+/i, "mid"],
    [/^(?:down|out\s+on|out\s+in|in\s+the\s+(?:middle|centre|center)\s+of)\s+/i, "mid"],
    [/^(?:(?:on|at|to|onto)\s+)?(?:the\s+)?(?:far|other|opposite)\s+(?:edge|side|lip|rim|end|bank|shore)\s+of\s+/i, "far"],
    [/^(?:on\s+the\s+other\s+side\s+of|across)\s+/i, "far"],
    [/^(?:(?:on|at|to)\s+)?(?:the\s+)?(?:top|head|crest)\s+of\s+/i, "top"],
    [/^(?:(?:on|at|to)\s+)?(?:the\s+)?(?:bottom|foot|base)\s+of\s+/i, "bottom"],
    [/^(?:(?:on|at|by|to|along)\s+)?(?:the\s+)?(?:near\s+)?(?:edge|side|lip|rim|end|bank|shore|poolside)\s+of\s+/i, "edge"],
    [/^(?:in|inside|into|down\s+in|on|onto|upon)\s+/i, "in"],
    [/^(?:beside|next\s+to|near|by|at|behind|in\s+front\s+of|close\s+to|with)\s+/i, "beside"],
  ];
  for (const [re, how] of forms) if (re.test(t)) return { how, what: t.replace(re, "").replace(/^(?:the|a|an|his|her|their|its)\s+/i, "").trim() };
  return { how: "beside", what: t.replace(/^(?:the|a|an)\s+/i, "") };
}

/**
 * Per-panel placements from the words, panel by panel (D36). Returns, for each panel, the
 * app's entries keyed like `spec.blocking` (people by id, props by "prop:" and id).
 */
export function blockingFromWords(plan: GeometryPlanData, panels: WordsPanel[], people: { id: string; name: string }[]): Record<string, AppBlock>[] {
  const b = plan.bounds ?? { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 };
  const props = plan.furniture ?? [];
  const views = plan.views ?? [];
  const areas = (plan.levels ?? []).filter((l) => l.kind || l.heightM !== 0);
  const clamp = (p: Point, m = 0.3): Point => r2({ x: Math.min(b.maxX - m, Math.max(b.minX + m, p.x)), y: Math.min(b.maxY - m, Math.max(b.minY + m, p.y)) });
  const base = new Map(plan.actors.map((a) => [a.characterId, a.position]));
  const pos = new Map(base);
  const propAt = new Map(props.map((f) => [f.id, f.position]));
  const held = new Map<string, string>(); // prop id → holder
  const left = new Map<string, Point>(); // who has gone, and where they went
  const byFirst = (w: string) => people.find((p) => p.name.split(/\s+/)[0].toLowerCase() === w.toLowerCase() || p.name.toLowerCase() === w.toLowerCase());
  const centre = () => {
    const ps = [...pos.entries()].filter(([id]) => !left.has(id)).map(([, p]) => p);
    return ps.length ? { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length } : { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  };
  /** Along a wall's direction from a point to just inside it, at most `cap` metres. */
  const towardWall = (from: Point, deg: number, margin: number, cap: number): Point => {
    const dx = Math.cos((deg * Math.PI) / 180), dy = Math.sin((deg * Math.PI) / 180);
    const tx = dx > 1e-6 ? (b.maxX - margin - from.x) / dx : dx < -1e-6 ? (b.minX + margin - from.x) / dx : Infinity;
    const ty = dy > 1e-6 ? (b.maxY - margin - from.y) / dy : dy < -1e-6 ? (b.minY + margin - from.y) / dy : Infinity;
    const t = Math.max(0.5, Math.min(cap, tx, ty));
    return clamp({ x: from.x + dx * t, y: from.y + dy * t }, Math.min(margin, 0.3));
  };
  const beside = (f: { position: Point; radiusM: number }, from: Point): Point => {
    let d = { x: from.x - f.position.x, y: from.y - f.position.y };
    let l = Math.hypot(d.x, d.y);
    if (l < 0.05) { const c = centre(); d = { x: c.x - f.position.x, y: c.y - f.position.y }; l = Math.hypot(d.x, d.y) || 1; }
    const k = (f.radiusM + 0.45) / (l || 1);
    return clamp({ x: f.position.x + d.x * k, y: f.position.y + d.y * k });
  };
  const placeOf = (t: Target, from: Point, on: boolean): Point => {
    if (t.kind === "prop") { const p = propAt.get(t.f.id) ?? t.f.position; return on ? clamp(p) : beside({ position: p, radiusM: t.f.radiusM }, from); }
    if (t.kind === "area") return clamp(areaSpot(t.l, on ? "in" : "edge", from));
    // Outdoors the "walls" are far off (D81): going to the rail or the trees is a few paces.
    return towardWall(from, t.v.directionDeg, 1.0, Math.min(b.maxX - b.minX, b.maxY - b.minY) >= 20 ? 3.5 : 9);
  };
  const nameOf = (t: Target) => (t.kind === "prop" ? t.f.name : t.kind === "area" ? t.l.name : t.v.name);

  return panels.map((pn) => {
    const out: Record<string, AppBlock> = {};
    const own = pn.own ?? {};
    const marked = new Set(Object.keys(pn.at ?? {}));
    // What the user set on this panel stands; their end spot is where the next panel starts.
    for (const [k, e] of Object.entries(own)) {
      if (k.startsWith("prop:")) { const id = k.slice(5); if (e.gone) propAt.delete(id); else propAt.set(id, e.to ?? e.at); held.delete(id); continue; }
      if (e.gone) { left.set(k, e.at); continue; }
      left.delete(k);
      if (e.only) continue; // this panel only: the next panel starts from where they were
      pos.set(k, e.to ?? e.at);
    }
    for (const id of marked) {
      const m = plan.actors.find((a) => a.characterId === id)?.marks?.find((x) => x.id === pn.at![id]);
      if (m) pos.set(id, m.position);
      left.delete(id);
    }
    // Anyone who left earlier: still gone unless this panel shows them (then back at their place).
    for (const [id, where] of [...left]) {
      if (own[id] || marked.has(id)) continue;
      if (pn.visibleIds.includes(id) || new RegExp(`\\b${(people.find((p) => p.id === id)?.name.split(/\s+/)[0] ?? id).replace(/[^\w]/g, "")}\\b`).test(pn.action)) {
        left.delete(id);
        const home = base.get(id)!;
        pos.set(id, home);
        out[id] = { at: home, by: "app", why: "back with the others" };
      } else out[id] = { at: where, gone: true, by: "app", why: "has left" };
    }

    // Where the panel writer put each person (D80): "in the skate bowl", "on the far lip of the
    // bowl", "beside Ava". It comes before the verbs below, which then leave that person be.
    const placed = new Set<string>();
    for (const [id, words0] of Object.entries(pn.places ?? {})) {
      if (!pos.has(id) || own[id] || marked.has(id) || left.has(id)) continue;
      const from = pos.get(id)!;
      const { how, what } = readPlace(words0);
      const person = byFirst(what.split(/\s+/)[0] ?? "");
      let spot: Point | undefined, why = "";
      if (person && person.id !== id && pos.has(person.id)) {
        const tp = pos.get(person.id)!, d = { x: from.x - tp.x, y: from.y - tp.y }, l = Math.hypot(d.x, d.y) || 1;
        if (l < 1.3) { placed.add(id); continue; } // already beside them
        spot = clamp({ x: tp.x + (d.x / l) * 0.9, y: tp.y + (d.y / l) * 0.9 }); why = `beside ${person.name.split(/\s+/)[0]}`;
      } else {
        const t = resolve(what, props, views, areas);
        if (!t) continue;
        const rest = [...pos.entries()].filter(([k]) => k !== id && !left.has(k)).map(([, p]) => p);
        const others = rest.length ? { x: rest.reduce((a, p) => a + p.x, 0) / rest.length, y: rest.reduce((a, p) => a + p.y, 0) / rest.length } : undefined;
        if (t.kind === "area") spot = clamp(areaSpot(t.l, how === "beside" ? "edge" : how, from, others));
        else if (how === "farWall" || how === "mid") spot = placeOf(t, from, false);
        else spot = placeOf(t, from, how === "in");
        // Already in the area they're said to be in (D86): their verbs still move them, "on the
        // ski run" with "starts down the slope" left Elin standing at the top.
        if (t.kind === "area" && how === "in" && Math.hypot(spot.x - from.x, spot.y - from.y) < 0.3) continue;
        why = `${how === "in" ? (t.kind === "area" && isIn(t.l) ? "in" : "on") : how === "far" ? "across" : how === "farWall" ? "on the far wall of" : how === "mid" ? "out on" : "at"} the ${nameOf(t)}`;
      }
      placed.add(id);
      // Nobody shares a spot (D81): two people "at the top of the slope" stood on one point, and
      // the camera chosen for them stood there too. The later one steps aside, a pace at a time.
      if (spot) {
        const taken = (q: Point) => [...pos.entries()].some(([k, o]) => k !== id && !left.has(k) && Math.hypot(o.x - q.x, o.y - q.y) < 0.75);
        const c0 = centre();
        const out0 = { x: spot.x - c0.x, y: spot.y - c0.y }, ol = Math.hypot(out0.x, out0.y);
        const side = ol > 0.05 ? { x: -out0.y / ol, y: out0.x / ol } : { x: 1, y: 0 };
        const base = spot;
        for (let n = 1; n <= 6 && taken(spot); n++) { const k = Math.ceil(n / 2) * 0.9 * (n % 2 ? 1 : -1); spot = clamp({ x: base.x + side.x * k, y: base.y + side.y * k }); }
      }
      if (!spot || Math.hypot(spot.x - from.x, spot.y - from.y) < 0.3) continue;
      out[id] = { at: spot, by: "app", why };
      pos.set(id, spot);
    }

    // The words, in order. Each match's person is the last name before it since the previous
    // match, or the one before carrying on ("she", "and"), or the panel's main person.
    const found: { kind: Rule["kind"]; m: RegExpExecArray }[] = [];
    for (const rule of RULES) { rule.re.lastIndex = 0; let m; while ((m = rule.re.exec(pn.action))) found.push({ kind: rule.kind, m }); }
    // A part of an area wins over a plainer reading of the same words ("rides up toward the far lip").
    const partsFound = found.filter((f) => f.kind === "part");
    for (let k = found.length - 1; k >= 0; k--) {
      const f = found[k];
      if (f.kind !== "part" && f.kind !== "pick" && f.kind !== "put" && partsFound.some((q) => q.m.index < f.m.index + f.m[0].length && f.m.index < q.m.index + q.m[0].length)) found.splice(k, 1);
    }
    found.sort((x, y) => x.m.index - y.m.index || y.m[0].length - x.m[0].length);
    const kept: typeof found = [];
    for (const f of found) { const last = kept[kept.length - 1]; if (!last || f.m.index >= last.m.index + last.m[0].length) kept.push(f); }
    let actor = pn.subjectId;
    let prevEnd = 0;
    const done = new Set<string>();
    for (const { kind, m } of kept) {
      const who = subjectIn(pn.action.slice(prevEnd, m.index), prevEnd === 0, byFirst);
      if (who) actor = who;
      prevEnd = m.index + m[0].length;
      const id = actor;
      if (!id || !pos.has(id) || own[id] || marked.has(id)) continue;
      if (placed.has(id) && kind !== "turn" && kind !== "face" && kind !== "turnAway" && kind !== "pick" && kind !== "put") continue;
      const from = pos.get(id)!;
      const set = (e: Omit<AppBlock, "by">) => {
        const n: AppBlock = { ...(out[id] ?? {}), ...e, by: "app" };
        if (n.to) delete n.facingDeg; // walking: they face the way they walk
        out[id] = n;
      };
      if (kind === "downhill") {
        if (done.has(`${id}:move`)) continue;
        const slopes = areas.filter((l) => l.dropM);
        const named = resolve(m[1], [], [], slopes);
        const dist0 = (l: PlanLevel) => insideLevel(l, from) ? 0 : Math.hypot(l.x + l.w / 2 - from.x, l.y + l.d / 2 - from.y);
        const l = named?.kind === "area" ? named.l : [...slopes].sort((x, y) => dist0(x) - dist0(y))[0];
        if (!l) continue;
        const u = { x: Math.cos(((l.fallDeg ?? 90) * Math.PI) / 180), y: Math.sin(((l.fallDeg ?? 90) * Math.PI) / 180) };
        // How far: a few tentative paces, or a proper start down it.
        const slow = /\b(?:shuffl\w*|tentative\w*|inch\w*|edg(?:e|es|ed|ing)|creep\w*|careful\w*|slow\w*|step\w*|walk\w*|wobbl\w*)\b/i.test(m[0]);
        let spot = { x: from.x + u.x * (slow ? 2 : 5), y: from.y + u.y * (slow ? 2 : 5) };
        // Following someone down: a couple of metres above them on the slope.
        const fm = /\bfollow(?:s|ed|ing)?\s+(?:after\s+|behind\s+)?([A-Z][a-z]+)/.exec(m[0]);
        const lead = fm ? byFirst(fm[1]) : undefined;
        const lp = lead && lead.id !== id && !left.has(lead.id) ? pos.get(lead.id) : undefined;
        let why = `${slow ? "a few paces" : "on the way"} down the ${l.name}`;
        if (lp) {
          const behind = { x: lp.x - u.x * 2.2, y: lp.y - u.y * 2.2 };
          if ((behind.x - from.x) * u.x + (behind.y - from.y) * u.y > 0.3) { spot = behind; why = `following ${lead!.name.split(/\s+/)[0]} down the ${l.name}`; }
        }
        // Not past the foot of the slope.
        const foot = areaSpot(l, "bottom", from);
        const along = (spot.x - foot.x) * u.x + (spot.y - foot.y) * u.y;
        if (along > 0) spot = { x: spot.x - u.x * along, y: spot.y - u.y * along };
        spot = clamp(spot);
        done.add(`${id}:move`);
        if (Math.hypot(spot.x - from.x, spot.y - from.y) < 0.3) continue;
        set({ at: spot, why });
        pos.set(id, spot);
      } else if (kind === "part") {
        if (done.has(`${id}:move`)) continue;
        const said = m[0].replace(/^(?:towards?|up\s+to|up|by|along)\s+/i, "on ");
        const { how, what } = readPlace(/\bof\s/i.test(said) ? said : `${said} of area`);
        // Named, or else the area they're in or nearest to.
        const named = resolve(what, [], [], areas);
        const l = named?.kind === "area" ? named.l : [...areas].sort((x, y) => Math.hypot(x.x + x.w / 2 - from.x, x.y + x.d / 2 - from.y) - Math.hypot(y.x + y.w / 2 - from.x, y.y + y.d / 2 - from.y))[0];
        if (!l || how === "beside") continue;
        const rest = [...pos.entries()].filter(([k]) => k !== id && !left.has(k)).map(([, p]) => p);
        const others = rest.length ? { x: rest.reduce((a, p) => a + p.x, 0) / rest.length, y: rest.reduce((a, p) => a + p.y, 0) / rest.length } : undefined;
        const spot = clamp(areaSpot(l, how, from, others));
        done.add(`${id}:move`);
        if (Math.hypot(spot.x - from.x, spot.y - from.y) < 0.3) continue;
        set({ at: spot, why: `${how === "far" ? "across" : how === "farWall" ? "on the far wall of" : "at the edge of"} the ${l.name}` });
        pos.set(id, spot);
      } else if (kind === "leave") {
        if (done.has(`${id}:move`)) continue;
        // Where to: "heads for the stairs", "goes upstairs"; the room they leave isn't where they go.
        const dest = /\bfor\s+the\s+([a-z\s]+)/i.exec(m[0])?.[1] ?? (/\b(?:up|down)stairs\b/i.test(m[0]) ? "stairs" : undefined);
        const named = resolve(dest, [], views);
        const exit = named?.kind === "view" ? named.v : views.find((v) => EXIT_RE.test(v.name));
        const c = centre();
        const deg = exit ? exit.directionDeg : degTo(c, from);
        const to = towardWall(from, deg, 0.3, 6);
        set({ at: from, to, why: "walks off" });
        left.set(id, to);
        done.add(`${id}:move`);
      } else if (kind === "goto" || kind === "at") {
        if (done.has(`${id}:move`)) continue;
        const t = resolve(kind === "goto" ? m[1] : m[2], props, views, areas);
        if (!t) continue;
        // Into an area (D80): "drops into the bowl", "dives into the pool".
        const on = (kind === "at" && /^(on|onto|on\s+to|in|into|over)$/i.test(m[1] ?? "") && t.kind !== "view") || (kind === "goto" && t.kind === "area" && /\b(?:into|in\s+to|onto|in)\s+/i.test(m[0]));
        const spot = placeOf(t, from, on);
        if (Math.hypot(spot.x - from.x, spot.y - from.y) < 0.3) continue;
        const name = nameOf(t);
        // Into an area (D82): the panel shows them in it, riding or swimming, not on the way.
        if (kind === "goto" && t.kind === "area" && on) set({ at: spot, why: `in the ${name}` });
        else if (kind === "goto") set({ at: from, to: spot, why: `goes to the ${name}` });
        else set({ at: spot, ...(t.kind === "view" ? { facingDeg: t.v.directionDeg } : {}), why: `${on ? "on" : "at"} the ${name}` });
        pos.set(id, spot);
        done.add(`${id}:move`);
      } else if (kind === "gotoPerson") {
        if (done.has(`${id}:move`)) continue;
        const who = byFirst(m[1]);
        const tp = who && who.id !== id ? pos.get(who.id) : undefined;
        if (!tp || left.has(who!.id)) continue;
        const d = { x: from.x - tp.x, y: from.y - tp.y }, l = Math.hypot(d.x, d.y);
        if (l < 1.3) continue; // already beside them
        const spot = clamp({ x: tp.x + (d.x / l) * 0.9, y: tp.y + (d.y / l) * 0.9 });
        set({ at: from, to: spot, why: `goes over to ${who!.name.split(/\s+/)[0]}` });
        pos.set(id, spot);
        done.add(`${id}:move`);
      } else if (kind === "closer") {
        if (done.has(`${id}:move`)) continue;
        const named = m[1] ? byFirst(m[1]) : undefined;
        const line = plan.lineOfAction?.includes(id) ? plan.lineOfAction.find((x) => x !== id) : undefined;
        const others = pn.visibleIds.filter((x) => x !== id && pos.has(x) && !left.has(x)).sort((x, y) => Math.hypot(pos.get(x)!.x - from.x, pos.get(x)!.y - from.y) - Math.hypot(pos.get(y)!.x - from.x, pos.get(y)!.y - from.y));
        const tid = named?.id ?? (line && others.includes(line) ? line : others[0]);
        const tp = tid ? pos.get(tid) : undefined;
        if (!tp) continue;
        const d = Math.hypot(tp.x - from.x, tp.y - from.y);
        const step = Math.min(0.5, d - 0.7);
        if (step < 0.1) continue;
        const spot = clamp({ x: from.x + ((tp.x - from.x) / d) * step, y: from.y + ((tp.y - from.y) / d) * step });
        set({ at: spot, facingDeg: degTo(spot, tp), why: `steps closer to ${people.find((p) => p.id === tid)?.name.split(/\s+/)[0] ?? tid}` });
        pos.set(id, spot);
        done.add(`${id}:move`);
      } else if (kind === "turn" || kind === "face") {
        if (out[id]?.to) continue; // walking: they face the way they walk
        const who = m[1] ? byFirst(m[1]) : undefined;
        const tp = who ? pos.get(who.id) : undefined;
        const t = !who ? resolve(m[2], props, views) : undefined;
        const at = out[id]?.at ?? from;
        const deg = tp ? degTo(at, tp) : t?.kind === "prop" ? degTo(at, propAt.get(t.f.id) ?? t.f.position) : t?.kind === "view" ? t.v.directionDeg : undefined;
        if (deg === undefined) continue;
        set({ at, facingDeg: deg, why: `turns to ${who ? who.name.split(/\s+/)[0] : `the ${nameOf(t!)}`}` });
      } else if (kind === "turnAway") {
        if (out[id]?.to) continue;
        const who = m[1] ? byFirst(m[1]) : m[2] ? byFirst(m[2]) : undefined;
        const at = out[id]?.at ?? from;
        const away = (who ? pos.get(who.id) : undefined) ?? centre();
        if (Math.hypot(away.x - at.x, away.y - at.y) < 0.05) continue;
        set({ at, facingDeg: degTo(away, at), why: `turns away from ${who ? who.name.split(/\s+/)[0] : "the others"}` });
      } else if (kind === "pick") {
        const t = resolve(m[1], props, []);
        if (t?.kind !== "prop") continue;
        held.set(t.f.id, id);
        out[`prop:${t.f.id}`] = { at: propAt.get(t.f.id) ?? t.f.position, with: id, by: "app", why: `${people.find((p) => p.id === id)?.name.split(/\s+/)[0] ?? id} has it in hand` };
      } else if (kind === "put") {
        const what = m[1] ? resolve(m[1], props, []) : undefined;
        const propId = what?.kind === "prop" ? what.f.id : [...held.entries()].reverse().find(([, h]) => h === id)?.[0];
        const t = resolve(m[2], props.filter((f) => f.id !== propId), views);
        if (!propId || !t) continue;
        const spot = t.kind === "prop" ? clamp(propAt.get(t.f.id) ?? t.f.position) : placeOf(t, out[id]?.to ?? pos.get(id)!, false);
        held.delete(propId);
        propAt.set(propId, spot);
        out[`prop:${propId}`] = { at: spot, by: "app", why: `put down on the ${nameOf(t)}` };
      }
    }
    return out;
  });
}

/**
 * Who does the next action, from the words just before it (D36): a name right before the verb
 * ("as Aron walks off"); otherwise a name starting a sentence or clause ("Jade, fuming, gives
 * Chase the finger and turns away": Jade); otherwise whoever did the last one (she, he, and).
 */
export function subjectIn(seg: string, atStart: boolean, byFirst: (w: string) => { id: string } | undefined): string | undefined {
  const right = /\b([A-Z][a-z]+)\b(?:['’]s\s+\w+)?(?:\s*,[^,]{0,40},)?\s*(?:(?:\w+ly|then|now|also|just|still|finally|quickly|slowly|suddenly|is|was|are|were|has|had|been|remains|stays|keeps|lies|sits)\s+)*$/.exec(seg);
  if (right && byFirst(right[1])) return byFirst(right[1])!.id;
  const starts = new RegExp(String.raw`(?:${atStart ? "^\\s*|" : ""}[.;!?]\s+|\b(?:and|but|while|as|then|so)\s+)(?:(?:Then|Meanwhile|Now|Suddenly|Finally|Later|Still),?\s+)?([A-Z][a-z]+)\b`, "g");
  for (const m of seg.matchAll(starts)) { const p = byFirst(m[1]); if (p) return p.id; }
  return undefined;
}

// ---------- Posture from panel to panel (D37) ----------
// Someone lying on their bed stays lying in the next panel unless the words say they sit up,
// get up, or walk somewhere. Each panel's posture is the last one its words give, or the one
// before carried on. Walking (or leaving) means standing.

const ON_WHAT = String.raw`(?:\s+(?:on|in|across|upon|at|onto|into)\s+(?:(?:the|his|her|their|a|an|its|my|our)\s+)?(?:edge\s+of\s+(?:the|his|her|their)\s+)?${PHRASE})?`;
const POSES: { pose: Pose; re: RegExp }[] = [
  // Lying: "lies on his bed", "is lying down", "lies back", "in bed", "curled up on the sofa".
  // Not "lies to her" or "lays the table".
  { pose: "lying", re: new RegExp(String.raw`\b(?:lie(?:s)?|lying|lay)\b(?!\s+(?:to|about)\b)(?:\s+(?:down|back|flat|still|awake|motionless|there|face\s+(?:up|down)|curled\s+up|on\s+(?:his|her|their)\s+(?:back|front|side|stomach)))*${ON_WHAT}|\b(?:gets?|got|climbs?|climbed|crawls?|crawled|slips?|slipped)\s+(?:back\s+)?(?:into|in)\s+(?:(?:his|her|their|the)\s+)?(bed)\b|\b(?:curl(?:s|ed)?\s+up|stretch(?:es|ed)?\s+out|sprawl(?:s|ed)?|flop(?:s|ped)?\s+(?:down|back))${ON_WHAT}|\b(?:in\s+bed|asleep\s+(?:on|in)\s+the\s+\w+)\b`, "g") },
  // Sitting: "sits up", "sits on the edge of the bed", "is sitting", "sat at the table", "perched on".
  { pose: "sitting", re: new RegExp(String.raw`\b(?:sit(?:s)?|sitting|sat|seated|perch(?:es|ed|ing)?)\b(?:\s+(?:up|down|back|bolt\s+upright|upright|forward|alone|quietly|still))*${ON_WHAT}`, "g") },
  // Standing: "gets up", "stands up", "gets out of bed", "rises", "jumps to his feet", "stands".
  { pose: "standing", re: /\b(?:stand(?:s)?\s+up|standing\s+up|stood\s+up|gets?\s+(?:up|out\s+of\s+(?:bed|the\s+\w+)|to\s+(?:his|her|their)\s+feet)|got\s+(?:up|out\s+of\s+bed)|getting\s+up|ris(?:es|ing)|rose|jumps?\s+(?:up|to\s+(?:his|her|their)\s+feet)|leaps?\s+up|springs?\s+up|climbs?\s+out\s+of\s+bed|stands|standing|stood)\b/g },
  { pose: "kneeling", re: /\b(?:kneel(?:s|ing)?|knelt|drops?\s+to\s+(?:his|her|their)\s+knees|on\s+(?:his|her|their)\s+knees)\b/g },
  { pose: "crouching", re: /\b(?:crouch(?:es|ed|ing)?|squat(?:s|ted|ting)?|ducks?\s+down|hunker(?:s|ed)?\s+down)\b/g },
];

/** Postures, panel by panel (D37), given each panel's final positions (who walks, who has left). */
export function posturesFromWords(plan: GeometryPlanData, panels: (WordsPanel & { blocking?: Record<string, PanelBlock> })[], people: { id: string; name: string }[], start?: { pose: Pose; on?: string }): Record<string, PoseEntry>[] {
  const props = plan.furniture ?? [];
  const byFirst = (w: string) => people.find((p) => p.name.split(/\s+/)[0].toLowerCase() === w.toLowerCase() || p.name.toLowerCase() === w.toLowerCase());
  const state = new Map<string, { pose: Pose; on?: string }>();
  if (start) for (const a of plan.actors) state.set(a.characterId, { ...start });
  const onWords = (t: string | undefined) => {
    if (!t) return undefined;
    const hit = resolve(t, props, []);
    if (hit?.kind === "prop") return `the ${hit.f.name}`;
    const head = t.trim().split(/\s+/).filter((w) => !SKIP_HEADS.has(singular(w)) || /^(?:floor|ground)$/.test(w));
    return head.length ? `the ${head.join(" ")}` : undefined;
  };
  return panels.map((pn) => {
    const out: Record<string, PoseEntry> = {};
    const bl = pn.blocking ?? {};
    const setHere = new Map<string, { pose: Pose; on?: string; why: string; by: "you" | "app"; only?: boolean }>();
    // The words, in order: the last posture for each person wins.
    const found: { pose: Pose; m: RegExpExecArray }[] = [];
    for (const r of POSES) { r.re.lastIndex = 0; let m; while ((m = r.re.exec(pn.action))) found.push({ pose: r.pose, m }); }
    found.sort((x, y) => x.m.index - y.m.index || y.m[0].length - x.m[0].length);
    let actor = pn.subjectId, prevEnd = 0, lastEnd = -1;
    for (const { pose, m } of found) {
      if (m.index < lastEnd) continue; // overlaps the one before
      const seg = pn.action.slice(prevEnd, m.index);
      const who = subjectIn(seg, prevEnd === 0, byFirst);
      if (who) actor = who;
      prevEnd = lastEnd = m.index + m[0].length;
      // "The phone sits on the desk": a thing, not a person.
      if (!who && /\b(?:the|a|an|his|her|their|its)\s+[a-z][\w'-]*\s*$/i.test(seg)) continue;
      if (!actor) continue;
      const target = m.slice(1).find((x) => x);
      const before = state.get(actor);
      // "Sits on the bed" keeps what they're on if it isn't said again.
      const on = onWords(target) ?? (pose !== "standing" && before?.pose !== "standing" ? before?.on : undefined);
      setHere.set(actor, { pose, ...(on && pose !== "standing" ? { on } : {}), why: m[0].trim(), by: "app" });
    }
    // A posture you set on this panel wins (D37).
    for (const [k, b] of Object.entries(bl)) if (k.startsWith("pose:") && b.pose) setHere.set(k.slice(5), { pose: b.pose, by: "you", why: "set by you", ...(b.only ? { only: true } : {}), ...(b.pose !== "standing" ? { on: setHere.get(k.slice(5))?.on ?? state.get(k.slice(5))?.on } : {}) });
    for (const a of plan.actors) {
      const id = a.characterId;
      if (bl[id]?.gone) { state.set(id, { pose: "standing" }); continue; } // left on foot
      const before = state.get(id);
      const here = setHere.get(id);
      // Walking in this panel: on their feet in the picture; what the words end with carries on.
      if (bl[id]?.to && here?.by !== "you") {
        out[id] = { pose: "standing", by: "app", why: "walks", ...((before?.pose ?? "standing") !== "standing" ? { from: before!.pose } : {}), ...(here && here.pose !== "standing" ? { end: here.pose, ...(here.on ? { on: here.on } : {}) } : {}) };
        state.set(id, here ? { pose: here.pose, ...(here.on ? { on: here.on } : {}) } : { pose: "standing" });
        continue;
      }
      if (here) {
        const changed = (before?.pose ?? "standing") !== here.pose;
        out[id] = { pose: here.pose, ...(here.on ? { on: here.on } : {}), by: here.by, why: here.why, ...(changed ? { from: before?.pose ?? "standing" } : {}) };
        if (!here.only) state.set(id, { pose: here.pose, ...(here.on ? { on: here.on } : {}) });
      } else if (before && before.pose !== "standing") out[id] = { ...before, by: "carried" };
    }
    return out;
  });
}

/** Words for someone's posture in a picture or clip (D37), or nothing for plain standing. */
export function postureWords(name: string, e: PoseEntry | undefined, pr: "she" | "he" | "they" = "they"): string | undefined {
  if (!e) return undefined;
  const on = e.on ? ` ${e.pose === "lying" ? "on" : e.pose === "sitting" ? (/\b(table|desk|bar|counter)\b/.test(e.on) ? "at" : "on") : "on"} ${e.on}` : "";
  const word = { standing: "standing", sitting: "sitting", lying: "lying", kneeling: "kneeling", crouching: "crouching" }[e.pose];
  const subj = pr === "she" ? "she" : pr === "he" ? "he" : "they";
  const has = pr === "they" ? "have" : "has";
  if (e.from && e.from !== e.pose) {
    if (e.pose === "standing") return `${name} has just got up: ${subj} ${pr === "they" ? "are" : "is"} on ${pr === "she" ? "her" : pr === "he" ? "his" : "their"} feet now, no longer ${e.from}`;
    return `${name} ${has} just ${e.pose === "sitting" ? (e.from === "lying" ? "sat up" : "sat down") : e.pose === "lying" ? "lain down" : e.pose === "kneeling" ? "knelt down" : "crouched down"} and is ${word}${on} now (${subj} ${pr === "they" ? "were" : "was"} ${e.from} before)`;
  }
  if (e.pose === "standing") return undefined;
  return `${name} is ${word}${on}${e.by === "carried" ? `, still ${word} as in the panel before: ${subj} ${has} not got up` : ""}`;
}

/** The posture a scene setting gives everyone at the start (D37): "sitting round the kitchen table". */
export function startPose(spot: string | undefined, plan: GeometryPlanData): { pose: Pose; on?: string } | undefined {
  if (!spot) return undefined;
  for (const r of POSES) {
    if (r.pose === "standing") continue;
    r.re.lastIndex = 0;
    const m = r.re.exec(spot);
    if (m) {
      const t = m.slice(1).find((x) => x);
      const hit = t ? resolve(t, plan.furniture ?? [], []) : undefined;
      return { pose: r.pose, ...(hit?.kind === "prop" ? { on: `the ${hit.f.name}` } : t ? { on: `the ${t}` } : {}) };
    }
  }
  return undefined;
}
