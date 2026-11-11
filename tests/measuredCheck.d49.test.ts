// D49, D52: any scene, made-up names. The check reads where each main person's head is and
// compares their size with the plan, and judges blocking, the characters' look and the room and props
// separately; a wrong composition is redrawn, not edited. The request is built once, full or
// short, from the same values, with the contradictions taken out and scanned for before sending.
import { describe, expect, it } from "vitest";
import { checkPrompt, judgePicture, lookLine, planPrompt, type PictureExpectation } from "../src/lib/domain/pictureCheck";
import { pictureXY } from "../src/lib/domain/geometry";
import { panelPrompt, requestConflicts, sceneDescription } from "../src/lib/domain/imagePrompts";
import { withoutMove } from "../src/lib/domain/shotLanguage";
import type { GeometryPlanData, PlanCamera, ShotSpec } from "../src/lib/domain/types";

// Panel 1 as Paul's real check saw it (D52): the plan has the group small at the table with heads
// on the eye-level line, and Jade in the foreground cut at the bottom edge.
const expect0: PictureExpectation = {
  order: ["Ava Stone", "Ben", "Cleo", "Dee"], props: [], crowd: "busy",
  figures: [
    { name: "Ava Stone", x: 0.274, headY: 0.488, feetY: 0.655, standing: true },
    { name: "Ben", x: 0.338, headY: 0.488, feetY: 0.66, standing: true },
    { name: "Cleo", x: 0.389, headY: 0.487, feetY: 0.668, standing: true },
    { name: "Dee", x: 0.858, headY: 0.461, feetY: 1.02, standing: true },
  ],
};
const main = JSON.stringify({ left_to_right: ["Ava Stone", "Ben", "Cleo", "Dee"], props_seen: [], background_people: "busy" });
const planOf = (people: unknown[]) => JSON.stringify({ people });

describe("The plan check reads heads and compares sizes with the plan (D49, D51, D52)", () => {
  it("fails the group drawn twice too big and the camera tilted down, but not the foreground person the plan cuts at the bottom", () => {
    const r = judgePicture(expect0, main, planOf([
      { name: "Ava Stone", head_top: 0.2, vs_box: "taller", times: 2.1 },
      { name: "Ben", head_top: null, vs_box: "hidden" },
      { name: "Cleo", head_top: 0.21, vs_box: "taller", times: 2 },
      { name: "Dee", head_top: 0.16, vs_box: "taller", times: 2 },
    ]));
    expect(r.pass).toBe(false);
    expect(r.redraw).toBe(true);
    expect(r.areas!.look.pass).toBe(true);
    const all = r.problems.join(" ");
    expect(all).toMatch(/Ava Stone is drawn about 2\.1 times taller than planned/);
    expect(all).toMatch(/Cleo is drawn about 2\.0 times taller than planned/);
    // Dee runs off the bottom edge in the plan: her size goes with where her head is, which the eye level covers.
    expect(all).not.toMatch(/Dee is drawn/);
    expect(all).toMatch(/The camera is too high or tilted down: heads are about 19% of the way down the picture, but image 1 has them about 48% down/);
    expect(r.eyeLevel).toBe("above");
    expect(r.areas!.blocking.unmeasured).toEqual([expect.stringMatching(/person detector isn't running/), "Ben: hidden, size not judged"]);
    expect(r.measured?.find((m) => m.name === "Ava Stone")).toEqual({ name: "Ava Stone", plannedHeadY: 0.488, headY: 0.2, fit: "bigger", heightRatio: 2.1 });
  });

  it("passes a picture whose heads are where the plan puts them and whose people are about their box's size", () => {
    const r = judgePicture(expect0, main, planOf([
      { name: "Ava Stone", head_top: 0.47, vs_box: "about the same", times: 1 },
      { name: "Ben", head_top: 0.49, vs_box: "about the same" },
      { name: "Cleo", head_top: 0.5, vs_box: "taller", times: 1.3 }, // within the margin
      { name: "Dee", head_top: 0.44, vs_box: "about the same" },
    ]));
    expect(r).toMatchObject({ pass: true, problems: [], eyeLevel: "on" });
    expect(r.redraw).toBeUndefined();
  });

  it("one misread head doesn't decide the eye level", () => {
    const r = judgePicture(expect0, main, planOf([
      { name: "Ava Stone", head_top: 0.48, vs_box: "about the same" },
      { name: "Ben", head_top: 0.49, vs_box: "about the same" },
      { name: "Cleo", head_top: 0.1, vs_box: "about the same" },
    ]));
    expect(r.eyeLevel).toBe("on");
  });

  it("heads well below the plan: the camera is too low or tilted up", () => {
    const r = judgePicture(expect0, main, planOf([{ name: "Ava Stone", head_top: 0.7, vs_box: "about the same" }, { name: "Ben", head_top: 0.72, vs_box: "about the same" }]));
    expect(r.eyeLevel).toBe("below");
    expect(r.problems.join(" ")).toMatch(/too low or tilted up/);
  });

  it("someone away from their place fails blocking; someone the plan cuts who is shown whole fails as pulled back", () => {
    const r = judgePicture(expect0, main, planOf([
      { name: "Ava Stone", head_top: 0.48, vs_box: "away from it" },
      { name: "Dee", head_top: 0.46, vs_box: "shorter", times: 0.6 },
    ]));
    expect(r.problems.join(" ")).toMatch(/Ava Stone isn't where image 1 puts them/);
    expect(r.problems.join(" ")).toMatch(/Dee is drawn about 1\.7 times shorter than planned: the camera has moved back to show the whole body/);
  });

  it("keeps the areas apart, and an unread plan check is never a pass on blocking", () => {
    const look = JSON.stringify({ left_to_right: ["Ava Stone", "Ben", "Cleo", "Dee"], props_seen: [], background_people: "busy", clothes: [{ name: "Ben", matches_reference: false, difference: "jacket is blue" }] });
    const r = judgePicture(expect0, look, "");
    expect(r.areas!.look.pass).toBe(false);
    expect(r.areas!.blocking.pass).toBe(true);
    expect(r.redraw).toBeUndefined();
    expect(r.areas!.blocking.unmeasured).toEqual([expect.stringMatching(/person detector isn't running/), "Ava Stone: size not judged", "Ben: size not judged", "Cleo: size not judged", "Dee: size not judged", "eye level: not judged"]);
    // Without a plan check (no figures sent) nothing is said about it.
    expect(judgePicture(expect0, main).areas!.blocking.unmeasured).toEqual([]);
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

describe("The plan check is its own short request (D52)", () => {
  it("sends the picture and the plan drawn on it, says who is who, and asks for heads as numbers", () => {
    const t = planPrompt(expect0, [{ name: "Ava Stone", look: "navy suit" }, { name: "Dee", look: "orange and cream mini dress" }, { name: "Zed", look: "not in this shot" }]);
    expect(t).toMatch(/Image 2 is the same picture with the plan drawn on it/);
    expect(t).toMatch(/- Ava Stone: navy suit/);
    expect(t).not.toMatch(/Zed/);
    expect(t).toMatch(/The boxes in image 2 are where they should be, not where they are/);
    expect(t).toMatch(/"head_top"/);
    // The main check no longer carries it.
    const c = checkPrompt({ ...expect0, blocking: true }, []);
    expect(c).toMatch(/Image 2 is the approved shot/);
    expect(c).not.toMatch(/plan_fit|head_top|dashed box/);
  });

  it("recognises each person by the part of their clothes that names a colour", () => {
    const l = lookLine("Contemporary, expensive-looking British smart-casual executive style. Beautifully tailored deep midnight-navy two-piece suit with a fitted single-breasted jacket, notch lapels and two buttons, worn open over a crisp white shirt.");
    expect(l.startsWith("Beautifully tailored deep midnight-navy two-piece suit")).toBe(true);
    expect(l.length).toBeLessThanOrEqual(111);
    expect(lookLine("", ["Closely buzzed hair"])).toBe("Closely buzzed hair");
  });
});
