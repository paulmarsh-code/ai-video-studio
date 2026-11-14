import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import * as studio from "@/lib/studioRepo";
import { elementKey, sceneClips, type ClipPanel } from "@/lib/domain/clips";
import { isSetPiece } from "@/lib/domain/setRender";
import { withPiecePictures } from "@/lib/setImage";
import { ClipsBoard } from "@/components/ClipsBoard";
import { klingElementList } from "@/lib/klingList";

export const dynamic = "force-dynamic";

export default async function ClipsPage({ params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params;
  const db = await getDb();
  const s = repo.getScene(db, sceneId);
  if (!s) notFound();
  const crumbs = (
    <p className="text-sm text-neutral-500">
      <Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>Project</Link> / <Link href={`/projects/${id}/scenes/${sceneId}`}>Scene</Link> /
    </p>
  );
  if (!s.venue || !s.plan) return <div className="max-w-5xl">{crumbs}<h1 className="text-2xl font-semibold">Make the clips</h1><p className="mt-2 text-neutral-600">This scene needs a venue and a floor plan first.</p></div>;
  const cast = repo.getCast(db, s.scene.projectId);
  const plan = withPiecePictures(db, sceneId, s.plan.data);
  // A name typed before the list came in is matched to its Element in the list, ignoring case (D114).
  const listed = klingElementList();
  const elements = Object.fromEntries(Object.entries(studio.getKlingElements(db, s.scene.projectId)).map(([k, e]) => {
    const hit = listed.elements.find((x) => x.id === e.id) ?? listed.elements.find((x) => x.name.trim().toLowerCase() === e.name.trim().toLowerCase());
    return [k, hit ? { id: hit.id, name: hit.name } : e];
  }));
  const panels: ClipPanel[] = [...s.panels].sort((a, b) => a.order - b.order).flatMap((p) => {
    const shot = s.shots.find((x) => x.panelId === p.id);
    return shot ? [{ order: p.order, durationSec: p.durationSec, description: p.description, emotion: p.emotion, dialogue: (p.dialogue ?? []) as ClipPanel["dialogue"], spec: shot.spec, imageAssetId: p.imageAssetId ?? undefined }] : [];
  });
  const crowd = (s.scene.staging as { crowd?: string } | null)?.crowd;
  const clips = sceneClips({ panels, cast, plan, venue: { id: s.venue.id, name: s.venue.name }, crowd, elements });
  const held = [...new Set(panels.flatMap((p) => (p.spec.props ?? []).map((x) => x.name)))];
  const pieces = (plan.furniture ?? []).filter(isSetPiece).map((f) => f.name);
  const rows = [
    ...cast.map((c) => ({ key: elementKey.character(c.id), what: c.name, kind: "Character" })),
    { key: elementKey.venue(s.venue.id), what: s.venue.name, kind: "Venue" },
    ...[...new Set([...pieces, ...held])].map((n) => ({ key: elementKey.prop(n), what: n, kind: "Prop" })),
  ].map((r) => ({ ...r, element: elements[r.key] }));

  return (
    <div className="max-w-6xl">
      {crumbs}
      <h1 className="text-2xl font-semibold">Make the clips</h1>
      <p className="mt-1 max-w-3xl text-neutral-600">
        Kling keeps the clips consistent with Elements: each character, the venue and each key prop made once in Kling, the same in every clip. Here the scene&apos;s panels are
        grouped into multi-shot clips, and each clip&apos;s request is written from the plan: who stands where, each shot with its time and size, what happens, the one
        speaker&apos;s exact line, and the voices.
      </p>
      <ClipsBoard projectId={s.scene.projectId} rows={rows} clips={clips} list={listed} />
    </div>
  );
}
