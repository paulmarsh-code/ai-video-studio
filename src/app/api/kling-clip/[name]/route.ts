// A finished clip saved on this computer (D126), from data/clips/.
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = path.basename(decodeURIComponent((await params).name));
  if (!/\.mp4$/i.test(name)) return NextResponse.json({ error: "Not a clip." }, { status: 400 });
  const f = path.join(process.cwd(), "data", "clips", name);
  if (!fs.existsSync(f)) return NextResponse.json({ error: "That clip isn't saved on this computer." }, { status: 404 });
  return new NextResponse(new Uint8Array(fs.readFileSync(f)), { headers: { "content-type": "video/mp4", "content-disposition": `inline; filename="${name}"` } });
}
