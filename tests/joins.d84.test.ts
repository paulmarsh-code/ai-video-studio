import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { joinLine, platePrompt, SEAM_SHOWS, seamStrength } from "@/lib/domain/plate";
import { joinsAcross } from "@/lib/backgroundImage";

// D84: where two venue views meet in a camera's cut, the plate is asked to make one continuous
// place, and a plate still showing a line there is tried again.
describe("joins between venue views (D84)", () => {
  it("finds the joins across a cut, both times round the ring, not right at an edge", () => {
    expect(joinsAcross([0, 1000, 2000, 3000], 4000, 3400, 800)).toEqual([0.75]);
    expect(joinsAcross([0, 1000], 2000, 900, 400)).toEqual([0.25]);
    expect(joinsAcross([0, 1000], 2000, 990, 400)).toEqual([]); // 2.5% in: at the edge
  });

  it("names the joins in the plate request only when there are some", () => {
    expect(platePrompt({ venueName: "skate park" })).not.toMatch(/joined/);
    const p = platePrompt({ venueName: "skate park", joins: [0.861] });
    expect(p).toMatch(/meet about 86% of the way across from the left/);
    expect(p).toMatch(/no line, step, break or double image/);
    expect(joinLine([0.3, 0.7])).toMatch(/about 30% and 70% of the way/);
  });

  it("measures a hard line at a join, and not an ordinary picture", async () => {
    const W = 200, H = 120;
    // Smooth left half, a different picture on the right: a hard join at x = 120.
    const px = Buffer.alloc(W * H);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) px[r * W + c] = c < 120 ? 90 + ((c * 3 + r * 2) % 40) : 170 + ((c * 5 + r) % 30);
    const hard = seamStrength(px, W, H, 120);
    expect(hard).toBeGreaterThan(SEAM_SHOWS);
    const smooth = await sharp(px, { raw: { width: W, height: H, channels: 1 } }).blur(8).raw().toBuffer();
    expect(seamStrength(smooth, W, H, 60)).toBeLessThan(SEAM_SHOWS);
  });
});
