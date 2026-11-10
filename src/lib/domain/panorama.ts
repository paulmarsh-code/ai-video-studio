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
