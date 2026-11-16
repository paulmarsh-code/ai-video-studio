// A character's voice sample (D146): a few seconds of them speaking (mp3, wav, m4a or a video
// with sound), sent with every clip they speak in, so Kling keeps their voice from clip to clip.

import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import * as studio from "@/lib/studioRepo";
import { cleanBaseCode, storeAsset } from "@/lib/assetStore";
import { elementKey } from "@/lib/domain/clips";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string; slug: string }> }) {
  try {
    const { projectId, slug } = await params;
    const db = await getDb();
    const project = repo.getProject(db, projectId);
    if (!project) throw new Error("Project not found");
    const who = repo.getCast(db, projectId).find((c) => c.id === slug);
    if (!who) throw new Error("That character wasn't found.");
    const file = (await req.formData()).get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Choose a sound or video file.");
    if (!/^(audio|video)\//.test(file.type) && !/\.(mp3|wav|m4a|mp4|mov)$/i.test(file.name)) throw new Error("That isn't a sound or video file.");
    const ext = (file.name.match(/\.(\w+)$/)?.[1] ?? "mp3").toLowerCase();
    const a = storeAsset(db, { projectId, baseCode: cleanBaseCode(`${project.code}_VOICE_${who.name.split(/\s+/)[0]}`), kind: "voice-sample", ext, mime: file.type || "audio/mpeg", data: Buffer.from(await file.arrayBuffer()), note: `Voice sample for ${who.name}: ${file.name}` });
    studio.setKlingElement(db, projectId, elementKey.voice(slug), { id: a.id, name: file.name });
    return NextResponse.json({ ok: true, assetId: a.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ projectId: string; slug: string }> }) {
  const { projectId, slug } = await params;
  studio.setKlingElement(await getDb(), projectId, elementKey.voice(slug), null);
  return NextResponse.json({ ok: true });
}
