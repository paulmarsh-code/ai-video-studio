import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import * as studio from "@/lib/studioRepo";
import { panelPrompt } from "@/lib/domain/imagePrompts";
import { getImageProvider } from "@/lib/providers/images";
import { setPanelImageAction } from "@/app/studioActions";
import { ImageSlot } from "@/components/ImageSlot";
import { PanelEditor } from "@/components/PanelEditor";

export const dynamic = "force-dynamic";

export default async function StoryboardPage({ params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params;
  const db = await getDb();
  const project = repo.getProject(db, id);
  const s = repo.getScene(db, sceneId);
  if (!project || !s || s.scene.projectId !== id) notFound();
  const cast = repo.getCast(db, id);
  const chars = studio.listCharacters(db, id);
  const profiles = studio.getApprovedProfiles(db, id);
  const brief = project.brief as { aspect?: string; style?: string };
  const genre = repo.getProjectGenre(db, id);
  const canGenerate = !!getImageProvider();
  const base = `${project.code}_EP${String(s.scene.episode).padStart(2, "0")}_S${String(s.scene.number).padStart(2, "0")}`;
  const recheck = repo.getAnimatic(db, sceneId)?.timeline.recheck ?? {};
  const pending = chars.filter((c) => c.draft);
  const missingRefs = chars.filter((c) => c.approved && !c.approved.profile.refs?.front && !c.approved.profile.refs?.face);
  const portrait = (brief.aspect ?? "9:16").startsWith("9");
  let n = s.panels.length + 1;
  while (s.panels.some((p) => p.code.toLowerCase() === `p${n}`)) n++;

  return (
    <div className="max-w-6xl">
      <p className="text-sm text-neutral-500">
        <Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>{project.name}</Link> / <Link href={`/projects/${id}/scenes/${sceneId}`}>Scene</Link> /
      </p>
      <h1 className="text-2xl font-semibold">Storyboard: {s.scene.title}</h1>
      <p className="mt-1 max-w-3xl text-neutral-600">
        One panel per clip. Write what happens and the exact line, then make the panel image in ChatGPT from the prompt and upload it.
        The prompt uses the approved characters, the venue and, once shots are designed, the camera framing from the floor plan.
      </p>

      <div className="mt-3 space-y-1 text-sm">
        {s.venue && <p>Venue: <Link className="text-blue-700 underline" href={`/projects/${id}/venues/${s.venue.id}`}>{s.venue.name}</Link> {s.venue.status !== "approved" && <span className="text-amber-700">(not approved yet)</span>}</p>}
        {pending.length > 0 && <p className="text-amber-700">Unapproved character changes: {pending.map((c) => c.name).join(", ")}. Prompts below use the last approved version. <Link className="underline" href={`/projects/${id}/characters`}>Review characters</Link></p>}
        {missingRefs.length > 0 && <p className="text-amber-700">No approved reference image yet for {missingRefs.map((c) => c.name).join(", ")}. Add one in <Link className="underline" href={`/projects/${id}/characters`}>Characters</Link> so ChatGPT keeps them consistent.</p>}
        <p className="text-neutral-600">Next: <Link className="text-blue-700 underline" href={`/projects/${id}/scenes/${sceneId}/design`}>Design shots</Link> · <Link className="text-blue-700 underline" href={`/projects/${id}/scenes/${sceneId}/animatic`}>Animatic</Link></p>
      </div>

      <ol className="mt-6 space-y-4">
        {s.panels.map((p, i) => {
          const shot = s.shots.find((x) => x.panelId === p.id);
          const d = p.dialogue[0];
          const prompt = panelPrompt({
            description: p.description, emotion: p.emotion, shot: shot?.spec, cast, profiles, plan: s.plan?.data,
            venueName: s.venue?.name ?? "venue", venueViews: s.venue?.views as { name: string; imageAssetId?: string }[] | undefined, aspect: brief.aspect, genre, style: brief.style,
          });
          return (
            <li key={p.id} className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-4 md:grid-cols-[1fr_16rem]" data-testid={`panel-${p.code}`}>
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-sm font-semibold">{i + 1}. {p.code}</span>
                  <span className={`rounded px-2 py-0.5 ${p.status === "approved" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{p.status} · v{p.version}</span>
                  {shot && <Link className="text-blue-700 underline" href={`/projects/${id}/shots/${shot.id}`}>Shot {shot.code}</Link>}
                  {shot && !shot.spec.cameraId && <span className="text-amber-700">no camera yet</span>}
                  {recheck[p.id] && <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Animatic re-check</span>}
                </div>
                <PanelEditor
                  key={`${p.id}-${p.version}-${p.order}-${p.status}-${!!p.imageAssetId}`}
                  sceneId={sceneId}
                  cast={cast.map((c) => ({ id: c.id, name: c.name }))}
                  first={i === 0}
                  last={i === s.panels.length - 1}
                  panel={{ id: p.id, code: p.code, description: p.description, emotion: p.emotion, speakerId: d?.characterId, line: d?.text, durationSec: p.durationSec, status: p.status, version: p.version, hasImage: !!p.imageAssetId }}
                />
              </div>
              <ImageSlot
                label="Panel image"
                projectId={id}
                baseCode={`${base}_${p.code}_PANEL`}
                kind="panel"
                assetId={p.imageAssetId ?? undefined}
                prompt={prompt.text}
                attach={prompt.attach}
                shape={portrait ? "portrait" : "landscape"}
                canGenerate={canGenerate}
                onAttach={setPanelImageAction.bind(null, p.id)}
              />
            </li>
          );
        })}
      </ol>

      <div className="mt-6 rounded-xl border border-dashed border-neutral-300 p-4">
        <h2 className="mb-2 font-semibold">Add a panel</h2>
        <PanelEditor key={`new-${n}`} sceneId={sceneId} cast={cast.map((c) => ({ id: c.id, name: c.name }))} suggestedCode={`P${n}`} />
      </div>
    </div>
  );
}
