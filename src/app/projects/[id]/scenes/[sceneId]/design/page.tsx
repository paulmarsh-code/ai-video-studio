import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { designScene } from "@/lib/domain/director";
import { GENRE_PROFILES } from "@/lib/domain/genre";
import * as repo from "@/lib/repo";
import { DesignBoard } from "@/components/DesignBoard";

export const dynamic = "force-dynamic";

export default async function DesignPage({ params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params;
  const db = await getDb();
  const s = repo.getScene(db, sceneId);
  if (!s || !s.plan) notFound();
  const cast = repo.getCast(db, id);
  const name = (cid: string) => cast.find((c) => c.id === cid)?.name ?? cid;
  const inputs = s.shots.map((sh) => ({
    id: sh.id,
    code: sh.code,
    spec: sh.spec,
    description: s.panels.find((p) => p.id === sh.panelId)?.description,
  }));
  const genre = repo.getProjectGenre(db, id);
  const design = designScene(s.plan.data, inputs, name, genre);
  return (
    <div className="max-w-6xl">
      <p className="text-sm text-neutral-500">
        <Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>Project</Link> /{" "}
        <Link href={`/projects/${id}/scenes/${sceneId}`}>Scene</Link> /
      </p>
      <h1 className="text-2xl font-semibold">Design shots</h1>
      <p className="mt-1 max-w-3xl text-neutral-600">
        The app has chosen a camera for every shot from the approved storyboard and blocking, using established film grammar
        (180° rule, shot/reverse shot, close-ups for emotional peaks, clear sightlines, consistent screen sides and backgrounds).
        Pick a different option for any shot, then apply. You can still fine-tune on the floor plan, which will warn you if a change makes a shot worse.
      </p>
      <p className="mt-1 text-sm text-neutral-500">
        Genre: <strong>{GENRE_PROFILES[genre].label}</strong> ({GENRE_PROFILES[genre].summary}) Change it on the project page. Rules and sources: docs/CINEMA_RULES.md. Uses the people and furniture from floor plan v{s.plan.version}.
      </p>
      <DesignBoard projectId={id} sceneId={sceneId} plan={s.plan.data} cast={cast} design={design} shots={inputs} />
    </div>
  );
}
