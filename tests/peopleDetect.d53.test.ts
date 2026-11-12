// D53: any scene, made-up names. A person detector outlines everyone; the vision model only
// says which outline is whom; sizes, places across and the eye level are measured by rule.
import { describe, expect, it } from "vitest";
import { decodePeople, detectScale, keepBest, numberPeople, type Person } from "../src/lib/domain/peopleDetect";
import { judgePicture, marksPrompt, type PictureExpectation } from "../src/lib/domain/pictureCheck";

describe("Reading the detector's output (D53)", () => {
  it("turns a person guess on the grid into an outline on the picture, and drops what isn't a person", () => {
    const k = 85, rows = 80 * 80 + 40 * 40 + 20 * 20, out = new Float32Array(rows * k);
    // A 1024 × 1536 picture fits the 640 square at 0.4167: a person at row 0 of the 32-pixel grid, cell (5, 10).
    const at = 80 * 80 + 40 * 40 + 10 * 20 + 5, b = at * k;
    out[b] = 0.5; out[b + 1] = 0.5; out[b + 2] = Math.log(2); out[b + 3] = Math.log(4); out[b + 4] = 0.9; out[b + 5] = 0.95;
    // Something sure but not a person (kind 2) is ignored.
    const c = 100 * k; out[c + 4] = 0.9; out[c + 7] = 0.9;
    const s = detectScale(1024, 1536);
    const [p, ...rest] = decodePeople(out, k, s, 1024, 1536);
    expect(rest).toEqual([]);
    expect(p.score).toBeCloseTo(0.855, 3);
    // Centre (5.5 × 32, 10.5 × 32) = (176, 336) in the square; 64 × 128 in size.
    expect(p.x0).toBeCloseTo((176 - 32) / s / 1024, 4);
    expect(p.y1).toBeCloseTo((336 + 64) / s / 1536, 4);
  });

  it("keeps the surest of overlapping guesses, and numbers the people worth naming left to right", () => {
    const a: Person = { x0: 0.5, y0: 0.2, x1: 0.7, y1: 0.8, score: 0.9 };
    const kept = keepBest([a, { ...a, x0: 0.51, score: 0.6 }, { x0: 0.1, y0: 0.3, x1: 0.2, y1: 0.6, score: 0.8 }], 2 / 3);
    expect(kept).toHaveLength(2);
    const n = numberPeople([...kept, { x0: 0.9, y0: 0.1, x1: 0.91, y1: 0.12, score: 0.9 }, { x0: 0.3, y0: 0.1, x1: 0.4, y1: 0.4, score: 0.2 }]);
    expect(n.map((p) => [p.n, p.x0])).toEqual([[1, 0.1], [2, 0.5]]); // too small and too unsure are left out
  });
});

// Panel 1 as the detector measured Paul's real picture: the group drawn about twice their
// planned height and the camera pointed down; Jade in front, a little left of her place.
const expect1: PictureExpectation = {
  order: ["Ava Stone", "Ben", "Cleo", "Dee"], props: [], crowd: "busy",
  figures: [
    { name: "Ava Stone", x: 0.274, headY: 0.488, feetY: 0.655, standing: true },
    { name: "Ben", x: 0.338, headY: 0.488, feetY: 0.66, standing: true },
    { name: "Cleo", x: 0.389, headY: 0.487, feetY: 0.668, standing: true },
    { name: "Dee", x: 0.858, headY: 0.461, feetY: 1.02, standing: true },
  ],
};
const found = numberPeople([
  { score: 0.93, x0: 0.532, x1: 0.872, y0: 0.163, y1: 0.907 },
  { score: 0.92, x0: 0.056, x1: 0.242, y0: 0.194, y1: 0.579 },
  { score: 0.88, x0: 0.402, x1: 0.53, y0: 0.21, y1: 0.563 },
  { score: 0.88, x0: 0.232, x1: 0.419, y0: 0.203, y1: 0.381 }, // behind the table
  { score: 0.75, x0: 0.029, x1: 0.098, y0: 0.231, y1: 0.436 },
  { score: 0.74, x0: 0.804, x1: 0.876, y0: 0.24, y1: 0.405 },
]);
const main = JSON.stringify({ left_to_right: ["Ava Stone", "Ben", "Cleo", "Dee"], props_seen: [], background_people: "busy" });
const pick = (names: Record<string, number>) => ({ people: found, aspect: 1.5, reply: JSON.stringify({ people: Object.entries(names).map(([name, box]) => ({ name, box })) }) });
const num = (x0: number) => found.find((p) => p.x0 === x0)!.n!;

describe("Measured against the plan (D53)", () => {
  it("fails the group at their measured size and the camera at the measured heads; Dee in front passes", () => {
    const r = judgePicture(expect1, main, pick({ "Ava Stone": num(0.056), Ben: num(0.232), Cleo: num(0.402), Dee: num(0.532) }));
    expect(r.measuredBy).toBe("detector");
    expect(r.redraw).toBe(true);
    const all = r.problems.join(" ");
    expect(all).toMatch(/Ava Stone is drawn about 2\.3 times the planned height \(38% of the picture's height, planned 17%\)/);
    expect(all).toMatch(/Cleo is drawn about 2\.0 times the planned height/);
    expect(all).not.toMatch(/Dee|Ben is drawn/);
    expect(all).toMatch(/Heads are higher in the picture than in image 1: about 19% of the way down, but image 1 has them about 48% down/);
    expect(r.eyeLevel).toBe("above");
    // Behind the table, Ben's outline isn't his height.
    expect(r.areas!.blocking.unmeasured).toEqual(["Ben: partly hidden, size not measured"]);
    expect(r.measured!.find((m) => m.name === "Dee")).toMatchObject({ fit: "fits", heightRatio: 1.38, x: 0.702, plannedX: 0.858 });
  });

  it("someone well away from their place across fails with where they are", () => {
    const far: PictureExpectation = { ...expect1, figures: expect1.figures!.map((f) => f.name === "Dee" ? { ...f, x: 0.3 } : f) };
    const r = judgePicture(far, main, pick({ Dee: num(0.532) }));
    expect(r.problems.join(" ")).toMatch(/Dee is about 70% of the way across the picture; image 1 has them about 30% across/);
  });

  it("passes when outlines match the plan, and says who couldn't be matched", () => {
    const right = numberPeople([{ score: 0.9, x0: 0.25, x1: 0.3, y0: 0.48, y1: 0.66 }, { score: 0.9, x0: 0.36, x1: 0.42, y0: 0.49, y1: 0.67 }]);
    const r = judgePicture(expect1, main, { people: right, aspect: 1.5, reply: JSON.stringify({ people: [{ name: "Ava Stone", box: 1 }, { name: "Cleo", box: 2 }, { name: "Ben", box: 0 }, { name: "Dee", box: 2 }] }) });
    expect(r.pass).toBe(true);
    expect(r.eyeLevel).toBe("on");
    // A number belongs to one person: Dee can't also be outline 2.
    expect(r.areas!.blocking.unmeasured).toEqual(["Ben: not matched to anyone found, not measured", "Dee: not matched to anyone found, not measured"]);
  });

  it("asks the model only which outline is whom", () => {
    const t = marksPrompt(expect1, [{ name: "Dee", look: "orange and cream mini dress" }], 6);
    expect(t).toMatch(/outlined and numbered 1 to 6, left to right/);
    expect(t).toMatch(/- Dee: orange and cream mini dress/);
    expect(t).toMatch(/"box": 1/);
    expect(t).not.toMatch(/head_top|times/);
  });
});
