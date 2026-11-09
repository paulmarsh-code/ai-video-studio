// Genre profiles change taste (shot choice, look, movement, pacing) but never continuity.
import { describe, expect, it } from "vitest";
import { composeKlingPrompt } from "../src/lib/domain/composer";
import { applyDesign, designScene } from "../src/lib/domain/director";
import { checkLineOfAction } from "../src/lib/domain/geometry";
import { GENRES, GENRE_PROFILES } from "../src/lib/domain/genre";
import { validateShot } from "../src/lib/domain/validator";
import { CAST } from "../src/lib/demo/paidOnTime";
import { name, PLAN, SCENE } from "./fixtures/scene1";

const presets = (g: (typeof GENRES)[number]) => designScene(PLAN, SCENE, name, g).shots.map((s) => s.options[0]?.camera.preset);
const count = (xs: (string | undefined)[], v: string) => xs.filter((x) => x === v).length;

describe("Genre shapes shot choice", () => {
  it("drama uses at least as many close-ups as comedy; comedy at least as many group/wide shots", () => {
    const drama = presets("drama");
    const comedy = presets("comedy");
    expect(count(drama, "single-cu")).toBeGreaterThanOrEqual(count(comedy, "single-cu"));
    expect(count(comedy, "two-shot") + count(comedy, "wide")).toBeGreaterThanOrEqual(count(drama, "two-shot") + count(drama, "wide"));
    expect(drama.join()).not.toBe(comedy.join());
  });
  it("comedy explains its choice in the reasons", () => {
    const d = designScene(PLAN, SCENE, name, "comedy");
    expect(d.shots.flatMap((s) => s.options[0]?.reasons ?? []).some((r) => r.startsWith("Comedy:"))).toBe(true);
  });
});

describe("Continuity never changes with genre", () => {
  for (const g of GENRES) {
    it(`${g}: every shot gets a camera that passes the geometry checks and the 180-degree rule`, () => {
      const d = designScene(PLAN, SCENE, name, g);
      for (const s of d.shots) expect(s.options.length, `${g} ${s.shotCode}`).toBeGreaterThan(0);
      const { plan, assign } = applyDesign(PLAN, d.shots.map((s) => ({ shotId: s.shotId, shotCode: s.shotCode, option: s.options[0] })), d.lineOfAction);
      expect(checkLineOfAction(plan, CAST)).toEqual([]);
      for (const sh of SCENE) {
        const bad = validateShot({ ...sh.spec, cameraId: assign[sh.id] }, CAST, plan).filter((f) => ["VISIBLE_OUT_OF_VIEW", "SUBJECT_HIDDEN", "FACE_HIDDEN", "CROSSES_LINE_OF_ACTION"].includes(f.code));
        expect(bad, `${g} ${sh.code}`).toEqual([]);
      }
    });
  }
});

describe("Genre in the prompt", () => {
  const d = designScene(PLAN, SCENE, name, "drama");
  const { plan, assign } = applyDesign(PLAN, d.shots.map((s) => ({ shotId: s.shotId, shotCode: s.shotCode, option: s.options[0] })), d.lineOfAction);
  const c2a = SCENE.find((s) => s.code === "C2a")!;
  it("adds the genre look and replaces 'static camera' with the genre movement (no contradiction)", () => {
    const t = composeKlingPrompt({ ...c2a.spec, cameraId: assign[c2a.id] }, CAST, plan, undefined, "drama").text;
    expect(t).toContain(`Look: ${GENRE_PROFILES.drama.look}.`);
    expect(t).toContain("slow, subtle push-in");
    expect(t).not.toContain("static camera");
  });
  it("neutral genre adds no look line", () => {
    const t = composeKlingPrompt({ ...c2a.spec, cameraId: assign[c2a.id] }, CAST, plan).text;
    expect(t).not.toContain("Look:");
    expect(t).toContain("static camera");
  });
});
