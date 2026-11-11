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
  order: ["Ava", "Ben", "Cleo"], props: [], crowd: "busy",
  figures: [
    { name: "Ava", x: 0.25, headY: 0.49, feetY: 0.66, standing: true },
    { name: "Ben", x: 0.4, headY: 0.49, feetY: 0.66, standing: true },
    { name: "Cleo", x: 0.85, headY: 0.46, feetY: 1.08, standing: true },
  ],
};
const reply = (figures: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ left_to_right: ["Ava", "Ben", "Cleo"], props_seen: [], background_people: "busy", figures, verticals: "upright", ...extra });

describe("The check measures the picture against the plan (D49, B1)", () => {
  it("fails a picture whose far group is drawn far too big and whose camera tilted down, and says to redraw", () => {
    const r = judgePicture(expect0, reply([
      { name: "Ava", box: [0.05, 0.17, 0.27, 0.66], head_y: 0.17, feet_y: 0.66, feet: "visible" },
      { name: "Ben", box: [0.3, 0.2, 0.49, 0.42], head_y: 0.2, feet_y: null, feet: "hidden" },
      { name: "Cleo", box: [0.71, 0.2, 1, 0.94], head_y: 0.2, feet_y: 0.94, feet: "visible" },
    ]));
    expect(r.pass).toBe(false);
    expect(r.redraw).toBe(true);
    expect(r.areas!.blocking.pass).toBe(false);
    expect(r.areas!.look.pass).toBe(true);
    expect(r.problems.join(" ")).toMatch(/Ava is drawn about 2\.9 times too big/);
    expect(r.problems.join(" ")).toMatch(/Cleo's feet should be just out of the picture/);
    expect(r.problems.join(" ")).toMatch(/Heads are higher in the picture than in image 1/);
    // What couldn't be seen is said, not passed.
    expect(r.areas!.blocking.unmeasured).toEqual(["Ben: size not measured (feet hidden)"]);
  });

  it("passes a picture that follows the plan, within measuring error", () => {
    const r = judgePicture(expect0, reply([
      { name: "Ava", box: [0.21, 0.5, 0.29, 0.67], head_y: 0.5, feet_y: 0.67, feet: "visible" },
      { name: "Ben", box: [0.36, 0.48, 0.44, 0.65], head_y: 0.48, feet_y: 0.65, feet: "visible" },
      { name: "Cleo", box: [0.75, 0.47, 0.95, 1], head_y: 0.47, feet_y: null, feet: "below the bottom edge" },
    ]));
    expect(r).toMatchObject({ pass: true, problems: [] });
    expect(r.redraw).toBeUndefined();
    expect(r.measured?.find((m) => m.name === "Ava")?.heightRatio).toBeCloseTo(1, 1);
  });

  it("someone in the wrong part of the picture fails blocking, even when the right size", () => {
    const r = judgePicture(expect0, reply([
      { name: "Ava", box: [0.6, 0.5, 0.68, 0.67], head_y: 0.5, feet_y: 0.67, feet: "visible" },
      { name: "Ben", box: [0.36, 0.48, 0.44, 0.65], head_y: 0.48, feet_y: 0.65, feet: "visible" },
    ]));
    expect(r.problems.join(" ")).toMatch(/Ava is too far right in the picture/);
  });

  it("keeps the areas apart: a good-looking picture with the wrong blocking still fails, and look problems don't touch blocking", () => {
    const r = judgePicture(expect0, reply([], { clothes: [{ name: "Ben", matches_reference: false, difference: "jacket is blue" }] }));
    expect(r.areas!.look.pass).toBe(false);
    expect(r.areas!.blocking.pass).toBe(true);
    expect(r.redraw).toBeUndefined();
    expect(r.areas!.blocking.unmeasured.length).toBeGreaterThan(0);
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
