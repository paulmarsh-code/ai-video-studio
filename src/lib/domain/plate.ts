// Version C (D66): a finished background plate for each camera, and the parts of the picture GPT
// may draw. Every fault in T6 came from GPT redrawing the whole picture each time: the background
// swapped for another panel's, the table moved, people swapped. Here the background is made once
// per camera as a finished photograph, image 1 is drawn on it, GPT draws the main characters and
// props, and the plate is pasted back everywhere else, so what's behind them and where the
// table stands can't change. Pure: words and shapes, no pictures.

import { pictureXY } from "./geometry";
import type { GeometryPlanData, PlanCamera, Point } from "./types";

/** Bump when the plate request or how it's made changes, so plates are made again. */
export const PLATE_RULES = 1;

/**
 * The request for a camera's plate. Image 1 is the rough cut of what this camera sees, from the
 * venue's 360° views: soft where the views ran out or the floor was cleared. GPT finishes it as
 * one sharp photograph, with the background guests, and the open floor where the main
 * characters and their props will go left empty.
 */
export function platePrompt(i: { venueName: string; aspect?: string; crowd?: string; light?: string; style?: string }): string {
  const crowd = i.crowd?.trim().replace(/[.\s]+$/, "");
  return [
    `${(i.style ?? "photorealistic").replace(/^./, (m) => m.toUpperCase())} photograph for a ${i.aspect ?? "9:16"} video: the ${i.venueName}, seen from one fixed camera. Image 1 is a rough cut of exactly what this camera sees.`,
    "Keep image 1's framing, camera height, eye level, perspective and layout exactly: every wall, railing, counter, light and view stays where it is in image 1, at the same size. Do not move, zoom, tilt or re-frame.",
    "Finish it as one sharp photograph with the same clarity all over: everything from near to far in focus, no blur and no haze added. Any soft, blurred or mirrored part of image 1 is only unfinished: draw it sharp, carrying on what is next to it.",
    "The open floor in the middle and front of the picture is empty: no tables, chairs, stools, sofas or other free-standing furniture on it, and nobody on it. The main characters and their props are added later.",
    crowd
      ? `Background guests: ${crowd}. They stand or sit further back and at the sides, never on the open floor in the middle and front; all different people, natural and relaxed, none looking at the camera.`
      : "No people anywhere.",
    i.light ? `Light: ${i.light}` : "",
    "No text, no logos, no watermark.",
  ].filter(Boolean).join("\n");
}

/** The cue in the picture request (D66): only the main characters, the props and their shadows are drawn. */
export const PLATE_KEEP_FULL = "- Everything in image 1 outside the stand-ins and the outlined props is the finished background photograph, with its background guests: keep it exactly as it is, as sharp as it is, and add no one to it. Draw only the main characters, the props and their shadows, as sharp as the background.";
export const PLATE_KEEP_SHORT = "Everything else in image 1 is the finished background, with its guests: keep it exactly, as sharp as it is, and add no one; draw only the main characters, the props and their shadows, as sharp as the background.";

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
