// D127: Kling Elements made from the app's own pictures; names fit Kling's 20-character box.
import { describe, expect, it } from "vitest";
import { nameOf } from "../src/lib/klingElementRequests";

describe("Element names (D127)", () => {
  it("keep a short name, cut a long one at a word", () => {
    expect(nameOf("Chase Whitmore")).toBe("Chase Whitmore");
    expect(nameOf("GLOWVANE launch-party venue")).toBe("GLOWVANE");
    expect(nameOf("Tall round cocktail table")).toBe("Tall round cocktail");
  });
});
