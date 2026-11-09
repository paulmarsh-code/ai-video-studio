// Generate an image through the configured provider (decision D15).
// Returns 501 when no provider is configured — the UI then offers manual upload only.

import fs from "node:fs";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cleanBaseCode, storeAsset } from "@/lib/assetStore";
import { getImageProvider } from "@/lib/providers/images";
import * as repo from "@/lib/repo";

export async function POST(req: Request) {
  const provider = getImageProvider();
  if (!provider) return NextResponse.json({ error: "No image provider is connected. Copy the prompt into ChatGPT and upload the image." }, { status: 501 });
  const body = (await req.json()) as { projectId?: string; baseCode?: string; kind?: string; prompt?: string; refAssetIds?: string[]; size?: "portrait" | "landscape" | "square" };
  if (!body.projectId || !body.baseCode || !body.prompt) return NextResponse.json({ error: "projectId, baseCode and prompt are required" }, { status: 400 });
  const db = await getDb();
  const refs = (body.refAssetIds ?? []).map((id) => repo.getAsset(db, id)).filter((a) => a && fs.existsSync(a.path))
    .map((a) => ({ data: fs.readFileSync(a!.path), mime: a!.mime, name: a!.assetCode }));
  try {
    const img = await provider.generate(body.prompt, refs, body.size ?? "portrait");
    const saved = storeAsset(db, {
      projectId: body.projectId, baseCode: cleanBaseCode(body.baseCode), kind: body.kind ?? "image", ext: "png", mime: img.mime, data: img.data, note: img.providerNote,
    });
    return NextResponse.json(saved);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[images/generate] ${body.baseCode} (${refs.length} reference pictures): ${error}`);
    return NextResponse.json({ error }, { status: 502 });
  }
}
