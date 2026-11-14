// D102: cameras close enough for the shot. Someone on the way in is at their place once they've
// arrived; a group seen at an angle lets the camera come closer; a close size in a 9:16 group panel
// frames the subject and the one they're with, and lets the rest be cut by the edges.
import { describe, expect, it } from "vitest";
import { blockingFromWords } from "../src/lib/domain/panelWords";
import { applyDesign, designScene } from "../src/lib/domain/director";
import { planForShot } from "../src/lib/domain/geometry";

const table = { id: "t", name: "cocktail table", position: { x: 0.5, y: 10.7 }, radiusM: 0.35, heightM: 1.1 };
const base = {
  aspect: "9:16" as const, bounds: { minX: -9, maxX: 9, minY: 0, maxY: 22 }, views: [], cameras: [], furniture: [table],
  actors: [
    { characterId: "jade", position: { x: 1.5, y: 10.7 }, marks: [{ id: "crossing", label: "crossing", position: { x: 3.1, y: 8.7 } }] },
    { characterId: "chase", position: { x: -0.5, y: 10.7 } }, { characterId: "marcus", position: { x: -0.1, y: 11.0 } }, { characterId: "nina", position: { x: 0.4, y: 11.3 } },
  ],
};
const people = [{ id: "jade", name: "Jade" }, { id: "chase", name: "Chase" }, { id: "marcus", name: "Marcus" }, { id: "nina", name: "Nina" }];
const all = people.map((p) => p.id);

describe("Cameras close enough for the shot (D102)", () => {
  it("someone crossing the room in one panel is at their place in the next", () => {
    const out = blockingFromWords(base as never, [
      { action: "Jade walks through the crowd.", visibleIds: all, at: { jade: "crossing" } },
      { action: "Jade reaches them.", visibleIds: all },
      { action: "Jade turns to Chase.", visibleIds: ["jade", "chase"] },
    ] as never, people);
    expect(out[2].jade?.at).toEqual({ x: 1.5, y: 10.7 });
  });
  it("a cowboy shot of the group stands close, not 6 m back", () => {
    const S = (i: number, o: object) => ({ id: `s${i}`, code: `P${i}`, description: "", spec: { code: `P${i}`, venueName: "v", sceneContext: "", presentIds: all, visibleIds: all, excludedIds: [], durationSec: 4, audioMode: "on", ...o } as never });
    const shots = [S(0, { shot: "full shot" }), S(1, { speakerId: "jade", dialogue: "Well?", shot: "cowboy shot" }), S(2, { speakerId: "chase", dialogue: "Luck.", visibleIds: ["chase", "jade"] })];
    const d = designScene(base as never, shots, (id) => id);
    const { plan, assign } = applyDesign(base as never, d.shots.map((x) => ({ shotId: x.shotId, shotCode: x.shotCode, option: x.options[0] })), d.lineOfAction);
    const sp = planForShot(plan, shots[1].spec);
    const cam = sp.cameras.find((c) => c.id === assign.s1)!;
    const jade = sp.actors.find((a) => a.characterId === "jade")!.position;
    expect(Math.hypot(cam.position.x - jade.x, cam.position.y - jade.y)).toBeLessThan(4);
  });
});
