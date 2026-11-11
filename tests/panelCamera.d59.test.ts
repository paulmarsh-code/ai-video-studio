// D59: any scene. A panel names the camera it uses, and says when it's the panel's own copy of a
// floor-plan camera; the venue can be made again with an empty floor.
import { describe, expect, it } from "vitest";
import { panelCameraLabel } from "../src/lib/domain/geometry";
import { EMPTY_FLOOR_CHANGE, venueChangePrompt } from "../src/lib/domain/describe";

describe("Which camera a panel uses (D59)", () => {
  const plan = { cameras: [{ id: "cam-1", name: "Wide (P1)" }, { id: "cam-1~4c8d57", name: "Wide (P1), for this panel" }, { id: "cam-2~aa", name: "Close-up, turned" }] };
  it("names the camera, and the one a panel's own copy came from", () => {
    expect(panelCameraLabel(plan, "cam-1")).toEqual({ name: "Wide (P1)" });
    expect(panelCameraLabel(plan, "cam-1~4c8d57")).toEqual({ name: "Wide (P1), for this panel", copyOf: "Wide (P1)" });
    expect(panelCameraLabel(plan, "cam-2~aa")).toEqual({ name: "Close-up, turned", copyOf: "Close-up" });
    expect(panelCameraLabel(plan, undefined)).toBeUndefined();
  });
});

describe("Empty the floor (D59)", () => {
  it("asks for the views without loose furniture or people, keeping everything built in, and the description as it was", () => {
    const t = venueChangePrompt({ setting: "interior", description: "A warehouse hall with a long bar.", views: ["a", "b", "c", "d"] }, EMPTY_FLOOR_CHANGE);
    expect(t).toMatch(/take out every free-standing table, chair, stool, sofa and pot plant/);
    expect(t).toMatch(/Keep everything built in exactly as it is/);
    expect(t).toMatch(/without mentioning that the floor is empty/);
  });
});
