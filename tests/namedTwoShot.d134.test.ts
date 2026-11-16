// D134: a two-shot named in a group panel is of the two it names. "Two-shot of Jade and Chase:
// Jade holds the contract out to Chase" got the group's fixed wide, Marcus and Nina between them.
// Any scene; made-up names.
import { describe, expect, it } from "vitest";
import { designScene, namedPair } from "../src/lib/domain/director";
import { planForShot, readCamera } from "../src/lib/domain/geometry";

const table = { id: "t", name: "cocktail table", position: { x: 0.5, y: 10.7 }, radiusM: 0.35, heightM: 1.1 };
const base = {
  aspect: "9:16" as const, bounds: { minX: -9, maxX: 9, minY: 0, maxY: 22 }, views: [], cameras: [], furniture: [table],
  actors: [
    { characterId: "ava", position: { x: 1.5, y: 10.7 } }, { characterId: "bo", position: { x: -0.5, y: 10.7 } },
    { characterId: "cy", position: { x: 0.1, y: 11.1 } }, { characterId: "di", position: { x: 0.8, y: 11.3 } },
  ],
};
const names: Record<string, string> = { ava: "Ava Stone", bo: "Bo Lind", cy: "Cy Moss", di: "Di Roe" };
const name = (id: string) => names[id] ?? id;
const all = Object.keys(names);
const S = (i: number, description: string, o: object = {}) => ({ id: `s${i}`, code: `P${i}`, description, spec: { code: `P${i}`, venueName: "v", sceneContext: "", presentIds: all, visibleIds: all, excludedIds: [], durationSec: 3, audioMode: "off", ...o } as never });

describe("A two-shot named in a group panel (D134)", () => {
  it("finds the two the words name, in order", () => {
    expect(namedPair("Two-shot of Ava and Bo: Ava hands Bo the letter.", all, name)).toEqual(["ava", "bo"]);
    expect(namedPair("Bo and Ava, side by side.", all, name)).toEqual(["bo", "ava"]);
    expect(namedPair("Ava laughs.", all, name)).toBeUndefined();
  });
  it("frames the two named, not the group's wide", () => {
    const shots = [S(0, "They talk at the table.", { speakerId: "bo", dialogue: "Well?" }), S(1, "Two-shot of Ava and Bo: Ava pulls a letter from her bag and holds it out to Bo.")];
    const d = designScene(base as never, shots, name);
    const o = d.shots.find((x) => x.shotId === "s1")!.options[0];
    expect(o.kind).toBe("Two-shot on Ava Stone and Bo Lind");
    const seen = readCamera(planForShot(base as never, shots[1].spec), o.camera).actors.filter((a) => a.inView).map((a) => a.characterId);
    expect(seen).toEqual(expect.arrayContaining(["ava", "bo"]));
  });
});
