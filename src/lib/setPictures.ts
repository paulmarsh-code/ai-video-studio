// Making the fixed set's own pictures with GPT (D98): one picture each, about 7p, kept as a
// candidate until it is used on the "Build the set" page.

import fs from "node:fs";
import sharp from "sharp";
import type { DB } from "@/db/client";
import * as repo from "./repo";
import { cleanBaseCode, storeAsset } from "./assetStore";
import type { ImageProvider } from "./providers/images";
import { despill, floorPrompt, keyColourFor, piecePrompt, sizeFor, trimClear, wallPrompt } from "./domain/setPictures";
import { isSetPiece } from "./domain/setRender";
import { cutOut, withPiecePictures } from "./setImage";

export type SetPictureKind = { kind: "wall"; view: string } | { kind: "floor" } | { kind: "piece"; furnitureId: string };

function sceneBits(db: DB, sceneId: string) {
  const s = repo.getScene(db, sceneId);
  if (!s || !s.venue || !s.plan) throw new Error("This scene needs a venue and a floor plan first.");
  const project = repo.getProject(db, s.scene.projectId)!;
  const brief = (project.brief ?? {}) as { style?: string };
  return { s, project, venue: s.venue, plan: withPiecePictures(db, sceneId, s.plan.data), style: brief.style };
}

const file = (db: DB, assetId?: string) => {
  const a = assetId ? repo.getAsset(db, assetId) : undefined;
  return a && fs.existsSync(a.path) ? a : undefined;
};

/** Make one of the set's pictures. Returns the new asset; nothing is used until it's chosen. */
export async function makeSetPicture(db: DB, sceneId: string, what: SetPictureKind, provider: ImageProvider): Promise<{ assetId: string; assetCode: string; note?: string }> {
  const { project, venue, plan, style } = sceneBits(db, sceneId);
  const outdoors = venue.setting === "exterior";
  const views = (venue.views ?? []) as { name: string; imageAssetId?: string }[];
  const base = `${project.code}_SET_${venue.name.split(/\s+/).slice(0, 2).join("")}`;
  if (what.kind === "wall" || what.kind === "floor") {
    const view = what.kind === "wall" ? views.find((v) => v.name === what.view) : views.find((v) => file(db, v.imageAssetId));
    const a = file(db, view?.imageAssetId);
    if (!view || !a) throw new Error(what.kind === "wall" ? `That view has no picture yet.` : "The venue has no view pictures yet.");
    const prompt = what.kind === "wall" ? wallPrompt({ venueName: venue.name, viewName: view.name, outdoors, style }) : floorPrompt({ venueName: venue.name, outdoors });
    const img = await provider.generate(prompt, [{ data: fs.readFileSync(a.path), mime: a.mime, name: "venue_view.png" }], what.kind === "wall" ? "landscape" : "square", { firstFullSize: true });
    const png = await sharp(img.data).removeAlpha().png().toBuffer();
    const code = cleanBaseCode(`${base}_${what.kind === "wall" ? `WALL_${view.name.split(/\s+/).slice(0, 3).join("")}` : "FLOOR"}`);
    const saved = storeAsset(db, { projectId: project.id, baseCode: code, kind: what.kind === "wall" ? "set-wall" : "set-floor", ext: "png", mime: "image/png", data: png, note: img.providerNote });
    return { assetId: saved.id, assetCode: saved.assetCode };
  }
  const f = (plan.furniture ?? []).find((x) => x.id === what.furnitureId);
  if (!f || !isSetPiece(f)) throw new Error("That isn't one of the scene's set pieces.");
  const a = file(db, f.imageAssetId);
  if (!a) throw new Error(`The ${f.name} has no picture yet. Add one in the scene setting first.`);
  const src = fs.readFileSync(a.path);
  const st = await sharp(src).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer();
  // The prop's own colour, from the middle of its picture, picks a background it doesn't have.
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 16; y < 48; y++) for (let x = 16; x < 48; x++) { const k = (y * 64 + x) * 3; r += st[k]; g += st[k + 1]; b += st[k + 2]; n++; }
  const key = keyColourFor([r / n, g / n, b / n]);
  const prompt = piecePrompt({ name: f.name, detail: f.detail, key });
  const img = await provider.generate(prompt, [{ data: src, mime: a.mime, name: "prop.png" }], sizeFor(f.radiusM * 2, f.heightM ?? 1), { firstFullSize: true });
  const raw = await sharp(img.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const tex = { data: raw.data, width: raw.info.width, height: raw.info.height };
  const cut = cutOut(tex);
  const plain = cut !== tex;
  const done = plain ? trimClear(despill(cut, key.rgb)) : tex;
  const png = await sharp(Buffer.from(done.data), { raw: { width: done.width, height: done.height, channels: 4 } }).png().toBuffer();
  const stored = storeAsset(db, { projectId: project.id, baseCode: cleanBaseCode(`${base}_PIECE_${f.name.split(/\s+/).slice(0, 3).join("")}`), kind: "set-piece", ext: "png", mime: "image/png", data: png, note: img.providerNote });
  const saved = { assetId: stored.id, assetCode: stored.assetCode };
  return plain ? saved : { ...saved, note: "GPT didn't keep the background plain, so it couldn't be cut out. Try again." };
}
