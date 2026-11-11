// D53: finding the people in a picture. The vision model guessed positions (heads at 34% one
// run, 22% the next, about 20% in fact) and called a group twice its planned size "about the
// same". A person detector (YOLOX-S, Apache 2.0) outlines every person exactly; the vision model
// only says which outline is which character, and the pass or fail is measured here.
// This file is the arithmetic, kept free of the model runtime so it can be tested anywhere.

/** One person found in a picture, as fractions of its width and height (0 = left or top edge). */
export interface Person { x0: number; y0: number; x1: number; y1: number; score: number; /** Their number on the marked picture, left to right. */ n?: number }

/** The detector looks at the picture fitted into a 640 × 640 square, padded at the right and bottom. */
export const DETECT_SIZE = 640;

/** How much the picture is shrunk to fit the detector's square. */
export function detectScale(width: number, height: number): number {
  return Math.min(DETECT_SIZE / width, DETECT_SIZE / height);
}

/**
 * Turn YOLOX's raw output into people. Each row is one guess on a grid of 8, 16 and 32 pixel
 * cells: centre and size relative to its cell, how sure it is that something is there, then a
 * score per kind of thing; kind 0 is a person.
 */
export function decodePeople(out: ArrayLike<number>, rowLength: number, scale: number, width: number, height: number, minScore = 0.3): Person[] {
  const found: Person[] = [];
  let row = 0;
  for (const stride of [8, 16, 32]) {
    const cells = DETECT_SIZE / stride;
    for (let gy = 0; gy < cells; gy++) {
      for (let gx = 0; gx < cells; gx++, row++) {
        const b = row * rowLength;
        if (b + 5 >= out.length) return found;
        const score = out[b + 4] * out[b + 5];
        if (!(score >= minScore)) continue;
        const cx = (out[b] + gx) * stride, cy = (out[b + 1] + gy) * stride;
        const w = Math.exp(out[b + 2]) * stride, h = Math.exp(out[b + 3]) * stride;
        found.push({ score, x0: (cx - w / 2) / scale / width, y0: (cy - h / 2) / scale / height, x1: (cx + w / 2) / scale / width, y1: (cy + h / 2) / scale / height });
      }
    }
  }
  return keepBest(found, width / height);
}

/** Where guesses overlap a lot they are the same person: keep the surest. */
export function keepBest(people: Person[], aspectWH: number, maxOverlap = 0.45): Person[] {
  const area = (p: Person) => Math.max(0, p.x1 - p.x0) * Math.max(0, p.y1 - p.y0) * aspectWH;
  const overlap = (a: Person, b: Person) => {
    const i = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)) * aspectWH;
    return i / (area(a) + area(b) - i || 1);
  };
  const keep: Person[] = [];
  for (const p of [...people].sort((a, b) => b.score - a.score)) if (keep.every((k) => overlap(k, p) < maxOverlap)) keep.push(p);
  return keep;
}

/**
 * The people worth numbering on the picture: sure enough and not tiny, left to right, at most 40,
 * edges clamped to the picture.
 */
export function numberPeople(people: Person[], minHeight = 0.04, minScore = 0.35, max = 40): Person[] {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return people
    .filter((p) => p.score >= minScore && p.y1 - p.y0 >= minHeight)
    .sort((a, b) => b.y1 - b.y0 - (a.y1 - a.y0))
    .slice(0, max)
    .sort((a, b) => a.x0 + a.x1 - (b.x0 + b.x1))
    .map((p, i) => ({ x0: clamp(p.x0), y0: clamp(p.y0), x1: clamp(p.x1), y1: Math.min(p.y1, 1.02), score: +p.score.toFixed(2), n: i + 1 }));
}
