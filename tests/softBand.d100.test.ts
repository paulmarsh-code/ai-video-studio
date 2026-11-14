// D100: image 1's soft bands, above and below the venue views, are named as unfinished when image 1
// isn't on a finished plate, so GPT draws them sharp instead of keeping a blurred roof.
import { describe, expect, it } from "vitest";
import { softBandLine } from "../src/lib/domain/plate";

describe("Image 1's unfinished bands (D100)", () => {
  it("names the top and bottom bands, with their share of the frame", () => {
    const l = softBandLine({ top: 0.2, bottom: 0.2 }, false);
    expect(l).toContain("the top 20% of image 1 is unfinished");
    expect(l).toContain("ceiling, beams and lights");
    expect(l).toContain("the bottom 20%");
    expect(l).toContain("No blurred band");
    expect(softBandLine({ top: 0.1, bottom: 0 }, true)).toContain("the skyline and sky");
  });
  it("says nothing for a frame the views fill", () => {
    expect(softBandLine({ top: 0.02, bottom: 0 }, false)).toBe("");
  });
});
