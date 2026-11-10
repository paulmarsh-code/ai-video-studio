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
    "List everything they hold, carry or wear on ONE side of the body only: a bag in one hand or on one shoulder, a phone, a drink, a watch or bracelet on one wrist, an umbrella, a folder.",
    "For each, say which side OF THE PICTURE it is on, as you look at it (left or right of the image), and where on the body (hand, shoulder, wrist, arm or hip).",
    "Leave out things worn on both sides or in the middle (a necklace, a belt, both earrings).",
    'Reply with JSON only: {"items": [{"what": "short name, e.g. tan leather satchel", "picture_side": "left | right", "where": "hand | shoulder | wrist | arm | hip"}]}',
  ].join("\n");
}

/** Turn the model's picture sides into the character's own sides (a front view is a mirror). */
export function parseHeldItems(reply: string): studio.HeldItem[] {
  try {
    const o = JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0] ?? "") as { items?: { what?: unknown; picture_side?: unknown; where?: unknown }[] };
    return (o.items ?? []).flatMap((x) => {
      const what = String(x.what ?? "").trim().toLowerCase();
      const ps = String(x.picture_side ?? "").toLowerCase();
      const where = String(x.where ?? "hand").toLowerCase();
      if (!what || !/^(left|right)$/.test(ps)) return [];
      return [{ what, side: ps === "left" ? "right" as const : "left" as const, where: /^(hand|shoulder|wrist|arm|hip)$/.test(where) ? where : "hand" }];
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
