// Up and down (D25). The camera normally sits at eye level, looking level. When a moment is
// about looking down (over a cliff edge, into a hole, at the street below) or up (at a window,
// the sky, someone towering over them), the camera goes high and tilts down, or low and tilts
// up, so the picture shows the drop or the height. Read from the panel's words, for any scene;
// the user can still set height and tilt on the floor plan.

import type { PlanCamera } from "./types";

export type VerticalKind = "level" | "high" | "low" | "overhead";

export interface Vertical { kind: VerticalKind; heightM: number; tiltDeg: number; why: string }

export const EYE_LEVEL_M = 1.6;

const DOWN_INTO = /\b(?:look(?:s|ed|ing)?|peer(?:s|ed|ing)?|stare(?:s|d)?|staring|gaz(?:e|es|ed|ing)|glanc(?:e|es|ed|ing)|peek(?:s|ed|ing)?)\s+(?:down\s+)?into\s+(?:the|a|an)\s+(?:hole|well|pit|shaft|grave|box|crate|chest|water|pool|abyss|chasm|hatch|trapdoor|basement|cellar|crater|bucket|drawer|bag|case|tank|void|manhole|mine)\b/i;
const DOWN = /\b(?:(?:look(?:s|ed|ing)?|peer(?:s|ed|ing)?|stare(?:s|d)?|staring|gaz(?:e|es|ed|ing)|glanc(?:e|es|ed|ing)|peek(?:s|ed|ing)?)\s+down|over\s+the\s+(?:edge|cliff|ledge|balcony|railing|rail|parapet|side|drop|precipice|banister)|(?:edge|brink|lip)\s+of\s+(?:a|the)\s+(?:cliff|roof|rooftop|building|ledge|drop|precipice|canyon|gorge|ravine|crater|pit|hole|platform)|(?:below|beneath)\s+(?:her|him|them|us|me)|(?:the\s+)?(?:street|ground|floor|crowd|city|valley|river|sea)\s+(?:far\s+)?below|from\s+(?:the\s+)?(?:top|rooftop|roof|balcony|ledge|cliff|bridge|window)\s+above|looks?\s+down\s+on|reflection\s+in\s+(?:the\s+)?(?:water|pool|pond|lake|river|puddle|sea|fountain))\b/i;
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

/** Which way the moment looks, from its words. Undefined: keep the camera level. */
export function verticalFor(text: string): Vertical | undefined {
  const b = bodyFor(text);
  if (b) return bodyVertical(b);
  if (DOWN_INTO.test(text)) return { kind: "overhead", heightM: 2.6, tiltDeg: -60, why: "looking down into something: a steep high angle from above shows inside it" };
  if (DOWN.test(text)) return { kind: "high", heightM: 2.8, tiltDeg: -35, why: "looking down: a high angle from above and behind shows the drop below" };
  if (UP.test(text)) return { kind: "low", heightM: 0.6, tiltDeg: 25, why: "looking up: a low angle from below shows the height above" };
  return undefined;
}

/** The camera's height and tilt, with eye level as the default. */
export function verticalOf(cam: Pick<PlanCamera, "heightM" | "tiltDeg">): Vertical {
  const heightM = cam.heightM ?? EYE_LEVEL_M;
  const tiltDeg = cam.tiltDeg ?? 0;
  const kind: VerticalKind = tiltDeg <= -50 ? "overhead" : tiltDeg <= -10 || heightM >= 2.4 ? "high" : tiltDeg >= 10 || heightM <= 0.9 ? "low" : "level";
  return { kind, heightM, tiltDeg, why: "" };
}

/** Words for prompts: replaces "eye level" when the camera is high or low. */
export function verticalText(cam: Pick<PlanCamera, "heightM" | "tiltDeg">): string {
  const v = verticalOf(cam);
  const h = Math.round(v.heightM * 10) / 10, t = Math.round(Math.abs(v.tiltDeg));
  if (v.kind === "overhead" && v.tiltDeg <= -85) return `top shot from directly above, about ${h} m up, looking straight down`;
  if (v.kind === "overhead") return `steep high angle from about ${h} m up, looking almost straight down (about ${t}° down)`;
  if (v.kind === "high") return `high angle from about ${h} m up, tilted down about ${t}°, looking down`;
  if (v.kind === "low" && v.tiltDeg < 5) return `low camera about ${h} m off the ground, level`;
  if (v.kind === "low") return `low angle from about ${h} m off the ground, tilted up about ${t}°, looking up`;
  return "eye level";
}
