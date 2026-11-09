import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import { PlanEditorLoader } from "@/components/PlanEditorLoader";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params;
  const db = await getDb();
  const s = repo.getScene(db, sceneId);
  if (!s || !s.plan) notFound();
  const cast = repo.getCast(db, id);
  const approved = repo.shotsWithApprovedTakes(db, sceneId);
  return (
    <div>
      <p className="text-sm text-neutral-500">
        <Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>Project</Link> /{" "}
        <Link href={`/projects/${id}/scenes/${sceneId}`}>Scene</Link> /
      </p>
      <h1 className="text-2xl font-semibold">Floor plan: {s.plan.name}</h1>
      <p className="text-neutral-600">{s.venue?.name}. Lock positions here before writing prompts.</p>
      <PlanEditorLoader
        sceneId={sceneId}
        initial={s.plan.data}
        version={s.plan.version}
        cast={cast}
        shots={s.shots.map((sh) => ({ id: sh.id, code: sh.code, spec: sh.spec, approved: approved.has(sh.id) }))}
      />
    </div>
  );
}
