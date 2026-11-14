// D97: the fixed set seen from a camera lines up with the app's own camera model, and two shots
// from one camera position see the same set.
import { describe, expect, it } from "vitest";
import { renderView, render360, sliceIn360, wallForDirection, isSetPiece, type SetModel } from "../src/lib/domain/setRender";
import { pictureXY } from "../src/lib/domain/geometry";

const red = { data: new Uint8Array(4 * 4 * 4).fill(255).map((v, i) => (i % 4 === 1 || i % 4 === 2 ? 0 : v)), width: 4, height: 4 };
const plan = { aspect: "9:16" as const, bounds: { minX: -5, maxX: 5, minY: 0, maxY: 10 }, actors: [], cameras: [], views: [],
  furniture: [{ id: "t", name: "cocktail table", position: { x: 0, y: 6 }, radiusM: 0.4, heightM: 1.1 }] };
const set: SetModel = { bounds: plan.bounds, wallM: 4, ceilingM: 4, walls: [{ side: "maxY" }], floor: [40, 40, 40], ceiling: [20, 20, 20], sky: [20, 20, 20],
  pieces: [{ id: "t", name: "cocktail table", at: { x: 0, y: 6 }, widthM: 0.8, heightM: 1.1, texture: red }] };
const cam = { id: "c", name: "Wide", preset: "wide" as const, position: { x: 0, y: 1 }, lookAt: { x: 0, y: 6 } };

describe("The fixed set (D97)", () => {
  it("draws a set piece exactly where the layout picture puts it", () => {
    const W = 64, H = 96;
    const img = renderView(set, plan as never, cam as never, W, H, 1);
    const q = pictureXY(plan as never, cam as never, { x: 0, y: 6 }, 0.55)!;
    const k = (Math.floor(q.y * H) * W + Math.floor(q.x * W)) * 4;
    expect([img[k], img[k + 1], img[k + 2]]).toEqual([255, 0, 0]);
    // Just above its top, it's the room behind.
    const top = pictureXY(plan as never, cam as never, { x: 0, y: 6 }, 1.4)!;
    const k2 = (Math.floor(top.y * H) * W + Math.floor(top.x * W)) * 4;
    expect(img[k2 + 1]).not.toBe(0);
  });
  it("two shots from one position see the same set; a pan only moves the slice", () => {
    const a = renderView(set, plan as never, cam as never, 32, 48, 1);
    const b = renderView(set, plan as never, { ...cam, id: "c2" } as never, 32, 48, 1);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const s = sliceIn360(plan as never, cam as never);
    // Looking along +y is a quarter turn anticlockwise from +x: three quarters of the way round a clockwise 360°.
    expect((s.left + s.right) / 2).toBeCloseTo(0.75, 2);
    expect(render360(set, plan as never, cam.position, 1.6, 64, 16).length).toBe(64 * 16 * 4);
  });
  it("walls by the way their view looks, and which props are set pieces", () => {
    expect([wallForDirection(0), wallForDirection(90), wallForDirection(180), wallForDirection(270)]).toEqual(["maxX", "maxY", "minX", "minY"]);
    expect(isSetPiece({ id: "a", name: "table", position: { x: 0, y: 0 }, radiusM: 0.4, heightM: 1.1 })).toBe(true);
    expect(isSetPiece({ id: "b", name: "phone", position: { x: 0, y: 0 }, radiusM: 0.05, heightM: 0.01 })).toBe(false);
    expect(isSetPiece({ id: "c", name: "skateboard", position: { x: 0, y: 0 }, radiusM: 0.4, heightM: 0.6, heldBy: "kai" })).toBe(false);
  });
});
