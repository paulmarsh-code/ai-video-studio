// D85: a named two-shot keeps the pair off the frame's edges. Any scene; made-up names.
import { describe, expect, it } from "vitest";
import { designScene } from "../src/lib/domain/director";
import { pictureXY } from "../src/lib/domain/geometry";
import type { ShotSpec } from "../src/lib/domain/types";

const plan = {
  aspect: "9:16" as const,
  bounds: { minX: -8, maxX: 8, minY: 0, maxY: 16 },
  actors: [{ characterId: "ava", position: { x: -2.5, y: 8 } }, { characterId: "bo", position: { x: 2.5, y: 8 } }],
  furniture: [],
  cameras: [],
  views: [{ name: "wall", directionDeg: 90 }],
};
const spec = { code: "P1", visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], audioMode: "off", durationSec: 4, venueName: "park" } as unknown as ShotSpec;

describe("A pair five metres apart in a named two-shot (D85)", () => {
  it("has both of them well inside the frame, not at its edges", () => {
    const d = designScene(plan as never, [{ id: "s1", code: "P1", spec, description: "Two-shot: Ava and Bo talk across the yard." }], (id) => id, "neutral");
    const cam = d.shots[0].options[0].camera;
    expect(cam.name).toMatch(/Two-shot/);
    for (const a of plan.actors) {
      const x = pictureXY({ ...plan, cameras: [cam] } as never, cam, a.position, 1.0)!.x;
      expect(x).toBeGreaterThan(0.12);
      expect(x).toBeLessThan(0.88);
    }
  });
});
