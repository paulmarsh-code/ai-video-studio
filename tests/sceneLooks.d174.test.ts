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
