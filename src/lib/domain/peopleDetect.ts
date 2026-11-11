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

/**
 * Furniture the detector knows (D55), by its kind number in the set it was trained on. A prop whose
 * name says it is one of these has its place measured like the people's; anything else (a logo
 * wall, a bar counter) stays with the vision model's description.
 */
export const THING_KINDS: Record<number, string> = { 13: "bench", 56: "chair", 57: "couch", 58: "potted plant", 59: "bed", 60: "dining table", 62: "tv" };

/** The detector's kind for a prop, from its name, or undefined when it has none. */
export function detectorKind(propName: string): string | undefined {
  const n = propName.toLowerCase();
  if (/\b(counter|bar|shelf|shelves|stand|plinth|pedestal)\b/.test(n) && !/\btable\b/.test(n)) return undefined;
  if (/\b(table|desk)\b/.test(n)) return "dining table";
  if (/\b(chair|stool|armchair)\b/.test(n)) return "chair";
  if (/\b(sofa|couch|settee)\b/.test(n)) return "couch";
  if (/\b(bench)\b/.test(n)) return "bench";
  if (/\b(pot plant|potted plant|plant)\b/.test(n)) return "potted plant";
  if (/\bbed\b/.test(n)) return "bed";
  if (/\b(tv|television|monitor)\b/.test(n)) return "tv";
  return undefined;
}

/** A piece of furniture the detector found (D55): its outline and kind. */
export interface Thing extends Person { kind: string }

/** The furniture in the detector's output, by the same grid as the people. */
export function decodeThings(out: ArrayLike<number>, rowLength: number, scale: number, width: number, height: number, minScore = 0.3): Thing[] {
  const found: Thing[] = [];
  let row = 0;
  const kinds = Object.entries(THING_KINDS).map(([k, name]) => [Number(k), name] as const);
  for (const stride of [8, 16, 32]) {
    const cells = DETECT_SIZE / stride;
    for (let gy = 0; gy < cells; gy++) {
      for (let gx = 0; gx < cells; gx++, row++) {
        const b = row * rowLength;
        if (b + 5 + 80 > out.length) break;
        let best = 0, kind = "";
        for (const [k, name] of kinds) { const sc = out[b + 4] * out[b + 5 + k]; if (sc > best) { best = sc; kind = name; } }
        if (best < minScore) continue;
        const cx = (out[b] + gx) * stride, cy = (out[b + 1] + gy) * stride;
        const w = Math.exp(out[b + 2]) * stride, h = Math.exp(out[b + 3]) * stride;
        found.push({ kind, score: best, x0: (cx - w / 2) / scale / width, y0: (cy - h / 2) / scale / height, x1: (cx + w / 2) / scale / width, y1: (cy + h / 2) / scale / height });
      }
    }
  }
  return [...new Set(found.map((t) => t.kind))].flatMap((k) => keepBest(found.filter((t) => t.kind === k), width / height) as Thing[]);
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

/**
 * A square round someone's head and shoulders (D54), in pixels, for a close look at where their
 * eyes go: as wide as the larger of most of their outline's width and three-tenths of its height,
 * centred across, from just above the outline's top. Undefined when it would be too small to see
 * eyes in (under 48 pixels, a face of about 20).
 */
export function headCrop(p: Person, width: number, height: number, min = 48): { left: number; top: number; size: number } | undefined {
  const size = Math.round(Math.max(0.7 * (p.x1 - p.x0) * width, 0.3 * (Math.min(p.y1, 1) - p.y0) * height));
  if (size < min) return undefined;
  const s = Math.min(size, width, height);
  const left = Math.round(Math.min(Math.max(0, ((p.x0 + p.x1) / 2) * width - s / 2), width - s));
  const top = Math.round(Math.min(Math.max(0, p.y0 * height - 0.05 * s), height - s));
  return { left, top, size: s };
}
