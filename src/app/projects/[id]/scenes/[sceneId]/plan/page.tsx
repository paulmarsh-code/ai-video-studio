import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { PlanEditorLoader } from "@/components/PlanEditorLoader";
import { planEditorProps } from "@/lib/planEditorData";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string; sceneId: string }>; searchParams: Promise<{ panel?: string }> }) {
  const { id, sceneId } = await params;
  const initialStep = Math.max(0, Number.parseInt((await searchParams).panel ?? "0", 10) || 0);
  const d = await planEditorProps(await getDb(), sceneId);
  if (!d) notFound();
  const { planName, venueName, ...editor } = d;
  return (
    <div>
      <p className="text-sm text-neutral-500">
        <Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>Project</Link> /{" "}
        <Link href={`/projects/${id}/scenes/${sceneId}`}>Scene</Link> /
      </p>
      <h1 className="text-2xl font-semibold">Floor plan: {planName}</h1>
      <p className="text-neutral-600">{venueName}.</p>
      {(d.locks.positions || d.locks.cameras) && (
        <p className="my-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="plan-locked">
          {d.locks.cameras ? "The positions and cameras are approved and locked." : "The positions are approved and locked."} Moves to the scene plan can&apos;t be saved.{" "}
          To change them, use <Link className="underline" href={`/projects/${id}/scenes/${sceneId}/storyboard`}>Change positions</Link> on the storyboard first; the cameras will then be chosen again and pictures from the old layout will need redrawing.
          {" "}To fix one picture, use &ldquo;Need to change something?&rdquo; on its panel instead.
        </p>
      )}
      <PlanEditorLoader key={d.version} {...editor} initialStep={initialStep} />
    </div>
  );
}
