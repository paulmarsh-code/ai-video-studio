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
