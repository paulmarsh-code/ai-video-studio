// Up and down (D25): high and low cameras from the panel's words, for any scene.
import { describe, expect, it } from "vitest";
import { verticalFor, verticalText } from "../src/lib/domain/vertical";
import { presetText } from "../src/lib/domain/geometry";
import { layoutSketchSvg } from "../src/lib/domain/layoutSketch";
import { addMovementMarks, defaultPlan, shotSpecFor } from "../src/lib/domain/story";
import { designScene } from "../src/lib/domain/director";

describe("Up and down (D25)", () => {
  it.each([
    ["She stands on the edge of the cliff, looking down", "high"],
    ["He peers over the edge of the roof", "high"],
    ["She looks down at the street below", "high"],
    ["He looks into the hole", "overhead"],
    ["She peers down into the well", "overhead"],
    ["He looks up at the window", "low"],
    ["She gazes up towards the sky", "low"],
    ["The giant towers over him", "low"],
    ["He stares up at the balcony above", "low"],
    ["She smiles at Ben", undefined],
    ["He sits down at the table", undefined],
  ])("%s", (text, kind) => { expect(verticalFor(text)?.kind).toBe(kind); });
  it("prompts say the angle instead of eye level", () => {
    const cam = { id: "c", name: "c", preset: "two-shot" as const, position: { x: 0, y: 0 }, lookAt: { x: 0, y: 5 } };
    expect(presetText(cam)).toBe("Two-shot at eye level, static camera.");
    expect(presetText({ ...cam, heightM: 2.8, tiltDeg: -35 })).toContain("high angle from about 2.8 m up, tilted down about 35°");
    expect(presetText({ ...cam, preset: "wide", heightM: 0.6, tiltDeg: 25 })).toContain("low angle from about 0.6 m off the ground, tilted up about 25°");
    expect(verticalText({ heightM: 4, tiltDeg: -80 })).toContain("looking almost straight down");
  });
  it("the camera chooser gives a looking-down moment a high camera, and the sketch shows it", () => {
    const cast = ["mia", "tom"];
    const panels = [
      { action: "Mia and Tom reach the cliff top.", inFrame: cast, line: "", emotion: "calm", seconds: 3 },
      { action: "Mia stands at the edge of the cliff, looking down at the sea below.", inFrame: ["mia"], line: "", emotion: "afraid", seconds: 3 },
      { action: "Tom looks up at the gulls overhead.", inFrame: ["tom"], line: "", emotion: "calm", seconds: 3 },
    ];
    const staging = { spot: "standing on a cliff top", props: [], crowd: "", crowdLevel: "none" as const };
    const base = defaultPlan(cast, panels as never, [{ name: "sea", directionDeg: 90 }], staging, "16:9");
    const { plan } = addMovementMarks(base, panels.map((p) => ({ action: p.action, subjectId: p.inFrame[0] })));
    const shots = panels.map((p, i) => ({ id: `s${i}`, code: `P${i + 1}`, description: p.action, spec: { ...shotSpecFor(p as never, { code: `P${i + 1}`, venueName: "cliff", castIds: cast, staging }), subjectId: p.inFrame[0] } }));
    const d = designScene(plan, shots, (id) => id);
    expect(d.shots[0].options[0].camera.tiltDeg ?? 0).toBe(0);
    expect(d.shots[1].options[0].camera.tiltDeg).toBeLessThan(0);
    expect(d.shots[1].options[0].camera.heightM).toBeGreaterThan(2);
    expect(d.shots[2].options[0].camera.tiltDeg).toBeGreaterThan(0);
    const svg = layoutSketchSvg({ plan: { ...plan, cameras: [d.shots[1].options[0].camera] }, camera: d.shots[1].options[0].camera, people: [{ id: "mia", name: "Mia" }], size: "landscape" });
    expect(svg).toContain("m up,");
  });
});
