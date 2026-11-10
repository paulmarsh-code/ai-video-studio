// Who looks at whom, from many ways of saying it (D25). Names are made up: the rules are general.
import { describe, expect, it } from "vitest";
import { gazeFor, gazeLine } from "../src/lib/domain/gaze";
import type { ShotSpec } from "../src/lib/domain/types";

const people = [{ id: "a", name: "Ava Stone" }, { id: "b", name: "Ben" }, { id: "c", name: "Cleo" }, { id: "d", name: "Dev" }];
const shot = (o: Partial<ShotSpec> = {}): ShotSpec => ({ code: "P", venueName: "v", sceneContext: "", presentIds: ["a", "b", "c", "d"], visibleIds: ["a", "b", "c", "d"], excludedIds: [], actions: "", durationSec: 3, audioMode: "off", ...o } as ShotSpec);
const g = (text: string, o: Partial<ShotSpec> = {}) => Object.fromEntries(gazeFor({ shot: shot({ subjectId: "a", ...o }), description: text, people, line: ["a", "b"] }).map((x) => [x.id, x.at]));

describe("Who looks at whom: wider wording (D25)", () => {
  it.each([
    ["Ava glares at Dev", "a", "Dev"],
    ["Ava stares coldly at Cleo", "a", "Cleo"],
    ["Ava peers over at Dev", "a", "Dev"],
    ["Ben turns to Cleo", "b", "Cleo"],
    ["Ben smirks at Dev", "b", "Dev"],
    ["Cleo nods to Ben", "c", "Ben"],
    ["Ava rolls her eyes at Ben", "a", "Ben"],
    ["Dev watches Ava", "d", "Ava"],
    ["Ava addresses Cleo directly", "a", "Cleo"],
    ["Ben confronts Dev", "b", "Dev"],
    ["Ava meets Ben's gaze", "a", "Ben"],
    ["Cleo catches Dev's eye", "c", "Dev"],
    ["Ava ignores Ben", "a", "away"],
    ["Ava avoids Ben's eyes", "a", "away"],
    ["Ava looks down at the floor", "a", "down:floor"],
    ["Ava looks up at the window", "a", "up:window"],
    ["Ava looks away", "a", "away"],
  ])("%s", (text, who, at) => { expect(g(text)[who]).toBe(at); });
  it("pairs: exchange a look, look at each other, lock eyes", () => {
    expect(g("Cleo and Dev exchange a nervous look")).toMatchObject({ c: "Dev", d: "Cleo" });
    expect(g("Cleo and Dev look at each other")).toMatchObject({ c: "Dev", d: "Cleo" });
    expect(g("Ava locks eyes with Ben")).toMatchObject({ a: "Ben", b: "Ava" });
  });
  it("she/he carries on from the person before; her/him is the one they're talking with", () => {
    expect(g("Ava steps closer. She glares at him.")).toMatchObject({ a: "Ben" });
    expect(g("Ben shrugs, then he turns to Cleo")).toMatchObject({ b: "Cleo" });
  });
  it("everyone turns to look", () => {
    expect(g("Everyone turns to Ava")).toMatchObject({ b: "Ava", c: "Ava", d: "Ava" });
  });
  it("reads well in the prompt", () => {
    const line = gazeLine([{ id: "a", at: "down:floor" }, { id: "b", at: "away" }, { id: "c", at: "Ava" }], (id) => people.find((p) => p.id === id)!.name);
    expect(line).toContain("Ava Stone looks down at the floor; Ben looks away, avoiding eye contact; Cleo looks at Ava");
  });
});

describe("Over the shoulder, left, right, behind (D25)", () => {
  it.each([
    ["Ava glances back over her shoulder", "a", "shoulder"],
    ["Ava looks back over her shoulder at Dev", "a", "shoulder:Dev"],
    ["Ben looks left", "b", "left"],
    ["Ben looks to his right", "b", "right"],
    ["Cleo turns to look behind her", "c", "behind"],
    ["Dev looks back", "d", "back"],
  ])("%s", (text, who, at) => { expect(g(text)[who]).toBe(at); });
  it("reads well", () => {
    expect(gazeLine([{ id: "a", at: "shoulder:Dev" }, { id: "b", at: "left" }], (id) => people.find((p) => p.id === id)!.name))
      .toContain("Ava Stone looks back over their shoulder at Dev, head turned, body still facing the other way; Ben turns their head to look to their own left");
  });
});

describe("Mirrors and looking through things (D25)", () => {
  it.each([
    ["Ben looks in his rear-view mirror", "b", "through:in:rear-view mirror"],
    ["Ben glances into the rearview mirror", "b", "through:in:rearview mirror"],
    ["Ben checks his mirrors", "b", "through:in:mirrors"],
    ["Ava looks at her side mirror", "a", "through:in:side mirror"],
    ["Cleo peers through the keyhole", "c", "through:through:keyhole"],
    ["Dev looks out of the window", "d", "through:out of:window"],
    ["Ava stares through the windscreen", "a", "through:through:windscreen"],
  ])("%s", (text, who, at) => { expect(g(text)[who]).toBe(at); });
  it("reads well", () => {
    expect(gazeLine([{ id: "b", at: "through:in:rear-view mirror" }, { id: "c", at: "through:through:keyhole" }], (id) => people.find((p) => p.id === id)!.name))
      .toContain("Ben looks into the rear-view mirror, eyes on the reflection; Cleo looks through the keyhole");
  });
});

describe("More things looked through (D25)", () => {
  it.each([
    ["Dev looked through the window", "d", "through:through:window"],
    ["Cleo looked through the open door", "c", "through:through:open door"],
    ["Ava peers through the doorway", "a", "through:through:doorway"],
    ["Ben looks through his eyeglass", "b", "through:through:eyeglass"],
    ["Ben looked through the telescope", "b", "through:through:telescope"],
    ["Cleo looked through her binoculars", "c", "through:through:binoculars"],
    ["Dev peered through a spyglass", "d", "through:through:spyglass"],
  ])("%s", (text, who, at) => { expect(g(text)[who]).toBe(at); });
});

describe("Each thing looked through has its own look (D25)", () => {
  it.each([
    ["Cleo looked through her binoculars", "two overlapping circles"],
    ["Ben looked through the telescope", "one round magnified view"],
    ["Cleo peers through the keyhole", "keyhole-shaped opening"],
    ["Dev looks through the peephole", "fish-eye"],
    ["Ben looks in his rear-view mirror", "rear-view mirror"],
    ["Dev looked through the window", "frame within the frame"],
    ["Ava peers through the doorway", "doorway"],
  ])("%s", async (text, expected) => {
    const { shotEffect: fx } = await import("../src/lib/domain/gaze");
    const subject = /^(\w+)/.exec(text)![1];
    const id = people.find((p) => p.name.startsWith(subject))!.id;
    const gz = gazeFor({ shot: shot({ subjectId: id }), description: text, people, line: ["a", "b"] });
    expect(fx(gz, id)).toContain(expected);
  });
});

describe("Reflections (D25)", () => {
  it.each([
    ["Ava looks at her reflection in the mirror", "a", "reflection:mirror", "over their shoulder into the mirror"],
    ["Ben stares at his reflection in the water", "b", "reflection:water", "reflection in the water"],
    ["Cleo checks her reflection in the shop window", "c", "reflection:shop window", "faint reflection in the glass"],
    ["Dev looks at himself in the mirror", "d", "reflection:mirror", "into the mirror"],
  ])("%s", async (text, who, at, effect) => {
    const { shotEffect: fx } = await import("../src/lib/domain/gaze");
    expect(g(text, { subjectId: who })[who]).toBe(at);
    const gz = gazeFor({ shot: shot({ subjectId: who }), description: text, people, line: ["a", "b"] });
    expect(fx(gz, who)).toContain(effect);
  });
  it("a reflection in water also tilts the camera down", async () => {
    const { verticalFor } = await import("../src/lib/domain/vertical");
    expect(verticalFor("Ben stares at his reflection in the water")?.kind).toBe("high");
  });
});

describe("Looking out of vehicles (D25)", () => {
  it.each([
    ["Ava looks out of the car window", "a", "through:out of:car window", "side window"],
    ["Ben stares out the plane window", "b", "through:out of:plane window", "small oval window"],
    ["Cleo gazes out of the train", "c", "through:out of:train", "scenery outside slightly blurred"],
    ["Dev looks out of the window of the plane", "d", "through:out of:plane window", "oval window"],
    ["Ava looks out through the windscreen", "a", "through:out through:windscreen", "windscreen"],
    ["Ben peers out of the ship's porthole", "b", "through:out of:ship porthole", "porthole"],
    ["Cleo looks out of the airplane", "c", "through:out of:airplane", "oval window"],
    ["Dev looks out of the taxi window", "d", "through:out of:taxi window", "side window"],
  ])("%s", async (text, who, at, effect) => {
    const { shotEffect: fx } = await import("../src/lib/domain/gaze");
    expect(g(text, { subjectId: who })[who]).toBe(at);
    expect(fx(gazeFor({ shot: shot({ subjectId: who }), description: text, people, line: ["a", "b"] }), who)).toContain(effect);
  });
});
