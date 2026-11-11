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
