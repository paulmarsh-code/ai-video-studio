// Room size per venue and raised/lowered areas (D29): any scene; made-up names.
import { describe, expect, it } from "vitest";
import { applyRoom, guessRoom, groupCentre, roomFor } from "../src/lib/domain/room";
import { floorZ, levelLines, levelsFromWords } from "../src/lib/domain/levels";
import { addMovementMarks, defaultPlan, shotSpecFor } from "../src/lib/domain/story";
import { cameraPlacementProblem, readCamera } from "../src/lib/domain/geometry";
import { designScene } from "../src/lib/domain/director";
import { layoutSketchSvg } from "../src/lib/domain/layoutSketch";
import type { GeometryPlanData } from "../src/lib/domain/types";

describe("Room size per venue (D29)", () => {
  it.each([
    ["The lift", 2.5], ["Ava's bedroom", 4.5], ["Corner café", 7], ["The Ember Room cocktail bar", 10],
    ["Grand ballroom", 18], ["Product launch event space", 18], ["Windswept cliff top", 30], ["Somewhere", 9],
  ])("%s", (text, w) => { expect(guessRoom(text).widthM).toBe(w); });
  it("outdoors by setting; a size you set wins over the guess", () => {
    expect(guessRoom("The meeting point", "exterior").widthM).toBe(30);
    expect(roomFor({ name: "Grand ballroom", room: { widthM: 12, depthM: 14 } })).toMatchObject({ widthM: 12, depthM: 14, guessed: false });
    expect(roomFor({ name: "Grand ballroom", room: null })).toMatchObject({ widthM: 18, guessed: true });
  });
  const cast = ["ava", "ben", "cal"];
  const panels = [
    { action: "Ava, Ben and Cal talk.", inFrame: cast, line: "", emotion: "calm", seconds: 3 },
    { action: "Dan walks in from across the room.", inFrame: ["cal"], line: "", emotion: "calm", seconds: 3 },
  ];
  const staging = { spot: "standing around a small table", props: [], crowd: "", crowdLevel: "none" as const };
  it("a new plan uses the venue's room, with the group in the same relative place", () => {
    const small = defaultPlan(cast, panels as never, [], staging, "16:9", { room: { widthM: 4.5, depthM: 5.5 } });
    expect(small.bounds).toEqual({ minX: -2.25, maxX: 2.25, minY: 0, maxY: 5.5 });
    for (const a of small.actors) { expect(a.position.x).toBeGreaterThan(-2.25); expect(a.position.x).toBeLessThan(2.25); expect(a.position.y).toBeLessThan(5.5); }
    const usual = defaultPlan(cast, panels as never, [], staging, "16:9");
    expect(usual.bounds).toEqual({ minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 });
    expect(groupCentre({ widthM: 9, depthM: 10 })).toEqual({ x: 0.25, y: 4.85 });
  });
  it("arrival marks fit inside a small room", () => {
    const small = defaultPlan(cast, panels as never, [], staging, "16:9", { room: { widthM: 4.5, depthM: 5.5 } });
    const { plan } = addMovementMarks(small, [{ action: panels[0].action, subjectId: "ava" }, { action: "Cal walks in from across the room.", subjectId: "cal" }]);
    const m = plan.actors.find((a) => a.characterId === "cal")!.marks!.find((x) => x.id === "arriving")!;
    expect(m.position.x).toBeGreaterThan(-2.25); expect(m.position.x).toBeLessThan(2.25);
    expect(m.position.y).toBeGreaterThan(0); expect(m.position.y).toBeLessThan(5.5);
  });
  it("changing the room keeps everyone in the same place relative to each other", () => {
    const p = defaultPlan(cast, panels as never, [], staging, "16:9");
    const q = applyRoom(p, { widthM: 18, depthM: 22 });
    const d = (pl: GeometryPlanData) => Math.hypot(pl.actors[0].position.x - pl.actors[1].position.x, pl.actors[0].position.y - pl.actors[1].position.y);
    expect(d(q)).toBeCloseTo(d(p), 5);
    expect(q.bounds!.maxY).toBe(22);
  });
});

describe("Raised and lowered areas (D29)", () => {
  const b = { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 }, C = { x: 0.25, y: 4.85 };
  it.each([
    ["standing on the stage", "", 1],
    ["leaning on the balcony railing, looking down on the hall", "", 4],
    ["at the top of the stairs", "", 3],
    ["standing at the edge of the cliff", "", -30],
    ["on the rooftop by the ledge", "", -20],
    ["standing around a table", "A hotel bar with a mezzanine balcony", 4],
    ["standing around a table", "", undefined],
  ])("%s", (spot, venue, h) => { expect(levelsFromWords(spot, venue, b, C)[0]?.heightM).toBe(h); });
  it("people on a level stand at its height; a camera can't stand over a drop", () => {
    const lv = levelsFromWords("standing at the edge of the cliff", "", b, C);
    const plan: GeometryPlanData = { bounds: b, levels: lv, actors: [{ characterId: "ava", position: C }], cameras: [], views: [] };
    expect(floorZ(plan, C)).toBe(0);
    expect(floorZ(plan, { x: 0, y: 9 })).toBe(-30);
    expect(cameraPlacementProblem(plan, { id: "c", name: "c", preset: "wide", position: { x: 0, y: 9 }, lookAt: C })).toContain("drop");
  });
  it("someone high on a balcony is out of the top of a level camera's frame, and the chooser tilts up to them", () => {
    const cast = ["ava", "ben"];
    const ps = [
      { action: "Ava talks to Ben.", inFrame: cast, line: "", emotion: "calm", seconds: 3 },
      { action: "Ben smiles.", inFrame: ["ben"], line: "", emotion: "calm", seconds: 3 },
    ];
    const plan = defaultPlan(cast, ps as never, [], { spot: "standing in the hall", props: [], crowd: "", crowdLevel: "none" }, "16:9");
    const ben = plan.actors.find((a) => a.characterId === "ben")!.position;
    plan.levels = [{ id: "stage", name: "the stage", heightM: 3, x: ben.x - 0.6, y: ben.y - 0.6, w: 1.2, d: 1.2, edge: "plain" }];
    const level = { id: "c", name: "c", preset: "single-cu" as const, position: { x: ben.x, y: ben.y - 2 }, lookAt: ben };
    expect(readCamera(plan, level).actors.find((a) => a.characterId === "ben")!.frame).toBe("out-above");
    const shots = ps.map((p, i) => ({ id: `s${i}`, code: `P${i + 1}`, description: p.action, spec: { ...shotSpecFor(p as never, { code: `P${i + 1}`, venueName: "hall", castIds: cast }), subjectId: p.inFrame[0] === "ben" ? "ben" : "ava" } }));
    const d = designScene(plan, shots, (id) => id);
    const c = d.shots[1].options[0].camera;
    expect(c.tiltDeg!).toBeGreaterThan(10);
    expect(d.shots[1].options[0].reasons.join(" ")).toContain("R-LEVEL");
    expect(readCamera(plan, c).actors.find((a) => a.characterId === "ben")!.inView).toBe(true);
    const lines = levelLines(plan, c, ["ben"], (id) => (id === "ben" ? "Ben" : id));
    expect(lines.join(" ")).toMatch(/Ben is on the stage, about \d(\.\d)? m above the camera/);
    const svg = layoutSketchSvg({ plan: { ...plan, cameras: [c] }, camera: c, people: [{ id: "ben", name: "Ben" }], size: "landscape" });
    expect(svg).toContain("the stage (+3 m)");
  });
  it("a cliff drop beyond the group is named in the prompt", () => {
    const lv = levelsFromWords("standing at the edge of the cliff", "", b, C);
    const plan: GeometryPlanData = { bounds: b, levels: lv, actors: [{ characterId: "ava", position: C }], cameras: [], views: [] };
    const cam = { id: "c", name: "c", preset: "wide" as const, position: { x: C.x, y: C.y - 3 }, lookAt: C };
    expect(levelLines(plan, cam, ["ava"], () => "Ava").join(" ")).toContain("sheer drop of about 30 m");
  });
});

describe("Room guess reads the name first (D29)", () => {
  it("a launch venue whose description mentions a bar is a hall", () => {
    expect(roomFor({ name: "GLOWVANE launch-party venue", description: "A converted warehouse with a long bar and a screen wall" }).widthM).toBe(18);
    expect(roomFor({ name: "The Meridian", description: "A small hotel bar with leather booths" }).widthM).toBe(10);
  });
});
