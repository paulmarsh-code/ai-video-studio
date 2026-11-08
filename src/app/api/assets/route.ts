// Asset upload (Release 1: dialogue audio per line). Files are stored under ./data/assets
// with a predictable asset code, e.g. POT_EP01_S01_C4a_AUDIO_v01.mp3.

import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
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
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
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
  if (!ext) return NextResponse.json({ error: `Unsupported file type ${file.type || "(unknown)"}` }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 25 MB" }, { status: 413 });

  const db = getDb();
  const project = repo.getProject(db, projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const existing = repo.listAssets(db, projectId).filter((a) => a.assetCode.startsWith(`${baseCode}_v`)).length;
  const assetCode = `${baseCode}_v${String(existing + 1).padStart(2, "0")}.${ext}`;
  const dir = path.join(process.cwd(), "data", "assets", project.code);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, assetCode);
  fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));
  const id = repo.insertAsset(db, { projectId, assetCode, kind, path: filePath, mime: file.type, sourceNote: `Uploaded: ${file.name}` });
  return NextResponse.json({ id, assetCode });
}
