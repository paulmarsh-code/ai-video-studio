// Cutting a reference sheet into views (D16).

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectCuts, paddedWidth, pieceRects, type Lum } from "../src/lib/domain/sheet";

function synthetic(w: number, h: number, joins: number[], bg = [120, 135, 128]): Lum {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const panel = joins.filter((j) => x >= j).length;
    let v = bg[panel % bg.length];
    // a "figure" in each panel: a dark block over the middle 60% of the height
    const cx = ((joins[panel - 1] ?? 0) + (joins[panel] ?? w)) / 2;
    if (Math.abs(x - cx) < 15 && y > h * 0.2 && y < h * 0.8) v = 40;
    data[y * w + x] = v;
  }
  return { w, h, data };
}

describe("Reference sheet cutting", () => {
  it("finds the joins in a real ChatGPT sheet with unequal panels (Jade, 9 Nov 2026)", () => {
    const data = fs.readFileSync(path.join(__dirname, "fixtures/sheet_jade_400x225.lum"));
    const cuts = detectCuts({ w: 400, h: 225, data }, 3, "x");
    // Joins by eye at about 665 and 1190 px of 2048.
    expect(cuts[0] * 2048).toBeGreaterThan(640);
    expect(cuts[0] * 2048).toBeLessThan(690);
    expect(cuts[1] * 2048).toBeGreaterThan(1165);
    expect(cuts[1] * 2048).toBeLessThan(1215);
  });

  it("finds unequal joins and ignores the figures' outlines", () => {
    const cuts = detectCuts(synthetic(300, 200, [80, 190]), 3, "x");
    expect(Math.round(cuts[0] * 300)).toBe(80);
    expect(Math.round(cuts[1] * 300)).toBe(190);
  });

  it("falls back to an equal split when there are no joins", () => {
    const flat: Lum = { w: 90, h: 60, data: new Uint8Array(90 * 60).fill(128) };
    expect(detectCuts(flat, 3, "x")).toEqual([1 / 3, 2 / 3]);
    expect(detectCuts(flat, 2, "y")).toEqual([0.5]);
  });

  it("pads narrow pieces to the 1:2 minimum and cuts in reading order", () => {
    expect(paddedWidth(450, 1000, 0.5)).toBe(500);
    expect(paddedWidth(600, 1000, 0.5)).toBe(600);
    const r = pieceRects(1000, 500, [0.5], [0.5]);
    expect(r).toHaveLength(4);
    expect(r[1].x).toBeGreaterThan(r[0].x);
    expect(r[2].y).toBeGreaterThan(r[0].y);
  });
});
