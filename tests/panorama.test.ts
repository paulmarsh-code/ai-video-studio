// The room as a 360° ring (D20): each camera's background is the slice it would really see.
import { describe, expect, it } from "vitest";
import { ringSectors, viewSlice, viewsInSlice } from "../src/lib/domain/panorama";
import type { GeometryPlanData, PlanCamera } from "../src/lib/domain/types";

const views = [
  { name: "screen wall", directionDeg: 90 },
  { name: "bar", directionDeg: 180 },
  { name: "windows and entrance", directionDeg: 270 },
  { name: "lounge seating", directionDeg: 0 },
];
const plan: GeometryPlanData = { bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 }, aspect: "16:9", views, actors: [], cameras: [] } as never;
const cam = (x: number, y: number, lx: number, ly: number, fovDeg?: number): PlanCamera => ({ id: "c", name: "c", preset: "wide", position: { x, y }, lookAt: { x: lx, y: ly }, fovDeg });

describe("360° ring backgrounds (D20)", () => {
  it("joins the views clockwise, each taking the ring halfway to its neighbours", () => {
    const s = ringSectors(views);
    expect(s.map((x) => x.name)).toEqual(["windows and entrance", "bar", "screen wall", "lounge seating"]);
    for (const x of s) expect(x.leftDeg - x.rightDeg).toBeCloseTo(90);
  });
  it("looking at the screen wall, the bar is on the left and the lounge on the right, never swapped", () => {
    const sl = viewSlice(plan, cam(0, 2, 0, 9));
    const seen = viewsInSlice(ringSectors(views), sl).map((x) => x.name);
    expect(seen[0]).toBe("bar");
    expect(seen).toContain("screen wall");
    expect(seen[seen.length - 1]).toBe("lounge seating");
  });
  it("turning the camera left slides the room the right way: more bar, less lounge", () => {
    const sectors = ringSectors(views);
    const straight = viewsInSlice(sectors, viewSlice(plan, cam(0, 2, 0, 9)));
    const left = viewsInSlice(sectors, viewSlice(plan, cam(0, 2, -3, 9)));
    const share = (v: { name: string; share: number }[], n: string) => v.find((x) => x.name === n)?.share ?? 0;
    expect(share(left, "bar")).toBeGreaterThan(share(straight, "bar"));
    expect(share(left, "lounge seating")).toBeLessThan(share(straight, "lounge seating"));
  });
  it("a longer lens sees a narrower slice; standing closer to the wall sees less of it", () => {
    const wide = viewSlice(plan, cam(0, 2, 0, 9));
    const tele = viewSlice(plan, cam(0, 2, 0, 9, 25));
    expect(tele.leftDeg - tele.rightDeg).toBeLessThan(wide.leftDeg - wide.rightDeg);
    const far = viewSlice(plan, cam(0, 1, 0, 9, 40));
    const near = viewSlice(plan, cam(0, 7, 0, 9, 40));
    expect(near.leftDeg - near.rightDeg).toBeLessThan(far.leftDeg - far.rightDeg);
  });
  it("moving the camera sideways, not turning it, shifts which part of the wall is behind (parallax)", () => {
    const a = viewSlice(plan, cam(-3, 2, -3, 9, 30));
    const b = viewSlice(plan, cam(3, 2, 3, 9, 30));
    expect((a.leftDeg + a.rightDeg) / 2).toBeGreaterThan((b.leftDeg + b.rightDeg) / 2);
  });
});
