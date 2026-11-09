// Asset upload: dialogue audio, character and venue reference images, storyboard panels.
// Files are stored under ./data/assets/<project code>/ with a predictable asset code,
// e.g. POT_EP01_S01_C4a_AUDIO_v01.mp3 or POT_CHR_JADE_FRONT_v01.png.

import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { IMAGE_EXT, storeAsset } from "@/lib/assetStore";
import * as repo from "@/lib/repo";

const ALLOWED: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  ...IMAGE_EXT,
};
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const projectId = String(form.get("projectId") ?? "");
  const baseCode = String(form.get("baseCode") ?? "").replace(/[^A-Za-z0-9_]/g, "");
  const kind = String(form.get("kind") ?? "audio");
  if (!(file instanceof File) || !projectId || !baseCode) {
    return NextResponse.json({ error: "file, projectId and baseCode are required" }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: `Unsupported file type ${file.type || "(unknown)"}. Use PNG, JPG or WebP for images.` }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 25 MB" }, { status: 413 });

  const db = await getDb();
  if (!repo.getProject(db, projectId)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const saved = storeAsset(db, {
    projectId, baseCode, kind, ext, mime: file.type, data: Buffer.from(await file.arrayBuffer()), note: `Uploaded: ${file.name}`,
  });
  return NextResponse.json(saved);
}
