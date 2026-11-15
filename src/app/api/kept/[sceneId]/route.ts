// Keep a finished take for some of a scene's panels (D130): the clip itself and the frame the next
// clip opens on, chosen on the clips page from the take as it plays.
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import * as studio from "@/lib/studioRepo";
import { cleanBaseCode, storeAsset } from "@/lib/assetStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  try {
    const db = await getDb();
    const s = repo.getScene(db, sceneId);
    if (!s) throw new Error("Scene not found.");
    const project = repo.getProject(db, s.scene.projectId)!;
    const form = await req.formData();
    const video = form.get("video"), frame = form.get("frame");
    const from = Number(form.get("from")), to = Number(form.get("to")), atSec = Number(form.get("atSec") ?? 0);
    if (!(video instanceof File) || !(frame instanceof File)) throw new Error("A clip and its chosen frame are both needed.");
    if (!(from >= 1 && to >= from)) throw new Error("Choose the panels the take covers.");
    const base = cleanBaseCode(`${project.code}_EP${String(s.scene.episode).padStart(2, "0")}_S${String(s.scene.number).padStart(2, "0")}_KEPT_P${from}-${to}`);
    const v = storeAsset(db, { projectId: project.id, baseCode: base, kind: "kept-take", ext: "mp4", mime: video.type || "video/mp4", data: Buffer.from(await video.arrayBuffer()), note: `Kept take for panels ${from}-${to}: ${video.name}` });
    const f = storeAsset(db, { projectId: project.id, baseCode: `${base}_FRAME`, kind: "kept-frame", ext: "png", mime: "image/png", data: Buffer.from(await frame.arrayBuffer()), note: `Frame at ${atSec.toFixed(2)} s of ${video.name}, for the next clip to open on` });
    studio.setKeptTake(db, sceneId, from, { from, to, videoAssetId: v.id, frameAssetId: f.id, atSec, name: video.name });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  const from = Number(new URL(req.url).searchParams.get("from"));
  const db = await getDb();
  studio.setKeptTake(db, sceneId, from, null);
  return NextResponse.json({ ok: true });
}
