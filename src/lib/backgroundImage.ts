// Server side of the 360° room ring (D20): join a venue's view pictures round a ring and cut
// the slice a shot's camera sees. Sent to GPT as the background reference instead of the one
// nearest view, so the room keeps its order and proportion from every angle.

import fs from "node:fs";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { persist, type DB } from "@/db/client";
import * as t from "@/db/schema";
import { pictureXY, planForShot } from "./domain/geometry";
import { detectorKind, type Thing } from "./domain/peopleDetect";
import { dividerBands } from "./domain/sheet";
import { detectPeople } from "./peopleDetector";
import { calibrationPrompt, horizonOf, readCalibration, ringSectors, roomCentre, viewScale, viewSlice, wallDistance, type ViewCalibration } from "./domain/panorama";
import { getTextProvider } from "./providers/images";
import * as repo from "./repo";

// A view picture spans about 90°. At 1,024 pixels for 90°, a medium shot's slice was about 300
// to 400 pixels stretched to fill a 1,024-wide frame, so image 1's background was soft in every
// version (D67). The ring now keeps 1,536 pixels for 90°, the width of a full-size view.
const H = 1152; // ring height in pixels
const PX_PER_DEG = 1536 / 90;

const ringCache = new Map<string, { data: Buffer; width: number; startDeg: number; joins: number[] }>();

type RingView = { name: string; directionDeg: number; path: string; calib?: ViewCalibration; wallM?: number };

/**
 * A view picture without the white sheet divider left along an edge (D62), and its measured eye
 * level and floor line moved to match the trimmed picture.
 */
async function withoutDividers(buf: Buffer, calib?: ViewCalibration): Promise<{ buf: Buffer; calib?: ViewCalibration }> {
  const { data, info } = await sharp(buf).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  const b = dividerBands({ w: info.width, h: info.height, data, channels: info.channels });
  if (!b.top && !b.bottom && !b.left && !b.right) return { buf, calib };
  const h2 = info.height - b.top - b.bottom;
  const out = await sharp(buf).extract({ left: b.left, top: b.top, width: info.width - b.left - b.right, height: h2 }).png().toBuffer();
  const move = (y: number) => +((y * info.height - b.top) / h2).toFixed(3);
  return { buf: out, calib: calib ? { horizon: move(calib.horizon), floor: Math.min(1, move(calib.floor)) } : undefined };
}

/**
 * One view picture filling its share of the ring. Measured (D48): at the room's own scale, its
 * eye level on the ring's, and a soft continuation of its own colours around it where it's
 * smaller than its share. Otherwise: fitted to cover its share, as before.
 */
async function sectorImage(v0: RingView, w: number): Promise<Buffer> {
  const { buf, calib } = await withoutDividers(fs.readFileSync(v0.path), v0.calib);
  const v = { ...v0, calib };
  const cover = () => sharp(buf).resize({ width: w, height: H, fit: "cover" }).png().toBuffer();
  if (!v.calib || !v.wallM) return cover();
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) return cover();
  const f = viewScale(v.calib, { width: meta.width, height: meta.height }, { width: w, height: H }, v.wallM, PX_PER_DEG);
  if (!f) return cover();
  const sw = Math.max(8, Math.round(meta.width * f)), sh = Math.max(8, Math.round(meta.height * f));
  const sharpPart = await sharp(buf).resize({ width: sw, height: sh, fit: "fill" }).png().toBuffer();
  // The open floor in front of the far wall, and whatever the picture stood on it (tables,
  // plants), is softened: it's at the picture's own distances, not the plan's, so the people
  // and props of the layout stand on a plain floor instead (D48).
  const floorTop = Math.max(0, Math.min(sh - 1, Math.round(v.calib.floor * sh)));
  const soft = await sharp(sharpPart).blur(30).modulate({ brightness: 0.95 }).png().toBuffer();
  const fade = Math.max(4, Math.round(sh * 0.03));
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="${((floorTop - fade) / sh).toFixed(4)}" stop-color="#fff"/><stop offset="${(floorTop / sh).toFixed(4)}" stop-color="#000"/><stop offset="1" stop-color="#000"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  const alpha = await sharp(mask).resize({ width: sw, height: sh }).greyscale().raw().toBuffer();
  const top = await sharp(sharpPart).removeAlpha().joinChannel(alpha, { raw: { width: sw, height: sh, channels: 1 } }).png().toBuffer();
  const scaled = await sharp(soft).composite([{ input: top, left: 0, top: 0 }]).png().toBuffer();
  const left = Math.round(w / 2 - sw / 2), top0 = Math.round(H / 2 - horizonOf(v.calib) * sh);
  const cl = Math.max(0, -left), ct = Math.max(0, -top0);
  const vw = Math.min(sw - cl, w - Math.max(0, left)), vh = Math.min(sh - ct, H - Math.max(0, top0));
  if (vw <= 0 || vh <= 0) return sharp(scaled).resize({ width: w, height: H, fit: "fill" }).blur(40).modulate({ brightness: 0.9 }).png().toBuffer();
  const part = await sharp(scaled).extract({ left: cl, top: ct, width: vw, height: vh }).png().toBuffer();
  const pad = { top: Math.max(0, top0), left: Math.max(0, left) };
  const more = { bottom: H - pad.top - vh, right: w - pad.left - vw };
  if (!pad.top && !pad.left && more.bottom <= 0 && more.right <= 0) return part;
  return paddedOut(part, vw, vh, { ...pad, bottom: Math.max(0, more.bottom), right: Math.max(0, more.right) });
}

/**
 * A view picture padded out to its share of the ring where it runs out (D64): the picture mirrored
 * across its edge and gently softened, so the room carries on (more pergola above, more floor
 * below). The old fill was the whole picture stretched and heavily blurred, which made a hard-edged
 * blurred band across the top of the frame; GPT copied it as an out-of-focus roof.
 */
export async function paddedOut(part: Buffer, vw: number, vh: number, e: { top: number; left: number; bottom: number; right: number }): Promise<Buffer> {
  // Below, the floor is drawn out from its last line: mirrored, it showed the planters and their
  // lights again under the people. Above, the same from its top line (D78). At the sides, the
  // room is mirrored, as far as the picture reaches and repeated beyond that.
  let img = part;
  if (e.bottom) {
    const k = Math.max(2, Math.min(vh, Math.round(vh * 0.04)));
    const floor = await sharp(part).extract({ left: 0, top: vh - k, width: vw, height: k }).resize({ width: vw, height: e.bottom, fit: "fill" }).blur(12).png().toBuffer();
    img = await sharp(part).extend({ bottom: e.bottom, background: { r: 0, g: 0, b: 0, alpha: 1 } }).composite([{ input: floor, left: 0, top: vh }]).png().toBuffer();
  }
  // Above too (D78): mirrored, a skate park's brick building and screen hung upside down in the
  // sky, and the finished background kept them. The top line drawn out and softened is sky or
  // ceiling carrying on, which the plate request finishes sharp.
  if (e.top) {
    const k = Math.max(2, Math.min(vh, Math.round(vh * 0.04)));
    const sky = await sharp(img).extract({ left: 0, top: 0, width: vw, height: k }).resize({ width: vw, height: e.top, fit: "fill" }).blur(12).png().toBuffer();
    img = await sharp(img).extend({ top: e.top, background: { r: 0, g: 0, b: 0, alpha: 1 } }).composite([{ input: sky, left: 0, top: 0 }]).png().toBuffer();
  }
  let cw = vw, ch = vh + e.bottom + e.top;
  const left = { ...e, bottom: 0, top: 0 };
  while (left.top || left.left || left.right) {
    const step = { top: Math.min(left.top, ch - 1), left: Math.min(left.left, cw - 1), right: Math.min(left.right, cw - 1) };
    img = await sharp(img).extend({ ...step, extendWith: "mirror" }).png().toBuffer();
    cw += step.left + step.right; ch += step.top;
    left.top -= step.top; left.left -= step.left; left.right -= step.right;
  }
  const W = cw, Hh = ch;
  // Soft only in the padding, fading in over a short band so there's no seam.
  const soft = await sharp(img).blur(5).png().toBuffer();
  const f = 24;
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}"><defs>`
    + `<linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="${(e.top / Hh).toFixed(4)}" stop-color="#000"/><stop offset="${((e.top + (e.top ? f : 0)) / Hh).toFixed(4)}" stop-color="#fff"/><stop offset="${((e.top + vh - (e.bottom ? f : 0)) / Hh).toFixed(4)}" stop-color="#fff"/><stop offset="${((e.top + vh) / Hh).toFixed(4)}" stop-color="#000"/><stop offset="1" stop-color="#000"/></linearGradient>`
    + `<linearGradient id="h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000"/><stop offset="${(e.left / W).toFixed(4)}" stop-color="#000"/><stop offset="${((e.left + (e.left ? f : 0)) / W).toFixed(4)}" stop-color="#fff"/><stop offset="${((e.left + vw - (e.right ? f : 0)) / W).toFixed(4)}" stop-color="#fff"/><stop offset="${((e.left + vw) / W).toFixed(4)}" stop-color="#000"/><stop offset="1" stop-color="#000"/></linearGradient>`
    + `<mask id="m"><rect width="100%" height="100%" fill="url(#h)"/></mask></defs><rect width="100%" height="100%" fill="url(#v)" mask="url(#m)"/></svg>`);
  const alpha = await sharp(mask).resize({ width: W, height: Hh }).greyscale().raw().toBuffer();
  const sharpOnTop = await sharp(img).removeAlpha().joinChannel(alpha, { raw: { width: W, height: Hh, channels: 1 } }).png().toBuffer();
  return sharp(soft).composite([{ input: sharpOnTop, left: 0, top: 0 }]).png().toBuffer();
}

/**
 * The ring, twice round so any slice can be cut without wrapping. x = (startDeg - angle) * PX_PER_DEG.
 * Neighbouring views overlap by a few degrees and fade into each other (D84): joined edge to edge,
 * the skate park's bowl stopped dead at a hard vertical line where the arches view began, the plate
 * kept it ("change nothing") and GPT drew the bowl's rim breaking off at it.
 */
const JOIN_BLEND = Math.round(4 * PX_PER_DEG); // each side of a join, pixels

async function ringFor(views: RingView[]) {
  const key = views.map((v) => `${v.name}@${v.directionDeg}:${v.path}:${v.calib ? `${v.calib.horizon}/${v.calib.floor}/${v.wallM?.toFixed(2)}` : "-"}`).join("|");
  const hit = ringCache.get(key);
  if (hit) return hit;
  const sectors = ringSectors(views);
  const B = JOIN_BLEND;
  const pieces: { input: Buffer; x: number }[] = [];
  const joins: number[] = [];
  let x = 0;
  for (const s of sectors) {
    const v = views.find((y) => y.name === s.name)!;
    const w = Math.max(8, Math.round((s.leftDeg - s.rightDeg) * PX_PER_DEG));
    joins.push(x);
    // The view a little wider than its share, its left edge fading in over the neighbour's own
    // extra: the two pictures cross-fade across the join instead of meeting at a line.
    const ww = w + 2 * B;
    const img = await sectorImage(v, ww);
    const fade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${ww}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000"/><stop offset="${((2 * B) / ww).toFixed(4)}" stop-color="#fff"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
    const alpha = await sharp(fade).resize({ width: ww, height: H }).extractChannel(0).raw().toBuffer();
    // Plain colour first: removeAlpha in the same chain as joinChannel drops the joined fade too.
    const rgb = await sharp(img).resize({ width: ww, height: H, fit: "fill" }).removeAlpha().png().toBuffer();
    const input = await sharp(rgb).joinChannel(alpha, { raw: { width: ww, height: H, channels: 1 } }).png().toBuffer();
    pieces.push({ input, x: x - B });
    x += w;
  }
  const width = x;
  // Three copies laid left to right, the first only so the second's first join has something to
  // fade over; the second and third are the ring, twice round.
  const parts = [0, 1, 2].flatMap((c) => pieces.map((p) => ({ input: p.input, left: B + c * width + p.x, top: 0 })));
  const canvas = await sharp({ create: { width: 3 * width + 2 * B, height: H, channels: 3, background: "#808080" } }).composite(parts).png().toBuffer();
  const data = await sharp(canvas).extract({ left: B + width, top: 0, width: 2 * width, height: H }).png().toBuffer();
  const out = { data, width, startDeg: sectors[0].leftDeg, joins };
  ringCache.set(key, out);
  return out;
}

type StoredView = { name: string; imageAssetId?: string; calib?: ViewCalibration & { assetId: string } };
const measuring = new Map<string, Promise<void>>();

/**
 * Measure each view picture once (D48): its eye level and where its floor meets the far wall,
 * by the vision model, kept on the venue with the picture it was measured on. Skipped without a
 * GPT link; a picture that can't be measured is left as it was.
 */
export function calibrateViews(db: DB, venueId: string): Promise<void> {
  const running = measuring.get(venueId);
  if (running) return running;
  const job = (async () => {
    const text = getTextProvider();
    const venue = db.select().from(t.venues).where(eq(t.venues.id, venueId)).get();
    if (!text || !venue) return;
    const views = (venue.views ?? []) as StoredView[];
    let changed = false;
    const next: StoredView[] = [];
    for (const v of views) {
      const a = v.imageAssetId ? repo.getAsset(db, v.imageAssetId) : undefined;
      if (!a || !fs.existsSync(a.path) || v.calib?.assetId === v.imageAssetId) { next.push(v); continue; }
      try {
        const c = readCalibration(await text.describe(calibrationPrompt(), [{ data: fs.readFileSync(a.path), mime: a.mime }]));
        if (c) { next.push({ ...v, calib: { ...c, assetId: v.imageAssetId! } }); changed = true; continue; }
      } catch { /* left unmeasured: the ring uses the ordinary fit */ }
      next.push(v);
    }
    if (!changed) return;
    // Only the measurements change: anything else saved meanwhile is kept.
    const now = db.select().from(t.venues).where(eq(t.venues.id, venueId)).get();
    const merged = ((now?.views ?? []) as StoredView[]).map((v) => { const m = next.find((x) => x.name === v.name && x.imageAssetId === v.imageAssetId && x.calib); return m ? { ...v, calib: m.calib } : v; });
    db.update(t.venues).set({ views: merged }).where(eq(t.venues.id, venueId)).run();
    persist(db);
  })().finally(() => measuring.delete(venueId));
  measuring.set(venueId, job);
  return job;
}

/** The scene's venue ring, or null when the venue has fewer than two view pictures. */
export async function ringForScene(db: DB, sceneId: string) {
  let scene = repo.getScene(db, sceneId);
  const plan = scene?.plan?.data;
  if (!scene || !plan || !scene.venue) return null;
  // Off unless asked for (D49): on Paul's venue the vision model read eye level far too high, the
  // views were shrunk to about 40-55% and image 1 became mostly blur, while GPT still drew the
  // group too big. The ordinary fit is kept; RING_CALIBRATION=1 turns the measured scale back on.
  const calibrate = /^(1|true|on|yes)$/i.test(process.env.RING_CALIBRATION ?? "");
  if (calibrate && ((scene.venue.views ?? []) as StoredView[]).some((v) => v.imageAssetId && v.calib?.assetId !== v.imageAssetId) && getTextProvider()) {
    await calibrateViews(db, scene.venue.id);
    scene = repo.getScene(db, sceneId)!;
  }
  const centre = roomCentre(plan);
  const pics = ((scene.venue!.views ?? []) as StoredView[])
    .map((v) => {
      const dir = plan.views.find((p) => p.name === v.name)?.directionDeg;
      const a = v.imageAssetId ? repo.getAsset(db, v.imageAssetId) : undefined;
      if (dir === undefined || !a || !fs.existsSync(a.path)) return undefined;
      const calib = calibrate && v.calib?.assetId === v.imageAssetId ? { horizon: v.calib!.horizon, floor: v.calib!.floor } : undefined;
      return { name: v.name, directionDeg: dir, path: a.path, ...(calib ? { calib, wallM: wallDistance(plan, centre, dir) } : {}) };
    })
    .filter((v): v is RingView => !!v);
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
  // pictures hold): the room carried on, mirrored across the edge and gently softened (D64). It
  // was a heavy blur of the whole strip, a hard-edged band that GPT drew as a blurred roof.
  const visTop = Math.max(0, top), cutTop = Math.max(0, -top);
  const visH = Math.min(ringH - cutTop, Hf - visTop);
  if (visH <= 0) return sharp(strip).resize({ width: W, height: Hf, fit: "fill" }).blur(30).modulate({ brightness: 0.9 }).png().toBuffer();
  const part = await sharp(strip).extract({ left: 0, top: cutTop, width: W, height: visH }).png().toBuffer();
  const framed = visTop || Hf - visTop - visH > 0 ? await paddedOut(part, W, visH, { top: visTop, left: 0, right: 0, bottom: Hf - visTop - visH }) : part;
  // Furniture standing in the venue pictures that the plan doesn't have (D56): GPT copied a real
  // table from the bar view instead of the plan's cocktail table among the group. The plan's own
  // props stay; the rest are softened into the room, as the floor beyond the views already is.
  const spots = (plan.furniture ?? []).flatMap((f) => {
    const kind = detectorKind(f.name), foot = kind ? pictureXY(plan, cam, f.position, 0) : undefined;
    return kind && foot ? [{ kind, x: foot.x, baseY: foot.y }] : [];
  });
  return clearLooseFurniture(framed, spots, horizon / Hf).catch(() => framed);
}

/**
 * Where the joins between venue views fall across this camera's frame, 0 (left) to 1 (right)
 * (D84). The plate request names them so GPT makes one continuous place across each, and the
 * plate is checked for a line left there.
 */
export async function frameJoins(db: DB, shotId: string): Promise<number[]> {
  const shot = repo.getShot(db, shotId);
  if (!shot?.spec.cameraId) return [];
  const scene = repo.getScene(db, shot.sceneId);
  const full = scene?.plan?.data;
  const plan = full ? planForShot(full, shot.spec) : undefined;
  const cam = plan?.cameras.find((c) => c.id === shot.spec.cameraId);
  if (!plan || !cam) return [];
  const ring = await ringForScene(db, shot.sceneId);
  if (!ring) return [];
  const slice = viewSlice(plan, cam);
  let x0 = Math.round((ring.startDeg - slice.leftDeg) * PX_PER_DEG);
  x0 = ((x0 % ring.width) + ring.width) % ring.width;
  const w = Math.max(16, Math.min(ring.width, Math.round((slice.leftDeg - slice.rightDeg) * PX_PER_DEG)));
  return joinsAcross(ring.joins, ring.width, x0, w);
}

/** Ring joins (pixels round the ring) as fractions across a cut from `x0`, `w` wide. Not within 3% of an edge. */
export function joinsAcross(joins: number[], ringWidth: number, x0: number, w: number): number[] {
  return joins.flatMap((j) => [j, j + ringWidth]).map((j) => (j - x0) / w).filter((f) => f > 0.03 && f < 0.97).map((f) => +f.toFixed(3)).sort((a, b) => a - b);
}

/** The loose furniture in a background that isn't the plan's (D56): standing on the floor, below the horizon, and nowhere near a planned prop of its kind. */
export function looseFurniture(things: Thing[], spots: { kind: string; x: number; baseY: number }[], horizon: number): Thing[] {
  return things.filter((t) => t.kind !== "tv" // a screen is part of the room, not loose furniture
    && t.x1 - t.x0 <= 0.35 && t.y1 - t.y0 <= 0.35 // nothing big enough to take a piece of the room with it
    && t.y1 > horizon + 0.03 && !spots.some((s) => s.kind === t.kind && s.x >= t.x0 - 0.05 && s.x <= t.x1 + 0.05 && Math.abs(s.baseY - t.y1) < 0.1));
}

async function clearLooseFurniture(bg: Buffer, spots: { kind: string; x: number; baseY: number }[], horizon: number): Promise<Buffer> {
  const found = await detectPeople(bg, { thingScore: 0.25 });
  const loose = looseFurniture(found.things, spots, horizon);
  if (!loose.length) return bg;
  const { width: W, height: Hf } = found;
  const soft = await sharp(bg).blur(40).png().toBuffer();
  const patches = await Promise.all(loose.map(async (t) => {
    // What stands on it (glasses, flowers) goes too: half its height again above it.
    const x0 = Math.max(0, Math.floor((t.x0 - 0.03) * W)), x1 = Math.min(W, Math.ceil((t.x1 + 0.03) * W));
    const y0 = Math.max(0, Math.floor((t.y0 - 0.5 * (t.y1 - t.y0)) * Hf)), y1 = Math.min(Hf, Math.ceil((Math.min(t.y1, 1) + 0.02) * Hf));
    const w = x1 - x0, h = y1 - y0;
    if (w < 8 || h < 8) return undefined;
    const r = Math.max(4, Math.round(Math.min(w, h) * 0.12));
    const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><filter id="f"><feGaussianBlur stdDeviation="${r / 2}"/></filter></defs><rect x="${r}" y="${r}" width="${w - 2 * r}" height="${h - 2 * r}" fill="#fff" filter="url(#f)"/></svg>`)).resize(w, h).extractChannel(0).toBuffer();
    const piece = await sharp(soft).extract({ left: x0, top: y0, width: w, height: h }).removeAlpha().joinChannel(mask).png().toBuffer();
    return { input: piece, left: x0, top: y0 };
  }));
  const cover = patches.filter((x): x is NonNullable<typeof x> => !!x);
  return cover.length ? sharp(bg).composite(cover).png().toBuffer() : bg;
}
