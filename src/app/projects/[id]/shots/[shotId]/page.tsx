import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import { ShotDirector } from "@/components/ShotDirector";

export const dynamic = "force-dynamic";

export default async function ShotPage({ params }: { params: Promise<{ id: string; shotId: string }> }) {
  const { id, shotId } = await params;
  const db = getDb();
  const shot = repo.getShot(db, shotId);
  if (!shot) notFound();
  const cast = repo.getCast(db, id);
  const s = repo.getScene(db, shot.sceneId)!;
  const panel = s.panels.find((p) => p.id === shot.panelId);
  const versions = repo.listPromptVersions(db, shotId).map((v) => ({ version: v.version, createdAt: v.createdAt }));

  return (
    <div className="max-w-6xl">
      <p className="text-sm text-neutral-500">
        <Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>Project</Link> /{" "}
        <Link href={`/projects/${id}/scenes/${shot.sceneId}`}>Scene</Link> /
      </p>
      <h1 className="text-2xl font-semibold">Shot Director: <span className="font-mono">{shot.code}</span></h1>
      {panel && <p className="mt-1 text-neutral-600">Storyboard {panel.code}: {panel.description}</p>}
      <ShotDirector
        projectId={id}
        shotId={shotId}
        initial={shot.spec}
        cast={cast}
        plan={s.plan?.data}
        promptVersions={versions}
      />
    </div>
  );
}
