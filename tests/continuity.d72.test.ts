// D72: the approved picture from the panel's own camera goes with it first.
import { describe, expect, it } from "vitest";
import { continuityFor } from "../src/lib/domain/continuity";
import type { ShotSpec } from "../src/lib/domain/types";

const plan = {
  aspect: "9:16" as const,
  bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
  actors: [{ characterId: "ava", position: { x: 1, y: 5 } }, { characterId: "bo", position: { x: -1, y: 5 } }],
  cameras: [
    { id: "two", name: "Two-shot", preset: "two-shot" as const, position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 },
    { id: "ots", name: "OTS", preset: "main-ots" as const, position: { x: -2.2, y: 5 }, lookAt: { x: 1, y: 5.1 }, fovDeg: 45 },
  ],
  views: [{ name: "skyline", directionDeg: 90 }, { name: "decking", directionDeg: 0 }, { name: "bar", directionDeg: 270 }, { name: "door", directionDeg: 180 }],
  lineOfAction: ["ava", "bo"] as [string, string],
};
const spec = (cameraId: string) => ({ visibleIds: ["ava", "bo"], cameraId } as unknown as ShotSpec);
const panels = (approved: string[]) => ["p1", "p2", "p3"].map((id, k) => ({ id, status: approved.includes(id) ? "approved" : "draft", imageAssetId: `a-${id}`, durationSec: [3, 4, 5][k] }));
const shots = [{ panelId: "p1", spec: spec("two") }, { panelId: "p2", spec: spec("ots") }, { panelId: "p3", spec: spec("two") }];

describe("The approved picture for continuity (D72)", () => {
  it("panel 1 gets panel 3, from its own camera, though panel 2 is approved too and has the lower number", () => {
    const c = continuityFor(panels(["p2", "p3"]), shots, plan, "p1")!;
    expect(c.assetId).toBe("a-p3");
    expect(c.label).toBe("approved scene picture (panel 3)");
    expect(c.cameraId).toBe("two");
    expect(c.view).toBe("skyline");
    expect(c.secondsApart).toBe(7); // panel 3 starts 7 seconds after panel 1 (3 + 4)
  });
  it("panel 2 has no approved picture from its camera, so it gets the fullest, lowest-numbered one", () => {
    expect(continuityFor(panels(["p1", "p3"]), shots, plan, "p2")!.assetId).toBe("a-p1");
  });
  it("never its own picture, and nothing when nothing else is approved", () => {
    expect(continuityFor(panels(["p1"]), shots, plan, "p1")).toBeUndefined();
  });
});
