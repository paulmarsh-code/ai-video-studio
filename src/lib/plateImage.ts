// Version C (D66): each camera's background plate, made once and kept, and the finished picture
// put together from it: GPT's main characters and props, the plate everywhere else.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { DB } from "@/db/client";
import { backgroundForFrame } from "./backgroundImage";
import { PLATE_RULES, platePrompt } from "./domain/plate";
import { lightingOf } from "./domain/imagePrompts";
import { imageSettings, SIZES, type ImageProvider } from "./providers/images";
import { recordDraw, testMode } from "./testRecords";
import * as repo from "./repo";

const plates = () => path.join(process.cwd(), "data", "plates");

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
  const prompt = platePrompt({ venueName: scene.venue?.name ?? "venue", aspect, crowd: shot.spec.crowd, light: lightingOf(scene.venue?.description ?? ""), style: brief.style });
  const s = imageSettings();
  const key = crypto.createHash("sha1").update(cut).update(prompt).update(`${s.model}|${s.quality}|${PLATE_RULES}`).digest("hex").slice(0, 16);
  return { cut, prompt, key, W, H, size: (portrait ? "portrait" : "landscape") as "portrait" | "landscape", code: shot.spec.code ?? shotId.slice(0, 8) };
}

/** The shot's plate if it has been made, without making one (for previews of image 1). */
export async function cachedPlate(db: DB, shotId: string): Promise<Buffer | null> {
  const p = await plateInput(db, shotId);
  if (!p) return null;
  const file = path.join(plates(), `${p.key}.png`);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

/**
 * The shot's plate, made with GPT the first time (one picture, about 7p) and kept for every
 * panel that shares the camera, the room and the crowd.
 */
export async function ensurePlate(db: DB, shotId: string, provider: ImageProvider, test?: { panelCode: string; variant: string }): Promise<Buffer | null> {
  const p = await plateInput(db, shotId);
  if (!p) return null;
  const file = path.join(plates(), `${p.key}.png`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const img = await provider.generate(p.prompt, [{ data: p.cut, mime: "image/png", name: "camera_view.png" }], p.size, { mask: await clearMask(p.W, p.H) });
  const png = await sharp(img.data).resize({ width: p.W, height: p.H, fit: "fill" }).removeAlpha().png().toBuffer();
  fs.mkdirSync(plates(), { recursive: true });
  fs.writeFileSync(file, png);
  if (testMode() && test) {
    const s = imageSettings();
    recordDraw({
      panelCode: test.panelCode, kind: "plate", variant: test.variant, prompt: p.prompt,
      inputs: [{ name: "camera_view.png", data: p.cut, mime: "image/png" }],
      model: s.model, quality: s.quality, size: SIZES[p.size], endpoint: "images/edits",
      output: { assetId: `plate-${p.key}`, data: png, note: img.providerNote },
      extras: [{ name: "plate_key.txt", data: `${p.key}\n` }],
    });
  }
  return png;
}

/** A mask that lets GPT redraw the whole picture: the plate is a finished version of all of it. */
async function clearMask(W: number, H: number): Promise<Buffer> {
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
}

/**
 * Where GPT may draw (D66), white on black: image 1's drawn stand-ins, props, arrows and tags,
 * with room round them for chairs and shadows, grown by about 1% of the width each way so a
 * person drawn a little bigger isn't cut.
 */
export async function drawArea(over: Buffer, extrasSvg: string, W: number, H: number): Promise<Buffer> {
  const drawn = await sharp(over).resize({ width: W, height: H, fit: "fill" }).ensureAlpha().extractChannel(3).png().toBuffer();
  const extra = await sharp(Buffer.from(extrasSvg)).resize({ width: W, height: H, fit: "fill" }).ensureAlpha().extractChannel(3).png().toBuffer();
  const both = await sharp(drawn).composite([{ input: extra, blend: "lighten" }]).greyscale().png().toBuffer();
  return sharp(both).blur(Math.max(2, W * 0.008)).threshold(6).greyscale().png().toBuffer();
}

/** The mask OpenAI takes: clear (alpha 0) where GPT may draw, solid elsewhere. */
export async function openAIMask(area: Buffer, W: number, H: number): Promise<Buffer> {
  const alpha = await sharp(area).negate({ alpha: false }).greyscale().raw().toBuffer();
  return sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } }).joinChannel(alpha, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
}

/**
 * The finished picture (D66): GPT's picture where the people and props are, the plate everywhere
 * else, blended over a few pixels so there's no edge. With numbers on how it went: how much of
 * the picture GPT drew, how far its own background strayed from the plate, and how sharp the
 * drawn and the pasted parts are, which should match.
 */
export async function onPlate(result: Buffer, plate: Buffer, area: Buffer, W: number, H: number): Promise<{ png: Buffer; numbers: { drawnShare: number; backgroundChange: number; sharpDrawn: number; sharpPlate: number } }> {
  const res = await sharp(result).resize({ width: W, height: H, fit: "fill" }).removeAlpha().png().toBuffer();
  const base = await sharp(plate).resize({ width: W, height: H, fit: "fill" }).removeAlpha().png().toBuffer();
  // A wide, soft join (about 2% of the width), so any small difference between GPT's background
  // near the people and the plate fades rather than shows as an edge.
  const soft = await sharp(area).blur(Math.max(1.5, W * 0.01)).greyscale().raw().toBuffer();
  const top = await sharp(res).joinChannel(soft, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
  const png = await sharp(base).composite([{ input: top, left: 0, top: 0 }]).png().toBuffer();
  // The numbers, on greyscale copies.
  const rgb = async (b: Buffer) => sharp(b).removeAlpha().raw().toBuffer();
  const [m, c1, c0, fin] = await Promise.all([sharp(area).greyscale().raw().toBuffer(), rgb(res), rgb(base), sharp(png).greyscale().raw().toBuffer()]);
  const edges = await sharp(fin, { raw: { width: W, height: H, channels: 1 } }).convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 }).raw().toBuffer();
  let drawn = 0, outN = 0, diff = 0, eIn = 0, eOut = 0;
  for (let i = 0; i < m.length; i++) {
    const e = Math.abs(edges[i] - 128);
    if (m[i] > 127) { drawn++; eIn += e; } else { outN++; eOut += e; diff += (Math.abs(c1[3 * i] - c0[3 * i]) + Math.abs(c1[3 * i + 1] - c0[3 * i + 1]) + Math.abs(c1[3 * i + 2] - c0[3 * i + 2])) / 3; }
  }
  return {
    png,
    numbers: {
      drawnShare: +(drawn / m.length).toFixed(3),
      backgroundChange: +(outN ? diff / outN / 255 : 0).toFixed(3),
      sharpDrawn: +(drawn ? eIn / drawn : 0).toFixed(2),
      sharpPlate: +(outN ? eOut / outN : 0).toFixed(2),
    },
  };
}
