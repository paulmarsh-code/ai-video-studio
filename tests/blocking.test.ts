// Blocking Plan v4 rule: in the main camera, Chase is always frame-left, Jade always
// frame-right, and Marcus and Nina sit between them.
import { describe, expect, it } from "vitest";
import { readCamera } from "../src/lib/domain/geometry";
import { SCENE1_PLAN } from "../src/lib/demo/paidOnTime";

describe("Blocking Plan v4", () => {
  it("main camera frame order is Chase, Marcus, Nina, Jade", () => {
    const r = readCamera(SCENE1_PLAN, SCENE1_PLAN.cameras.find((c) => c.id === "main")!);
    const order = r.actors.filter((a) => a.inView).sort((a, b) => a.angleDeg - b.angleDeg).map((a) => a.characterId);
    expect(order).toEqual(["chase", "marcus", "nina", "jade"]);
  });
  it("Jade's close-up shows only Jade", () => {
    const r = readCamera(SCENE1_PLAN, SCENE1_PLAN.cameras.find((c) => c.id === "jade-cu")!);
    expect(r.actors.filter((a) => a.inView).map((a) => a.characterId)).toEqual(["jade"]);
  });
});

describe("Regression: close-up viewfinder (Paul, 8 Nov 2026)", () => {
  it("a person alone in frame is never the soft over-the-shoulder foreground", () => {
    const plan = { ...SCENE1_PLAN, cameras: [{ id: "cu", name: "CU", preset: "single-cu" as const, position: { x: 0.4, y: 4.4 }, lookAt: { x: 1.5, y: 5.4 } }] };
    const r = readCamera(plan, plan.cameras[0]);
    // Others may be cut by the frame edge (D31); fully in frame is Jade alone.
    const inView = r.actors.filter((a) => a.inView && !a.partial);
    expect(inView.map((a) => a.characterId)).toEqual(["jade"]);
    expect(inView[0].foreground).toBe(false);
  });
});
