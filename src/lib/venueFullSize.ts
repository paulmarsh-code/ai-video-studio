// Full-size venue views (D67). A venue's four views come as quarters of one GPT picture, about
// 768 × 510 pixels each, and every camera's background is cut from them: a medium shot used
// about 300 pixels of one, stretched to fill the frame. Each small view is redrawn once at full
// size (1,536 × 1,024), checked that it's still the same place, and put back for the user to
// approve on the venue page. About 7p a view, once per venue.

import fs from "node:fs";
import sharp from "sharp";
import type { DB } from "@/db/client";
import { storeAsset } from "./assetStore";
import { SAME_PLACE, viewFullSizePrompt } from "./domain/plate";
import { samePlace } from "./plateImage";
import { imageSettings, SIZES, type ImageProvider } from "./providers/images";
import { recordDraw, testMode } from "./testRecords";
import * as repo from "./repo";
import * as studio from "./studioRepo";

/** Narrower than this, a view is small: a quarter of a sheet. */
export const FULL_WIDTH = 1200;

export type ViewResult = { name: string; result: "made" | "kept" | "already" | "no picture"; match?: number };

/** How many of a venue's view pictures are small. */
export async function smallViews(db: DB, venueId: string): Promise<number> {
  const v = studio.getVenue(db, venueId);
  let n = 0;
  for (const view of v?.views ?? []) {
    const a = view.imageAssetId ? repo.getAsset(db, view.imageAssetId) : undefined;
    if (!a || !fs.existsSync(a.path)) continue;
    const w = (await sharp(a.path).metadata()).width ?? 0;
    if (w < FULL_WIDTH) n++;
  }
  return n;
}

/** Redraw each small view at full size; one more try if GPT changes the place, else keep it as it was. */
export async function fullSizeViews(db: DB, venueId: string, provider: ImageProvider): Promise<ViewResult[]> {
  const venue = studio.getVenue(db, venueId);
  if (!venue) throw new Error("Venue not found");
  const jobs = venue.views.map(async (view): Promise<ViewResult & { save?: { data: Buffer; baseCode: string; projectId: string; note: string } }> => {
    const a = view.imageAssetId ? repo.getAsset(db, view.imageAssetId) : undefined;
    if (!a || !fs.existsSync(a.path)) return { name: view.name, result: "no picture" };
    const original = fs.readFileSync(a.path);
    if (((await sharp(original).metadata()).width ?? 0) >= FULL_WIDTH) return { name: view.name, result: "already" };
    const prompt = viewFullSizePrompt({ venueName: venue.name, viewName: view.name });
    let match = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const img = await provider.generate(prompt, [{ data: original, mime: a.mime, name: `${view.name}.png` }], "landscape", { firstFullSize: true });
      match = await samePlace(original, img.data);
      if (testMode()) {
        const s = imageSettings();
        recordDraw({
          panelCode: "VIEW", kind: "view", variant: "full-size", prompt, inputs: [{ name: `${view.name}.png`, data: original, mime: a.mime }],
          model: s.model, quality: s.quality, size: SIZES.landscape, endpoint: "images/edits",
          output: { assetId: `view-${view.name}-${attempt}`, data: img.data, note: img.providerNote },
          extras: [{ name: "view.json", data: JSON.stringify({ view: view.name, attempt, samePlace: match, used: match >= SAME_PLACE, needs: SAME_PLACE }, null, 2) }],
        });
      }
      if (match >= SAME_PLACE) {
        return { name: view.name, result: "made", match, save: { data: img.data, baseCode: a.assetCode.replace(/_v\d+\.\w+$/, ""), projectId: a.projectId, note: `${img.providerNote}; full size of ${a.assetCode}` } };
      }
    }
    return { name: view.name, result: "kept", match };
  });
  const done = await Promise.all(jobs);
  for (const d of done) {
    if (!d.save) continue;
    const stored = storeAsset(db, { projectId: d.save.projectId, baseCode: d.save.baseCode, kind: "venue-ref", ext: "png", mime: "image/png", data: d.save.data, note: d.save.note });
    studio.setVenueViewImage(db, venueId, d.name, stored.id);
  }
  return done.map(({ save: _save, ...r }) => r);
}
