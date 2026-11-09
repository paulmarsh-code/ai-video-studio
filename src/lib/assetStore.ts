// Saves a file as a versioned asset with a predictable code, e.g. POT_CHR_JADE_FRONT_v02.png.
// Used by manual upload and by the (optional) GPT image provider, so both land the same way.

import fs from "node:fs";
import path from "node:path";
import type { DB } from "@/db/client";
import * as repo from "./repo";

export const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function cleanBaseCode(code: string): string {
  return code.replace(/[^A-Za-z0-9_]/g, "").toUpperCase();
}

export function storeAsset(
  db: DB,
  a: { projectId: string; baseCode: string; kind: string; ext: string; mime: string; data: Buffer; note: string },
) {
  const project = repo.getProject(db, a.projectId);
  if (!project) throw new Error("Project not found");
  const existing = repo.listAssets(db, a.projectId).filter((x) => x.assetCode.startsWith(`${a.baseCode}_v`)).length;
  const assetCode = `${a.baseCode}_v${String(existing + 1).padStart(2, "0")}.${a.ext}`;
  const dir = path.join(process.cwd(), "data", "assets", project.code);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, assetCode);
  fs.writeFileSync(filePath, a.data);
  const id = repo.insertAsset(db, { projectId: a.projectId, assetCode, kind: a.kind, path: filePath, mime: a.mime, sourceNote: a.note });
  return { id, assetCode };
}
