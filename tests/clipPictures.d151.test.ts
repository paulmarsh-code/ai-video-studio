// D151: a clip's storyboard pictures drawn on an earlier floor plan don't go to Kling.
import { describe, expect, it } from "vitest";
import { outOfDateError, pictureIssues } from "../src/lib/sceneClips";

const clip = { pictures: [
  { shot: 1, panel: 9, assetId: "kept", continuity: true },
  { shot: 2, panel: 10, assetId: "p10" }, { shot: 3, panel: 11, assetId: "p11" }, { shot: 4, panel: 12, assetId: "p12" },
] };

describe("Out-of-date pictures (D151)", () => {
  it("Paul's clip 2: pictures drawn on plans 32 and 33 with the plan on 35 must be redrawn", () => {
    const panels = [
      { order: 9, check: { drawnOnPlan: 35 } },
      { order: 10, check: { drawnOnPlan: 32, pass: true, keptApproved: true } },
      { order: 11, check: { drawnOnPlan: 32, pass: false } },
      { order: 12, check: { drawnOnPlan: 33, pass: false } },
    ];
    const r = pictureIssues(clip, panels, () => "storyboard", 35);
    expect(r.redraw.map((x) => x.panel)).toEqual([10, 11, 12]);
    expect(r.redraw[0].why).toContain("version 32; it's now on 35");
    expect(outOfDateError(2, r)).toBe("Clip 2: the pictures for panels 10, 11, 12 were drawn on an earlier floor plan. Redraw them on the storyboard first, so Kling gets the people, props and camera as they are now.");
  });
  it("redrawn pictures pass; a failed check is only shown; a picked version or a kept frame isn't checked", () => {
    const panels = [10, 11, 12].map((order) => ({ order, check: { drawnOnPlan: 35, pass: order !== 11, problems: ["the satchel is in the wrong hand"] } }));
    const r = pictureIssues(clip, panels, (o) => (o === 12 ? "own" : "storyboard"), 35);
    expect(r.redraw).toEqual([]);
    expect(r.warn).toEqual([{ panel: 11, why: "Panel 11's picture didn't pass the app's picture check: the satchel is in the wrong hand." }]);
    expect(outOfDateError(2, r)).toBeNull();
    expect(pictureIssues(clip, [{ order: 10, check: {} }], () => "storyboard", 35).redraw.map((x) => x.panel)).toEqual([10, 11, 12]);
  });
});
