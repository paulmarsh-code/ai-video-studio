// The background a shot's camera sees, cut from the venue's 360° ring (D20), as a PNG.

import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { renderBackgroundForShot } from "@/lib/backgroundImage";

export async function GET(_req: Request, { params }: { params: Promise<{ shotId: string }> }) {
  const { shotId } = await params;
  const png = await renderBackgroundForShot(await getDb(), shotId);
  if (!png) return NextResponse.json({ error: "No camera yet, or the venue has fewer than two view pictures." }, { status: 404 });
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": `inline; filename="background_${shotId.slice(0, 8)}.png"`, "Cache-Control": "no-store" } });
}
