// D54: any scene, made-up names. Eye contact is judged on a close crop of each face, not on the
// whole picture, where the model took facing the camera for looking into the lens.
import { describe, expect, it } from "vitest";
import { headCrop, numberPeople } from "../src/lib/domain/peopleDetect";
import { checkPrompt, gazePrompt, judgePicture, matchPeople, type PictureExpectation } from "../src/lib/domain/pictureCheck";

const e: PictureExpectation = {
  order: ["Ava Stone", "Ben", "Cleo"], props: [], crowd: "busy",
  figures: [
    { name: "Ava Stone", x: 0.2, headY: 0.48, feetY: 0.66, standing: true },
    { name: "Ben", x: 0.35, headY: 0.48, feetY: 0.66, standing: true },
    { name: "Cleo", x: 0.5, headY: 0.48, feetY: 0.66, standing: true },
  ],
};
const main = (extra: Record<string, unknown> = {}) => JSON.stringify({ left_to_right: ["Ava Stone", "Ben", "Cleo"], props_seen: [], background_people: "busy", ...extra });

describe("Eye contact on a close crop of each face (D54)", () => {
  it("crops round the head and shoulders, and not at all when the face would be too small to see", () => {
    const near = { x0: 0.1, y0: 0.45, x1: 0.2, y1: 0.75, score: 0.9 };
    expect(headCrop(near, 1024, 1536)).toEqual({ left: 85, top: 684, size: 138 });
    expect(headCrop({ ...near, x1: 0.13, y1: 0.5 }, 1024, 1536)).toBeUndefined();
  });

  it("only eyes into the lens fail; facing the camera while looking elsewhere passes; unclear and too-small faces are said", () => {
    const r = judgePicture({ ...e, gazeByFace: true }, main(), undefined, {
      reply: JSON.stringify({ people: [{ name: "Ava Stone", eyes: "elsewhere" }, { name: "Ben", eyes: "can't tell" }] }),
      asked: ["Ava Stone", "Ben"], tooSmall: ["Cleo"],
    });
    expect(r.problems).toEqual([]);
    expect(r.areas!.blocking.unmeasured).toEqual(["Ben: eyes not clear, eye contact not judged", "Cleo: face too small to see where they look"]);
    const s = judgePicture({ ...e, gazeByFace: true }, main({ looking_at_camera: ["Ava Stone", "Ben"] }), undefined, {
      reply: JSON.stringify({ people: [{ name: "Ava Stone", eyes: "elsewhere" }, { name: "Ben", eyes: "into the lens" }] }), asked: ["Ava Stone", "Ben"], tooSmall: [],
    });
    // The whole-picture answer is ignored once the faces have been looked at.
    expect(s.problems).toEqual(["Ben is looking at the camera; they should look at each other as the moment says."]);
  });

  it("the main check doesn't ask about eye contact when the faces are asked separately, and says so if that didn't happen", () => {
    expect(checkPrompt({ ...e, gazeByFace: true }, [])).not.toMatch(/looking_at_camera/);
    expect(checkPrompt(e, [])).toMatch(/facing the camera while looking at someone else does not count/);
    expect(judgePicture({ ...e, gazeByFace: true }, main()).areas!.blocking.unmeasured).toEqual(["eye contact: not judged"]);
  });

  it("asks about each face by name, in order, and matches outlines one per person", () => {
    expect(gazePrompt([{ name: "Ava Stone", look: "navy suit" }, { name: "Ben", look: "" }])).toMatch(/image 1 should be Ava Stone: navy suit\n- image 2 should be Ben\n/);
    const people = numberPeople([{ x0: 0.1, y0: 0.4, x1: 0.2, y1: 0.7, score: 0.9 }, { x0: 0.3, y0: 0.4, x1: 0.4, y1: 0.7, score: 0.9 }]);
    const m = matchPeople(e, { people, aspect: 1.5, reply: JSON.stringify({ people: [{ name: "Ava Stone", box: 1 }, { name: "Ben", box: 1 }, { name: "Cleo", box: 2 }] }) });
    expect(m.map((x) => [x.name, x.box.n])).toEqual([["Ava Stone", 1], ["Cleo", 2]]);
  });
});

describe("The face close-ups also confirm who was matched (D54)", () => {
  it("someone the close-up shows is not them isn't measured, and isn't judged for eye contact", () => {
    const people = numberPeople([{ x0: 0.15, y0: 0.48, x1: 0.25, y1: 0.66, score: 0.9 }, { x0: 0.3, y0: 0.2, x1: 0.4, y1: 0.9, score: 0.9 }]);
    const r = judgePicture({ ...e, gazeByFace: true }, main(), { people, aspect: 1.5, reply: JSON.stringify({ people: [{ name: "Ava Stone", box: 1 }, { name: "Ben", box: 2 }] }) }, {
      reply: JSON.stringify({ people: [{ name: "Ava Stone", is_them: "yes", eyes: "elsewhere" }, { name: "Ben", is_them: "no", eyes: "into the lens" }] }), asked: ["Ava Stone", "Ben"], tooSmall: [],
    });
    // Outline 2 is far too tall for Ben, and looks into the lens, but it isn't Ben: neither is said.
    expect(r.problems.join(" ")).not.toMatch(/Ben/);
    expect(r.areas!.blocking.unmeasured).toContain("Ben: the outline picked was someone else, not measured");
    expect(r.measured!.map((m) => m.name)).toEqual(["Ava Stone"]);
  });
});
