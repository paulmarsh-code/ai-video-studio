import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import { GENRE_PROFILES } from "@/lib/domain/genre";
import { AnimaticPlayer } from "@/components/AnimaticPlayer";

export const dynamic = "force-dynamic";

export default async function AnimaticPage({ params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params;
  const db = await getDb();
  const project = repo.getProject(db, id);
  const s = repo.getScene(db, sceneId);
  if (!project || !s) notFound();
  const anim = repo.getAnimatic(db, sceneId);
  const baseCode = `${project.code}_EP${String(s.scene.episode).padStart(2, "0")}_S${String(s.scene.number).padStart(2, "0")}`;
  return (
    <div>
      <p className="text-sm text-neutral-500">
        <Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>Project</Link> /{" "}
        <Link href={`/projects/${id}/scenes/${sceneId}`}>Scene</Link> /
      </p>
      <h1 className="text-2xl font-semibold">Animatic: {s.scene.title}</h1>
      <p className="text-neutral-600">Watch the scene as a timed storyboard before spending any video credits.</p>
      <AnimaticPlayer
        projectId={id}
        sceneId={sceneId}
        baseCode={baseCode}
        panels={s.panels}
        cast={repo.getCast(db, id)}
        initial={anim?.timeline ?? { lineAudio: {}, durations: {} }}
        version={anim?.version ?? 0}
        postGapSec={GENRE_PROFILES[repo.getProjectGenre(db, id)].postGapSec}
      />
    </div>
  );
}
