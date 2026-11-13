// D89: in a video clip the people the panel shows stay in it, no stranger takes over, and in an
// action clip the background people move simply. Not for a clip where someone leaves.
import { describe, expect, it } from "vitest";
import { composeKlingPrompt } from "../src/lib/domain/composer";
import { CAST } from "../src/lib/demo/paidOnTime";
import { PLAN, SCENE } from "./fixtures/scene1";

const shot = SCENE.find((s) => s.spec.visibleIds.length >= 2)!;
const make = (actions: string) => composeKlingPrompt({ ...shot.spec, actions, crowd: "a few skaters riding the street section" }, CAST, PLAN).text;

describe("Nobody new takes over a clip (D89)", () => {
  it("the people shown stay to the end, and in an action clip the background moves simply", () => {
    const t = make("She drops in and carves across the bowl.");
    expect(t).toMatch(/stay in the picture to the end of the clip; no one else comes into the foreground or takes their place\./);
    expect(t).toMatch(/Background people stay small, far off and still; nobody else rides/);
    expect(t).toMatch(/they have stopped to watch, standing still/);
  });
  it("no background line without action, and no stay line when someone walks off", () => {
    expect(make("They talk quietly.")).not.toMatch(/far off and still|stopped to watch/);
    expect(make("She walks off towards the door.")).not.toMatch(/to the end of the clip/);
  });
});
