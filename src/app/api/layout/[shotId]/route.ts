// The layout sketch for one shot as a PNG (D18f): attach it in ChatGPT on the by-hand route.

import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { renderLayoutForShot } from "@/lib/layoutImage";

export async function GET(_req: Request, { params }: { params: Promise<{ shotId: string }> }) {
  const { shotId } = await params;
  const png = await renderLayoutForShot(await getDb(), shotId);
  if (!png) return NextResponse.json({ error: "This panel has no camera yet." }, { status: 404 });
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": `inline; filename="layout_${shotId.slice(0, 8)}.png"`, "Cache-Control": "no-store" } });
}
