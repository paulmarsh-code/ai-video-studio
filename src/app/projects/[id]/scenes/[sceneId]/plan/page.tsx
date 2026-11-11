import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import { PlanEditorLoader } from "@/components/PlanEditorLoader";
import { sceneLocks } from "@/lib/studioRepo";
import { ringForScene } from "@/lib/backgroundImage";
import { startPose } from "@/lib/domain/panelWords";
import { asStaging } from "@/lib/domain/story";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string; sceneId: string }>; searchParams: Promise<{ panel?: string }> }) {
  const { id, sceneId } = await params;
  const initialStep = Math.max(0, Number.parseInt((await searchParams).panel ?? "0", 10) || 0);
  const db = await getDb();
  const s = repo.getScene(db, sceneId);
  if (!s || !s.plan) notFound();
  const cast = repo.getCast(db, id);
  const approved = repo.shotsWithApprovedTakes(db, sceneId);
  const locks = sceneLocks(db, sceneId);
  const r = await ringForScene(db, sceneId);
  const ring = r ? { url: `/api/venue-ring/${sceneId}`, startDeg: r.startDeg, width: r.width, height: r.height, pxPerDeg: r.pxPerDeg, previewHeight: 300 } : undefined;
  return (
    <div>
      <p className="text-sm text-neutral-500">
        <Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>Project</Link> /{" "}
        <Link href={`/projects/${id}/scenes/${sceneId}`}>Scene</Link> /
      </p>
      <h1 className="text-2xl font-semibold">Floor plan: {s.plan.name}</h1>
      <p className="text-neutral-600">{s.venue?.name}.</p>
      {(locks.positions || locks.cameras) && (
        <p className="my-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="plan-locked">
          {locks.cameras ? "The positions and cameras are approved and locked." : "The positions are approved and locked."} Moves to the scene plan can&apos;t be saved.{" "}
          To change them, use <Link className="underline" href={`/projects/${id}/scenes/${sceneId}/storyboard`}>Change positions</Link> on the storyboard first; the cameras will then be chosen again and pictures from the old layout will need redrawing.
          {!locks.cameras && <> You can still move people and props for single panels: step to a panel with the arrows above the plan.</>}
        </p>
      )}
      <PlanEditorLoader
        key={s.plan.version}
        sceneId={sceneId}
        initial={s.plan.data}
        version={s.plan.version}
        cast={cast}
        shots={s.shots.map((sh) => ({ id: sh.id, code: sh.code, spec: sh.spec, approved: approved.has(sh.id) }))}
        ring={ring}
        roomHref={s.scene.venueId ? `/projects/${id}/venues/${s.scene.venueId}` : undefined}
        panels={s.panels.flatMap((p) => { const sh = s.shots.find((x) => x.panelId === p.id); return sh ? [{ shotId: sh.id, code: p.code, description: p.description }] : []; })}
        initialStep={initialStep}
        locks={{ positions: !!locks.positions, cameras: !!locks.cameras }}
        scenePose={startPose(asStaging(s.scene.staging).spot, s.plan.data)}
      />
    </div>
  );
}
