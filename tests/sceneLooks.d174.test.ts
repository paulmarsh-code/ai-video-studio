// D174: a character dressed differently in one scene.
import { describe, expect, it } from "vitest";
import { elementKey } from "../src/lib/domain/clips";
import { lookPrompt } from "../src/components/SceneLooks";

describe("Clothes in this scene (D174)", () => {
  it("keys a scene's look apart from the character's usual Element", () => {
    expect(elementKey.look("jade", "s1")).toBe("char:jade@s1");
    expect(elementKey.look("jade", "s1")).not.toBe(elementKey.character("jade"));
  });
  it("draws the same person in the new clothes, front and back, whole body", () => {
    const f = lookPrompt("front", "a cream roll-neck, wide-leg jeans and loafers.");
    expect(f).toContain("exactly the same face, hair, skin tone, age and build");
    expect(f).toContain("They are now wearing: a cream roll-neck, wide-leg jeans and loafers.");
    expect(f).toContain("facing the camera");
    expect(lookPrompt("back", "x")).toContain("seen from directly behind");
  });
});

describe("When the scene is (D175)", () => {
  it("dresses a look for the season and puts the time in the frame and clip requests", async () => {
    expect(lookPrompt("front", "a jumper", "a cold late-November afternoon")).toContain("The clothes suit a cold late-November afternoon: right for the season and the weather.");
    const { whenLine } = await import("../src/lib/domain/clips");
    expect(whenLine("a cold late-November afternoon.")).toBe("It is a cold late-November afternoon: the light, the weather through any window, and what the guests and passers-by wear suit it.");
    const { framePrompt } = await import("../src/lib/sceneClips");
    const p = framePrompt({ which: "start", when: "a cold late-November afternoon", venue: "Café", aspect: "9:16", people: [], props: [], moment: "They talk" });
    expect(p).toContain("It is a cold late-November afternoon");
  });
});
