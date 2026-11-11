// Changing a panel in words (D39): "move Jade closer to Nina and have Marcus walk off to the right".
import { describe, expect, it } from "vitest";
import { changeFromWords } from "../src/lib/domain/changeWords";
import { aimToInclude, horizontalFov, readCamera } from "../src/lib/domain/geometry";
import type { GeometryPlanData, PlanCamera } from "../src/lib/domain/types";

const people = [{ id: "ava", name: "Ava Stone" }, { id: "ben", name: "Ben" }, { id: "cal", name: "Cal" }, { id: "dee", name: "Dee" }];
const plan: GeometryPlanData = {
  aspect: "9:16", bounds: { minX: -5, maxX: 5, minY: 0, maxY: 12 },
  actors: [{ characterId: "ava", position: { x: -1.5, y: 6 } }, { characterId: "ben", position: { x: 1, y: 6.5 } }, { characterId: "cal", position: { x: 0, y: 7 } }, { characterId: "dee", position: { x: 1.8, y: 7 } }],
  furniture: [{ id: "t", name: "cocktail table", position: { x: 0, y: 6.3 }, radiusM: 0.4 }, { id: "sofa", name: "grey sofa", position: { x: -3, y: 9 }, radiusM: 0.9 }],
  cameras: [], views: [{ name: "bar", directionDeg: 180 }, { name: "main entrance", directionDeg: 270 }],
};
const cam: PlanCamera = { id: "c", name: "Wide", preset: "wide", position: { x: 0, y: 1.5 }, lookAt: { x: 0, y: 6.5 }, fovDeg: 60 };
const dist = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);

describe("Changing a panel in words (D39)", () => {
  it("move Ava closer to Dee and have Cal walk off to the right", () => {
    const r = changeFromWords("move Ava closer to Dee and have Cal walk off to the right", plan, cam, people);
    expect(r.unclear).toEqual([]);
    expect(dist(r.entries.ava.at, { x: 1.8, y: 7 })).toBeLessThan(dist({ x: -1.5, y: 6 }, { x: 1.8, y: 7 }) - 1);
    // Right of the picture, for a camera looking along +y, is -x... from the camera's right-hand side.
    const toRight = r.entries.cal.to!;
    expect(toRight.x).toBeGreaterThan(2.5);
    expect(r.entries["pose:cal"].pose).toBe("standing");
    expect(r.understood).toEqual(["Ava: closer to Dee", "Cal: walks off to the right of the picture (this panel only)"]);
    expect(r.entries.cal.only).toBe(true);
  });
  it("left and right, nearer and further are as the picture shows them", () => {
    expect(changeFromWords("move Ben a bit to the left", plan, cam, people).entries.ben.at.x).toBeLessThan(1);
    expect(changeFromWords("move Ben closer to the camera", plan, cam, people).entries.ben.at.y).toBeLessThan(6.5);
    expect(changeFromWords("move Ben further back", plan, cam, people).entries.ben.at.y).toBeGreaterThan(6.5);
  });
  it("swaps, the other side of a prop, turning, postures, places and props", () => {
    const s = changeFromWords("swap Ava and Ben", plan, cam, people);
    expect(s.entries.ava.at).toEqual({ x: 1, y: 6.5 });
    expect(changeFromWords("move Ava to the other side of the table", plan, cam, people).entries.ava.at.x).toBeGreaterThan(1);
    expect(changeFromWords("turn Ben to face Ava", plan, cam, people).entries.ben.facingDeg).toBeDefined();
    expect(changeFromWords("Dee should be sitting", plan, cam, people).entries["pose:dee"].pose).toBe("sitting");
    const sofa = changeFromWords("put Ava on the sofa, sitting", plan, cam, people);
    expect(dist(sofa.entries.ava.at, { x: -3, y: 9 })).toBeLessThan(0.1);
    expect(changeFromWords("take the table away", plan, cam, people).entries["prop:t"]).toMatchObject({ gone: true });
  });
  it("says what it didn't understand", () => {
    const r = changeFromWords("make it more dramatic", plan, cam, people);
    expect(r.unclear).toEqual(["make it more dramatic"]);
  });
});

describe("Two people in one instruction (D39)", () => {
  it("'Cal and Dee walk off to the left' moves both", () => {
    const r = changeFromWords("Cal and Dee walk off to the left", plan, cam, people);
    expect(r.entries.cal.to!.x).toBeLessThan(-1);
    expect(r.entries.dee.to!.x).toBeLessThan(-1);
  });
});

describe("Keeping people in the picture (D42)", () => {
  it("'comes in from the right' starts them well over on the right, inside the frame", () => {
    const r = changeFromWords("Ava comes in from the right", plan, cam, people);
    expect(r.understood).toEqual(["Ava: comes in from the right of the picture"]);
    expect(r.entries.ava.at.x).toBeGreaterThan(0.8);
    expect(r.entries.ava.at.y).toBeCloseTo(6, 1);
  });
  it("a big move to the left stops at the edge of the frame", () => {
    const r = changeFromWords("move Ben a lot to the left", plan, cam, people);
    const depth = r.entries.ben.at.y - 1.5, half = depth * Math.tan((horizontalFov(plan, cam) * Math.PI) / 360);
    expect(r.entries.ben.at.x).toBeGreaterThanOrEqual(-0.81 * half);
  });
  it("a camera turns to take in someone moved out of its view, and stays put when all fit", () => {
    const away = { ...plan, actors: plan.actors.map((a) => (a.characterId === "ava" ? { ...a, position: { x: 4.5, y: 4 } } : a)) };
    const turned = aimToInclude(away, cam, ["ava", "ben"]);
    expect(turned).not.toBe(cam);
    expect(turned.position).toEqual(cam.position);
    expect(readCamera(away, turned).actors.find((a) => a.characterId === "ava")?.inView).toBe(true);
    expect(readCamera(away, turned).actors.find((a) => a.characterId === "ben")?.inView).toBe(true);
    expect(aimToInclude(plan, cam, ["ben", "cal"])).toBe(cam);
  });
});

describe("The camera turns as little as it can (D42)", () => {
  it("someone just out of frame on the right: a small turn right that keeps the others", () => {
    const right = { ...plan, actors: plan.actors.map((a) => (a.characterId === "dee" ? { ...a, position: { x: 3.4, y: 7 } } : a)) };
    const before = readCamera(right, cam).actors.find((a) => a.characterId === "dee");
    expect(before?.inView && !before.partial).toBe(false);
    const turned = aimToInclude(right, cam, ["dee"]);
    const r = readCamera(right, turned).actors;
    expect(r.find((a) => a.characterId === "dee")?.inView).toBe(true);
    expect(r.filter((a) => a.inView).length).toBeGreaterThanOrEqual(3); // the others still in shot
  });
});

describe("Approach and suggestions (D44)", () => {
  it("'approaches the group from the left' is understood", () => {
    const r = changeFromWords("Ava approaches the group from the left", plan, cam, people);
    expect(r.understood).toEqual(["Ava: comes in from the left of the picture"]);
    expect(r.entries.ava.at.x).toBeLessThan(0);
  });
  it("words that change nothing get suggestions with the names used", async () => {
    const { changeSuggestions } = await import("../src/lib/domain/changeWords");
    const r = changeFromWords("the angle ava approaches the group", plan, cam, people);
    expect(r.unclear.length).toBe(1);
    const sug = changeSuggestions(r.unclear, people);
    expect(sug[0]).toBe("Ava comes in from the right");
    for (const x of sug) expect(changeFromWords(x, plan, cam, people).unclear).toEqual([]);
  });
});
