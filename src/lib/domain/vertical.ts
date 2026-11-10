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

/** Which way the moment looks, from its words. Undefined: keep the camera level. */
export function verticalFor(text: string): Vertical | undefined {
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
  if (v.kind === "overhead") return `steep high angle from about ${h} m up, looking almost straight down (about ${t}° down)`;
  if (v.kind === "high") return `high angle from about ${h} m up, tilted down about ${t}°, looking down`;
  if (v.kind === "low") return `low angle from about ${h} m off the ground, tilted up about ${t}°, looking up`;
  return "eye level";
}
