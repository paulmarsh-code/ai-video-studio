import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import { isSetPiece, wallForDirection } from "@/lib/domain/setRender";
import { setPicturesOf } from "@/lib/domain/setPictures";
import { cameraPositions, withPiecePictures } from "@/lib/setImage";
import { getImageProvider } from "@/lib/providers/images";
import { SetBuilder } from "@/components/SetBuilder";

export const dynamic = "force-dynamic";

const SIDE = { minX: "left", maxX: "right", minY: "near", maxY: "far" } as const;

export default async function SetPage({ params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params;
  const db = await getDb();
  const s = repo.getScene(db, sceneId);
  if (!s) notFound();
  const crumbs = (
    <p className="text-sm text-neutral-500">
      <Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>Project</Link> / <Link href={`/projects/${id}/scenes/${sceneId}`}>Scene</Link> /
    </p>
  );
  if (!s.venue || !s.plan) {
    return <div className="max-w-5xl">{crumbs}<h1 className="text-2xl font-semibold">Build the set</h1><p className="mt-2 text-neutral-600">This scene needs a venue and a floor plan first.</p></div>;
  }
  const plan = withPiecePictures(db, sceneId, s.plan.data);
  const own = setPicturesOf(s.venue.setPictures);
  const views = ((s.venue.views ?? []) as { name: string; imageAssetId?: string }[]).filter((v) => v.imageAssetId).map((v) => {
    const dir = plan.views.find((x) => x.name === v.name)?.directionDeg;
    return { name: v.name, wall: dir === undefined ? undefined : SIDE[wallForDirection(dir)], viewAssetId: v.imageAssetId!, ownAssetId: own.walls?.[v.name] };
  });
  const pieces = (plan.furniture ?? []).filter(isSetPiece).map((f) => ({ id: f.id, name: f.name, propAssetId: f.imageAssetId, ownAssetId: f.imageAssetId ? own.pieces?.[f.imageAssetId] : undefined }));
  const positions = cameraPositions(db, sceneId, plan).map((p) => ({ shots: p.shots.map((x) => ({ shotId: x.shotId, code: x.code, camera: x.camera })) }));
  const outdoors = s.venue.setting === "exterior";

  return (
    <div className="max-w-6xl">
      {crumbs}
      <h1 className="text-2xl font-semibold">Build the set</h1>
      <p className="mt-1 max-w-3xl text-neutral-600">
        The set is {s.venue.name} built once, like a video game level, from floor plan v{s.plan.version}: the walls{outdoors ? " (the scenery all round)" : ""}, the floor and the
        set pieces standing at their places. Every camera position gets a 360° view of it, and each shot takes its slice, so shots from the same place show exactly the same background.
      </p>
      <p className="mt-1 max-w-3xl text-sm text-neutral-500">
        Until a wall, the floor or a set piece has its own picture, the set uses part of a venue view, which is why walls can look like a painted mural. Make each one once
        (one GPT picture, about 7p), check it, and use it. Nothing here changes your storyboard pictures or floor plan.
      </p>
      <SetBuilder sceneId={sceneId} venueId={s.venue.id} canMake={!!getImageProvider()} outdoors={outdoors} views={views} floorAssetId={own.floor} pieces={pieces} positions={positions} />
    </div>
  );
}
