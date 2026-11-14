// The fixed set's own pictures (D98), made once per venue and approved on the "Build the set" page:
// a straight-on picture of each wall, a floor, and each set piece cut out on a plain colour.
// Until a wall has its own picture the set uses the upper part of a venue view, which shows the
// room in perspective with tables in front of it: on the 360° it reads as a mural, and props
// cropped from their pictures carry their old background with them (proof step 1, 14 November).
//
// Pure: the requests and the small picture sums. The server side is `src/lib/setPictures.ts`.

import type { Texture } from "./setRender";

/** What a venue keeps for its set: wall pictures by view name, the floor, cut-outs by prop picture. */
export interface SetPictures {
  walls?: Record<string, string>;
  floor?: string;
  /** Prop picture asset id → its cut-out's asset id: a new prop picture needs a new cut-out. */
  pieces?: Record<string, string>;
}

export function setPicturesOf(v: unknown): SetPictures {
  const s = (v && typeof v === "object" ? v : {}) as SetPictures;
  return { walls: { ...(s.walls ?? {}) }, ...(s.floor ? { floor: s.floor } : {}), pieces: { ...(s.pieces ?? {}) } };
}

/** The straight-on picture of the wall (or, outdoors, the scenery) one venue view looks at. */
export function wallPrompt(o: { venueName: string; viewName: string; outdoors: boolean; style?: string }): string {
  const what = o.outdoors
    ? `the scenery the photo looks towards ("${o.viewName}") as one flat backdrop: the ground meeting it along the bottom edge, its skyline and the sky at the top`
    : `the wall the photo looks at ("${o.viewName}") as one flat surface: where it meets the floor along the bottom edge, where it meets the ceiling along the top edge, corner to corner across`;
  return [
    `Image 1 is a photo of ${o.venueName}. Make a picture of ${what}.`,
    "Camera square to it, centred and level, so it is seen straight on with no perspective: every vertical line upright, every horizontal line level, like an architect's elevation photographed.",
    "Keep everything that is part of it exactly as in image 1: materials, colours, windows, doors, screens, signs and their words, fittings, lights and the light falling on it.",
    "Leave out all people and everything standing in front of it: tables, chairs, stands, displays, plants and anything on the floor. Where they hid part of it, continue it as it would be.",
    "No floor or ceiling in the picture, no added text or logos, no frame or border.",
    o.style ? `Look: ${o.style}.` : "",
    "Photographic and sharp throughout.",
  ].filter(Boolean).join(" ");
}

/** The floor, seen from straight above, to repeat across the set. */
export function floorPrompt(o: { venueName: string; outdoors: boolean }): string {
  return [
    `Image 1 is a photo of ${o.venueName}. Make a picture of its ${o.outdoors ? "ground" : "floor"} only, seen from straight above, about 2 metres by 2 metres of it.`,
    "Same material, colour, pattern and finish as in image 1, evenly lit, with no shadows, people, furniture, feet, cables or anything standing on it.",
    "It will be repeated like a tile, so keep it even across the whole picture with nothing that stands out.",
    "Photographic, no text, no border.",
  ].join(" ");
}

/** A colour the prop doesn't have, for the plain background it's cut out from. */
export function keyColourFor(avg: [number, number, number]): { name: string; hex: string; rgb: [number, number, number] } {
  const [r, g, b] = avg;
  const greenish = g > r + 20 && g > b + 10;
  return greenish ? { name: "magenta", hex: "#FF00FF", rgb: [255, 0, 255] } : { name: "bright green", hex: "#00FF00", rgb: [0, 255, 0] };
}

/** One set piece alone on a plain colour, to be cut out and stood in the set. */
export function piecePrompt(o: { name: string; detail?: string; key: { name: string; hex: string } }): string {
  return [
    `Image 1 shows the ${o.name}${o.detail ? ` (${o.detail})` : ""}. Draw exactly this ${o.name} alone and whole, nothing cut off at the edges, seen straight from the front at the height of its middle, centred, filling most of the picture.`,
    "Same shape, proportions, colours, materials, words and details as in image 1.",
    `Behind it, only a perfectly plain, flat ${o.key.name} background (${o.key.hex}), the same colour edge to edge: no floor, no shadow on the background, no room, no people, nothing else.`,
    "Photographic and sharp.",
  ].join(" ");
}

/** The picture size that best fits something this wide and tall. */
export function sizeFor(widthM: number, heightM: number): "portrait" | "landscape" | "square" {
  const r = widthM / Math.max(0.01, heightM);
  return r > 1.25 ? "landscape" : r < 0.8 ? "portrait" : "square";
}

/**
 * A cut-out cropped to what's left of it, so the piece fills its real width and height in the set:
 * a margin of clear background would make it stand smaller than it is.
 */
export function trimClear(t: Texture, alphaBelow = 16): Texture {
  const { width: w, height: h } = t;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (t.data[(y * w + x) * 4 + 3] < alphaBelow) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return t;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(t.data.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + cw) * 4), y * cw * 4);
  return { data: out, width: cw, height: ch };
}

/**
 * Where the key colour has bled into the cut-out's edge (a green rim round a table), pull it back
 * towards the piece's own colours: each channel is held to the other two's level.
 */
export function despill(t: Texture, key: [number, number, number], reach = 2): Texture {
  const { width: w, height: h } = t;
  const out = new Uint8Array(t.data);
  const green = key[1] === 255 && key[0] === 0;
  const nearClear = (x: number, y: number) => {
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h && t.data[(Y * w + X) * 4 + 3] === 0) return true;
    }
    return false;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (out[i + 3] === 0 || !nearClear(x, y)) continue; // only the rim: the piece's own greens stay
    if (green) out[i + 1] = Math.min(out[i + 1], Math.max(out[i], out[i + 2]));
    else { const s = Math.min(out[i], out[i + 2]) - out[i + 1]; if (s > 0) { out[i] -= s; out[i + 2] -= s; } }
  }
  return { data: out, width: w, height: h };
}
