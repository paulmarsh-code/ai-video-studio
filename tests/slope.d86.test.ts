// D86: down a slope from the words, someone's own gear with them, and a plan grown for its
// areas kept at that size. Any scene; made-up names.
import { describe, expect, it } from "vitest";
import { blockingFromWords } from "../src/lib/domain/panelWords";
import { planForShot } from "../src/lib/domain/geometry";
import type { ShotSpec } from "../src/lib/domain/types";

const people = [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }];
const plan = {
  aspect: "9:16" as const,
  bounds: { minX: -15, maxX: 15, minY: -27, maxY: 30 },
  actors: [{ characterId: "ava", position: { x: 1.5, y: 13.4 } }, { characterId: "bo", position: { x: -0.2, y: 13.4 } }],
  furniture: [],
  cameras: [],
  views: [{ name: "pines", directionDeg: 0 }],
  // A run 40 m long falling towards -y, its top at y = 14.
  levels: [{ id: "run", name: "ski run", kind: "slope" as const, x: -4, y: -26, w: 10, d: 40, heightM: 0, dropM: 8, fallDeg: 270, edge: "plain" as const }],
};

describe("Down a slope (D86)", () => {
  const out = blockingFromWords(plan as never, [
    { action: "Ava stands beside Bo at the top.", visibleIds: ["ava", "bo"] },
    { action: "Ava pushes off and starts down the slope, sliding into a first turn.", visibleIds: ["ava"], subjectId: "ava", places: { ava: "on the ski run" } },
    { action: "Bo exhales, then shuffles his skis forward and follows after Ava, taking short, tentative moves down the slope.", visibleIds: ["ava", "bo"], subjectId: "bo", places: { bo: "on the ski run" } },
  ], people);

  it("someone already on the run who starts down it is shown a few metres down", () => {
    expect(out[1].ava.at.y).toBeCloseTo(8.4, 1);
    expect(out[1].ava.why).toMatch(/down the ski run/);
  });
  it("someone following another down stays a little above them", () => {
    expect(out[2].bo.at.y).toBeCloseTo(8.4 + 2.2, 1);
    expect(out[2].bo.why).toMatch(/following Ava/);
  });
  it("on the flat, walking down the street moves nobody", () => {
    const flat = { ...plan, levels: [] };
    const o = blockingFromWords(flat as never, [{ action: "Ava walks down the street.", visibleIds: ["ava"], subjectId: "ava" }], people);
    expect(o[0].ava).toBeUndefined();
  });
});

describe("Someone's own gear is with them (D86)", () => {
  it("'Bo's skis' goes with Bo; 'Bo's car' stays where it is", () => {
    const p = { ...plan, furniture: [
      { id: "s", name: "Bo's skis", position: { x: 0, y: 16 }, radiusM: 0.8, heightM: 0.75 },
      { id: "c", name: "Bo's car", position: { x: 5, y: 20 }, radiusM: 2, heightM: 1.5 },
    ] };
    const spec = { code: "P1", visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"] } as unknown as ShotSpec;
    const f = planForShot(p as never, spec).furniture!;
    expect(f.find((x) => x.id === "s")!.heldBy).toBe("bo");
    expect(f.find((x) => x.id === "c")!.heldBy).toBeUndefined();
  });
});
