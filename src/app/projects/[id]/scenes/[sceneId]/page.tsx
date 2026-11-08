import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { validateShot } from "@/lib/domain/validator";
import * as repo from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function ScenePage({ params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params;
  const db = getDb();
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
      <div className="mt-3 flex gap-4 text-sm">
        <Link className="text-blue-700 underline" href={`/projects/${id}/scenes/${sceneId}/plan`}>Floor plan</Link>
        <Link className="text-blue-700 underline" href={`/projects/${id}/scenes/${sceneId}/animatic`}>Animatic</Link>
      </div>

      <h2 className="mt-6 text-lg font-semibold">Shots</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-neutral-600">
              <th className="py-2 pr-3">Shot</th>
              <th className="pr-3">Speaker</th>
              <th className="pr-3">Line</th>
              <th className="pr-3">Camera</th>
              <th className="pr-3">Duration</th>
              <th className="pr-3">Checks</th>
            </tr>
          </thead>
          <tbody>
            {s.shots.map((shot) => {
              const f = validateShot(shot.spec, cast, s.plan?.data);
              const errors = f.filter((x) => x.severity === "error").length;
              const warnings = f.filter((x) => x.severity === "warning").length;
              return (
                <tr key={shot.id} className="border-b border-neutral-200 bg-white">
                  <td className="py-2 pr-3">
                    <Link className="font-mono text-blue-700 underline" href={`/projects/${id}/shots/${shot.id}`}>{shot.code}</Link>
                  </td>
                  <td className="pr-3">{shot.spec.speakerId ? name(shot.spec.speakerId) : <span className="text-neutral-500">silent</span>}</td>
                  <td className="pr-3">{shot.spec.dialogue ?? ""}</td>
                  <td className="pr-3">{s.plan?.data.cameras.find((c) => c.id === shot.spec.cameraId)?.name ?? "—"}</td>
                  <td className="pr-3">{shot.spec.durationSec}s</td>
                  <td className="pr-3">
                    {errors > 0 && <span className="mr-2 rounded bg-red-100 px-2 py-0.5 text-red-800">{errors} error</span>}
                    {warnings > 0 && <span className="mr-2 rounded bg-amber-100 px-2 py-0.5 text-amber-800">{warnings} warning</span>}
                    {errors + warnings === 0 && <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">ready</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
