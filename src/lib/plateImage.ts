// Version C (D66, D67): each camera's background made once as a finished, sharp photograph of the
// empty place, checked against the venue's own views before it's used, and kept for every panel
// that shares the camera. Image 1 is drawn on it. Nothing is pasted back afterwards: when it was,
// GPT's people, drawn a little bigger or lower than planned, lost hair and legs to the paste.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { DB } from "@/db/client";
import { backgroundForFrame } from "./backgroundImage";
import { PLATE_RULES, platePrompt, SAME_PLACE, structureMatch } from "./domain/plate";
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
  const prompt = platePrompt({ venueName: scene.venue?.name ?? "venue", aspect, light: lightingOf(scene.venue?.description ?? ""), style: brief.style });
  const s = imageSettings();
  const key = crypto.createHash("sha1").update(cut).update(prompt).update(`${s.model}|${s.quality}|${PLATE_RULES}`).digest("hex").slice(0, 16);
  return { cut, prompt, key, W, H, size: (portrait ? "portrait" : "landscape") as "portrait" | "landscape" };
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
  for (let attempt = 1; attempt <= 2; attempt++) {
    const img = await provider.generate(p.prompt, [{ data: p.cut, mime: "image/png", name: "camera_view.png" }], p.size, { firstFullSize: true });
    const png = await sharp(img.data).resize({ width: p.W, height: p.H, fit: "fill" }).removeAlpha().png().toBuffer();
    const match = await samePlace(p.cut, png);
    const ok = match >= SAME_PLACE;
    if (testMode() && test) {
      const s = imageSettings();
      recordDraw({
        panelCode: test.panelCode, kind: "plate", variant: test.variant, prompt: p.prompt,
        inputs: [{ name: "camera_view.png", data: p.cut, mime: "image/png" }],
        model: s.model, quality: s.quality, size: SIZES[p.size], endpoint: "images/edits",
        output: { assetId: `plate-${p.key}-${attempt}`, data: png, note: img.providerNote },
        extras: [{ name: "plate.json", data: JSON.stringify({ key: p.key, attempt, samePlace: match, used: ok, needs: SAME_PLACE }, null, 2) }],
      });
    }
    if (ok) {
      fs.mkdirSync(plates(), { recursive: true });
      fs.writeFileSync(file, png);
      return png;
    }
  }
  fs.mkdirSync(plates(), { recursive: true });
  fs.writeFileSync(strayed, "GPT changed the place twice; the cut from the venue's views is used.\n");
  return null;
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
