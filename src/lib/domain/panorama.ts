// The room as a 360° ring (D20). A venue's views (screen wall, bar, …) are joined round a ring
// in compass order, as if photographed from the middle of the room. For each camera the app
// works out which part of that ring it sees: rays through the frame's left and right edges are
// cast from the camera's own position to the room's walls, and where they land is read as an
// angle from the middle of the room. Moving the camera, turning it or changing the lens moves
// the slice, so the background is always the part of the room that camera would really see,
// in the right left-to-right order. Pure: the server cuts the picture.

import { horizontalFov } from "./geometry";
import type { GeometryPlanData, PlanCamera, PlanView, Point } from "./types";

export interface RingSector {
  name: string;
  /** Centre of the view, degrees (0 = +x, 90 = +y, counter-clockwise). */
  centreDeg: number;
  /** Its share of the ring, from its left edge (counter-clockwise side) to its right. */
  leftDeg: number;
  rightDeg: number;
}

const wrap = (a: number) => ((a % 360) + 360) % 360;
const DEFAULT_BOUNDS = { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 };
const boundsOf = (plan: GeometryPlanData) => plan.bounds ?? DEFAULT_BOUNDS;

/** Each view takes the ring up to halfway to its neighbours. Ordered clockwise (left to right). */
export function ringSectors(views: Pick<PlanView, "name" | "directionDeg">[]): RingSector[] {
  if (!views.length) return [];
  if (views.length === 1) return [{ name: views[0].name, centreDeg: wrap(views[0].directionDeg), leftDeg: wrap(views[0].directionDeg) + 180, rightDeg: wrap(views[0].directionDeg) - 180 }];
  const sorted = [...views].map((v) => ({ name: v.name, d: wrap(v.directionDeg) })).sort((a, b) => b.d - a.d); // clockwise
  return sorted.map((v, i) => {
    const prev = sorted[(i - 1 + sorted.length) % sorted.length]; // counter-clockwise neighbour
    const next = sorted[(i + 1) % sorted.length]; // clockwise neighbour
    const gapLeft = wrap(prev.d - v.d) || 360;
    const gapRight = wrap(v.d - next.d) || 360;
    return { name: v.name, centreDeg: v.d, leftDeg: v.d + gapLeft / 2, rightDeg: v.d - gapRight / 2 };
  });
}

/** Where a ray from `from` heading `deg` meets the room's walls. */
function hitWall(plan: GeometryPlanData, from: Point, deg: number): Point {
  const b = boundsOf(plan);
  const dx = Math.cos((deg * Math.PI) / 180), dy = Math.sin((deg * Math.PI) / 180);
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (b.maxX - from.x) / dx);
  if (dx < -1e-9) t = Math.min(t, (b.minX - from.x) / dx);
  if (dy > 1e-9) t = Math.min(t, (b.maxY - from.y) / dy);
  if (dy < -1e-9) t = Math.min(t, (b.minY - from.y) / dy);
  if (!Number.isFinite(t) || t < 0) t = 0;
  return { x: from.x + dx * t, y: from.y + dy * t };
}

/**
 * The part of the ring a camera sees, as angles from the middle of the room: `leftDeg` (the
 * frame's left edge) down to `rightDeg` (its right edge), clockwise; leftDeg > rightDeg.
 */
export function viewSlice(plan: GeometryPlanData, cam: PlanCamera): { leftDeg: number; rightDeg: number } {
  const b = boundsOf(plan);
  const C = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const fwd = (Math.atan2(cam.lookAt.y - cam.position.y, cam.lookAt.x - cam.position.x) * 180) / Math.PI;
  const half = horizontalFov(plan, cam) / 2;
  const angleFromCentre = (deg: number) => {
    const h = hitWall(plan, cam.position, deg);
    return (Math.atan2(h.y - C.y, h.x - C.x) * 180) / Math.PI;
  };
  const centre = angleFromCentre(fwd);
  // Unwrap both edges near the centre so the slice runs the short way round.
  const near = (a: number, ref: number) => ref + ((((a - ref) % 360) + 540) % 360) - 180;
  let leftDeg = near(angleFromCentre(fwd + half), centre);
  let rightDeg = near(angleFromCentre(fwd - half), centre);
  if (leftDeg <= rightDeg) { leftDeg = centre + half; rightDeg = centre - half; } // camera on a wall: fall back to the lens
  return { leftDeg, rightDeg };
}

/**
 * Which views a slice covers, left to right, each with the share of the frame it fills.
 * Used to describe the background in words, and by tests.
 */
export function viewsInSlice(sectors: RingSector[], slice: { leftDeg: number; rightDeg: number }): { name: string; share: number }[] {
  const out: { name: string; share: number }[] = [];
  const span = slice.leftDeg - slice.rightDeg;
  // Walk clockwise from the left edge in small steps.
  const step = Math.max(0.5, span / 200);
  for (let a = slice.leftDeg; a > slice.rightDeg; a -= step) {
    const w = wrap(a);
    const s = sectors.find((x) => {
      const l = wrap(x.leftDeg), r = wrap(x.rightDeg);
      return l > r ? w <= l && w > r : w <= l || w > r;
    });
    if (!s) continue;
    const last = out[out.length - 1];
    if (last?.name === s.name) last.share += step / span;
    else out.push({ name: s.name, share: step / span });
  }
  return out.map((x) => ({ name: x.name, share: Math.round(x.share * 100) / 100 }));
}

// ---- Each view at the room's own scale (D48) ----
// A view picture is put on the ring as if it spanned 90° from the middle of the room, but GPT
// draws a "view of the bar" from wherever it likes, often a few metres from it with a narrower
// lens. The bar then looked about twice as near as the room's size puts it: the blocking frame
// had the far wall right behind the group, and a prop the plan puts between them had nowhere to
// go but forward. Where the floor meets the far wall, measured once on each picture, sets how
// big the picture is on the ring, so that wall sits as far below eye level as it really is.

/** Eye level of the view pictures and of an ordinary camera, metres. */
export const EYE_M = 1.6;

/** How far it is from a point to the room's wall, looking one way (degrees, 0 = +x). */
export function wallDistance(plan: GeometryPlanData, from: Point, deg: number): number {
  const h = hitWall(plan, from, deg);
  return Math.hypot(h.x - from.x, h.y - from.y);
}

/** The middle of the room, where the ring's views are seen from. */
export function roomCentre(plan: GeometryPlanData): Point {
  const b = boundsOf(plan);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** Where a view picture's eye level is and where its floor meets the far wall, as fractions of its height from the top. */
export interface ViewCalibration { horizon: number; floor: number }

/** A measured eye level, kept near the middle: the views are asked for at eye level, and a far-out reading is noise. */
export const horizonOf = (c: ViewCalibration) => Math.min(0.6, Math.max(0.4, c.horizon));

/**
 * Pixels on the ring for each pixel of the view picture, so its floor line lands where a wall
 * `wallM` away really is; undefined when the measurement can't be used (no floor line below
 * eye level). Only ever made smaller than the ordinary fit, never larger: a wall drawn too
 * near is what goes wrong (it squeezes everything in front of it), and a small reading of the
 * floor line is too uncertain to blow a picture up by. Never below a third of the fit.
 */
export function viewScale(c: ViewCalibration, photo: { width: number; height: number }, sector: { width: number; height: number }, wallM: number, pxPerDeg: number): number | undefined {
  const horizon = horizonOf(c);
  const drop = c.floor - horizon;
  if (!(drop > 0.02) || !(wallM > 0.5)) return undefined;
  const want = pxPerDeg * ((Math.atan(EYE_M / wallM) * 180) / Math.PI);
  const f = want / (drop * photo.height);
  const cover = Math.max(sector.width / photo.width, sector.height / photo.height);
  if (f >= cover * 0.95) return undefined; // near enough as it is
  return Math.max(cover * 0.35, f);
}

/** The vision model's reply about a view picture, as a calibration; null when it isn't usable. */
export function readCalibration(reply: string): ViewCalibration | null {
  const m = reply.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { horizon?: unknown; floor_line?: unknown };
    const h = Number(j.horizon), f = Number(j.floor_line);
    if (!Number.isFinite(h) || !Number.isFinite(f) || h <= 0 || h >= 1 || f <= 0 || f > 1 || f <= h) return null;
    return { horizon: +h.toFixed(3), floor: +f.toFixed(3) };
  } catch { return null; }
}

/** What the vision model is asked about each view picture. */
export function calibrationPrompt(): string {
  return [
    "This is a photograph of a room or place, taken at eye level. Measure two heights in it, each as a fraction of the picture's height from the top (0 = top edge, 1 = bottom edge).",
    "horizon: the camera's eye level, where lines running away from the camera along the floor, the ceiling and the walls meet (the vanishing point).",
    "floor_line: at the middle of the picture, where the floor meets the bottom of the far wall, or the bottom of whatever stands against it (a bar counter, a stage, a fence). Ignore tables, chairs or anything else standing out in the open floor.",
    'Reply with JSON only, no other text: {"horizon": 0.5, "floor_line": 0.7}',
  ].join("\n");
}
