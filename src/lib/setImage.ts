// The fixed set (D97), server side: turns a scene's venue views and prop pictures into the set's
// textures, and renders a camera's view or a camera position's 360° as PNG.
//
// Until the venue has proper wall pictures (straight-on, floor to ceiling, made once and
// approved), each wall uses the upper part of the venue view that faces it, above where the floor
// starts. Set pieces use their prop pictures, cut out from their background where it is plain.

import fs from "node:fs";
import sharp from "sharp";
import type { DB } from "@/db/client";
import * as repo from "./repo";
import type { GeometryPlanData, PlanCamera, Point } from "./domain/types";
import { sceneAnchor } from "./domain/director";
import { render360, renderView, setModel, wallForDirection, type SetModel, type SetWall, type Texture } from "./domain/setRender";

/** How far down a venue view the floor starts, when nothing better is known. */
const FLOOR_STARTS = 0.6;

async function rgba(file: string, maxW = 1600): Promise<Texture> {
  const { data, info } = await sharp(file).resize({ width: maxW, withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function crop(t: Texture, top: number, bottom: number): Texture {
  const y0 = Math.round(t.height * top), y1 = Math.round(t.height * bottom);
  const h = Math.max(1, y1 - y0);
  return { data: t.data.subarray(y0 * t.width * 4, (y0 + h) * t.width * 4), width: t.width, height: h };
}

function average(t: Texture, top: number, bottom: number): [number, number, number] {
  const y0 = Math.round(t.height * top), y1 = Math.max(y0 + 1, Math.round(t.height * bottom));
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < t.width; x += 2) { const k = (y * t.width + x) * 4; r += t.data[k]; g += t.data[k + 1]; b += t.data[k + 2]; n++; }
  return [r / n, g / n, b / n];
}

/**
 * A prop picture cut out from a plain background: everything joined to the picture's edge that
 * is close to the edge's own colour becomes clear. A busy background is left as it is.
 */
export function cutOut(t: Texture, tolerance = 38): Texture {
  const { width: w, height: h } = t;
  const out = new Uint8Array(t.data);
  const edge: number[] = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) edge.push(y * w, y * w + w - 1);
  let er = 0, eg = 0, eb = 0;
  for (const i of edge) { er += t.data[i * 4]; eg += t.data[i * 4 + 1]; eb += t.data[i * 4 + 2]; }
  er /= edge.length; eg /= edge.length; eb /= edge.length;
  // How plain the edge is: a busy one (a room behind the prop) isn't cut.
  let spread = 0;
  for (const i of edge) spread += Math.abs(t.data[i * 4] - er) + Math.abs(t.data[i * 4 + 1] - eg) + Math.abs(t.data[i * 4 + 2] - eb);
  if (spread / edge.length > 60) return t;
  const seen = new Uint8Array(w * h);
  const stack = edge.filter((i) => Math.abs(t.data[i * 4] - er) + Math.abs(t.data[i * 4 + 1] - eg) + Math.abs(t.data[i * 4 + 2] - eb) < tolerance * 3);
  for (const i of stack) seen[i] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    out[i * 4 + 3] = 0;
    const x = i % w, y = (i - x) / w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j < 0 || seen[j]) continue;
      const d = Math.abs(t.data[j * 4] - er) + Math.abs(t.data[j * 4 + 1] - eg) + Math.abs(t.data[j * 4 + 2] - eb);
      if (d < tolerance * 3) { seen[j] = 1; stack.push(j); }
    }
  }
  return { data: out, width: w, height: h };
}

/** The scene's set: room shell, walls covered by the venue views, set pieces at their spots. */
export async function sceneSet(db: DB, sceneId: string, plan?: GeometryPlanData): Promise<{ set: SetModel; plan: GeometryPlanData } | null> {
  const scene = repo.getScene(db, sceneId);
  const p = plan ?? scene?.plan?.data;
  if (!scene || !p || !scene.venue) return null;
  const b = p.bounds ?? { minX: -5, maxX: 5, minY: 0, maxY: 10 };
  const outdoors = scene.venue.setting === "exterior";
  // Each wall gets the view that looks most squarely at it.
  const best = new Map<SetWall["side"], { off: number; tex: Texture; name: string }>();
  const pics: Texture[] = [];
  for (const v of (scene.venue.views ?? []) as { name: string; imageAssetId?: string }[]) {
    const dir = p.views.find((x) => x.name === v.name)?.directionDeg;
    const a = v.imageAssetId ? repo.getAsset(db, v.imageAssetId) : undefined;
    if (dir === undefined || !a || !fs.existsSync(a.path)) continue;
    const tex = await rgba(a.path);
    pics.push(tex);
    const side = wallForDirection(dir);
    const off = Math.abs(((dir - { maxX: 0, maxY: 90, minX: 180, minY: 270 }[side] + 540) % 360) - 180);
    const was = best.get(side);
    if (!was || off < was.off) best.set(side, { off, tex: crop(tex, 0, FLOOR_STARTS), name: v.name });
  }
  if (!pics.length) return null;
  const walls: SetWall[] = (["minX", "maxX", "minY", "maxY"] as const).map((side) => { const w = best.get(side); return { side, ...(w ? { texture: w.tex, name: w.name } : {}) }; });
  // How tall the walls are: the wall pictures' own shape, across the walls they cover.
  const heights = walls.filter((w) => w.texture).map((w) => {
    const span = w.side === "minX" || w.side === "maxX" ? b.maxY - b.minY : b.maxX - b.minX;
    return (span * w.texture!.height) / w.texture!.width;
  }).sort((x, y) => x - y);
  const wallM = Math.min(12, Math.max(3, heights[Math.floor(heights.length / 2)] ?? 4));
  const textures: Record<string, Texture | undefined> = {};
  for (const f of p.furniture ?? []) {
    const a = f.imageAssetId ? repo.getAsset(db, f.imageAssetId) : undefined;
    if (a && fs.existsSync(a.path)) textures[f.id] = cutOut(await rgba(a.path, 900));
  }
  const floor = pics.map((t) => average(t, 0.88, 1)).reduce((s, c) => [s[0] + c[0] / pics.length, s[1] + c[1] / pics.length, s[2] + c[2] / pics.length] as [number, number, number], [0, 0, 0] as [number, number, number]);
  const top = pics.map((t) => average(t, 0, 0.06)).reduce((s, c) => [s[0] + c[0] / pics.length, s[1] + c[1] / pics.length, s[2] + c[2] / pics.length] as [number, number, number], [0, 0, 0] as [number, number, number]);
  const anchor: Point | undefined = sceneAnchor(p)?.at;
  // Floor and ceiling: a strip from the nearest part of a view, mirrored into a seamless tile.
  // Blurred: the nearest floor in a view has table feet and cloths in it, which repeat as blobs.
  const floorTexture = await tileFrom(pics[0], 0.9, 1, 0.3, 0.7, 14);
  const ceilingTexture = outdoors ? undefined : await tileFrom(pics[0], 0, 0.08, 0.3, 0.7);
  const set = setModel(p, { walls, textures, wallM, ceilingM: outdoors ? undefined : wallM, floor, ceiling: top, sky: top, floorTexture, ceilingTexture, tileM: 3, ...(anchor ? { anchor } : {}) });
  return { set, plan: p };
}

/** A seamless square tile from part of a picture: the part, mirrored both ways. */
async function tileFrom(t: Texture, top: number, bottom: number, left: number, right: number, blur = 0): Promise<Texture> {
  const x0 = Math.round(t.width * left), y0 = Math.round(t.height * top);
  const w = Math.max(2, Math.round(t.width * (right - left))), h = Math.max(2, Math.round(t.height * (bottom - top)));
  let img = sharp(Buffer.from(t.data), { raw: { width: t.width, height: t.height, channels: 4 } }).extract({ left: x0, top: y0, width: w, height: h }).resize(256, 256, { fit: "fill" });
  if (blur > 0.3) img = sharp(await img.raw().toBuffer(), { raw: { width: 256, height: 256, channels: 4 } }).blur(blur);
  const part = await img.raw().toBuffer();
  const src = { data: part, width: 256, height: 256 };
  const out = new Uint8Array(512 * 512 * 4);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const sx = x < 256 ? x : 511 - x, sy = y < 256 ? y : 511 - y;
    out.set(src.data.subarray((sy * 256 + sx) * 4, (sy * 256 + sx) * 4 + 4), (y * 512 + x) * 4);
  }
  return { data: out, width: 512, height: 512 };
}

const png = (data: Uint8Array, width: number, height: number) => sharp(Buffer.from(data), { raw: { width, height, channels: 4 } }).png().toBuffer();

/** What a camera sees of the set, as a PNG the size of a panel picture. */
export async function setView(set: SetModel, plan: GeometryPlanData, cam: PlanCamera, width = 1024, height = 1536, ss = 2): Promise<Buffer> {
  return png(renderView(set, plan, cam, width, height, ss), width, height);
}

/** The 360° around a camera position, as a PNG. */
export async function set360(set: SetModel, plan: GeometryPlanData, at: Point, heightM: number, width = 3072, height = 900): Promise<Buffer> {
  return png(render360(set, plan, at, heightM, width, height), width, height);
}
