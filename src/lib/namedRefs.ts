// Character references with their names on them (D109). Paul: "we can't have mixed characters,
// this is a complete red line … we need a way to ensure characters with their names are linked."
// Image 1's stand-ins are labelled JADE, CHASE…; each reference picture now says the same name in
// large letters above it, so GPT matches face, clothes and carried things to the right person.

import sharp from "sharp";
import type { DB } from "@/db/client";
import { listCharacters } from "./studioRepo";
import * as repo from "./repo";

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A picture with a name banner above it, in the same first-name capitals as image 1's labels. */
export async function withNameBanner(picture: Buffer, name: string): Promise<Buffer> {
  const meta = await sharp(picture).metadata();
  const W = meta.width ?? 1024, H = meta.height ?? 1024;
  const band = Math.max(60, Math.round(H * 0.09));
  const label = esc(name.split(/\s+/)[0].toUpperCase());
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${band}"><rect width="${W}" height="${band}" fill="#fff"/><text x="${W / 2}" y="${Math.round(band * 0.74)}" font-size="${Math.round(band * 0.7)}" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="#111">${label}</text></svg>`);
  return sharp(picture).removeAlpha().extend({ top: band, background: { r: 255, g: 255, b: 255 } }).composite([{ input: svg, left: 0, top: 0 }]).png().toBuffer();
}

/** Puts the name on every reference that is one of an approved character's pictures, in place. */
export async function nameCharacterRefs(db: DB, projectId: string, _ids: string[], refs: { data: Buffer; mime: string; name: string }[]): Promise<number> {
  // Matched by asset code, which each reference carries as its name.
  const owner = new Map<string, string>();
  for (const c of listCharacters(db, projectId)) {
    const r = (c.approved?.profile as { refs?: Record<string, string> } | undefined)?.refs ?? {};
    for (const id of Object.values(r)) { const a = id ? repo.getAsset(db, id) : undefined; if (a) owner.set(a.assetCode, c.name); }
  }
  let n = 0;
  for (let k = 0; k < refs.length; k++) {
    const who = owner.get(refs[k].name);
    if (!who) continue;
    refs[k] = { ...refs[k], data: await withNameBanner(refs[k].data, who), mime: "image/png" };
    n++;
  }
  return n;
}
