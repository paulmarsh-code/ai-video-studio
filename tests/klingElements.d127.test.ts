// D127/D128: Kling Elements made from the app's own pictures; names fit Kling's 20-character box,
// with the project's code first so they sort and group by project.
import { describe, expect, it } from "vitest";
import { nameOf, ofProject } from "../src/lib/klingNames";

describe("Element names (D127, D128)", () => {
  it("keep a short name, cut a long one at a word, the project's code first", () => {
    expect(nameOf("Chase Whitmore")).toBe("Chase Whitmore");
    expect(nameOf("Chase Whitmore", "POT")).toBe("POT Chase Whitmore");
    expect(nameOf("GLOWVANE launch-party venue", "POT")).toBe("POT GLOWVANE");
    expect(nameOf("Tall round cocktail table")).toBe("Tall round cocktail");
  });
  it("know a project's Elements by their names", () => {
    expect(ofProject("POT Jade", "POT")).toBe(true);
    expect(ofProject("POT · Jade (studio test)", "POT")).toBe(true);
    expect(ofProject("HP_Judge_V01", "HP")).toBe(true);
    expect(ofProject("Potted plant", "POT")).toBe(false);
    expect(ofProject("Jadefull", "POT")).toBe(false);
  });
});
