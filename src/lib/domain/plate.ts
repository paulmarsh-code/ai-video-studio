// Version C (D66): a finished background plate for each camera, and the parts of the picture GPT
// may draw. Every fault in T6 came from GPT redrawing the whole picture each time: the background
// swapped for another panel's, the table moved, people swapped. Here the background is made once
// per camera as a finished photograph, image 1 is drawn on it, GPT draws the main characters and
// props, and the plate is pasted back everywhere else, so what's behind them and where the
// table stands can't change. Pure: words and shapes, no pictures.

import { pictureXY } from "./geometry";
import type { GeometryPlanData, PlanCamera, Point } from "./types";

/** Bump when the plate request or how it's made changes, so plates are made again. */
export const PLATE_RULES = 3;

/**
 * The request for a camera's plate (D66, D67): the empty place from this camera, finished as a
 * sharp photograph. Image 1 is the cut from the venue's approved views. Asked to "finish" it with
 * background guests, GPT invented a different place for both cameras, so the plate now has no
 * people (the guests are drawn in each picture, as in version A) and the request is a clean-up:
 * the same photograph, sharper. It's checked against the cut before it's used (`structureMatch`).
 */
export function platePrompt(i: { venueName: string; aspect?: string; light?: string; style?: string; joins?: number[] }): string {
  return [
    `Image 1 is a real photograph of the ${i.venueName}, seen from one fixed camera, but soft and low in detail. Return the same photograph, sharp and clean, for a ${i.aspect ?? "9:16"} ${(i.style ?? "photorealistic").toLowerCase()} video.`,
    "Change nothing in it: the framing, camera height, eye level and perspective stay exactly as they are, and every wall, railing, screen, planter, counter, door, light, the view beyond and the floor stay exactly where they are, at the same size, with the same materials and colours. Add nothing and remove nothing. Do not move, zoom, tilt or re-frame.",
    "Only sharpen it and add fine detail, with the same clarity all over: everything from near to far in focus. Any soft, blurred or mirrored strip along an edge carries on what is next to it, sharp.",
    joinLine(i.joins),
    "No people anywhere, and no tables, chairs or other free-standing furniture on the open floor.",
    i.light ? `Light, as it is in image 1: ${i.light}` : "",
    "No text, no logos, no watermark.",
  ].filter(Boolean).join("\n");
}

/**
 * Where image 1 is joined from two of the venue's views (D84). The one change the plate may make:
 * at a join the two photographs fade into each other, and a ramp, rim, wall or railing can stop
 * at it or show twice. Left alone, GPT kept a hard line there and drew a skate bowl breaking off.
 */
export function joinLine(joins?: number[]): string {
  if (!joins?.length) return "";
  const at = joins.map((f) => `${Math.round(f * 100)}%`);
  const where = at.length === 1 ? `about ${at[0]} of the way across from the left` : `about ${at.slice(0, -1).join(", ")} and ${at[at.length - 1]} of the way across from the left`;
  return `The one exception: image 1 is joined from photographs of the same place taken from the same spot, and they meet ${where}. Make it one continuous photograph there: every floor, ramp, rim, edge, wall, railing and roofline carries on smoothly across the join at the same height and curve, with no line, step, break or double image.`;
}

/**
 * How strong a vertical line is in a picture near a join (D84): the biggest change between
 * neighbouring columns within `reach` pixels of `x`, against the picture's usual column change.
 * A hard join left in a plate measured 2.7; the strongest ordinary edges about 1.8.
 */
export function seamStrength(grey: ArrayLike<number>, W: number, H: number, x: number, reach = 12): number {
  const col = (c: number) => {
    let d = 0;
    for (let r = 0; r < H; r++) d += Math.abs(grey[r * W + c + 1] - grey[r * W + c - 1]);
    return d / H;
  };
  const all: number[] = [];
  for (let c = 1; c < W - 1; c += 2) all.push(col(c));
  all.sort((a, b) => a - b);
  const usual = all[Math.floor(all.length / 2)] || 1;
  let worst = 0;
  for (let c = Math.max(1, Math.round(x) - reach); c <= Math.min(W - 2, Math.round(x) + reach); c++) worst = Math.max(worst, col(c));
  return +(worst / usual).toFixed(2);
}

/** Above this, a join is still showing as a line (D84). */
export const SEAM_SHOWS = 2.3;

/**
 * The request to redraw one small venue view at full size (D67). A venue's four views came as
 * quarters of one GPT picture, 768 × 510 pixels each, which is all a camera's background was cut
 * from. Redrawn once at full size and approved on the venue page, every camera gets a sharp
 * background from the same approved views.
 */
export function viewFullSizePrompt(i: { venueName: string; viewName: string }): string {
  return [
    `Image 1 is one view of the ${i.venueName}, looking towards the ${i.viewName}, but small and low in detail. Return the same picture at full size and full detail.`,
    "Change nothing in it: the framing, camera height, eye level and perspective stay exactly as they are, and every wall, railing, screen, planter, counter, door, light, the view beyond and the floor stay exactly where they are, at the same size, with the same materials, colours and light. Add nothing and remove nothing; no people.",
    "Only sharpen it and add fine detail, with the same clarity all over.",
    "No text, no logos, no watermark.",
  ].join("\n");
}

/**
 * How alike two pictures are in layout (D67): -1 to 1, from small, blurred greyscale copies of
 * the same size, each evened out to its own brightness and contrast. A redraw that keeps the
 * place scores about 0.9 or more; GPT's invented terraces scored about 0.12.
 */
export function structureMatch(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  const stats = (x: ArrayLike<number>) => {
    let m = 0;
    for (let i = 0; i < n; i++) m += x[i];
    m /= n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (x[i] - m) ** 2;
    return { m, sd: Math.sqrt(v / n) || 1 };
  };
  const sa = stats(a), sb = stats(b);
  let c = 0;
  for (let i = 0; i < n; i++) c += ((a[i] - sa.m) / sa.sd) * ((b[i] - sb.m) / sb.sd);
  return +(c / n).toFixed(3);
}

/** Below this a redraw has changed the place, and isn't used (D67). */
export const SAME_PLACE = 0.6;

/** The cue in the picture request (D66, D67): image 1's background is finished; keep it. */
export const PLATE_KEEP_FULL = "- Everything in image 1 outside the stand-ins and the outlined props is the finished background photograph: keep it exactly as it is, as sharp as it is, adding only the background people described below. Draw the main characters, the props and their shadows as sharp as the background.";
export const PLATE_KEEP_SHORT = "Everything else in image 1 is the finished background: keep it exactly, as sharp as it is, adding only the background people described; draw the main characters, the props and their shadows as sharp as it.";

/**
 * Extra parts GPT may draw (D66), as SVG polygons in a `width` × `height` picture: beyond the
 * stand-ins' and props' own outlines, which come from image 1's drawing itself. Round each
 * person, a box a metre wide from the floor to well above their head, for hair, gestures and a
 * chair; round their feet and each prop's foot, room for a shadow.
 */
export function maskExtras(plan: GeometryPlanData, cam: PlanCamera, actorIds: string[], width: number, height: number): string {
  const f = { x: cam.lookAt.x - cam.position.x, y: cam.lookAt.y - cam.position.y };
  const fl = Math.hypot(f.x, f.y) || 1;
  const rt = { x: f.y / fl, y: -f.x / fl }, fw = { x: f.x / fl, y: f.y / fl };
  const at = (p: Point, side: number, ahead: number): Point => ({ x: p.x + rt.x * side + fw.x * ahead, y: p.y + rt.y * side + fw.y * ahead });
  const polys: string[] = [];
  const poly = (pts: ({ x: number; y: number } | undefined)[]) => {
    if (pts.some((p) => !p)) return;
    polys.push(`<polygon points="${pts.map((p) => `${(p!.x * width).toFixed(1)},${(p!.y * height).toFixed(1)}`).join(" ")}" fill="#fff"/>`);
  };
  const ring = (c: Point, r: number) => poly(Array.from({ length: 16 }, (_, k) => { const a = (k / 16) * 2 * Math.PI; return pictureXY(plan, cam, { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }, 0); }));
  // A box standing on the floor at `c`: `w` across, `d` deep, `h` high, seen from this camera.
  const box = (c: Point, w: number, d: number, h: number) => {
    const corners = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([s, a]) => at(c, s, a));
    const pts = corners.flatMap((p) => [pictureXY(plan, cam, p, 0), pictureXY(plan, cam, p, h)]);
    if (pts.some((p) => !p)) return;
    // The outline of all eight corners: their convex hull.
    poly(hull(pts as { x: number; y: number }[]));
  };
  for (const a of plan.actors) {
    if (!actorIds.includes(a.characterId)) continue;
    const seated = a.pose === "sitting";
    ring(a.position, seated ? 0.55 : 0.4);
    // Head room and elbow room: hair, a raised hand or an arm out isn't cut off by the plate.
    // Not for someone right by the lens (an over-the-shoulder back): their own outline already
    // fills most of the picture, and a box would leave no plate at all.
    const near = pictureXY(plan, cam, a.position, 0);
    if (near && near.depth >= 2) box(a.position, 0.42, 0.4, (seated ? 1.35 : a.pose === "lying" ? 0.6 : 1.8) + 0.3);
  }
  for (const p of plan.furniture ?? []) {
    if (p.heldBy) continue;
    ring(p.position, p.radiusM + 0.3);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${polys.join("")}</svg>`;
}

/** The convex hull of some points (Andrew's monotone chain), for a box's outline in the picture. */
function hull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: typeof p = [], upper: typeof p = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
