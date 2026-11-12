// D80, stage 1 of the places-and-actions plan: areas at their real size, what each person is
// doing, where each person is panel by panel, and cameras that see it. Any scene; made-up names.
import { describe, expect, it } from "vitest";
import { actionOf, actionsInWords, parseStoryReply, propHeight } from "../src/lib/domain/story";
import { areaFromWords, floorZ, levelAt, withAreas } from "../src/lib/domain/levels";
import { areaSpot, blockingFromWords, readPlace } from "../src/lib/domain/panelWords";
import { cameraPlacementProblem, planForShot, propsBlocking } from "../src/lib/domain/geometry";
import { layoutSketchSvg } from "../src/lib/domain/layoutSketch";
import { carriedNow, doingWords, panelPrompt } from "../src/lib/domain/imagePrompts";
import type { GeometryPlanData, ShotSpec } from "../src/lib/domain/types";

const CAST = [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }];
const views = [{ name: "deep pool and diving boards", directionDeg: 90 }, { name: "changing rooms", directionDeg: 270 }];
const b = { minX: -6, maxX: 6, minY: 0, maxY: 12 };

describe("Areas from the scene setting (D80)", () => {
  it("are read from AREA lines, with a kind from the fixed list", () => {
    const r = parseStoryReply("SCENE\nSPOT: at the edge of the pool\nAREA: pool - water - 10 m by 5 m, 1.4 m deep\nAREA: ski run - slope - 40 m long, falls 8 m\nPANEL 1\nACTION: x", CAST as never);
    expect(r.staging.areas).toEqual([{ name: "pool", kind: "water", detail: "10 m by 5 m, 1.4 m deep" }, { name: "ski run", kind: "slope", detail: "40 m long, falls 8 m" }]);
  });
  it("stand at their real size beside the group, towards the venue view that names them", () => {
    const l = areaFromWords({ name: "pool", kind: "water", detail: "10 m by 5 m, 1.4 m deep" }, b, { x: 0, y: 5 }, views)!;
    expect(l).toMatchObject({ kind: "water", w: 10, d: 5, waterM: 1.4 });
    expect(l.y).toBeCloseTo(5.6, 1); // its near edge just beyond the group, towards the pool view (90°)
    const bowl = areaFromWords({ name: "skate bowl", kind: "lowered", detail: "round, about 5 m across and 2 m deep" }, b, { x: 0, y: 5 }, [])!;
    expect(bowl).toMatchObject({ round: true, w: 5, d: 5, heightM: -2 });
    expect(levelAt({ levels: [bowl] }, { x: bowl.x + 0.1, y: bowl.y + 0.1 })).toBeUndefined(); // a round bowl's corner is floor
  });
  it("a slope falls across itself; the plan grows to hold it; a prop of the same name gives way", () => {
    const plan: GeometryPlanData = { bounds: b, actors: [{ characterId: "ava", position: { x: 0, y: 5 } }], furniture: [{ id: "spot", name: "ski run", position: { x: 0, y: 5 }, radiusM: 0.13 }], cameras: [], views: [] };
    const p = withAreas(plan, [{ name: "ski run", kind: "slope", detail: "40 m long, falls 8 m" }]);
    const run = p.levels![0];
    expect(p.bounds!.maxY).toBeGreaterThanOrEqual(run.y + run.d);
    expect(p.furniture).toEqual([]);
    expect(floorZ(p, { x: 0, y: run.y + 0.5 })).toBeGreaterThan(-0.5);
    expect(floorZ(p, { x: 0, y: run.y + run.d - 0.5 })).toBeLessThan(-7.5);
    expect(withAreas(p, [{ name: "ski run", kind: "slope", detail: "" }])).toBe(p); // nothing new
  });
});

describe("What each person is doing (D80)", () => {
  it("from DOING, in the fixed words or plain ones", () => {
    expect(actionOf("ride (skateboard)")).toEqual({ action: "ride", with: "skateboard" });
    expect(actionOf("skiing")).toEqual({ action: "ride", with: "skis" });
    expect(actionOf("on the phone")).toEqual({ action: "phone" });
    expect(actionOf("stand filming")).toEqual({ action: "stand" });
    expect(actionOf("nonsense")).toBeUndefined();
  });
  it("from the panel's own verbs when there is no DOING, to the person named before them", () => {
    expect(actionsInWords("Ava stands at the rim while Bo drops in and carves across the bowl.", ["ava", "bo"])).toEqual({ bo: { action: "ride" } });
    expect(actionsInWords("Bo dives into the pool; Ava swims to the edge.", ["ava", "bo"])).toEqual({ bo: { action: "dive" }, ava: { action: "swim" } });
    expect(actionsInWords("Ava runs her hand through her hair and Bo falls silent.", ["ava", "bo"])).toEqual({});
  });
  it("is said in the request and on the stand-in's label", () => {
    expect(doingWords("Bo", { action: "ride", with: "skateboard" })).toBe("Bo is riding a skateboard");
    expect(doingWords("Ava", { action: "swim" })).toMatch(/only head and shoulders above the water/);
  });
});

describe("Where each person is, panel by panel (D80)", () => {
  const pool = areaFromWords({ name: "pool", kind: "water", detail: "8 m by 4 m, 1.4 m deep" }, b, { x: 0, y: 5 }, views)!;
  const plan: GeometryPlanData = { bounds: { ...b, maxY: 14 }, levels: [pool], actors: [{ characterId: "ava", position: { x: -1, y: 5 } }, { characterId: "bo", position: { x: 1, y: 5 } }], cameras: [], views };
  it("reads in, at the edge, across, the far wall, top and foot", () => {
    expect(readPlace("in the pool")).toEqual({ how: "in", what: "pool" });
    expect(readPlace("at the edge of the pool")).toEqual({ how: "edge", what: "pool" });
    expect(readPlace("on the far lip of the skate bowl")).toEqual({ how: "far", what: "skate bowl" });
    expect(readPlace("up the far wall of the bowl")).toEqual({ how: "farWall", what: "bowl" });
    expect(readPlace("at the bottom of the ski run")).toEqual({ how: "bottom", what: "ski run" });
    expect(readPlace("beside Ava")).toEqual({ how: "beside", what: "Ava" });
  });
  it("puts people in the area, on its rim outside the water, and across from the others", () => {
    const [p1, p2] = blockingFromWords(plan, [
      { action: "Bo dives in.", visibleIds: ["ava", "bo"], places: { bo: "in the pool", ava: "at the edge of the pool" } },
      { action: "Bo swims away.", visibleIds: ["ava", "bo"], places: { bo: "at the far edge of the pool" } },
    ], CAST);
    expect(levelAt(plan, p1.bo.at)).toBe(pool);
    expect(levelAt(plan, p1.ava?.at ?? { x: -1, y: 5 })).toBeUndefined();
    expect(p2.bo.at.y).toBeGreaterThan(pool.y + pool.d); // beyond the far edge, away from Ava
  });
  it("areaSpot keeps someone already in it where they are", () => {
    expect(areaSpot(pool, "in", { x: pool.x + 1, y: pool.y + 1 })).toEqual({ x: +(pool.x + 1).toFixed(2), y: +(pool.y + 1).toFixed(2) });
  });
});

describe("Pictures and cameras for areas and actions (D80)", () => {
  const bowl = { ...areaFromWords({ name: "skate bowl", kind: "lowered", detail: "round, about 5 m across and 2 m deep" }, b, { x: 0, y: 5 }, [])!, x: -2.5, y: 6, w: 5, d: 5 };
  const plan: GeometryPlanData = {
    aspect: "9:16", bounds: { ...b, maxY: 14 }, levels: [bowl],
    actors: [{ characterId: "ava", position: { x: -1.5, y: 5.6 } }, { characterId: "bo", position: { x: 0, y: 8.5 } }],
    furniture: [{ id: "l", name: "ledge", detail: "a low concrete ledge, knee-high", position: { x: 0, y: 5.8 }, radiusM: 0.35, heightM: 1.1 }, { id: "sb", name: "skateboard", detail: "used by Bo", position: { x: 2, y: 3 }, radiusM: 0.4 }],
    cameras: [{ id: "c", name: "Front", preset: "two-shot", position: { x: 0, y: 1 }, lookAt: { x: 0, y: 7 }, fovDeg: 60 }],
    views: [],
  };
  const spec = { code: "P2", visibleIds: ["ava", "bo"], presentIds: ["ava", "bo"], excludedIds: [], cameraId: "c", audioMode: "off", durationSec: 4, venueName: "park", doing: { bo: { action: "ride", with: "skateboard" } } } as unknown as ShotSpec;
  it("a knee-high ledge is knee-high, and hides the face of someone down in the bowl behind it", () => {
    expect(propHeight("a low concrete ledge, knee-high", "ledge")).toBe(0.5);
    const sp = planForShot(plan, spec);
    expect(sp.furniture!.find((f) => f.id === "l")!.heightM).toBe(0.5);
    expect(propsBlocking(sp, sp.cameras[0], ["bo"]).some((x) => x.face)).toBe(true);
  });
  it("the stand-in says what they're doing, and the hollow is drawn", () => {
    const sp = planForShot(plan, spec);
    const svg = layoutSketchSvg({ plan: sp, camera: sp.cameras[0], size: "portrait", overlay: true, people: [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }] });
    expect(svg).toMatch(/RIDING SKATEBOARD/);
    expect(svg).toMatch(/skate bowl \(2 m deep\)/);
  });
  it("the request says what they're doing and where; a ridden board isn't carried in a hand", () => {
    const sp = planForShot(plan, spec);
    expect(carriedNow(sp, "bo", { appearance: "", wardrobe: "black hoodie; carries a green skateboard in his right hand", refs: {} } as never).map((x) => x.what)).not.toContain("green skateboard");
    const p = panelPrompt({ description: "Bo carves across the bowl; Ava watches from the rim.", shot: spec, cast: CAST.map((c) => ({ ...c, pronoun: "she", voiceLock: "", description: "" })) as never, profiles: {}, plan, venueName: "park", blockingHref: "/api/blocking/x" });
    for (const x of [p.text, p.short!]) {
      expect(x).toMatch(/Doing: Bo is riding a skateboard/);
      expect(x).toMatch(/Bo is in the skate bowl, about \d(\.\d)? m below the camera/);
    }
  });
  it("cameras don't stand in water or down in a hollow", () => {
    expect(cameraPlacementProblem(plan, { id: "x", name: "x", preset: "wide", position: { x: 1, y: 7.8 }, lookAt: { x: 0, y: 2 } })).toBe("in skate bowl");
  });
});
