// Shot designer: proposals follow the rules library on the Paid On Time Scene 1 storyboard.
import { describe, expect, it } from "vitest";
import { applyDesign, classifyMoment, designScene, groupMultiShot } from "../src/lib/domain/director";
import { checkLineOfAction, occlusions, readCamera } from "../src/lib/domain/geometry";
import { validateShot } from "../src/lib/domain/validator";
import { CAST } from "../src/lib/demo/paidOnTime";
import { name, PLAN, SCENE } from "./fixtures/scene1";

describe("Moment classification", () => {
  it("recognises arrival, dialogue, reaction, emotional peak and exit", () => {
    expect(SCENE.map((s, i) => classifyMoment(s, i))).toEqual(["establishing", "dialogue", "dialogue", "reaction", "peak", "dialogue", "exit"]);
  });
});

describe("Shot designer on Scene 1", () => {
  const d = designScene(PLAN, SCENE, name);
  it("finds at least one camera for every shot", () => {
    for (const s of d.shots) expect(s.options.length, s.shotCode).toBeGreaterThan(0);
  });
  it("uses the expected camera types: wide to establish, OTS for dialogue, close-up for the peak", () => {
    const top = Object.fromEntries(d.shots.map((s) => [s.shotCode, s.options[0].camera.preset]));
    expect(top.C1).toBe("wide");
    expect(top.C2a).toBe("main-ots");
    expect(top.C2b).toBe("main-ots");
    expect(top.C4a).toBe("single-cu");
  });
  it("every chosen camera passes the validator's geometry checks and the 180-degree rule", () => {
    const choices = d.shots.map((s) => ({ shotId: s.shotId, shotCode: s.shotCode, option: s.options[0] }));
    const { plan, assign } = applyDesign(PLAN, choices, d.lineOfAction);
    expect(checkLineOfAction(plan, CAST)).toEqual([]);
    for (const sh of SCENE) {
      const spec = { ...sh.spec, cameraId: assign[sh.id] };
      const bad = validateShot(spec, CAST, plan).filter((f) => ["VISIBLE_OUT_OF_VIEW", "SUBJECT_HIDDEN", "FACE_HIDDEN", "CROSSES_LINE_OF_ACTION"].includes(f.code));
      expect(bad, sh.code).toEqual([]);
    }
  });
  it("Chase and Jade keep their sides of the screen across the dialogue (R-SCREEN)", () => {
    const sides = new Map<string, Set<number>>();
    for (const s of d.shots) {
      const sh = SCENE.find((x) => x.id === s.shotId)!;
      const r = readCamera(PLAN, s.options[0].camera);
      for (const a of r.actors) {
        if (!a.inView || a.foreground || !sh.spec.visibleIds.includes(a.characterId) || a.frame === "centre") continue;
        if (!sides.has(a.characterId)) sides.set(a.characterId, new Set());
        sides.get(a.characterId)!.add(a.frame === "frame-left" ? -1 : 1);
      }
    }
    expect(sides.get("jade")?.size ?? 1).toBe(1);
    expect(sides.get("chase")?.size ?? 1).toBe(1);
  });
  it("the two Chase lines share one reverse camera", () => {
    const choices = d.shots.map((s) => ({ shotId: s.shotId, shotCode: s.shotCode, option: s.options[0] }));
    const { assign } = applyDesign(PLAN, choices, d.lineOfAction);
    expect(assign.C2b).toBe(assign.C4b);
  });
  it("no proposed shot hides the subject's face", () => {
    for (const s of d.shots) {
      const sh = SCENE.find((x) => x.id === s.shotId)!;
      const r = readCamera(PLAN, s.options[0].camera);
      const subj = sh.spec.subjectId ?? sh.spec.speakerId ?? sh.spec.visibleIds[0];
      expect(occlusions(r, sh.spec.visibleIds).filter((o) => o.characterId === subj && o.level === "face"), s.shotCode).toEqual([]);
    }
  });
});

describe("Multi-shot grouping (R-MULTISHOT)", () => {
  it("joins Chase's line with the silent reaction, never two speakers", () => {
    const g = groupMultiShot(SCENE);
    expect(g.map((x) => x.shotCodes)).toContainEqual(["C2b", "C3"]);
    for (const grp of g) {
      const speakers = new Set(grp.shotIds.map((id) => SCENE.find((s) => s.id === id)!.spec.speakerId).filter(Boolean));
      expect(speakers.size).toBeLessThanOrEqual(1);
      expect(grp.durationSec).toBeLessThanOrEqual(15);
    }
  });
});
