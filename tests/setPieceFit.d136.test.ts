// D136: a set piece's picture at its real size. A table's picture includes what stands on it and
// its cloth's flare; the plan's 70 cm and 110 cm are the table itself, measured at its top.
import { describe, expect, it } from "vitest";
import { pieceFit } from "../src/lib/domain/setRender";

/** A clear picture with opaque rows of the given widths, centred. */
function pic(widths: number[], w = 100) {
  const data = new Uint8Array(w * widths.length * 4);
  widths.forEach((rw, y) => { const l = Math.round((w - rw) / 2); for (let x = l; x < l + rw; x++) data[(y * w + x) * 4 + 3] = 255; });
  return { data, width: w, height: widths.length };
}

describe("A set piece at its real size (D136)", () => {
  it("a table with things on top: the top is the plan's height, the flare wider than its top", () => {
    // 30 rows of bucket and flowers (narrow), a 60-wide top seen as a band of 10 rows, then the
    // cloth flaring to 100 at the floor over 60 rows.
    const t = pic([...Array(30).fill(25), ...Array(10).fill(60), ...Array.from({ length: 60 }, (_, i) => Math.round(60 + (40 * i) / 59))]);
    const f = pieceFit(t, 0.7, 1.1);
    expect(f.widthM).toBeCloseTo((0.7 * 100) / 60, 2); // the top is 70 cm; the picture is wider at the floor
    expect(f.heightM).toBeCloseTo((1.1 * 100) / 70, 2); // the top at 110 cm, the flowers above it
  });
  it("a piece with nothing on top keeps its size", () => {
    expect(pieceFit(pic(Array(80).fill(70)), 1.2, 2)).toEqual({ widthM: 1.2, heightM: 2 });
  });
});
