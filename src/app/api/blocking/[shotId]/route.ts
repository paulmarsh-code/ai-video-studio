// The blocking frame for a shot (D34): the 360° background this camera sees, with labelled
// stand-ins, props, walking arrows and held-item tags. GPT finishes this picture; on the
// by-hand route it is downloaded and attached first in ChatGPT.

import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { renderBlockingForShot } from "@/lib/blockingImage";
import { ensureHeldItems } from "@/lib/heldItemsServer";
import * as repo from "@/lib/repo";

export async function GET(_req: Request, { params }: { params: Promise<{ shotId: string }> }) {
  const { shotId } = await params;
  const db = await getDb();
  const shot = repo.getShot(db, shotId);
  const scene = shot ? repo.getScene(db, shot.sceneId) : undefined;
  if (scene) await ensureHeldItems(db, scene.scene.projectId);
  const png = await renderBlockingForShot(db, shotId);
  if (!png) return NextResponse.json({ error: "No blocking frame for this shot: it needs a camera and the venue's 360° view." }, { status: 404 });
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
}
