// The scene's venue as a 360° ring (D21), small, for the live camera preview. ?meta=1 returns
// where the ring starts and how many pixels a degree is, so the browser can cut any slice.

import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { ringForScene, ringPreview } from "@/lib/backgroundImage";

export async function GET(req: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  const db = await getDb();
  if (new URL(req.url).searchParams.get("meta")) {
    const ring = await ringForScene(db, sceneId);
    if (!ring) return NextResponse.json({ error: "The venue needs two or more view pictures." }, { status: 404 });
    return NextResponse.json({ startDeg: ring.startDeg, width: ring.width, height: ring.height, pxPerDeg: ring.pxPerDeg });
  }
  const jpg = await ringPreview(db, sceneId);
  if (!jpg) return NextResponse.json({ error: "The venue needs two or more view pictures." }, { status: 404 });
  return new NextResponse(new Uint8Array(jpg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
}
