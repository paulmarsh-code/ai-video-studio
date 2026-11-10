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

export async function renderBackgroundForShot(db: DB, shotId: string): Promise<Buffer | null> {
  const shot = repo.getShot(db, shotId);
  if (!shot?.spec.cameraId) return null;
  const scene = repo.getScene(db, shot.sceneId);
  const full = scene?.plan?.data;
  const plan = full ? planForShot(full, shot.spec) : undefined;
  const cam = plan?.cameras.find((c) => c.id === shot.spec.cameraId);
  if (!scene || !plan || !cam || !scene.venue) return null;
  const pics = (scene.venue.views as { name: string; imageAssetId?: string }[])
    .map((v) => {
      const dir = plan.views.find((p) => p.name === v.name)?.directionDeg;
      const a = v.imageAssetId ? repo.getAsset(db, v.imageAssetId) : undefined;
      return dir !== undefined && a && fs.existsSync(a.path) ? { name: v.name, directionDeg: dir, path: a.path } : undefined;
    })
    .filter((v): v is { name: string; directionDeg: number; path: string } => !!v);
  if (pics.length < 2) return null; // one view: the plain view picture is used instead
  const ring = await ringFor(pics);
  const slice = viewSlice(plan, cam);
  // Position of the left edge on the ring, moved into the first copy.
  let x0 = Math.round((ring.startDeg - slice.leftDeg) * PX_PER_DEG);
  x0 = ((x0 % ring.width) + ring.width) % ring.width;
  const w = Math.max(16, Math.min(ring.width, Math.round((slice.leftDeg - slice.rightDeg) * PX_PER_DEG)));
  return sharp(ring.data).extract({ left: x0, top: 0, width: w, height: H }).resize({ width: 1024, height: 1024, fit: "inside" }).png().toBuffer();
}

/** Whether a shot can have a ring background (two or more view pictures). */
export function hasRing(views: { imageAssetId?: string }[] | undefined): boolean {
  return (views ?? []).filter((v) => v.imageAssetId).length >= 2;
}
