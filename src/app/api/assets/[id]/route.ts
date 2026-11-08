import fs from "node:fs";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = repo.getAsset(await getDb(), id);
  if (!asset || !fs.existsSync(asset.path)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(fs.readFileSync(asset.path), {
    headers: { "Content-Type": asset.mime, "Content-Disposition": `inline; filename="${asset.assetCode}"` },
  });
}
