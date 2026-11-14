// Drawing on the fixed set (D103, stage 3 of Paul's redesign). Image 1 is the set as this panel's
// camera sees it, with the stand-ins; GPT draws the people; then the set is pasted back over
// everything that isn't a person, so the room, the table and the light can't change between
// panels. Background people GPT adds stay: the people it drew are found and kept too.

import sharp from "sharp";
import type { DB } from "@/db/client";
import * as repo from "./repo";
import { blockingOver } from "./blockingImage";
import { cameraPositions, sceneSetCached, setView } from "./setImage";
import { drawArea } from "./plateImage";
import { maskExtras } from "./domain/plate";

/** Whether a scene draws its panels on the fixed set: the user turned it on and the set exists. */
export function drawsOnSet(db: DB, sceneId: string): boolean {
  const s = repo.getScene(db, sceneId);
  return !!(s?.venue && s.plan && (s.scene.staging as { onSet?: boolean } | null)?.onSet);
}

/** Image 1 on the set, the stand-ins' area, and the empty set view to paste back. */
export async function renderBlockingOnSet(db: DB, shotId: string): Promise<{ png: Buffer; area: Buffer; set: Buffer; W: number; H: number } | null> {
  const shot = repo.getShot(db, shotId);
  if (!shot) return null;
  const b = await sceneSetCached(db, shot.sceneId);
  if (!b) return null;
  const x = cameraPositions(db, shot.sceneId, b.plan).flatMap((p) => p.shots).find((q) => q.shotId === shotId);
  if (!x) return null;
  const portrait = (b.plan.aspect ?? "9:16") === "9:16";
  const W = portrait ? 1024 : 1536, H = portrait ? 1536 : 1024;
  const set = await sharp(await setView(b.set, x.plan, x.cam, W, H, 2)).removeAlpha().png().toBuffer();
  const parts = await blockingOver(db, shotId, set);
  if (!parts) return null;
  const ids = parts.plan.actors.filter((a) => parts.peopleIds.includes(a.characterId)).map((a) => a.characterId);
  const area = await drawArea(parts.over, maskExtras(parts.plan, parts.cam, ids, W, H), W, H);
  return { png: parts.png, area, set, W, H };
}

/**
 * The set pasted back over GPT's picture, except where people are: the stand-ins' area, and every
 * person the detector finds in the picture (background people included), each with room below
 * for their shadow. The join is feathered so it doesn't show as an outline.
 */
/** Above this, GPT moved the room too far for the set to go back over it (D103; to be checked on real pictures). */
export const ROOM_MOVED = 0.12;

export async function pasteSet(picture: Buffer, set: Buffer, area: Buffer, W: number, H: number): Promise<{ png: Buffer; keptPeople: number; moved: number; pasted: boolean }> {
  const pic = await sharp(picture).resize({ width: W, height: H, fit: "fill" }).removeAlpha().png().toBuffer();
  let boxes = "";
  let kept = 0;
  try {
    const { detectPeople } = await import("./peopleDetector");
    const found = await detectPeople(pic);
    for (const p of found.people) {
      if (p.score < 0.3) continue;
      const w = p.x1 - p.x0, h = p.y1 - p.y0;
      const x0 = Math.max(0, p.x0 - 0.12 * w), x1 = Math.min(1, p.x1 + 0.12 * w), y0 = Math.max(0, p.y0 - 0.05 * h), y1 = Math.min(1, p.y1 + 0.08 * h);
      boxes += `<rect x="${(x0 * W).toFixed(1)}" y="${(y0 * H).toFixed(1)}" width="${((x1 - x0) * W).toFixed(1)}" height="${((y1 - y0) * H).toFixed(1)}" rx="${(0.2 * w * W).toFixed(1)}" fill="#fff"/>`;
      kept++;
    }
  } catch { /* no detector: the stand-ins' area alone */ }
  // Where GPT's picture stays: white. Feathered, then the set goes over the rest.
  const people = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/>${boxes}</svg>`)).removeAlpha().greyscale().png().toBuffer();
  const keep = await sharp(await sharp(area).resize({ width: W, height: H, fit: "fill" }).greyscale().png().toBuffer())
    .composite([{ input: people, blend: "lighten" }]).greyscale().blur(Math.max(2, W * 0.006)).extractChannel(0).raw().toBuffer();
  // How far GPT's room has moved from the set, outside the people (0 the same, 1 nothing alike), on
  // small blurred copies. A room GPT has shifted or re-framed would show double where pasted.
  const small = async (b: Buffer) => sharp(b).resize({ width: W, height: H, fit: "fill" }).removeAlpha().greyscale().blur(4).resize(96, 144, { fit: "fill" }).raw().toBuffer();
  const [a0, b0, k0] = await Promise.all([small(pic), small(set), sharp(keep, { raw: { width: W, height: H, channels: 1 } }).resize(96, 144, { fit: "fill" }).raw().toBuffer()]);
  let diff = 0, n = 0;
  for (let i = 0; i < a0.length; i++) if (k0[i] < 40) { diff += Math.abs(a0[i] - b0[i]); n++; }
  const moved = n ? diff / n / 255 : 0;
  if (moved > ROOM_MOVED) return { png: pic, keptPeople: kept, moved, pasted: false };
  const setAlpha = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) setAlpha[i] = 255 - keep[i];
  const setLayer = await sharp(await sharp(set).resize({ width: W, height: H, fit: "fill" }).removeAlpha().png().toBuffer()).joinChannel(setAlpha, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
  return { png: await sharp(pic).composite([{ input: setLayer, left: 0, top: 0 }]).png().toBuffer(), keptPeople: kept, moved, pasted: true };
}
