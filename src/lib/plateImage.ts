// Version C (D66, D67): each camera's background made once as a finished, sharp photograph of the
// empty place, checked against the venue's own views before it's used, and kept for every panel
// that shares the camera. Image 1 is drawn on it. Nothing is pasted back afterwards: when it was,
// GPT's people, drawn a little bigger or lower than planned, lost hair and legs to the paste.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { DB } from "@/db/client";
import { backgroundForFrame, frameJoins } from "./backgroundImage";
import { PLATE_RULES, platePrompt, SAME_PLACE, SEAM_SHOWS, seamStrength, structureMatch } from "./domain/plate";
import { lightingOf } from "./domain/imagePrompts";
import { imageSettings, SIZES, type ImageProvider } from "./providers/images";
import { recordDraw, testMode } from "./testRecords";
import * as repo from "./repo";

const plates = () => path.join(process.cwd(), "data", "plates");

/** A picture's layout for `structureMatch`: blurred, greyscale, 32 × 32. */
export async function layoutOf(picture: Buffer): Promise<Buffer> {
  return sharp(picture).removeAlpha().greyscale().resize({ width: 256, height: 256, fit: "fill" }).blur(6).resize({ width: 32, height: 32, fit: "fill" }).raw().toBuffer();
}

/** How alike two pictures are in layout (D67), -1 to 1. */
export async function samePlace(a: Buffer, b: Buffer): Promise<number> {
  return structureMatch(await layoutOf(a), await layoutOf(b));
}

/** What a shot's plate is made from, and its name: the same cut, request and model make the same plate. */
async function plateInput(db: DB, shotId: string) {
  const shot = repo.getShot(db, shotId);
  if (!shot?.spec.cameraId) return null;
  const scene = repo.getScene(db, shot.sceneId);
  if (!scene) return null;
  const brief = (repo.getProject(db, scene.scene.projectId)?.brief ?? {}) as { aspect?: string; style?: string };
  const aspect = String(brief.aspect ?? scene.plan?.data.aspect ?? "9:16");
  const portrait = !aspect.startsWith("16");
  const W = portrait ? 1024 : 1536, H = portrait ? 1536 : 1024;
  const cut = await backgroundForFrame(db, shotId, W, H);
  if (!cut) return null;
  const joins = await frameJoins(db, shotId);
  const prompt = platePrompt({ venueName: scene.venue?.name ?? "venue", aspect, light: lightingOf(scene.venue?.description ?? ""), style: brief.style, joins });
  const s = imageSettings();
  const key = crypto.createHash("sha1").update(cut).update(prompt).update(`${s.model}|${s.quality}|${PLATE_RULES}`).digest("hex").slice(0, 16);
  return { cut, prompt, key, W, H, joins, size: (portrait ? "portrait" : "landscape") as "portrait" | "landscape" };
}

/** The shot's plate if it has been made, without making one (for previews of image 1). */
export async function cachedPlate(db: DB, shotId: string): Promise<Buffer | null> {
  const p = await plateInput(db, shotId);
  if (!p) return null;
  const file = path.join(plates(), `${p.key}.png`);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

/**
 * The shot's plate, made with GPT the first time (one picture, about 7p) and kept. It is used
 * only if it is still the same place as the cut from the venue's views (`SAME_PLACE`); if not,
 * it's made once more, and if that strays too, the cut itself is used (version A's background)
 * and the record says so. Returns null when there's nothing to use but the cut.
 */
// Plates being made, by name: two panels sharing a camera drawn at once wait for one plate
// instead of each paying for their own (D68: panels 1 and 3 made the same plate twice).
const making = new Map<string, Promise<Buffer | null>>();

export async function ensurePlate(db: DB, shotId: string, provider: ImageProvider, test?: { panelCode: string; variant: string }): Promise<Buffer | null> {
  const p = await plateInput(db, shotId);
  if (!p) return null;
  const file = path.join(plates(), `${p.key}.png`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const already = making.get(p.key);
  if (already) return already;
  const job = makePlate(p, file, provider, test).finally(() => making.delete(p.key));
  making.set(p.key, job);
  return job;
}

async function makePlate(p: NonNullable<Awaited<ReturnType<typeof plateInput>>>, file: string, provider: ImageProvider, test?: { panelCode: string; variant: string }): Promise<Buffer | null> {
  const strayed = path.join(plates(), `${p.key}.strayed`);
  if (fs.existsSync(strayed)) return null;
  // A plate that keeps the place but still shows a join is kept in reserve: one more try, and if
  // that is no better it's used anyway, as the cut it came from shows the same join (D84).
  let reserve: Buffer | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const img = await provider.generate(p.prompt, [{ data: p.cut, mime: "image/png", name: "camera_view.png" }], p.size, { firstFullSize: true });
    const png = await sharp(img.data).resize({ width: p.W, height: p.H, fit: "fill" }).removeAlpha().png().toBuffer();
    const match = await samePlace(p.cut, png);
    const seams = await seamsIn(png, p.W, p.H, p.joins);
    const joined = seams.every((x) => x < SEAM_SHOWS);
    const ok = match >= SAME_PLACE && joined;
    if (testMode() && test) {
      const s = imageSettings();
      recordDraw({
        panelCode: test.panelCode, kind: "plate", variant: test.variant, prompt: p.prompt,
        inputs: [{ name: "camera_view.png", data: p.cut, mime: "image/png" }],
        model: s.model, quality: s.quality, size: SIZES[p.size], endpoint: "images/edits",
        output: { assetId: `plate-${p.key}-${attempt}`, data: png, note: img.providerNote },
        extras: [{ name: "plate.json", data: JSON.stringify({ key: p.key, attempt, samePlace: match, needs: SAME_PLACE, joins: p.joins, seams, seamShows: SEAM_SHOWS, used: ok || (attempt === 2 && match >= SAME_PLACE) }, null, 2) }],
      });
    }
    if (match >= SAME_PLACE && !joined && !reserve) reserve = png;
    const use = ok ? png : attempt === 2 ? reserve : null;
    if (use) {
      fs.mkdirSync(plates(), { recursive: true });
      fs.writeFileSync(file, use);
      return use;
    }
  }
  fs.mkdirSync(plates(), { recursive: true });
  fs.writeFileSync(strayed, "GPT changed the place twice; the cut from the venue's views is used.\n");
  return null;
}

/** How strongly each join still shows as a line in a plate (D84). */
export async function seamsIn(png: Buffer, W: number, H: number, joins: number[]): Promise<number[]> {
  if (!joins.length) return [];
  const grey = await sharp(png).resize({ width: W, height: H, fit: "fill" }).greyscale().raw().toBuffer();
  return joins.map((f) => seamStrength(grey, W, H, f * W));
}

/**
 * Numbers for the test record (D66): how much of the picture is the people and props' area, how
 * far GPT's background strayed from the plate outside it (0 = not at all), and how sharp each
 * part is, which should be close.
 */
export async function plateNumbers(result: Buffer, plate: Buffer, area: Buffer, W: number, H: number): Promise<{ drawnShare: number; backgroundChange: number; sharpDrawn: number; sharpBackground: number; samePlace: number }> {
  const res = await sharp(result).resize({ width: W, height: H, fit: "fill" }).removeAlpha().png().toBuffer();
  const base = await sharp(plate).resize({ width: W, height: H, fit: "fill" }).removeAlpha().png().toBuffer();
  const rgb = async (b: Buffer) => sharp(b).removeAlpha().raw().toBuffer();
  const [m, c1, c0, g] = await Promise.all([sharp(area).greyscale().raw().toBuffer(), rgb(res), rgb(base), sharp(res).greyscale().raw().toBuffer()]);
  const edges = await sharp(g, { raw: { width: W, height: H, channels: 1 } }).convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 }).raw().toBuffer();
  let drawn = 0, outN = 0, diff = 0, eIn = 0, eOut = 0;
  for (let i = 0; i < m.length; i++) {
    const e = Math.abs(edges[i] - 128);
    if (m[i] > 127) { drawn++; eIn += e; } else { outN++; eOut += e; diff += (Math.abs(c1[3 * i] - c0[3 * i]) + Math.abs(c1[3 * i + 1] - c0[3 * i + 1]) + Math.abs(c1[3 * i + 2] - c0[3 * i + 2])) / 3; }
  }
  return {
    drawnShare: +(drawn / m.length).toFixed(3),
    backgroundChange: +(outN ? diff / outN / 255 : 0).toFixed(3),
    sharpDrawn: +(drawn ? eIn / drawn : 0).toFixed(2),
    sharpBackground: +(outN ? eOut / outN : 0).toFixed(2),
    samePlace: await samePlace(base, res),
  };
}

/**
 * The people and props' area of image 1 (D66), white on black: its drawn stand-ins, props, arrows
 * and tags, with room round them, grown by about 1% of the width. Used for the numbers above.
 */
export async function drawArea(over: Buffer, extrasSvg: string, W: number, H: number): Promise<Buffer> {
  const drawn = await sharp(over).resize({ width: W, height: H, fit: "fill" }).ensureAlpha().extractChannel(3).png().toBuffer();
  const extra = await sharp(Buffer.from(extrasSvg)).resize({ width: W, height: H, fit: "fill" }).ensureAlpha().extractChannel(3).png().toBuffer();
  const both = await sharp(drawn).composite([{ input: extra, blend: "lighten" }]).greyscale().png().toBuffer();
  return sharp(both).blur(Math.max(2, W * 0.008)).threshold(6).greyscale().png().toBuffer();
}

/**
 * An approved picture from the same camera, without its background guests (D74): each guest's
 * outline is filled from the camera's plate, which is the same view with nobody in it. Asked in
 * words not to copy the guests' places, GPT still copied them, a waitress in the same spot and
 * facing the same way seven seconds later. The main characters (the `keep` largest outlines, and
 * anyone nearly as large) stay. Returns the picture unchanged when the detector can't run.
 */
export async function withoutGuests(picture: Buffer, plate: Buffer, keep: number): Promise<{ png: Buffer; removed: number }> {
  try {
    const { detectPeople } = await import("./peopleDetector");
    const { numberPeople } = await import("./domain/peopleDetect");
    const found = await detectPeople(picture);
    const people = numberPeople(found.people, 0.03, 0.3).sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0));
    if (!people.length) return { png: picture, removed: 0 };
    const tallest = people[0].y1 - people[0].y0;
    const main = people.filter((p, k) => k < keep || p.y1 - p.y0 >= 0.6 * tallest);
    const guests = people.filter((p) => !main.includes(p));
    if (!guests.length) return { png: picture, removed: 0 };
    const { width: W, height: H } = found;
    const rects = guests.map((p) => {
      const w = p.x1 - p.x0, h = p.y1 - p.y0;
      const x0 = Math.max(0, p.x0 - 0.25 * w), x1 = Math.min(1, p.x1 + 0.25 * w), y0 = Math.max(0, p.y0 - 0.1 * h), y1 = Math.min(1, p.y1 + 0.06 * h);
      return `<rect x="${(x0 * W).toFixed(1)}" y="${(y0 * H).toFixed(1)}" width="${((x1 - x0) * W).toFixed(1)}" height="${((y1 - y0) * H).toFixed(1)}" fill="#fff"/>`;
    }).join("");
    // The main characters are never touched, even where a guest's box overlaps them.
    const keepOut = main.map((p) => {
      const w = p.x1 - p.x0, h = p.y1 - p.y0;
      const x0 = Math.max(0, p.x0 - 0.04 * w), x1 = Math.min(1, p.x1 + 0.04 * w), y0 = Math.max(0, p.y0 - 0.04 * h);
      return `<rect x="${(x0 * W).toFixed(1)}" y="${(y0 * H).toFixed(1)}" width="${((x1 - x0) * W).toFixed(1)}" height="${((Math.min(1, p.y1) - y0) * H).toFixed(1)}" fill="#000"/>`;
    }).join("");
    const area = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/>${rects}${keepOut}</svg>`)).removeAlpha().blur(Math.max(2, W * 0.006)).extractChannel(0).raw().toBuffer();
    // The plate as plain colour first: removeAlpha in the same chain would drop the joined mask too.
    const base = await sharp(plate).resize({ width: W, height: H, fit: "fill" }).removeAlpha().png().toBuffer();
    const fill = await sharp(base).joinChannel(area, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
    const png = await sharp(picture).removeAlpha().composite([{ input: fill, left: 0, top: 0 }]).png().toBuffer();
    return { png, removed: guests.length };
  } catch {
    return { png: picture, removed: 0 };
  }
}
