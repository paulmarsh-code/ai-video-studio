// D81: general faults found by running the five generality scenes (T7-T11) through the app.
import { describe, expect, it } from "vitest";
import { propKind } from "../src/lib/domain/story";
import { guessRoom } from "../src/lib/domain/room";
import { areaFromWords, levelsFromWords } from "../src/lib/domain/levels";
import { blockingFromWords, readPlace } from "../src/lib/domain/panelWords";
import { planForShot } from "../src/lib/domain/geometry";
import { verticalFor } from "../src/lib/domain/vertical";
import type { GeometryPlanData } from "../src/lib/domain/types";

const b = { minX: -15, maxX: 15, minY: 0, maxY: 30 };
const CAST = [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }];

describe("Faults found across the five scenes (D81)", () => {
  it("two people sent to the same place stand apart", () => {
    const slope = areaFromWords({ name: "ski run", kind: "slope", detail: "60 m long, falls 10 m" }, b, { x: 0, y: 5 }, [])!;
    const plan: GeometryPlanData = { bounds: { ...b, maxY: 70 }, levels: [slope], actors: [{ characterId: "ava", position: { x: -1, y: 5 } }, { characterId: "bo", position: { x: 1, y: 5 } }], cameras: [], views: [] };
    const [p] = blockingFromWords(plan, [{ action: "They stand.", visibleIds: ["ava", "bo"], places: { ava: "at the top of the ski run", bo: "at the top of the ski run" } }], CAST);
    const A = p.ava?.at ?? { x: -1, y: 5 }, B = p.bo?.at ?? { x: 1, y: 5 };
    expect(Math.hypot(A.x - B.x, A.y - B.y)).toBeGreaterThan(0.7);
  });
  it("partway down a slope is down it", () => {
    expect(readPlace("partway down the ski run")).toEqual({ how: "mid", what: "ski run" });
    expect(readPlace("in the middle of the deck")).toEqual({ how: "mid", what: "deck" });
  });
  it("only a prop's name makes it a table-top thing", () => {
    expect(propKind("DJ booth portable, waist-high, black, with a laptop and two speakers on it", "DJ booth")).toBe("table");
    expect(propKind("kettle blackened metal", "kettle")).toBe("small");
  });
  it("small things aren't stood on a fire", () => {
    const plan: GeometryPlanData = { actors: [], cameras: [], views: [], furniture: [{ id: "f", name: "campfire", position: { x: 0, y: 5 }, radiusM: 0.5, heightM: 0.5 }, { id: "m", name: "enamel mugs", position: { x: 1, y: 5 }, radiusM: 0.13, heightM: 0.2 }] };
    expect((planForShot(plan).furniture!.find((f) => f.id === "m") as { onId?: string }).onId).toBeUndefined();
  });
  it("someone falling or riding isn't still kneeling from the panel before", () => {
    const plan: GeometryPlanData = { actors: [{ characterId: "ava", position: { x: 0, y: 5 } }], cameras: [], views: [] };
    const a = planForShot(plan, { posture: { ava: { pose: "kneeling", by: "carried" } }, doing: { ava: { action: "fall" } } }).actors[0];
    expect(a.pose).toBeUndefined();
    expect(a.doing).toEqual({ action: "fall" });
  });
  it("outdoor venues are sized as outdoors, and a deck or clearing is small", () => {
    expect(guessRoom("Skydiving drop zone A small grass airfield, flat green farmland", "exterior").label).toBe("open ground outdoors");
    expect(guessRoom("Yacht deck at sea", "exterior")).toMatchObject({ widthM: 8, depthM: 12 });
  });
  it("a landing field isn't a balcony, and staring down a slope isn't a look over an edge", () => {
    expect(levelsFromWords("on the landing field", "", b, { x: 0, y: 5 })).toEqual([]);
    expect(verticalFor("Tom stares down the slope, gripping his poles.")).toBeUndefined();
    expect(verticalFor("She looks down at the street far below.")?.kind).toBe("high");
  });
});
