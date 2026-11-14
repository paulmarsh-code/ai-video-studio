// The fixed set (D98). GET ?pos=<n>: the 360° around camera position n with its shots' slices
// marked; GET ?shot=<id>: what that shot's camera sees of the set. POST makes one of the set's
// own pictures with GPT ({ kind: "wall", view } | { kind: "floor" } | { kind: "piece", furnitureId }).

import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getImageProvider } from "@/lib/providers/images";
import { cameraPositions, positionPreview, sceneSetCached, setView } from "@/lib/setImage";
import { makeSetPicture, type SetPictureKind } from "@/lib/setPictures";
import sharp from "sharp";

const none = () => NextResponse.json({ error: "No set yet: the venue needs view pictures and the scene a floor plan." }, { status: 404 });

export async function GET(req: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  const q = new URL(req.url).searchParams;
  const db = await getDb();
  const b = await sceneSetCached(db, sceneId);
  if (!b) return none();
  const positions = cameraPositions(db, sceneId, b.plan);
  let img: Buffer | null = null;
  if (q.get("pos")) {
    const pos = positions[Number(q.get("pos"))];
    if (pos) img = await positionPreview(b.set, b.plan, pos);
  } else if (q.get("shot")) {
    const shot = positions.flatMap((p) => p.shots).find((x) => x.shotId === q.get("shot"));
    if (shot) {
      const portrait = (b.plan.aspect ?? "9:16") === "9:16";
      img = await sharp(await setView(b.set, shot.plan, shot.cam, portrait ? 512 : 768, portrait ? 768 : 512, 1)).jpeg({ quality: 85 }).toBuffer();
    }
  }
  if (!img) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(img), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  const provider = getImageProvider();
  if (!provider) return NextResponse.json({ error: "No image provider is connected, so the set's pictures can't be made here." }, { status: 501 });
  const what = (await req.json()) as SetPictureKind;
  const db = await getDb();
  try {
    return NextResponse.json(await makeSetPicture(db, sceneId, what, provider));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[set] ${sceneId} ${JSON.stringify(what)}: ${error}`);
    return NextResponse.json({ error }, { status: 502 });
  }
}
