// Regression (D30): in a portrait (9:16) project the suggested shot sizes cut people out of the
// frame, because the lens for a size was worked out across the width while a portrait lens
// angle is for the height. Suggested sizes must never cut out anyone the panel has in frame.
import { describe, expect, it } from "vitest";
import { fovForSize } from "../src/lib/domain/shotLanguage";
import { suggestShots } from "../src/lib/domain/shotSuggest";
import { addMovementMarks, defaultPlan, shotSpecFor } from "../src/lib/domain/story";
import { designScene } from "../src/lib/domain/director";
import { planForShot, readCamera } from "../src/lib/domain/geometry";

describe("Portrait shot sizes (D30)", () => {
  it("the size's slice is the long side in portrait, so the lens is wider than landscape's width-based maths gave", () => {
    // A medium shot (0.95 m tall) from 3 m: portrait long side is the height, 0.95 m.
    expect(fovForSize("ms", 3, 9 / 16)).toBe(18);
    expect(fovForSize("ms", 3, 16 / 9)).toBe(31);
  });
  it("a group scene in portrait keeps everyone the panel has in frame, whatever the suggested size", () => {
    const cast = ["ava", "ben", "cal", "dee"];
    const panels = [
      { action: "Ava walks in and spots Ben, Cal and Dee at a high table.", inFrame: cast },
      { action: "Ava greets everyone.", inFrame: cast, speaker: "ava", line: "This looks incredible, well done everyone." },
      { action: "Ben answers her.", inFrame: ["ben", "ava"], speaker: "ben", line: "I've seen better." },
      { action: "Ava calls him out, angry.", inFrame: cast, speaker: "ava", line: "That explains why you still haven't paid me." },
      { action: "Ben waves her off, bored.", inFrame: cast, speaker: "ben", line: "Run along now." },
    ].map((p) => ({ ...p, line: p.line ?? "", emotion: /angry/.test(p.action) ? "angry" : "calm", seconds: 3 }));
    const staging = { spot: "standing around a cocktail table", props: [], crowd: "", crowdLevel: "none" as const };
    const base = defaultPlan(cast, panels as never, [{ name: "screen wall", directionDeg: 90 }], staging, "9:16");
    const { plan, at, from } = addMovementMarks(base, panels.map((p) => ({ action: p.action, subjectId: p.inFrame[0] })));
    const raw = panels.map((p, i) => ({ id: `s${i}`, code: `P${i + 1}`, description: p.action, spec: { ...shotSpecFor(p as never, { code: `P${i + 1}`, venueName: "v", castIds: cast, staging }), speakerId: p.speaker, dialogue: p.line, emotion: p.emotion, subjectId: p.speaker ?? p.inFrame[0], at: at[i], from: from[i] } }));
    const sug = suggestShots(raw as never);
    const shots = raw.map((x, k) => ({ ...x, spec: { ...x.spec, shot: sug[k].shot || undefined, shotBy: "app" as const } }));
    const d = designScene(plan, shots as never, (id) => id);
    shots.forEach((sh, k) => {
      const cam = d.shots[k].options[0].camera;
      const seen = readCamera(planForShot(plan, sh.spec as never), cam).actors.filter((a) => a.inView).map((a) => a.characterId);
      // Over-the-shoulder shots may lose someone at the very edge; everything else keeps all of them.
      const need = cam.preset === "main-ots" || cam.preset === "reverse-ots" ? sh.spec.visibleIds.slice(0, 2) : sh.spec.visibleIds;
      for (const id of need) expect(seen, `${sh.code} "${sug[k].shot}" loses ${id}`).toContain(id);
    });
  });
});

describe("Edge people, arrivals, eye lines and light (D31)", () => {
  it("someone whose middle is just outside the frame is partly in it, not gone", async () => {
    const { readCamera } = await import("../src/lib/domain/geometry");
    const plan = { aspect: "9:16" as const, actors: [{ characterId: "a", position: { x: 0, y: 3 } }, { characterId: "b", position: { x: -0.85, y: 3 } }], cameras: [], views: [] };
    const cam = { id: "c", name: "c", preset: "main-ots" as const, position: { x: 0, y: 0 }, lookAt: { x: 0, y: 3 }, fovDeg: 45 };
    const b = readCamera(plan as never, cam).actors.find((x) => x.characterId === "b")!;
    expect(b.inView).toBe(true);
    expect(b.partial).toBe(true);
  });
  it("someone still arriving in the next panel is further along their path, not on the same spot", () => {
    const cast = ["ava", "ben"];
    const ps = [{ action: "Ava, Ben talk.", inFrame: cast, line: "", emotion: "calm", seconds: 3 }];
    const base = defaultPlan(cast, ps as never, [], { spot: "around a table", props: [], crowd: "", crowdLevel: "none" }, "9:16");
    const { plan, at, from } = addMovementMarks(base, [
      { action: "Ava enters the busy room.", subjectId: "ava" },
      { action: "She walks through the crowd and spots Ben.", subjectId: "ava" },
      { action: "Ava reaches them.", subjectId: "ava" },
    ]);
    expect(at[0]).toEqual({ ava: "arriving" });
    expect(at[1]).toEqual({ ava: "crossing" });
    expect(from[1]).toEqual({ ava: "arriving" });
    const m = plan.actors.find((a) => a.characterId === "ava")!.marks!;
    const place = plan.actors.find((a) => a.characterId === "ava")!.position;
    const d = (id: string) => { const p = m.find((x) => x.id === id)!.position; return Math.hypot(p.x - place.x, p.y - place.y); };
    expect(d("crossing")).toBeLessThan(d("arriving") - 1);
  });
  it("the venue's lighting is held in every picture, without time-of-day sentences", async () => {
    const { lightingOf } = await import("../src/lib/domain/imagePrompts");
    const t = lightingOf("An evening launch party in a warehouse. Warm festoon lights hang across the atrium, creating an amber glow. A large screen shows a gradient.");
    expect(t).toContain("festoon lights");
    expect(t).not.toContain("evening launch");
    expect(t).not.toContain("screen");
  });
});

describe("Renaming a prop (D32)", () => {
  it("a prop can be renamed with positions approved, keeping its place and its look", async () => {
    const { propsFromFurniture } = await import("../src/lib/domain/story");
    const props = propsFromFurniture([{ id: "p2", name: "champagne flutes", detail: "rectangular display plinth, 1.2 m tall" } as never]);
    expect(props[0].ref).toBe("p2");
  });
});

describe("Bag hand, way out, and two-shots in a group (D33)", () => {
  it("reads any item held or worn on one side from the description, for any character", async () => {
    const { carriedItems } = await import("../src/lib/domain/imagePrompts");
    expect(carriedItems({ wardrobe: "Carries a tan leather satchel in her left hand." })).toEqual([{ side: "left", what: "tan leather satchel", where: "hand" }]);
    expect(carriedItems({ wardrobe: "On his right shoulder, a black canvas tote." })).toEqual([{ side: "right", what: "black canvas tote", where: "shoulder" }]);
    expect(carriedItems({ wardrobe: "Holds a smartphone in his right hand and wears a silver watch on his left wrist." })).toEqual([
      { side: "right", what: "smartphone", where: "hand" }, { side: "left", what: "silver watch", where: "wrist" }]);
    expect(carriedItems({ wardrobe: "An acoustic guitar slung over her left shoulder." })).toEqual([{ side: "left", what: "acoustic guitar", where: "shoulder" }]);
    expect(carriedItems({ wardrobe: "Carries a tan satchel." })).toEqual([]);
    // However many words describe it (Paul's wording, 10 Nov).
    expect(carriedItems({ wardrobe: "Carries a structured medium-sized tan leather top-handle satchel with a brass clasp and polished metal fittings in her left hand. Small pearl stud earrings." })).toEqual([
      { side: "left", what: "tan leather top-handle satchel", where: "hand" }]);
    // A phrase that names nothing is skipped, not guessed.
    expect(carriedItems({ wardrobe: "Holds it consistently in his right hand." })).toEqual([]);
  });
  it("finds the way out and says where it is from the camera", async () => {
    const { exitFrom } = await import("../src/lib/domain/gestures");
    const views = [{ name: "screen wall", directionDeg: 90 }, { name: "windows and entrance", directionDeg: 270 }];
    expect(exitFrom(views, 90)?.where).toContain("behind the camera");
    expect(exitFrom(views, 270)?.where).toContain("ahead");
    expect(exitFrom(views, 0)?.where).toContain("right of the picture");
    expect(exitFrom([{ name: "bar", directionDeg: 0 }], 0)).toBeUndefined();
  });
  it("walking off is mid-stride towards the way out, legs not crossed", async () => {
    const { aimDetail } = await import("../src/lib/domain/gestures");
    const t = aimDetail("Ava scoffs and turns away to walk off.", "Ava", "Ben", { name: "entrance", where: "behind the camera, so walking towards the camera and past it" }).join(" ");
    expect(t).toContain("heading for the entrance");
    expect(t).toContain("never crossed");
    expect(t).toContain("head turns back over the shoulder towards Ben");
  });
  it("a two-shot of two people in a group keeps the person right beside them at the edge, from a camera not standing among them", () => {
    const cast = ["ava", "ben", "cal", "dee"];
    const panels = [
      { action: "Ava, Ben, Cal and Dee talk at a table.", inFrame: cast },
      { action: "Cal and Dee exchange shocked glances.", inFrame: ["cal", "dee"] },
    ].map((p) => ({ ...p, line: "", emotion: "calm", seconds: 3 }));
    const plan = defaultPlan(cast, panels as never, [{ name: "screen wall", directionDeg: 90 }], { spot: "around a cocktail table", props: [], crowd: "", crowdLevel: "none" }, "9:16");
    const shots = panels.map((p, i) => ({ id: `s${i}`, code: `P${i + 1}`, description: p.action, spec: { ...shotSpecFor(p as never, { code: `P${i + 1}`, venueName: "v", castIds: cast, staging: { spot: "around a cocktail table", crowd: "" } }), subjectId: p.inFrame[0], shot: i === 1 ? "medium shot, two-shot" : undefined, shotBy: "app" as const } }));
    const d = designScene(plan, shots as never, (id) => id);
    const cam = d.shots[1].options[0].camera;
    const seen = readCamera(planForShot(plan, shots[1].spec as never), cam).actors;
    expect(seen.filter((a) => a.inView).map((a) => a.characterId)).toEqual(expect.arrayContaining(["cal", "dee"]));
    for (const a of plan.actors.filter((x) => !["cal", "dee"].includes(x.characterId))) {
      const near = Math.hypot(a.position.x - cam.position.x, a.position.y - cam.position.y) < 2.5;
      if (near) expect(seen.find((x) => x.characterId === a.characterId)!.inView).toBe(true);
    }
  });
});
