// Server side of the 360° room ring (D20): join a venue's view pictures round a ring and cut
// the slice a shot's camera sees. Sent to GPT as the background reference instead of the one
// nearest view, so the room keeps its order and proportion from every angle.

import fs from "node:fs";
import sharp from "sharp";
import type { DB } from "@/db/client";
import { planForShot } from "./domain/geometry";
import { ringSectors, viewSlice } from "./domain/panorama";
import * as repo from "./repo";

const H = 768; // ring height in pixels
const PX_PER_DEG = 1024 / 90; // a view picture spans about 90°

const ringCache = new Map<string, { data: Buffer; width: number; startDeg: number }>();

/** The ring, twice round so any slice can be cut without wrapping. x = (startDeg - angle) * PX_PER_DEG. */
async function ringFor(views: { name: string; directionDeg: number; path: string }[]) {
  const key = views.map((v) => `${v.name}@${v.directionDeg}:${v.path}`).join("|");
  const hit = ringCache.get(key);
  if (hit) return hit;
  const sectors = ringSectors(views);
  const parts: { input: Buffer; left: number; top: number }[] = [];
  let x = 0;
  for (const s of sectors) {
    const v = views.find((y) => y.name === s.name)!;
    const w = Math.max(8, Math.round((s.leftDeg - s.rightDeg) * PX_PER_DEG));
    // The view's centre sits at the sector's centre; its picture fills the sector.
    const img = await sharp(fs.readFileSync(v.path)).resize({ width: w, height: H, fit: "cover" }).png().toBuffer();
    parts.push({ input: img, left: x, top: 0 });
    x += w;
  }
  const width = x;
  const doubled = parts.flatMap((p) => [p, { ...p, left: p.left + width }]);
  const data = await sharp({ create: { width: width * 2, height: H, channels: 3, background: "#808080" } }).composite(doubled).png().toBuffer();
  const out = { data, width, startDeg: sectors[0].leftDeg };
  ringCache.set(key, out);
  return out;
}

/** The scene's venue ring, or null when the venue has fewer than two view pictures. */
export async function ringForScene(db: DB, sceneId: string) {
  const scene = repo.getScene(db, sceneId);
  const plan = scene?.plan?.data;
  if (!scene || !plan || !scene.venue) return null;
  const pics = (scene.venue.views as { name: string; imageAssetId?: string }[])
    .map((v) => {
      const dir = plan.views.find((p) => p.name === v.name)?.directionDeg;
      const a = v.imageAssetId ? repo.getAsset(db, v.imageAssetId) : undefined;
      return dir !== undefined && a && fs.existsSync(a.path) ? { name: v.name, directionDeg: dir, path: a.path } : undefined;
    })
    .filter((v): v is { name: string; directionDeg: number; path: string } => !!v);
  if (pics.length < 2) return null; // one view: the plain view picture is used instead
  return { ...(await ringFor(pics)), height: H, pxPerDeg: PX_PER_DEG };
}

/** A small copy of the ring (twice round) for the live camera preview (D21). */
export async function ringPreview(db: DB, sceneId: string): Promise<Buffer | null> {
  const ring = await ringForScene(db, sceneId);
  if (!ring) return null;
  return sharp(ring.data).resize({ height: 300 }).jpeg({ quality: 78 }).toBuffer();
}

export async function renderBackgroundForShot(db: DB, shotId: string): Promise<Buffer | null> {
  const shot = repo.getShot(db, shotId);
  if (!shot?.spec.cameraId) return null;
  const scene = repo.getScene(db, shot.sceneId);
  const full = scene?.plan?.data;
  const plan = full ? planForShot(full, shot.spec) : undefined;
  const cam = plan?.cameras.find((c) => c.id === shot.spec.cameraId);
  if (!scene || !plan || !cam) return null;
  const ring = await ringForScene(db, shot.sceneId);
  if (!ring) return null;
  const slice = viewSlice(plan, cam);
  // Position of the left edge on the ring, moved into the first copy.
  let x0 = Math.round((ring.startDeg - slice.leftDeg) * PX_PER_DEG);
  x0 = ((x0 % ring.width) + ring.width) % ring.width;
  const w = Math.max(16, Math.min(ring.width, Math.round((slice.leftDeg - slice.rightDeg) * PX_PER_DEG)));
  // Up and down (D25): the frame's height in degrees, moved up or down by the camera's tilt.
  // The ring spans about ±34° of level, so a steep tilt reaches its edge and stops there.
  const aspect = String(plan.aspect ?? "9:16");
  const [aw, ah] = aspect.split(":").map(Number);
  const hfov = slice.leftDeg - slice.rightDeg;
  const vfov = (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) * ((ah || 16) / (aw || 9))) * 180) / Math.PI;
  const h = Math.max(32, Math.min(H, Math.round(vfov * PX_PER_DEG)));
  const centre = H / 2 - (cam.tiltDeg ?? 0) * PX_PER_DEG;
  const top = Math.max(0, Math.min(H - h, Math.round(centre - h / 2)));
  return sharp(ring.data).extract({ left: x0, top, width: w, height: h }).resize({ width: 1024, height: 1024, fit: "inside" }).png().toBuffer();
}

/** Whether a shot can have a ring background (two or more view pictures). */
export function hasRing(views: { imageAssetId?: string }[] | undefined): boolean {
  return (views ?? []).filter((v) => v.imageAssetId).length >= 2;
}

/**
 * The background this camera sees, laid out at the picture's own size (D34): the ring slice
 * fills the frame's width, its horizon sits where the camera's horizon is (moved by tilt), and
 * any sky or floor beyond the ring's height continues its edge colours.
 */
export async function backgroundForFrame(db: DB, shotId: string, W: number, Hf: number): Promise<Buffer | null> {
  const shot = repo.getShot(db, shotId);
  if (!shot?.spec.cameraId) return null;
  const scene = repo.getScene(db, shot.sceneId);
  const full = scene?.plan?.data;
  const plan = full ? planForShot(full, shot.spec) : undefined;
  const cam = plan?.cameras.find((c) => c.id === shot.spec.cameraId);
  if (!scene || !plan || !cam) return null;
  const ring = await ringForScene(db, shot.sceneId);
  if (!ring) return null;
  const slice = viewSlice(plan, cam);
  let x0 = Math.round((ring.startDeg - slice.leftDeg) * PX_PER_DEG);
  x0 = ((x0 % ring.width) + ring.width) % ring.width;
  const w = Math.max(16, Math.min(ring.width, Math.round((slice.leftDeg - slice.rightDeg) * PX_PER_DEG)));
  const s = W / w;
  const ringH = Math.round(H * s);
  const strip = await sharp(ring.data).extract({ left: x0, top: 0, width: w, height: H }).resize({ width: W, height: ringH, fit: "fill" }).png().toBuffer();
  // Where the horizon falls in the frame: the middle, moved by the tilt (D25).
  const hfovRad = ((slice.leftDeg - slice.rightDeg) * Math.PI) / 180;
  const focal = W / 2 / Math.tan(hfovRad / 2);
  const horizon = Hf / 2 + Math.tan(((cam.tiltDeg ?? 0) * Math.PI) / 180) * focal;
  const top = Math.round(horizon - ringH / 2);
  // Beyond the ring's height (portrait frames see more ceiling and floor than the view
  // pictures hold): a soft, blurred continuation of the room's own colours, so nothing new is
  // invented there and GPT fills it in naturally.
  const under = await sharp(strip).resize({ width: W, height: Hf, fit: "fill" }).blur(30).modulate({ brightness: 0.9 }).png().toBuffer();
  const visTop = Math.max(0, top), cutTop = Math.max(0, -top);
  const visH = Math.min(ringH - cutTop, Hf - visTop);
  if (visH <= 0) return under;
  const part = await sharp(strip).extract({ left: 0, top: cutTop, width: W, height: visH }).png().toBuffer();
  return sharp(under).composite([{ input: part, left: 0, top: visTop }]).png().toBuffer();
}
