// D166: the scene's starting positions placed from the user's words.
import { describe, expect, it } from "vitest";
import { applyPlacement, parsePlacement, placePrompt, wallOf } from "../src/lib/domain/placeFromWords";

const plan = {
  aspect: "9:16" as const, bounds: { minX: -9, maxX: 9, minY: 0, maxY: 22 },
  views: [{ name: "bar", directionDeg: 180 }, { name: "screen wall", directionDeg: 90 }],
  actors: [{ characterId: "c", position: { x: 0, y: 10 }, marks: [{ id: "m", label: "arriving", position: { x: 4, y: 12 } }] }, { characterId: "j", position: { x: 1, y: 10 } }],
  furniture: [{ id: "bar", name: "bar counter", position: { x: 0, y: 10 }, radiusM: 1.5 }],
  cameras: [],
};
const input = { plan: plan as never, people: [{ id: "c", name: "Chase" }, { id: "j", name: "Jade" }], words: "Chase leans facing the bar, his back to Jade; Jade hidden behind guests.", story: "Chase brags on the phone." };

describe("Placing from words (D166)", () => {
  it("names each wall by its side of the room", () => {
    expect(wallOf(180, plan.bounds)).toBe("the wall along x = -9");
    expect(wallOf(90, plan.bounds)).toBe("the wall along y = 22");
  });
  it("gives the model the room, the walls, the props, the people and the words", () => {
    const p = placePrompt(input);
    expect(p).toContain("- bar: the wall along x = -9");
    expect(p).toContain("- bar: bar counter at (0.0, 10.0)");
    expect(p).toContain("- j: Jade at (1.0, 10.0)");
    expect(p).toContain("Chase leans facing the bar, his back to Jade");
    expect(p).toContain("A fixed fitting named after a wall");
  });
  it("keeps only known ids, keeps them in the room and turns facing into a direction", () => {
    const r = parsePlacement('Here: {"people":[{"id":"c","x":-8.2,"y":10,"facing":{"x":-9,"y":10}},{"id":"j","x":-5,"y":10.5},{"id":"x","x":0,"y":0}],"props":[{"id":"bar","x":-30,"y":10},{"id":"nope","x":1,"y":1}],"summary":"Chase at the bar"}', input);
    expect(r.people.c).toEqual({ at: { x: -8.2, y: 10 }, facingDeg: 180 });
    expect(r.people.j).toEqual({ at: { x: -5, y: 10.5 } });
    expect(r.people.x).toBeUndefined();
    expect(r.props).toEqual({ bar: { x: -8.7, y: 10 } });
    expect(r.summary).toBe("Chase at the bar");
  });
  it("puts everyone at their new place, without arrival marks, and moves props", () => {
    const out = applyPlacement(plan as never, { people: { c: { at: { x: -8, y: 10 }, facingDeg: 180 } }, props: { bar: { x: -8.7, y: 10 } }, summary: "" });
    expect(out.actors[0]).toEqual({ characterId: "c", position: { x: -8, y: 10 }, facingDeg: 180 });
    expect(out.actors[1]).toEqual(plan.actors[1]);
    expect(out.furniture![0].position).toEqual({ x: -8.7, y: 10 });
  });
  it("a reply it can't read places nobody", () => {
    expect(parsePlacement("sorry", input).people).toEqual({});
  });
});
