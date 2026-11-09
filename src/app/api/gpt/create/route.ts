// "Create with GPT" (D17): one request does the whole ChatGPT round trip.
//   1. The text model writes the labelled description (from the prompt, plus a picture if given).
//   2. The image model draws the one-image board from that description (plus reference images).
//   3. The board is stored as an asset; the browser cuts it and saves, exactly as for an upload.
// Returns 501 when no GPT link is set up.

import fs from "node:fs";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cleanBaseCode, storeAsset } from "@/lib/assetStore";
import { characterBoardPrompt, cleanReply, descriptionOnly, venueBoardPrompt, venueFillFromReply } from "@/lib/domain/describe";
import { getImageProvider, getTextProvider } from "@/lib/providers/images";
import * as repo from "@/lib/repo";

export const maxDuration = 300;

interface Body {
  projectId?: string;
  what?: "character" | "place";
  prompt?: string;
  baseCode?: string;
  /** Picture sent to the text model to describe (the first is used). */
  describeImageIds?: string[];
  /** Pictures the image model draws from (a consented real person, the place, or the current views when changing). */
  boardRefIds?: string[];
  /** Pictures the user added to illustrate a change ("clothes like this"); sent to both models, last. */
  references?: { for: string; assetId: string }[];
}

export async function POST(req: Request) {
  const text = getTextProvider();
  const image = getImageProvider();
  if (!text || !image) return NextResponse.json({ error: "No GPT link is set up. Use the ChatGPT steps instead." }, { status: 501 });
  const b = (await req.json()) as Body;
  if (!b.projectId || !b.prompt || !b.baseCode || !b.what) return NextResponse.json({ error: "projectId, what, prompt and baseCode are required" }, { status: 400 });
  const db = await getDb();
  const read = (ids: string[] = []) => ids.map((id) => repo.getAsset(db, id)).filter((a) => a && fs.existsSync(a.path))
    .map((a) => ({ data: fs.readFileSync(a!.path), mime: a!.mime, name: a!.assetCode }));

  let reply: string;
  try {
    // The current/source picture first, then any reference pictures, matching the prompt's order.
    const pics = [...read(b.describeImageIds).slice(0, 1), ...read((b.references ?? []).map((r) => r.assetId))];
    reply = cleanReply(await text.describe(descriptionOnly(b.prompt), pics));
  } catch (e) {
    return NextResponse.json({ error: `GPT couldn't write the description: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
  try {
    const views = b.what === "place" ? venueFillFromReply(reply).views.map((v) => v.name) : undefined;
    const refs = b.references ?? [];
    const boardPrompt = b.what === "character" ? characterBoardPrompt(reply, undefined, refs) : venueBoardPrompt(reply, views?.length === 4 ? views : undefined, undefined, refs);
    const img = await image.generate(boardPrompt, [...read(b.boardRefIds), ...read(refs.map((r) => r.assetId))], "landscape");
    const saved = storeAsset(db, {
      projectId: b.projectId, baseCode: `${cleanBaseCode(b.baseCode)}_GPTBOARD`, kind: "reference-sheet", ext: "png", mime: img.mime, data: img.data, note: img.providerNote,
    });
    return NextResponse.json({ reply, boardAssetId: saved.id });
  } catch (e) {
    // The description is still useful: return it so the user can finish by hand in ChatGPT.
    return NextResponse.json({ reply, error: `GPT wrote the description but couldn't draw the image board: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
