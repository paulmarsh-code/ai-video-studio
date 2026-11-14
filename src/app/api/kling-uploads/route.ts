// Upload the clips' storyboard pictures to Kling from this computer (D125). Claude puts a one-time
// ticket on each picture in data/kling_jobs.json (its own workspace can't reach kling.ai); the clips
// page calls this every few seconds while open, and each picture with a live ticket is sent.

import fs from "node:fs";
import { NextResponse } from "next/server";
import { readJobs, writeJobs } from "@/lib/klingJobs";

export const dynamic = "force-dynamic";

/** The first web address in Kling's reply, wherever it puts it. */
function firstUrl(x: unknown): string | undefined {
  if (typeof x === "string") return /^https?:\/\//.test(x) ? x : undefined;
  if (Array.isArray(x)) { for (const y of x) { const u = firstUrl(y); if (u) return u; } return undefined; }
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    for (const k of ["url", "fileUrl", "file_url", "data"]) { const u = firstUrl(o[k]); if (u) return u; }
    for (const v of Object.values(o)) { const u = firstUrl(v); if (u) return u; }
  }
  return undefined;
}

export async function POST() {
  const f = readJobs();
  let uploaded = 0, failed = 0, waiting = 0;
  for (const j of f.jobs) for (const p of j.pictures) {
    if (!p.upload || p.klingUrl) continue;
    if (p.upload.expireAt && p.upload.expireAt < Date.now()) { p.uploadError = "The upload ticket ran out: ask Claude to make the clip again."; delete p.upload; failed++; continue; }
    try {
      if (!fs.existsSync(p.path)) throw new Error(`The picture file isn't on this computer any more (${p.path}).`);
      const data = fs.readFileSync(p.path);
      const type = /\.jpe?g$/i.test(p.path) ? "image/jpeg" : "image/png";
      const form = new FormData();
      form.append("ticket", p.upload.ticket);
      form.append("file", new Blob([new Uint8Array(data)], { type }), p.path.split(/[\\/]/).pop() ?? "picture.png");
      const res = await fetch(p.upload.url, { method: "POST", body: form });
      const text = await res.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* plain text */ }
      const url = res.ok ? firstUrl(body) : undefined;
      if (!url) throw new Error(`Kling didn't take the picture (${res.status}): ${text.slice(0, 200)}`);
      p.klingUrl = url; delete p.upload; delete p.uploadError; uploaded++;
    } catch (e) {
      p.uploadError = e instanceof Error ? e.message : String(e); delete p.upload; failed++;
    }
  }
  for (const j of f.jobs) for (const p of j.pictures) if (p.upload && !p.klingUrl) waiting++;
  if (uploaded || failed) writeJobs(f);
  return NextResponse.json({ uploaded, failed, waiting });
}
