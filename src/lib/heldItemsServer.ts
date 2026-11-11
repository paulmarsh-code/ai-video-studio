// Held items from reference pictures (D34). Which hand holds the bag, the phone or the drink
// is in each character's reference picture even when their description doesn't say. It is
// read once per approved front picture with the text model's vision, and kept: every
// blocking frame and picture prompt then marks it on the correct side.
//
// The model is only asked which side OF THE PICTURE each item is on (what it sees); the
// character's own left or right is worked out here, because a front picture is a mirror.

import fs from "node:fs";
import type { DB } from "@/db/client";
import { getTextProvider } from "./providers/images";
import * as repo from "./repo";
import * as studio from "./studioRepo";

export function heldItemsPrompt(name: string): string {
  return [
    `This is a reference picture of ${name}, standing and facing the camera.`,
    "Find everything they hold, carry or wear on ONE side of the body only: a bag in one hand or on one shoulder, a phone, a drink, a watch or bracelet on one wrist, an umbrella, a folder. Leave out things worn on both sides or in the middle.",
    "Do not use the words left and right. Instead give positions across the image as numbers: 0 is the image's left edge, 100 its right edge.",
    "For each item give: item_x, how far across the image the item is; and the person's face_x, how far across the image the middle of their face is.",
    'Reply with JSON only: {"face_x": 50, "items": [{"what": "short name, e.g. tan leather satchel", "item_x": 30, "where": "hand | shoulder | wrist | arm | hip"}]}',
  ].join("\n");
}

/**
 * Turn positions across the picture into the character's own side (D34). Left and right are
 * worked out here, never by the model: in a front picture, an item left of the face in the
 * image is in the person's RIGHT hand.
 */
export function parseHeldItems(reply: string): studio.HeldItem[] {
  try {
    const o = JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0] ?? "") as { face_x?: unknown; items?: { what?: unknown; item_x?: unknown; picture_side?: unknown; where?: unknown }[] };
    const face = Number(o.face_x);
    return (o.items ?? []).flatMap((x) => {
      const what = String(x.what ?? "").trim().toLowerCase();
      const where = String(x.where ?? "hand").toLowerCase();
      const ix = Number(x.item_x);
      let pictureSide: "left" | "right" | undefined;
      if (Number.isFinite(ix) && Number.isFinite(face) && Math.abs(ix - face) >= 3) pictureSide = ix < face ? "left" : "right";
      else if (/^(left|right)$/i.test(String(x.picture_side ?? ""))) pictureSide = String(x.picture_side).toLowerCase() as "left" | "right";
      if (!what || !pictureSide) return [];
      return [{ what, side: pictureSide === "left" ? "right" as const : "left" as const, where: /^(hand|shoulder|wrist|arm|hip)$/.test(where) ? where : "hand" }];
    });
  } catch { return []; }
}

/** Read held items for any character whose current front picture hasn't been read yet. */
export async function ensureHeldItems(db: DB, projectId: string): Promise<void> {
  const text = getTextProvider();
  if (!text) return;
  for (const c of studio.charactersNeedingHeldRead(db, projectId)) {
    const a = repo.getAsset(db, c.frontAssetId);
    if (!a || !fs.existsSync(a.path)) continue;
    try {
      const reply = await text.describe(heldItemsPrompt(c.name), [{ data: fs.readFileSync(a.path), mime: a.mime }]);
      studio.saveCharacterHeldItems(db, c.versionId, c.frontAssetId, parseHeldItems(reply));
    } catch (e) {
      console.error(`[held items] ${c.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
