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
