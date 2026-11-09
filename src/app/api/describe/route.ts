// Describe a picture or idea through the configured text/vision provider (D16).
// Returns 501 when none is configured: the UI then offers copy-and-paste with ChatGPT.

import fs from "node:fs";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getTextProvider } from "@/lib/providers/images";
import * as repo from "@/lib/repo";

export async function POST(req: Request) {
  const provider = getTextProvider();
  if (!provider) return NextResponse.json({ error: "No GPT connection is set up. Copy the prompt into ChatGPT and paste the reply." }, { status: 501 });
  const body = (await req.json()) as { prompt?: string; assetId?: string };
  if (!body.prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  let image: { data: Buffer; mime: string } | undefined; // one optional picture
  if (body.assetId) {
    const a = repo.getAsset(await getDb(), body.assetId);
    if (!a || !fs.existsSync(a.path)) return NextResponse.json({ error: "Picture not found" }, { status: 404 });
    image = { data: fs.readFileSync(a.path), mime: a.mime };
  }
  try {
    return NextResponse.json({ text: await provider.describe(body.prompt, image ? [image] : []) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
