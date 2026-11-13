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

import { storyPrompt } from "../src/lib/domain/story";

describe("Silence around the line, and panels that join up (D91)", () => {
  it("a spoken clip forbids mumbling before and after the line", () => {
    const spoken = SCENE.find((s) => s.spec.speakerId)!;
    const t = composeKlingPrompt(spoken.spec, CAST, PLAN).text;
    expect(t).toMatch(/Before and after it nobody speaks, mumbles, murmurs or makes any vocal sound/);
  });
  it("the panel-writing request asks for each panel to end where the next begins", () => {
    const p = storyPrompt({ story: "Ava teaches Bo to skate.", characters: [{ name: "Ava" }, { name: "Bo" }] as never, venue: "skate park", targetSec: 15 });
    expect(p).toMatch(/each panel's action ends where the next panel's picture starts/);
  });
});

import { closerForLines } from "../src/lib/domain/story";

describe("Lines framed on speaker and listener (D93)", () => {
  const chars = [{ id: "jade", name: "Jade" }, { id: "chase", name: "Chase Whitmore" }, { id: "marcus", name: "Marcus" }, { id: "nina", name: "Nina" }] as never;
  const all = ["jade", "chase", "marcus", "nina"];
  const panel = (speakerId: string | undefined, action: string, line = "x") => ({ action, inFrame: all, speakerId, line: speakerId ? line : "", emotion: "", seconds: 4 });
  it("keeps the speaker and the person they answer; keeps anyone whose reaction is described", () => {
    const out = closerForLines([
      panel(undefined, "Jade walks to the table."),
      panel("jade", "Jade asks Chase about the promo."),
      panel("chase", "Chase gives a quick, false correction."),
      panel("chase", "Chase smirks while Marcus and Nina look shocked."),
    ], chars);
    expect(out[0].inFrame).toEqual(all);
    expect(out[1].inFrame).toEqual(["jade", "chase"]);
    expect(out[2].inFrame).toEqual(["jade", "chase"]);
    expect(out[3].inFrame).toEqual(["chase", "marcus", "nina"]);
  });
});
