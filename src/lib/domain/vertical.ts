// Up and down (D25). The camera normally sits at eye level, looking level. When a moment is
// about looking down (over a cliff edge, into a hole, at the street below) or up (at a window,
// the sky, someone towering over them), the camera goes high and tilts down, or low and tilts
// up, so the picture shows the drop or the height. Read from the panel's words, for any scene;
// the user can still set height and tilt on the floor plan.

import type { PlanCamera } from "./types";

export type VerticalKind = "level" | "high" | "low" | "overhead" | "birds-eye" | "worms-eye";

export interface Vertical { kind: VerticalKind; heightM: number; tiltDeg: number; why: string; rollDeg?: number }

export const EYE_LEVEL_M = 1.6;

const DOWN_INTO = /\b(?:look(?:s|ed|ing)?|peer(?:s|ed|ing)?|stare(?:s|d)?|staring|gaz(?:e|es|ed|ing)|glanc(?:e|es|ed|ing)|peek(?:s|ed|ing)?)\s+(?:down\s+)?into\s+(?:the|a|an)\s+(?:hole|well|pit|shaft|grave|box|crate|chest|water|pool|abyss|chasm|hatch|trapdoor|basement|cellar|crater|bucket|drawer|bag|case|tank|void|manhole|mine)\b/i;
const DOWN = /\b(?:(?:look(?:s|ed|ing)?|peer(?:s|ed|ing)?|stare(?:s|d)?|staring|gaz(?:e|es|ed|ing)|glanc(?:e|es|ed|ing)|peek(?:s|ed|ing)?)\s+down(?!\s+(?:the|a|an|her|his|their)\s+(?:\w+\s+)?(?:slope|road|street|corridor|hall|hallway|aisle|line|track|path|lane|run|piste|hill|barrel|lens|table|bar|beach|pitch|field|river|valley|tunnel|platform|pier))|over\s+the\s+(?:edge|cliff|ledge|balcony|railing|rail|parapet|side|drop|precipice|banister)|(?:edge|brink|lip)\s+of\s+(?:a|the)\s+(?:cliff|roof|rooftop|building|ledge|drop|precipice|canyon|gorge|ravine|crater|pit|hole|platform)|(?:below|beneath)\s+(?:her|him|them|us|me)|(?:the\s+)?(?:street|ground|floor|crowd|city|valley|river|sea)\s+(?:far\s+)?below|from\s+(?:the\s+)?(?:top|rooftop|roof|balcony|ledge|cliff|bridge|window)\s+above|looks?\s+down\s+on|reflection\s+in\s+(?:the\s+)?(?:water|pool|pond|lake|river|puddle|sea|fountain))\b/i;
const UP = /\b(?:(?:look(?:s|ed|ing)?|peer(?:s|ed|ing)?|stare(?:s|d)?|staring|gaz(?:e|es|ed|ing)|glanc(?:e|es|ed|ing)|squint(?:s|ed|ing)?)\s+up(?:wards?)?|up\s+(?:at|to|towards?)\s+(?:the|a|an|her|his|their)\b|upwards|(?:above|over)\s+(?:her|him|them|us|me)\b|overhead|towards?\s+the\s+(?:sky|ceiling|roof|stars|moon|top|heavens|upper\s+floor|balcony|window\s+above)|tower(?:s|ed|ing)?\s+over|loom(?:s|ed|ing)?\s+over|from\s+(?:far\s+)?below|at\s+the\s+(?:top|summit)\s+of|(?:window|balcony|ledge|roof)\s+above)\b/i;

// Lying down (D26). Someone on their back on a bed, sofa or the grass sees straight up, and the
// classic shot is from directly above, looking down on their face. Lying without looking up gets
// a low camera, level with them. Their eyes are about half a metre up on a bed or sofa, near the
// ground on grass or a floor.
const SURFACE = String.raw`(?:bed|sofa|couch|settee|bench|mattress|lounger|sun\s?bed|hammock|day\s?bed|chaise|grass|lawn|ground|floor|beach|sand|deck|rug|carpet|blanket|towel|field|meadow|snow|hillside|road|pavement|tarmac|roof)`;
const LYING = new RegExp(String.raw`\b(?:lies|lying|lay|lain|laid|sprawl(?:s|ed|ing)?|reclin(?:es|ed|ing)|stretch(?:es|ed|ing)?\s+out|flat\s+out|curl(?:s|ed|ing)?\s+up)\b(?:\s+[\w’'-]+){0,4}?\s+(?:on|in|across|under|upon|among)\s+(?:(?:the|a|an|his|her|their|my|our)\s+(?:\w+\s+)?)?(${SURFACE}|back)\b|\b(?:on|onto)\s+(?:his|her|their|my|our)\s+back\b`, "i");
const RAISED = /bed|sofa|couch|settee|bench|mattress|lounger|hammock|chaise/i;
const SKYWARD = /\b(?:up|upwards?|overhead|above)\b|\b(?:at|towards?|into)\s+the\s+(?:sky|ceiling|stars|clouds|moon|sun|heavens|night\s+sky|canopy|branches|leaves|rafters)\b/i;

// Falling and jumping (D26). Off a cliff, a building, a bridge: the camera stays at the top and
// looks straight down as they drop away. Out of a plane, or skydiving: a camera falling alongside
// them. Falling to the floor: a camera down at floor level.
const HIGH_PLACE = String.raw`(?:cliff|cliffs|cliff\s?edge|cliff\s?top|edge|ledge|roof|rooftop|building|tower|skyscraper|bridge|balcony|window|wall|parapet|railing|platform|precipice|crag|rock|rocks|mountain|ridge|dam|pier|jetty|harbour\s+wall|boat|ship|deck|diving\s+board|high\s+board|tree|ladder|scaffold(?:ing)?|crane|stairwell|top)`;
const AIRCRAFT = String.raw`(?:plane|aeroplane|airplane|aircraft|jet|helicopter|chopper|hot[-\s]air\s+balloon|balloon|glider)`;
const FALL_VERB = String.raw`(?:fall(?:s|ing)?|fell|jump(?:s|ed|ing)?|leap(?:s|t|ed|ing)?|dive(?:s|d)?|diving|dove|plunge(?:s|d)?|plunging|plummet(?:s|ed|ing)?|tumble(?:s|d)?|tumbling|topple(?:s|d)?|toppling|slip(?:s|ped|ping)?|throw(?:s|n)?\s+(?:him|her|them)sel(?:f|ves)|hurl(?:s|ed|ing)?\s+(?:him|her|them)sel(?:f|ves)|is\s+(?:pushed|thrown)|was\s+(?:pushed|thrown)|gets?\s+pushed)`;
const SKYDIVE = new RegExp(String.raw`\b(?:sky[-\s]?div(?:e|es|ed|ing|er|ers)|free[-\s]?fall(?:s|ing)?|parachut(?:e|es|ed|ing|ist)|base[-\s]?jump(?:s|ed|ing|er)?|halo\s+jump)\b|\b${FALL_VERB}\s+(?:\w+\s+){0,2}?(?:out\s+of|from|off)\s+(?:the|a|an|his|her|their)\s+(?:\w+\s+)?(?:open\s+)?(?:door\s+of\s+the\s+)?${AIRCRAFT}\b`, "i");
const FALL_FROM = new RegExp(String.raw`\b${FALL_VERB}\s+(?:\w+\s+){0,2}?(?:off|from|over|out\s+of|down\s+from|backwards?\s+off|backwards?\s+over)\s+(?:the|a|an|his|her|their)\s+(?:\w+\s+){0,2}?(${HIGH_PLACE})\b|\b(?:off|over)\s+the\s+(?:edge|cliff|ledge|side)\b(?=[^.]*\b${FALL_VERB})|\b${FALL_VERB}\b(?=[^.]*\b(?:to\s+(?:his|her|their)\s+death|into\s+the\s+(?:sea|river|water|abyss|void|chasm|gorge|ravine|canyon|lake|depths)|hundreds?\s+of\s+(?:feet|metres|meters)|(?:the\s+)?(?:street|ground|sea|rocks|water)\s+(?:far\s+)?below))`, "i");
const FALL_DOWN = new RegExp(String.raw`\b(?:fall(?:s|ing)?|fell|collaps(?:e|es|ed|ing)|crumpl(?:e|es|ed|ing)|slump(?:s|ed|ing)?|drop(?:s|ped|ping)?|sink(?:s|ing)?|sank|trip(?:s|ped|ping)?|stumbl(?:e|es|ed|ing)|keel(?:s|ed|ing)?\s+over|is\s+knocked|gets?\s+knocked|was\s+knocked)\b(?:\s+[\w’'-]+){0,3}?\s+(?:to|onto|on\s+to|on|down\s+on|down\s+to|in\s+a\s+heap\s+on)\s+(?:the|his|her|their)\s+(?:\w+\s+)?(?:floor|ground|grass|pavement|road|carpet|knees|deck|tarmac|sand|mud|dirt)\b`, "i");

export type Posture = "lying" | "lying-up" | "falling" | "freefall" | "fallen";
export interface Body { posture: Posture; surface?: string; place?: string; jumps?: boolean }

/** What the body is doing, when it changes the camera: lying down, falling, in free fall. */
export function bodyFor(text: string): Body | undefined {
  const jumps = /\b(?:jump|leap|dive|dove|diving|throw|hurl|base)/i.test(text) && !/\b(?:fall|fell|slip|tumbl|toppl|pushed|thrown)/i.test(text);
  if (SKYDIVE.test(text)) return { posture: "freefall", jumps };
  const f = FALL_FROM.exec(text);
  if (f) return { posture: "falling", place: (f[1] ?? (/(cliff|edge|ledge|side)/i.exec(f[0])?.[1] ?? "edge")).toLowerCase(), jumps };
  if (FALL_DOWN.test(text)) return { posture: "fallen" };
  const l = LYING.exec(text);
  if (l) {
    // "on her back on the grass": the grass is what they lie on.
    const surfaces = [...text.slice(l.index).matchAll(new RegExp(String.raw`\b(?:on|in|across|under|upon|among)\s+(?:(?:the|a|an|his|her|their|my|our)\s+(?:\w+\s+)?)?(${SURFACE})\b`, "gi"))].map((m) => m[1]);
    const surface = (surfaces[0] ?? l[1] ?? "back").toLowerCase();
    const rest = text.slice(l.index);
    return { posture: SKYWARD.test(rest) || /\b(?:stares?|staring|gaz(?:e|es|ing))\s+at\s+the\s+(?:ceiling|sky|stars)/i.test(rest) ? "lying-up" : "lying", surface };
  }
  return undefined;
}

function bodyVertical(b: Body): Vertical {
  const low = b.surface && RAISED.test(b.surface) ? 0.6 : 0.3;
  switch (b.posture) {
    case "lying-up": return { kind: "overhead", heightM: low + 1.6, tiltDeg: -88, why: "lying on their back looking up: straight down from directly above, onto their face, as if from what they are looking at" };
    case "lying": return { kind: "low", heightM: low, tiltDeg: 0, why: "lying down: a low camera, level with them" };
    case "falling": return { kind: "overhead", heightM: 3.2, tiltDeg: -75, why: "falling from a height: from the top, looking straight down as they drop away, so the fall shows" };
    case "freefall": return { kind: "level", heightM: EYE_LEVEL_M, tiltDeg: 0, why: "in free fall: a camera falling alongside them at the same height, the ground far below" };
    case "fallen": return { kind: "low", heightM: 0.3, tiltDeg: 0, why: "falling to the ground: a camera at floor level where they land" };
  }
}

/** Words for the shot effect line: how the body and the space around it look. */
export function bodyEffect(text: string, who = "they"): string | undefined {
  const b = bodyFor(text);
  if (!b) return undefined;
  const surf = b.surface && b.surface !== "back" ? b.surface.replace(/\s+/g, " ") : undefined;
  const sky = /\bceiling|rafters\b/i.test(text) ? "ceiling" : /\b(?:indoors|room|bedroom|living\s+room|lounge|ward)\b/i.test(text) || (surf && RAISED.test(surf)) ? "ceiling" : "sky";
  switch (b.posture) {
    case "lying-up":
      return `seen from directly above, looking straight down: ${who} lying on their back${surf ? ` on the ${surf}` : ""}, face up, eyes looking up towards the camera${surf ? `, the ${surf} filling the frame around them` : ""}. What they see, the ${sky} straight above, is a different shot`;
    case "lying":
      return `the camera low, level with ${who} lying${surf ? ` on the ${surf}` : " down"}, their body running across the frame, the ${surf ?? "ground"} close in the foreground`;
    case "falling": {
      const verb = b.jumps ? "leaping out, arms forward" : "falling away, arms and legs flailing";
      const p = b.place && !/^(edge|side|top)$/.test(b.place) ? b.place : "edge";
      const place = /^(cliff|cliffs|building|tower|skyscraper|mountain|crag|rock|rocks|ridge|dam|tree|ladder|crane|scaffold|scaffolding|wall)$/.test(p) ? `the top of the ${p}` : `the ${p}`;
      return `from ${place}, looking straight down the drop: ${who} ${verb}, getting smaller, the ground or water far below; motion blur, clothes and hair streaming upward. The edge cuts across the bottom of the frame`;
    }
    case "freefall":
      return `in free fall high in the open sky, seen from a camera falling alongside ${who === "they" ? "them" : who} at the same height: body ${b.jumps ? "spread flat, arms and legs out" : "tumbling"}, clothes rippling and hair blown hard by the rushing wind, clouds around, the ground spread out far below; no plane interior and no floor in the picture`;
    case "fallen":
      return `the camera down at floor level, ${who} on the ground close to it, the ${/(grass|pavement|road|carpet|deck|tarmac|sand|mud|dirt)/i.exec(text)?.[1]?.toLowerCase() ?? "floor"} close in the foreground`;
  }
}

// Named angles (D27). When the panel names the shot ("low angle", "bird's-eye view", "Dutch
// angle", "from hip level"), that is what it gets, ahead of anything worked out from the action.
const NAMED: { re: RegExp; v: Vertical }[] = [
  { re: /\b(?:bird['’]?s?[-\s]eye|top[-\s](?:down\s+)?shot|overhead\s+shot|god['’]?s[-\s]eye|aerial\s+(?:shot|view)|from\s+directly\s+(?:above|overhead))\b/i, v: { kind: "birds-eye", heightM: 6, tiltDeg: -90, why: "bird's-eye view, named in the panel: straight down from directly overhead, map-like, showing scale and isolation" } },
  { re: /\b(?:worm['’]?s?[-\s]eye|nadir\s+(?:angle|shot|view)|from\s+the\s+(?:ground|floor)\s+looking\s+(?:straight\s+|steeply\s+)?up)\b/i, v: { kind: "worms-eye", heightM: 0.1, tiltDeg: 55, why: "worm's-eye view, named in the panel: from the ground looking steeply up, for towering height and dominance" } },
  { re: /\bhigh[-\s]angle\b/i, v: { kind: "high", heightM: 2.8, tiltDeg: -35, why: "high angle, named in the panel: looking down, making them smaller and more vulnerable" } },
  { re: /\blow[-\s]angle\b/i, v: { kind: "low", heightM: 0.6, tiltDeg: 25, why: "low angle, named in the panel: looking up, making them taller and more powerful" } },
  { re: /\b(?:ground|floor)[-\s](?:level|height)\s+(?:shot|camera|angle|view)|\bfrom\s+(?:ground|floor)\s+level\b|\bcamera\s+(?:on|at)\s+the\s+(?:floor|ground)\b/i, v: { kind: "low", heightM: 0.15, tiltDeg: 0, why: "ground level, named in the panel: the camera on the floor" } },
  { re: /\bknee[-\s](?:level|height)\b/i, v: { kind: "low", heightM: 0.5, tiltDeg: 0, why: "knee level, named in the panel: low, following feet and things near the ground" } },
  { re: /\b(?:hip|waist)[-\s](?:level|height)\b/i, v: { kind: "level", heightM: 1.0, tiltDeg: 0, why: "hip level, named in the panel: the camera at waist height" } },
  { re: /\bshoulder[-\s](?:level|height)\b/i, v: { kind: "level", heightM: 1.45, tiltDeg: 0, why: "shoulder level, named in the panel: just below the eyes, conversational" } },
  { re: /\beye[-\s]level\b/i, v: { kind: "level", heightM: EYE_LEVEL_M, tiltDeg: 0, why: "eye level, named in the panel: neutral and direct" } },
];
const DUTCH = /\b(?:dutch|canted|oblique)\s+(?:angle|tilt|shot|frame)|\btilted\s+(?:frame|horizon|camera\s+angle)|\b(?:frame|horizon)\s+(?:is\s+)?(?:tilted|on\s+a\s+slant|askew)\b/i;

// The feeling of the moment (D27), used only when nothing above sets the angle. Strong words
// only, so an ordinary conversation stays at eye level.
const MOOD_HIGH = /\b(?:vulnerable|helpless|powerless|defeated|cower(?:s|ed|ing)?|crushed|humiliat(?:ed|ion)|overwhelmed|small\s+and\s+alone|belittled|submissive|beg(?:s|ged|ging)|plead(?:s|ed|ing)|grovel(?:s|led|ling)?|kneel(?:s|ing)?\s+before|knelt\s+before|at\s+(?:his|her|their)\s+mercy)\b/i;
const MOOD_LOW = /\b(?:powerful|dominant|domineering|heroic|hero\s+shot|triumphant|victorious|menacing|intimidating|imposing|commanding|mighty|invincible|defiant|stands?\s+tall|towering)\b/i;
const MOOD_DUTCH = /\b(?:disorient(?:ed|ing|ation)|dizzy|dizziness|drunk(?:enly)?|delirious|hallucinat(?:es|ing|ion)|nightmare|unhinged|paranoi(?:a|d)|chao(?:s|tic)|panic(?:s|ked|king)?|off[-\s]balance|madness|unease|uneasy|psychotic|concussed|woozy|reeling|spinning)\b/i;
const MOOD_BIRDS = /\b(?:isolated|isolation|utterly\s+alone|all\s+alone|tiny\s+figure|dwarfed|lost\s+in\s+the\s+crowd|alone\s+in\s+the\s+(?:vast|empty|huge|middle))\b/i;

/** A Dutch angle for this moment: named, or from the feeling (D27). Degrees, or undefined. */
export function dutchFor(text: string): number | undefined {
  if (DUTCH.test(text)) return 20;
  if (MOOD_DUTCH.test(text)) return 15;
  return undefined;
}

function moodAngle(text: string): Vertical | undefined {
  if (MOOD_BIRDS.test(text)) return { kind: "birds-eye", heightM: 6, tiltDeg: -90, why: "isolation: a bird's-eye view from directly overhead makes them small in the space" };
  if (MOOD_HIGH.test(text)) return { kind: "high", heightM: 2.4, tiltDeg: -20, why: "vulnerable moment: a gentle high angle makes them look smaller and weaker" };
  if (MOOD_LOW.test(text)) return { kind: "low", heightM: 0.9, tiltDeg: 15, why: "powerful moment: a gentle low angle makes them look taller and stronger" };
  return undefined;
}

// Point of view (D27): "Jade's POV", "through Ben's eyes", "what she sees", "from his point of view".
const POV = /\b(?:pov|point[-\s]of[-\s]view|through\s+(?:[\w’'-]+['’]s|his|her|their)\s+eyes|what\s+(?:[\w’'-]+|he|she|they)\s+(?:sees?|saw|can\s+see)|as\s+(?:[\w’'-]+|he|she|they)\s+sees?\s+it)\b/i;

/** Whose eyes this shot is, if the panel asks for a point of view: an id from people, or the subject. */
export function povFor(text: string, people: { id: string; name: string }[], subjectId?: string): string | undefined {
  if (!POV.test(text)) return undefined;
  const esc = (p: { name: string }) => p.name.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // "Ben's POV", "through Ben's eyes", "what Ben sees" first; "POV: Ben" only if none of those.
  for (const p of people) {
    const n = esc(p);
    if (new RegExp(String.raw`\b${n}['’]s\s+(?:pov|point[-\s]of[-\s]view|eyes|view)\b|\bthrough\s+${n}['’]s\s+eyes\b|\bwhat\s+${n}\s+(?:sees?|saw|can\s+see)\b|\bas\s+${n}\s+sees?\b`, "i").test(text)) return p.id;
  }
  for (const p of people) if (new RegExp(String.raw`\b(?:pov|point[-\s]of[-\s]view)\s*(?:shot\s*)?[:,-]\s*${esc(p)}\b`, "i").test(text)) return p.id;
  return subjectId;
}

/** Which way the moment looks, from its words. Undefined: keep the camera level. */
export function verticalFor(text: string, emotion = ""): Vertical | undefined {
  const base = angleFor(text, emotion);
  const roll = dutchFor(`${text} ${emotion}`);
  if (!roll) return base;
  const b = base ?? { kind: "level" as const, heightM: EYE_LEVEL_M, tiltDeg: 0, why: "" };
  return { ...b, rollDeg: roll, why: [b.why, DUTCH.test(text) ? "Dutch angle, named in the panel: the frame tilted for unease" : "unsettled moment: a Dutch angle tilts the frame for unease and disorientation"].filter(Boolean).join("; ") };
}

function angleFor(text: string, emotion: string): Vertical | undefined {
  for (const n of NAMED) if (n.re.test(text)) return n.v;
  const b = bodyFor(text);
  if (b) return bodyVertical(b);
  if (DOWN_INTO.test(text)) return { kind: "overhead", heightM: 2.6, tiltDeg: -60, why: "looking down into something: a steep high angle from above shows inside it" };
  if (DOWN.test(text)) return { kind: "high", heightM: 2.8, tiltDeg: -35, why: "looking down: a high angle from above and behind shows the drop below" };
  if (UP.test(text)) return { kind: "low", heightM: 0.6, tiltDeg: 25, why: "looking up: a low angle from below shows the height above" };
  return moodAngle(`${text} ${emotion}`);
}

/** The camera's height and tilt, with eye level as the default. */
export function verticalOf(cam: Pick<PlanCamera, "heightM" | "tiltDeg">): Vertical {
  const heightM = cam.heightM ?? EYE_LEVEL_M;
  const tiltDeg = cam.tiltDeg ?? 0;
  const kind: VerticalKind = tiltDeg <= -85 ? "birds-eye" : tiltDeg <= -50 ? "overhead" : tiltDeg <= -10 || heightM >= 2.4 ? "high" : heightM <= 0.3 && tiltDeg >= 40 ? "worms-eye" : tiltDeg >= 10 || heightM <= 0.9 ? "low" : "level";
  return { kind, heightM, tiltDeg, why: "" };
}

/** Words for prompts: replaces "eye level" when the camera is high, low, rolled or anyone's eyes. */
export function verticalText(cam: Pick<PlanCamera, "heightM" | "tiltDeg" | "rollDeg">): string {
  const v = verticalOf(cam);
  const h = Math.round(v.heightM * 10) / 10, t = Math.round(Math.abs(v.tiltDeg));
  const roll = cam.rollDeg ? `, Dutch angle: the whole frame tilted about ${Math.round(Math.abs(cam.rollDeg))}° ${cam.rollDeg > 0 ? "clockwise" : "anticlockwise"}, horizon on a slant` : "";
  return angleWords(v, h, t) + roll;
}

function angleWords(v: Vertical, h: number, t: number): string {
  if (v.kind === "birds-eye") return `bird's-eye view from directly above, about ${h} m up, looking straight down`;
  if (v.kind === "overhead") return `steep high angle from about ${h} m up, looking almost straight down (about ${t}° down)`;
  if (v.kind === "high") return `high angle from about ${h} m up, tilted down about ${t}°, looking down`;
  if (v.kind === "worms-eye") return `worm's-eye view from the ground, about ${h} m up, looking steeply up about ${t}°`;
  if (v.kind === "low" && v.tiltDeg < 5) {
    if (v.heightM <= 0.3) return `ground-level camera on the floor, about ${h} m up, level`;
    if (v.heightM <= 0.7) return `knee-level camera, about ${h} m off the ground, level`;
    return `low camera about ${h} m off the ground, level`;
  }
  if (v.kind === "low") return `low angle from about ${h} m off the ground, tilted up about ${t}°, looking up`;
  if (v.heightM <= 1.15) return `hip-level camera, about ${h} m up`;
  if (v.heightM <= 1.5) return `shoulder-level camera, about ${h} m up`;
  return "eye level";
}
