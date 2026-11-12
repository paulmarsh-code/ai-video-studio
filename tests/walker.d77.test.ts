import { describe, expect, it } from "vitest";
import { crowdWithout, walkerIn } from "../src/lib/domain/continuity";

// D77: the background's one walker, found in the scene's own words, is left out of a panel's
// words when they'd have walked out of the picture since the approved one from the same camera.
const ROOF = "about 10 well-dressed industry guests mingling with drinks, some standing near the rooftop railing, a few seated at other tables, a server in black moving between groups";

describe("The background's one walker, in the scene's own words (D77)", () => {
  it("finds one person moving through, in any kind of scene", () => {
    expect(walkerIn(ROOF)).toBe("a server in black moving between groups");
    expect(walkerIn("about 25 party guests of all ages dancing and chatting with drinks; a DJ at the booth; a waiter carrying a tray of drinks")).toBe("a waiter carrying a tray of drinks");
    expect(walkerIn("a few skydivers packing parachutes by the hangar; a ground crew member walking out towards them")).toBe("a ground crew member walking out towards them");
    expect(walkerIn("shoppers browsing the stalls, a cyclist riding past")).toBe("a cyclist riding past");
  });
  it("not a group, and not people standing or sitting", () => {
    expect(walkerIn("a few skaters and BMX riders of different ages riding the street section")).toBeUndefined();
    expect(walkerIn("skiers and snowboarders of all ages coming off the chairlift; a beginners' group waiting in a line")).toBeUndefined();
    expect(walkerIn("two people watching from the ledge, a couple seated at a table")).toBeUndefined();
    expect(walkerIn("")).toBeUndefined();
    expect(walkerIn(undefined)).toBeUndefined();
  });
});

describe("The words without the walker (D77)", () => {
  it("takes out the part and what joined it", () => {
    expect(crowdWithout(ROOF, "a server in black moving between groups")).toBe("about 10 well-dressed industry guests mingling with drinks, some standing near the rooftop railing, a few seated at other tables");
    expect(crowdWithout("guests dancing; a waiter carrying drinks; a DJ at the booth", "a waiter carrying drinks")).toBe("guests dancing; a DJ at the booth");
    expect(crowdWithout("guests dancing and a waiter carrying drinks.", "a waiter carrying drinks")).toBe("guests dancing.");
    expect(crowdWithout("a waiter carrying drinks, and guests dancing", "a waiter carrying drinks")).toBe("guests dancing");
    expect(crowdWithout("a waiter carrying drinks", "a waiter carrying drinks")).toBe("");
  });
});
