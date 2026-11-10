// Check a panel picture against its approved layout (D19). 501 when no GPT link is set up.

import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { checkPanelPicture } from "@/lib/pictureCheckServer";
import { getTextProvider } from "@/lib/providers/images";

export const maxDuration = 120;

export async function POST(req: Request) {
  if (!getTextProvider()) return NextResponse.json({ error: "No GPT link is set up." }, { status: 501 });
  const b = (await req.json()) as { panelId?: string; assetId?: string };
  if (!b.panelId || !b.assetId) return NextResponse.json({ error: "panelId and assetId are required" }, { status: 400 });
  try {
    const r = await checkPanelPicture(await getDb(), b.panelId, b.assetId);
    if (!r) return NextResponse.json({ skipped: true });
    return NextResponse.json(r);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[images/check] ${b.panelId}: ${error}`);
    return NextResponse.json({ error }, { status: 502 });
  }
}
