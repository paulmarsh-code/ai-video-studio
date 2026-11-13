// D85: a named two-shot keeps the pair off the frame's edges. Any scene; made-up names.
import { describe, expect, it } from "vitest";
import { designScene } from "../src/lib/domain/director";
import { pictureXY } from "../src/lib/domain/geometry";
import type { ShotSpec } from "../src/lib/domain/types";

const plan = {
  aspect: "9:16" as const,
  bounds: { minX: -8, maxX: 8, minY: 0, maxY: 16 },
  actors: [{ characterId: "ava", position: { x: -2.5, y: 8 } }, { characterId: "bo", position: { x: 2.5, y: 8 } }],
  furniture: [],
  cameras: [],
  views: [{ name: "wall", directionDeg: 90 }],
};
const spec = { code: "P1", visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], audioMode: "off", durationSec: 4, venueName: "park" } as unknown as ShotSpec;

describe("A pair five metres apart in a named two-shot (D85)", () => {
  it("has both of them well inside the frame, not at its edges", () => {
    const d = designScene(plan as never, [{ id: "s1", code: "P1", spec, description: "Two-shot: Ava and Bo talk across the yard." }], (id) => id, "neutral");
    const cam = d.shots[0].options[0].camera;
    expect(cam.name).toMatch(/Two-shot/);
    for (const a of plan.actors) {
      const x = pictureXY({ ...plan, cameras: [cam] } as never, cam, a.position, 1.0)!.x;
      expect(x).toBeGreaterThan(0.12);
      expect(x).toBeLessThan(0.88);
    }
  });
});

import { blockingFromWords } from "../src/lib/domain/panelWords";
import { applyDesign } from "../src/lib/domain/director";

// D95: the scene's fixed cameras, measured from the table, and people who stay put at it.
describe("A scene's fixed cameras (D95)", () => {
  const table = { id: "t", name: "cocktail table", position: { x: 0.5, y: 10.7 }, radiusM: 0.35, heightM: 1.1 };
  const base = { aspect: "9:16" as const, bounds: { minX: -9, maxX: 9, minY: 0, maxY: 22 }, views: [], cameras: [], furniture: [table],
    actors: [{ characterId: "ava", position: { x: 1.5, y: 10.7 } }, { characterId: "bo", position: { x: -0.5, y: 10.7 } }, { characterId: "cy", position: { x: 0.3, y: 11.6 } }] };
  const people = [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }, { id: "cy", name: "Cy" }];
  it("'at the table' again doesn't walk someone round it", () => {
    const out = blockingFromWords(base as never, [
      { action: "Bo listens.", visibleIds: ["ava", "bo"], places: { bo: "at the cocktail table" } },
      { action: "Bo shrugs.", visibleIds: ["ava", "bo"], places: { bo: "at the cocktail table" } },
    ], people);
    expect(out[0].bo).toBeUndefined();
    expect(out[1].bo).toBeUndefined();
  });
  it("lines between the same two people reuse the same over-the-shoulder cameras, all on one side", () => {
    const all = ["ava", "bo", "cy"];
    const S = (i: number, o: object) => ({ id: `s${i}`, code: `P${i}`, description: "", spec: { code: `P${i}`, venueName: "v", sceneContext: "", presentIds: all, visibleIds: all, excludedIds: [], durationSec: 4, audioMode: "on", ...o } as never });
    const shots = [S(0, {}), S(1, { speakerId: "ava", dialogue: "Well?", visibleIds: ["ava", "bo"] }), S(2, { speakerId: "bo", dialogue: "Luck.", visibleIds: ["bo", "ava"] }), S(3, { speakerId: "ava", dialogue: "Really?", visibleIds: ["ava", "bo"] }), S(4, { speakerId: "bo", dialogue: "Really.", visibleIds: ["bo", "ava"] })];
    const d = designScene(base as never, shots, (id) => id);
    const { assign } = applyDesign(base as never, d.shots.map((x) => ({ shotId: x.shotId, shotCode: x.shotCode, option: x.options[0] })), d.lineOfAction);
    expect(assign.s1).toBe(assign.s3);
    expect(assign.s2).toBe(assign.s4);
    expect(new Set(Object.values(assign)).size).toBe(3);
    expect(d.shots[1].options[0].reasons.join(" ")).toMatch(/fixed cameras, measured from the cocktail table/);
  });
});
