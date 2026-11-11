// D49: any scene, made-up names. The check measures each main person's size, place across and
// eye level against the plan, and judges blocking, the characters' look and the room and props
// separately; a wrong composition is redrawn, not edited. The request is built once, full or
// short, from the same values, with the contradictions taken out and scanned for before sending.
import { describe, expect, it } from "vitest";
import { judgePicture, type PictureExpectation } from "../src/lib/domain/pictureCheck";
import { pictureXY } from "../src/lib/domain/geometry";
import { panelPrompt, requestConflicts, sceneDescription } from "../src/lib/domain/imagePrompts";
import { withoutMove } from "../src/lib/domain/shotLanguage";
import type { GeometryPlanData, PlanCamera, ShotSpec } from "../src/lib/domain/types";

const expect0: PictureExpectation = {
  order: ["Ava", "Ben", "Cleo"], props: [], crowd: "busy", overlay: true,
  figures: [
    { name: "Ava", x: 0.25, headY: 0.49, feetY: 0.66, standing: true },
    { name: "Ben", x: 0.4, headY: 0.49, feetY: 0.66, standing: true },
    { name: "Cleo", x: 0.85, headY: 0.46, feetY: 1.08, standing: true },
  ],
};
const reply = (plan_fit: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ left_to_right: ["Ava", "Ben", "Cleo"], props_seen: [], background_people: "busy", plan_fit, heads: "on the line", ...extra });

describe("The check compares the picture with the plan drawn over it (D49, D51)", () => {
  it("fails a picture whose far group is far taller than their boxes and whose camera tilted down, and says to redraw", () => {
    const r = judgePicture(expect0, reply([
      { name: "Ava", fit: "bigger", times: 2.2 },
      { name: "Ben", fit: "hidden" },
      { name: "Cleo", fit: "smaller", times: 0.8 },
    ], { heads: "well above the line" }));
    expect(r.pass).toBe(false);
    expect(r.redraw).toBe(true);
    expect(r.areas!.blocking.pass).toBe(false);
    expect(r.areas!.look.pass).toBe(true);
    expect(r.problems.join(" ")).toMatch(/Ava is drawn about 2\.2 times taller than planned/);
    expect(r.problems.join(" ")).toMatch(/Cleo is drawn clearly shorter than planned: the camera has moved back to show the whole body/);
    expect(r.problems.join(" ")).toMatch(/Heads are well above the planned eye level/);
    expect(r.eyeLevel).toBe("above");
    // What couldn't be seen is said, not passed.
    expect(r.areas!.blocking.unmeasured).toEqual(["Ben: hidden, size not judged"]);
  });

  it("passes a picture whose people fit their boxes", () => {
    const r = judgePicture(expect0, reply([{ name: "Ava", fit: "fits", times: 1.1 }, { name: "Ben", fit: "fits", times: 1 }, { name: "Cleo", fit: "fits" }]));
    expect(r).toMatchObject({ pass: true, problems: [], eyeLevel: "on" });
    expect(r.redraw).toBeUndefined();
    expect(r.measured?.find((m) => m.name === "Ava")).toEqual({ name: "Ava", fit: "fits", heightRatio: 1.1 });
  });

  it("someone away from their box fails blocking, even when the right size", () => {
    const r = judgePicture(expect0, reply([{ name: "Ava", fit: "elsewhere" }, { name: "Ben", fit: "fits" }, { name: "Cleo", fit: "fits" }]));
    expect(r.problems.join(" ")).toMatch(/Ava isn't where image 1 puts them/);
  });

  it("keeps the areas apart: look problems don't touch blocking, and an unjudged person isn't a pass", () => {
    const r = judgePicture(expect0, reply([], { clothes: [{ name: "Ben", matches_reference: false, difference: "jacket is blue" }], heads: "" }));
    expect(r.areas!.look.pass).toBe(false);
    expect(r.areas!.blocking.pass).toBe(true);
    expect(r.redraw).toBeUndefined();
    expect(r.areas!.blocking.unmeasured).toEqual(["Ava: not judged", "Ben: not judged", "Cleo: not judged", "eye level: not judged"]);
  });
});

const plan: GeometryPlanData = {
  aspect: "9:16",
  bounds: { minX: -9, maxX: 9, minY: 0, maxY: 22 },
  actors: [{ characterId: "ava", position: { x: -1, y: 11 } }, { characterId: "ben", position: { x: 1, y: 11 } }, { characterId: "cleo", position: { x: 4, y: 8 }, to: { x: 1.5, y: 10 } } as never],
  furniture: [{ id: "t", name: "cocktail table", position: { x: 0, y: 11 }, radiusM: 0.4, imageAssetId: "tbl" }, { id: "b", name: "ACME logo backdrop", detail: "white banner, cyan lettering", position: { x: 0, y: 14 }, radiusM: 1.5, heightM: 2.5, imageAssetId: "logo" }],
  cameras: [{ id: "c", name: "Wide", preset: "wide", position: { x: 5.5, y: 5.5 }, lookAt: { x: 0, y: 11 }, fovDeg: 70, size: "fs" }],
  views: [{ name: "bar", directionDeg: 180 }, { name: "screen", directionDeg: 90 }],
};

describe("The projection the check measures against (D49)", () => {
  it("puts the point the camera looks at, at eye height, in the middle of the picture", () => {
    const cam = plan.cameras[0] as PlanCamera;
    const p = pictureXY(plan, cam, cam.lookAt, 1.6)!;
    expect(p.x).toBeCloseTo(0.5, 2);
    expect(p.y).toBeCloseTo(0.5, 2);
    const feet = pictureXY(plan, cam, cam.lookAt, 0)!;
    expect(feet.y).toBeGreaterThan(0.5);
    expect(pictureXY(plan, cam, { x: 9, y: 2 }, 0)).toBeUndefined(); // behind the camera
  });
});

describe("One request, full or short, without contradictions (D49, B3)", () => {
  it("a description keeps its look but not its own bag hand or instructions written for reference sheets", () => {
    const d = sceneDescription("Bob haircut. Preserve the proportions of the approved front reference image. Carries a tan satchel with a brass clasp in her left hand. Consistent across front, rear and facial reference views.");
    expect(d).toBe("Bob haircut. Carries a tan satchel with a brass clasp.");
  });

  it("a still has no camera move", () => {
    expect(withoutMove("full shot, tracking shot")).toBe("full shot");
    expect(withoutMove("medium shot, slow push-in")).toBe("medium shot");
  });

  it("finds contradictions before sending", () => {
    expect(requestConflicts("Jade: carries a satchel in her left hand.\nCarried: Jade's satchel is in her right hand.")).toEqual(["Jade's satchel is said to be in both hands."]);
    expect(requestConflicts("Mind the mirror (D31).")).toEqual(["An internal decision number is in the request."]);
    expect(requestConflicts("Key props: logo backdrop.\nNo text, no logos.")).toEqual(['It asks for a logo and also says "no logos".']);
    expect(requestConflicts("Framing: full shot: the whole body head to toe.\nJade from the head down past the bottom edge.")).toEqual(['It says "head to toe" but the frame cuts the feet.']);
    expect(requestConflicts("Lighting, identical in every picture: warm.\nLook: natural, even lighting.")).toEqual(["It gives two different lighting looks."]);
    expect(requestConflicts("Moment: she arrives at the party.\nMoment: she arrives at the party.")).toHaveLength(1);
  });

  it("builds the short request from the same values, shorter and with nothing contradictory", () => {
    const spec = { code: "P1", visibleIds: ["ava", "ben", "cleo"], excludedIds: [], presentIds: ["ava", "ben", "cleo"], subjectId: "cleo", cameraId: "c", shot: "full shot, tracking shot", audioMode: "off", durationSec: 4, emotion: "hopeful", sceneContext: "A launch.", venueName: "hall", actions: "Cleo walks in.", crowd: "about 40 guests in suits. Some take photos.", spot: "around the cocktail table" } as unknown as ShotSpec;
    const cast = [{ id: "ava", name: "Ava" }, { id: "ben", name: "Ben" }, { id: "cleo", name: "Cleo" }].map((c) => ({ ...c, pronoun: "she" as const, voiceLock: "", description: "" }));
    const profiles = { cleo: { appearance: "Bob haircut. Preserve the approved front reference image.", wardrobe: "orange dress; carries a tan satchel in her left hand", anchors: [], refs: { front: "cf", back: "cb" } }, ava: { appearance: "Tall.", wardrobe: "navy suit", anchors: ["navy suit"], refs: { front: "af" } }, ben: { appearance: "Short.", wardrobe: "green bomber", anchors: [], refs: { front: "bf" } } };
    const p = panelPrompt({ description: "Cleo walks in.", emotion: "hopeful", shot: spec, cast: cast as never, profiles: profiles as never, plan, venueName: "hall", venueDescription: "Warm festoon lights hang across the hall.", blockingHref: "/api/blocking/x" });
    expect(p.short).toBeDefined();
    expect(p.short!.length).toBeLessThan(p.text.length * 0.7);
    for (const t of [p.text, p.short!]) {
      expect(requestConflicts(t)).toEqual([]);
      expect(t).not.toMatch(/tracking/);
      expect(t).not.toMatch(/reference image\./);
    }
    // The facts the shot needs are all in the short one.
    expect(p.short).toMatch(/Image 1 is this exact shot/);
    expect(p.short).toMatch(/Exactly 3 main characters, left to right/);
    expect(p.short).toMatch(/Cleo walks .* along the orange arrow/);
    expect(p.short).toMatch(/the cocktail table \(exactly as in its picture/);
    expect(p.short).toMatch(/the ACME logo backdrop \(exactly as in its picture, about \d+% of the picture's height\)/);
    expect(p.short).toMatch(/Light, the same in every picture of this scene: Warm festoon lights/);
    expect(p.short).toMatch(/the only lettering and logo are on the ACME logo backdrop/);
    // The prop's words lose to its picture in both.
    expect(p.text).not.toMatch(/cyan lettering/);
    // Without a blocking frame there is no short one.
    expect(panelPrompt({ description: "Cleo walks in.", shot: spec, cast: cast as never, profiles: profiles as never, plan, venueName: "hall" }).short).toBeUndefined();
  });
});

describe("The plan drawn over the picture (D51)", () => {
  it("image 2 is the picture with the plan's boxes and eye level, and the approved shot moves to image 3", async () => {
    const { checkPrompt } = await import("../src/lib/domain/pictureCheck");
    const t = checkPrompt({ ...expect0, blocking: true }, []);
    expect(t).toMatch(/Image 2 is the same picture with the plan drawn over it/);
    expect(t).toMatch(/Image 3 is the approved shot/);
    expect(t).toMatch(/Compare each main character with their dashed box in image 2/);
    expect(t).toMatch(/"plan_fit"/);
    const t0 = checkPrompt({ ...expect0, overlay: false, blocking: true }, []);
    expect(t0).toMatch(/Image 2 is the approved shot/);
    expect(t0).not.toMatch(/plan_fit/);
  });
});
