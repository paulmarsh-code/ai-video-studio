import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function ScenePage({ params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params;
  const db = await getDb();
  const s = repo.getScene(db, sceneId);
  if (!s) notFound();
  const cast = repo.getCast(db, id);
  const name = (cid?: string) => cast.find((c) => c.id === cid)?.name ?? "—";

  return (
    <div className="max-w-5xl">
      <p className="text-sm text-neutral-500">
        <Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>Project</Link> /
      </p>
      <h1 className="text-2xl font-semibold">
        EP{String(s.scene.episode).padStart(2, "0")} S{String(s.scene.number).padStart(2, "0")}: {s.scene.title}
      </h1>
      <p className="text-sm text-neutral-600">{s.venue?.name}</p>
      {/* The scene's steps (D164–D165): no cameras or shot settings; Kling chooses the shots. */}
      <ol className="mt-3 flex flex-wrap gap-4 text-sm">
        <li><Link className="text-blue-700 underline" href={`/projects/${id}/scenes/${sceneId}/storyboard?story=1`}>1. The story</Link></li>
        <li><Link className="text-blue-700 underline" href={`/projects/${id}/scenes/${sceneId}/storyboard?part=setting`}>2. Scene and props</Link></li>
        <li><Link className="text-blue-700 underline" href={`/projects/${id}/scenes/${sceneId}/plan`}>3. Floor plan (who is where)</Link></li>
        <li><Link className="text-blue-700 underline" href={`/projects/${id}/scenes/${sceneId}/set`}>4. Build the set</Link></li>
        <li><Link className="font-semibold text-blue-700 underline" href={`/projects/${id}/scenes/${sceneId}/clips`}>5. Make the clips</Link></li>
      </ol>

      <h2 className="mt-6 text-lg font-semibold">What happens</h2>
      <p className="text-sm text-neutral-600">Change, add or delete a moment on <Link className="text-blue-700 underline" href={`/projects/${id}/scenes/${sceneId}/clips`}>Make the clips</Link>: click &quot;Change&quot; on it.</p>
      <ol className="mt-2 space-y-1 text-sm">
        {s.panels.slice().sort((a, b) => a.order - b.order).map((p) => {
          const shot = s.shots.find((x) => x.panelId === p.id);
          return (
            <li key={p.id} className="rounded border border-neutral-200 bg-white px-3 py-2">
              <span className="font-mono text-neutral-500">{p.order}.</span> {p.description}
              {shot?.spec.speakerId && shot.spec.dialogue ? <span className="text-neutral-700"> {name(shot.spec.speakerId)}: &ldquo;{shot.spec.dialogue}&rdquo;</span> : null}
              <span className="ml-1 text-neutral-500">· {shot?.spec.durationSec ?? p.durationSec}s</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
