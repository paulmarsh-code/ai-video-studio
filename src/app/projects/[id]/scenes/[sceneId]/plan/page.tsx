import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { PlanEditorLoader } from "@/components/PlanEditorLoader";
import { planEditorProps } from "@/lib/planEditorData";
import { PositionsBox } from "@/components/ClipFrames";
import { buildSceneClips } from "@/lib/sceneClips";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string; sceneId: string }>; searchParams: Promise<{ panel?: string }> }) {
  const { id, sceneId } = await params;
  await searchParams;
  const db = await getDb();
  const d = await planEditorProps(db, sceneId);
  if (!d) notFound();
  const { planName, venueName, ...editor } = d;
  // One floor plan per scene (D165): where everyone starts, corrected in words; no cameras.
  const positions = buildSceneClips(db, sceneId)?.positions;
  return (
    <div>
      <p className="text-sm text-neutral-500">
        <Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>Project</Link> /{" "}
        <Link href={`/projects/${id}/scenes/${sceneId}`}>Scene</Link> /
      </p>
      <h1 className="text-2xl font-semibold">Floor plan: {planName}</h1>
      <p className="text-neutral-600">{venueName}.</p>
      <p className="mt-1 max-w-3xl text-sm text-neutral-600">Where everyone is as the scene starts. The app places them from the story; if something&apos;s wrong, say what in words below, then approve. Kling chooses the camera shots, so there are no cameras to set.</p>
      {positions && <div className="mt-3"><PositionsBox sceneId={sceneId} positions={positions} noThumb /></div>}
      {d.locks.positions && (
        <p className="my-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="plan-locked">
          The positions are approved and locked, so moves on the plan can&apos;t be saved. To change them, say what&apos;s wrong in the box above and save: that unlocks them.
        </p>
      )}
      <PlanEditorLoader key={d.version} {...editor} initialStep={0} positionsOnly />
    </div>
  );
}
