// Cutting a ChatGPT reference sheet into separate views (D16).
// ChatGPT rarely draws equal panels, so the cut positions are found from the image: a join
// between panels is an edge that runs the whole height (or width) of the sheet, whereas a
// figure's outline only covers part of it. Tested on a real sheet: joins at 665 and 1190 px
// of 2048, unequal panels. The user can always drag the lines before cutting.

export interface Lum {
  w: number;
  h: number;
  /** Luminance 0–255, row by row. */
  data: ArrayLike<number>;
}

const EDGE = 2.5; // luminance step that counts as an edge
const MIN_COVER = 0.6; // a join must cross at least 60% of the sheet

/** Fraction of rows (axis "x") or columns (axis "y") with an edge between position i and i+1. */
function coverage(img: Lum, axis: "x" | "y"): number[] {
  const { w, h, data } = img;
  const n = axis === "x" ? w - 1 : h - 1;
  const span = axis === "x" ? h : w;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let hits = 0;
    for (let j = 0; j < span; j++) {
      const a = axis === "x" ? data[j * w + i] : data[i * w + j];
      const b = axis === "x" ? data[j * w + i + 1] : data[(i + 1) * w + j];
      if (Math.abs(a - b) > EDGE) hits++;
    }
    out[i] = hits / span;
  }
  return out;
}

/**
 * Cut positions as fractions (0–1) for `parts` panels along an axis. Each cut is the strongest
 * full-length edge within ±20% of the equal-split position; falls back to the equal split.
 */
export function detectCuts(img: Lum, parts: number, axis: "x" | "y"): number[] {
  if (parts < 2) return [];
  const cov = coverage(img, axis);
  const len = cov.length + 1;
  const cuts: number[] = [];
  for (let k = 1; k < parts; k++) {
    const centre = (k * len) / parts;
    const lo = Math.max(1, Math.floor(centre - 0.2 * len));
    const hi = Math.min(cov.length - 1, Math.ceil(centre + 0.2 * len));
    let best = -1;
    let bestScore = MIN_COVER;
    for (let i = lo; i <= hi; i++) {
      // Prefer stronger joins; break ties towards the expected position.
      const score = cov[i] - Math.abs(i - centre) / len / 10;
      if (cov[i] >= MIN_COVER && score > bestScore) { best = i; bestScore = score; }
    }
    const prev = cuts.at(-1) ?? 0;
    const pos = best >= 0 ? (best + 1) / len : k / parts;
    cuts.push(pos > prev + 0.1 ? pos : k / parts);
  }
  return cuts;
}

/** Width needed so a piece is no narrower than minAspect (width ÷ height); pads, never crops. */
export function paddedWidth(w: number, h: number, minAspect: number): number {
  return w / h >= minAspect ? w : Math.ceil(h * minAspect);
}

/** Pixel rectangles for each panel, left to right then top to bottom. */
export function pieceRects(W: number, H: number, xCuts: number[], yCuts: number[]) {
  const xs = [0, ...xCuts.map((c) => Math.round(c * W)), W];
  const ys = [0, ...yCuts.map((c) => Math.round(c * H)), H];
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  for (let r = 0; r < ys.length - 1; r++) {
    for (let c = 0; c < xs.length - 1; c++) {
      // Trim a few pixels at each join so divider lines don't end up in the pieces.
      const trim = 4;
      const x0 = xs[c] + (c > 0 ? trim : 0);
      const x1 = xs[c + 1] - (c < xs.length - 2 ? trim : 0);
      const y0 = ys[r] + (r > 0 ? trim : 0);
      const y1 = ys[r + 1] - (r < ys.length - 2 ? trim : 0);
      rects.push({ x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) });
    }
  }
  return rects;
}

/**
 * Plain white bands along a view picture's edges (D62): a sheet divider left on the piece when it
 * was cut. Carried into image 1, GPT drew it as a white bar across the top of the picture (T6,
 * the rooftop bar). A band is whole lines of near-white starting within a few pixels of the edge;
 * the pixels to trim from each side, with two more for the soft edge, never more than `maxFrac`
 * of the picture.
 */
export function dividerBands(img: Lum & { channels?: number }, maxFrac = 0.08): { top: number; bottom: number; left: number; right: number } {
  const { w, h, data } = img;
  const ch = img.channels ?? 1;
  const at = (x: number, y: number) => data[(y * w + x) * ch];
  const white = (n: number, get: (j: number) => number) => {
    let hits = 0;
    for (let j = 0; j < n; j++) if (get(j) >= 225) hits++;
    return hits / n >= 0.9;
  };
  const band = (n: number, span: number, line: (k: number) => boolean) => {
    const cap = Math.floor(n * maxFrac);
    let k = 0;
    while (k < 4 && k < cap && !line(k)) k++;
    if (k >= 4 || k >= cap) return 0;
    while (k < cap && line(k)) k++;
    return Math.min(cap, k + 2);
  };
  return {
    top: band(h, w, (k) => white(w, (j) => at(j, k))),
    bottom: band(h, w, (k) => white(w, (j) => at(j, h - 1 - k))),
    left: band(w, h, (k) => white(h, (j) => at(k, j))),
    right: band(w, h, (k) => white(h, (j) => at(w - 1 - k, j))),
  };
}
