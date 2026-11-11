// D55: any scene, made-up names. A prop the person detector knows (a table, a chair, a sofa) has
// its place measured against the plan, like the people; others keep the model's description.
import { describe, expect, it } from "vitest";
import { decodeThings, detectScale, detectorKind, numberPeople } from "../src/lib/domain/peopleDetect";
import { judgePicture, type PictureExpectation } from "../src/lib/domain/pictureCheck";

describe("Which props the detector can measure (D55)", () => {
  it("knows tables, chairs and sofas by name, and leaves counters, plinths and logo walls to the model", () => {
    expect(detectorKind("tall round cocktail table")).toBe("dining table");
    expect(detectorKind("velvet armchair")).toBe("chair");
    expect(detectorKind("leather sofa")).toBe("couch");
    for (const n of ["bar counter", "Plinth", "GLOWVANE illuminated logo backdrop", "product display pedestal"]) expect(detectorKind(n)).toBeUndefined();
  });

  it("reads a table from the detector's output", () => {
    const k = 85, rows = 80 * 80 + 40 * 40 + 20 * 20, out = new Float32Array(rows * k);
    const b = (80 * 80 + 10 * 40 + 12) * k; // the 16-pixel grid, cell (12, 10)
    out[b] = 0.5; out[b + 1] = 0.5; out[b + 2] = Math.log(6); out[b + 3] = Math.log(4); out[b + 4] = 0.9; out[b + 5 + 60] = 0.8;
    const [t] = decodeThings(out, k, detectScale(1024, 1536), 1024, 1536);
    expect(t.kind).toBe("dining table");
    expect(t.score).toBeCloseTo(0.72, 2);
  });
});

const e: PictureExpectation = {
  order: ["Ava Stone", "Ben"], props: ["cocktail table"], crowd: "busy",
  figures: [
    { name: "Ava Stone", x: 0.25, headY: 0.48, feetY: 0.66, standing: true },
    { name: "Ben", x: 0.4, headY: 0.48, feetY: 0.66, standing: true },
  ],
  propSpots: [{ name: "cocktail table", kind: "dining table", x: 0.32, baseY: 0.67, among: true }],
};
const main = JSON.stringify({ left_to_right: ["Ava Stone", "Ben"], props_seen: ["cocktail table"], background_people: "busy" });
const people = numberPeople([{ x0: 0.22, y0: 0.48, x1: 0.28, y1: 0.66, score: 0.9 }, { x0: 0.37, y0: 0.49, x1: 0.43, y1: 0.67, score: 0.9 }]);
const reply = JSON.stringify({ people: [{ name: "Ava Stone", box: 1 }, { name: "Ben", box: 2 }] });

describe("A prop's place against the plan (D55)", () => {
  it("a table drawn well in front of the group it should stand among fails, with where it is", () => {
    const r = judgePicture(e, main, { people, reply, aspect: 1.5, things: [{ kind: "dining table", score: 0.5, x0: 0.42, y0: 0.68, x1: 0.73, y1: 0.915 }] });
    expect(r.areas!.blocking.pass).toBe(true);
    expect(r.areas!.room.problems).toEqual(["The cocktail table is well in front of where image 1 puts it: its foot is about 92% of the way down the picture, but image 1 has it about 67% down, among the people. Keep it where image 1 shows it."]);
    expect(r.redraw).toBe(true);
    expect(r.propsMeasured).toEqual([{ name: "cocktail table", x: 0.575, plannedX: 0.32, baseY: 0.915, plannedBaseY: 0.67 }]);
  });

  it("passes a table among them, says when it can't be found, and leaves it alone when the camera is wrong", () => {
    expect(judgePicture(e, main, { people, reply, aspect: 1.5, things: [{ kind: "dining table", score: 0.5, x0: 0.27, y0: 0.55, x1: 0.38, y1: 0.69 }] }).pass).toBe(true);
    expect(judgePicture(e, main, { people, reply, aspect: 1.5, things: [] }).areas!.room.unmeasured).toEqual(["the cocktail table: not found by the detector, place not measured"]);
    const high = numberPeople([{ x0: 0.22, y0: 0.2, x1: 0.28, y1: 0.4, score: 0.9 }, { x0: 0.37, y0: 0.21, x1: 0.43, y1: 0.41, score: 0.9 }]);
    const r = judgePicture(e, main, { people: high, reply, aspect: 1.5, things: [{ kind: "dining table", score: 0.5, x0: 0.42, y0: 0.68, x1: 0.73, y1: 0.915 }] });
    expect(r.eyeLevel).toBe("above");
    expect(r.areas!.room.problems).toEqual([]);
  });
});

describe("Image 1 shows only the plan's furniture (D56)", () => {
  it("clears tables and chairs standing in the venue picture, but keeps the plan's own and anything up on the walls", async () => {
    const { looseFurniture } = await import("../src/lib/backgroundImage");
    const spots = [{ kind: "dining table", x: 0.3, baseY: 0.67 }];
    const things = [
      { kind: "dining table", score: 0.33, x0: 0.44, y0: 0.67, x1: 0.74, y1: 0.79 }, // the venue picture's own, front centre
      { kind: "dining table", score: 0.4, x0: 0.22, y0: 0.6, x1: 0.4, y1: 0.7 }, // where the plan's table stands
      { kind: "tv", score: 0.5, x0: 0.6, y0: 0.2, x1: 0.8, y1: 0.4 }, // above the horizon: part of the room
      { kind: "chair", score: 0.4, x0: 0.1, y0: 0.75, x1: 0.2, y1: 0.9 },
    ];
    expect(looseFurniture(things, spots, 0.5).map((t) => [t.kind, t.x0])).toEqual([["dining table", 0.44], ["chair", 0.1]]);
  });
});

describe("Flat props are drawn as their own picture in image 1 (D57)", () => {
  it("a sign with a picture is placed as that picture at its spot; a table keeps its stand-in", async () => {
    const { layoutSketchSvg } = await import("../src/lib/domain/layoutSketch");
    const plan = {
      aspect: "9:16", bounds: { minX: -9, maxX: 9, minY: 0, maxY: 22 }, actors: [],
      furniture: [
        { id: "sign", name: "ACME logo backdrop", position: { x: 1, y: 12 }, radiusM: 1.5, heightM: 2.5, imageAssetId: "a" },
        { id: "tbl", name: "cocktail table", position: { x: -1, y: 9 }, radiusM: 0.35, imageAssetId: "b" },
      ],
      cameras: [{ id: "c", name: "Wide", preset: "wide", position: { x: 0, y: 2 }, lookAt: { x: 0, y: 10 }, fovDeg: 60 }],
      views: [],
    };
    const pics = { sign: "data:image/png;base64,AAAA", tbl: "data:image/png;base64,BBBB" };
    const svg = layoutSketchSvg({ plan: plan as never, camera: plan.cameras[0] as never, people: [], size: "portrait", overlay: true, propPictures: pics });
    expect(svg).toContain('href="data:image/png;base64,AAAA"');
    expect(svg).not.toContain("BBBB");
    // Without the blocking frame's overlay (the plain sketch), no pictures.
    expect(layoutSketchSvg({ plan: plan as never, camera: plan.cameras[0] as never, people: [], size: "portrait", propPictures: pics })).not.toContain("AAAA");
  });
});
