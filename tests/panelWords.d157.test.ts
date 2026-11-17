// D157: three misreadings in Paul's panels 8, 12 and 13, fixed for any scene (made-up names here).
import { describe, expect, it } from "vitest";
import { blockingFromWords } from "../src/lib/domain/panelWords";
import type { GeometryPlanData } from "../src/lib/domain/types";

const people = [{ id: "ava", name: "Ava Stone" }, { id: "bo", name: "Bo" }, { id: "cy", name: "Cy" }, { id: "di", name: "Di" }];
const bar: GeometryPlanData = {
  bounds: { minX: -6, maxX: 6, minY: 0, maxY: 20 },
  actors: [{ characterId: "ava", position: { x: 1, y: 10 } }, { characterId: "bo", position: { x: -1, y: 10 } }, { characterId: "cy", position: { x: -0.3, y: 10.5 } }, { characterId: "di", position: { x: 0.3, y: 10.6 } }],
  furniture: [{ id: "t", name: "cocktail table", position: { x: 0, y: 10 }, radiusM: 0.35 }],
  cameras: [], lineOfAction: ["ava", "bo"],
  views: [{ name: "screen wall", directionDeg: 90 }, { name: "entrance doors", directionDeg: 270 }, { name: "bar", directionDeg: 180 }, { name: "lounge", directionDeg: 0 }],
};
const P = (action: string, subjectId?: string, cameraAt?: { x: number; y: number }) => ({ action, subjectId, visibleIds: ["ava", "bo", "cy", "di"], ...(cameraAt ? { cameraAt } : {}) });

describe("Reading who does what (D157)", () => {
  it("a walk off goes away from the panel's camera, not towards the doors behind it", () => {
    const [out] = blockingFromWords(bar, [P("Ava scoffs and turns away to walk off.", "ava", { x: 0, y: 5 })], people);
    expect(out.ava.why).toBe("walks off");
    expect(out.ava.to!.y).toBeGreaterThan(12); // away from the camera at y 5, not to the doors at 270°
  });
  it("without a camera, the doors as before", () => {
    const [out] = blockingFromWords(bar, [P("Ava walks off.", "ava")], people);
    expect(out.ava.to!.y).toBeLessThan(8);
  });
  it("'back on Bo and the group… Ava carries on walking away' keeps Ava going, and moves nobody else", () => {
    const out = blockingFromWords(bar, [
      P("Ava scoffs and walks off.", "ava", { x: 0, y: 5 }),
      P("Back on Bo and the group: Bo shrugs and glances at Cy and Di as if to say good riddance; behind them, Ava carries on walking away.", "bo", { x: 0, y: 5 }),
    ], people);
    expect(out[1].ava).toMatchObject({ why: "still walking away" });
    expect(out[1].ava.at).toEqual(out[0].ava.to);
    expect(out[1].di).toBeUndefined();
    expect(out[1].cy).toBeUndefined();
  });
  it("a thing as the subject moves nobody: 'The ice bucket stays on the cocktail table'", () => {
    const [out] = blockingFromWords(bar, [P("Two-shot of Ava and Bo: Ava holds the letter out to Bo, insisting he looks at it.The silver ice bucket stays on the cocktail table beside the flowers.", "ava")], people);
    expect(out.bo).toBeUndefined();
    expect(out.ava).toBeUndefined();
  });
});

describe("Leaning on, and behind someone among the crowd (D162)", () => {
  const counter: GeometryPlanData = { ...bar, furniture: [{ id: "spot", name: "bar counter", position: { x: 0, y: 10 }, radiusM: 1.5 }], actors: [{ characterId: "bo", position: { x: 1, y: 10 } }, { characterId: "ava", position: { x: -1, y: 10 } }] };
  it("leaning on the counter is beside it, not on top of it", () => {
    const [out] = blockingFromWords(counter, [P("Bo leans on the counter, phone to his ear.", "bo")], people);
    const at = out.bo?.at ?? { x: 1, y: 10 };
    expect(Math.hypot(at.x, at.y - 10)).toBeGreaterThan(1.4);
  });
  it("'behind Bo among guests' is a few metres behind him, away from what he faces, and stays there", () => {
    const out = blockingFromWords(counter, [
      { ...P("Bo leans on the counter; Ava stands a few metres behind him.", "bo"), places: { bo: "at the bar counter", ava: "behind Bo among guests" } },
      { ...P("On Ava behind him, listening.", "ava"), places: { ava: "behind Bo among guests" } },
    ], people);
    expect(out[0].ava.why).toBe("a few metres behind Bo, out of sight");
    expect(out[0].ava.at.x).toBeGreaterThan(3); // the far side of Bo from the counter
    expect(out[1].ava).toBeUndefined(); // already there
  });
});
