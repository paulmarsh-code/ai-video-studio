import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import { ClipsBoard } from "@/components/ClipsBoard";
import { buildSceneClips } from "@/lib/sceneClips";
import { readJobs } from "@/lib/klingJobs";
import { elementSources, linkMadeElements, readElementRequests } from "@/lib/klingElementRequests";

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
  // Elements Claude has made from the app's pictures link themselves, once (D127).
  linkMadeElements(db, s.scene.projectId);
  const v = buildSceneClips(db, sceneId);
  if (!v) return <div className="max-w-5xl">{crumbs}<h1 className="text-2xl font-semibold">Make the clips</h1><p className="mt-2 text-neutral-600">This scene needs a venue and a floor plan first.</p></div>;
  const jobs = readJobs().jobs.filter((j) => j.sceneId === sceneId);
  const sources = elementSources(db, sceneId);
  const asks = readElementRequests().requests.filter((r) => r.projectId === s.scene.projectId);
  const making = Object.fromEntries(sources.map((x) => {
    const r = asks.find((a) => a.key === x.key);
    return [x.key, { pictures: x.pictures.length, status: r?.status, error: r?.error }];
  }));

  return (
    <div className="max-w-6xl">
      {crumbs}
      <h1 className="text-2xl font-semibold">Make the clips</h1>
      <p className="mt-1 max-w-3xl text-neutral-600">
        Kling keeps the clips consistent with Elements: each character, the venue and each key prop, the same in every clip. Each shot is staged from its storyboard picture.
        Here the panels are grouped into clips of up to two camera angles, and each clip&apos;s request is written from the plan. Pick the Elements and pictures, then create the clips.
      </p>
      <ClipsBoard projectId={s.scene.projectId} sceneId={sceneId} rows={v.rows} clips={v.clips} list={v.listed} pictures={v.pictures} jobs={jobs} making={making} />
    </div>
  );
}
