// The grey-box room (D60, test B): image 1 drawn from the plan alone, with no venue photo behind.
// Floor and walls in true perspective for this camera, a metre grid on the floor for scale; the
// plan's stand-ins and props are drawn over it as usual. The venue's look is sent to GPT
// separately, as a reference. In the photo version (A), GPT followed the photo over the plan: a
// table standing in the venue picture, a bar that made the people look small beside it.

import { pictureXY } from "./geometry";
import type { GeometryPlanData, PlanCamera, Point } from "./types";

const WALL_M = 4.5;
const CELL_M = 1;

/** The room as an SVG of `width` × `height`: far surfaces first, so near ones cover them. */
export function greyBoxSvg(plan: GeometryPlanData, cam: PlanCamera, width: number, height: number, opts: { outdoors?: boolean } = {}): string {
  const b = plan.bounds ?? { minX: -9, maxX: 9, minY: 0, maxY: 22 };
  const quads: { depth: number; pts: string; fill: string; stroke?: string }[] = [];
  const project = (p: Point, z: number) => pictureXY(plan, cam, p, z);
  const add = (corners: [Point, number][], fill: string, stroke?: string) => {
    const pr = corners.map(([p, z]) => project(p, z));
    if (pr.some((x) => !x || x.depth < 0.3)) return;
    const pts = pr.map((x) => `${(x!.x * width).toFixed(1)},${(x!.y * height).toFixed(1)}`).join(" ");
    quads.push({ depth: pr.reduce((a, x) => a + x!.depth, 0) / pr.length, pts, fill, stroke });
  };
  // Floor: metre cells, alternately a shade lighter, with a grid line, so size and distance read.
  for (let x = b.minX; x < b.maxX - 1e-6; x += CELL_M) {
    for (let y = b.minY; y < b.maxY - 1e-6; y += CELL_M) {
      const x1 = Math.min(x + CELL_M, b.maxX), y1 = Math.min(y + CELL_M, b.maxY);
      const shade = (Math.floor(x - b.minX) + Math.floor(y - b.minY)) % 2 ? "#c9c4ba" : "#cfcac1";
      add([[{ x, y }, 0], [{ x: x1, y }, 0], [{ x: x1, y: y1 }, 0], [{ x, y: y1 }, 0]], shade, "#b5afa4");
    }
  }
  // Walls: one-metre strips up to the wall height, each wall its own tone.
  const walls: { from: Point; to: Point; fill: string }[] = [
    { from: { x: b.minX, y: b.maxY }, to: { x: b.maxX, y: b.maxY }, fill: "#e4e1db" },
    { from: { x: b.minX, y: b.minY }, to: { x: b.minX, y: b.maxY }, fill: "#dcd8d1" },
    { from: { x: b.maxX, y: b.minY }, to: { x: b.maxX, y: b.maxY }, fill: "#dfdbd4" },
    { from: { x: b.minX, y: b.minY }, to: { x: b.maxX, y: b.minY }, fill: "#e8e5e0" },
  ];
  // Outdoors there are no walls: only the ground, under an open sky.
  for (const w of opts.outdoors ? [] : walls) {
    const len = Math.hypot(w.to.x - w.from.x, w.to.y - w.from.y), n = Math.max(1, Math.round(len / CELL_M));
    for (let i = 0; i < n; i++) {
      const p0 = { x: w.from.x + ((w.to.x - w.from.x) * i) / n, y: w.from.y + ((w.to.y - w.from.y) * i) / n };
      const p1 = { x: w.from.x + ((w.to.x - w.from.x) * (i + 1)) / n, y: w.from.y + ((w.to.y - w.from.y) * (i + 1)) / n };
      for (let z = 0; z < WALL_M - 1e-6; z += CELL_M) {
        const z1 = Math.min(z + CELL_M, WALL_M);
        add([[p0, z], [p1, z], [p1, z1], [p0, z1]], w.fill, z === 0 ? "#a8a29e" : undefined);
      }
    }
  }
  quads.sort((a, c) => c.depth - a.depth);
  const body = quads.map((q) => `<polygon points="${q.pts}" fill="${q.fill}"${q.stroke ? ` stroke="${q.stroke}" stroke-width="1"` : ` stroke="${q.fill}" stroke-width="0.6"`}/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${opts.outdoors ? "#d6dde3" : "#bfbcb6"}"/>${body}</svg>`;
}
