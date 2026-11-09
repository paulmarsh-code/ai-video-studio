import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import * as studio from "@/lib/studioRepo";
import { panelPrompt } from "@/lib/domain/imagePrompts";
import { getImageProvider, getTextProvider } from "@/lib/providers/images";
import { GENRE_PROFILES } from "@/lib/domain/genre";
import { StoryWizard } from "@/components/StoryWizard";
import { exampleFor } from "@/lib/domain/storyExamples";
import { StoryboardBoard } from "@/components/StoryboardBoard";
import { SceneSettingCard } from "@/components/SceneSettingCard";
import { asStaging, stagingPrompt } from "@/lib/domain/story";
import { PanelEditor } from "@/components/PanelEditor";

export const dynamic = "force-dynamic";

export default async function StoryboardPage({ params, searchParams }: { params: Promise<{ id: string; sceneId: string }>; searchParams: Promise<{ story?: string }> }) {
  const { id, sceneId } = await params;
  const sp = await searchParams;
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
  const castIds = studio.sceneCastIds(db, s.scene);
  const anyApproved = s.panels.some((p) => p.status === "approved");
  const telling = !anyApproved && (s.panels.length === 0 || sp.story === "1");
  const total = s.panels.reduce((sum, p) => sum + p.durationSec, 0);
  const crumbs = (
    <nav className="text-sm text-neutral-500" aria-label="Breadcrumb">
      <Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>{project.name}</Link> / <span className="text-neutral-800">Scene {s.scene.number}: {s.scene.title}</span>
    </nav>
  );
  if (telling) {
    const b = studio.briefOf(project);
    return (
      <div className="max-w-6xl">
        {crumbs}
        <h1 className="mb-4 text-2xl font-semibold">Storyboard: {s.scene.title}</h1>
        <StoryWizard sceneId={sceneId} sceneTitle={s.scene.title} venueName={s.venue?.name ?? "the venue"} canAuto={!!getTextProvider()} replacing={s.panels.length > 0}
          cast={chars.filter((c) => castIds.includes(c.slug)).map((c) => ({ id: c.slug, name: c.name, role: c.role }))}
          brief={{ format: b.format, parts: b.parts, partSec: b.partSec, audience: b.audience, outline: b.outline, genre: GENRE_PROFILES[b.genre].label }}
          initialStory={s.scene.story} initialTarget={s.scene.targetSec} example={exampleFor(b.genre, b.format)} />
        {s.panels.length > 0 && <p className="mt-4 text-sm"><Link className="text-blue-700 underline" href="?">Keep the current storyboard</Link></p>}
      </div>
    );
  }
  // The approved picture showing the most people keeps the rest of the scene consistent (D18c).
  const anchor = s.panels
    .map((p, i) => ({ panel: p, n: i + 1, people: s.shots.find((x) => x.panelId === p.id)?.spec.visibleIds.length ?? 0 }))
    .filter((x) => x.panel.status === "approved" && x.panel.imageAssetId)
    .sort((a, b) => b.people - a.people || a.n - b.n)[0];
  let n = s.panels.length + 1;
  while (s.panels.some((p) => p.code.toLowerCase() === `p${n}`)) n++;

  return (
    <div className="max-w-6xl">
      {crumbs}
      <h1 className="text-2xl font-semibold">Storyboard: {s.scene.title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900" data-testid="storyboard-summary">
        <span><strong>{s.panels.length} panels</strong> · about {total} s · target {s.scene.targetSec} s</span>
        {s.venue && <span>· {s.venue.name}{s.venue.status !== "approved" && <span className="text-amber-700"> (venue not approved yet)</span>}</span>}
        {!anyApproved && <Link className="text-blue-700 underline" href="?story=1" data-testid="rewrite-story">Rewrite from the story</Link>}
      </div>
      {pending.length > 0 && <p className="mt-2 text-sm text-amber-700">Unapproved character changes: {pending.map((c) => c.name).join(", ")}. Pictures use the last approved version. <Link className="underline" href={`/projects/${id}/characters`}>Review characters</Link></p>}
      {missingRefs.length > 0 && <p className="mt-2 text-sm text-amber-700">No approved pictures yet for {missingRefs.map((c) => c.name).join(", ")}. Create them in <Link className="underline" href={`/projects/${id}/characters`}>Characters</Link> so every panel keeps them consistent.</p>}

      <div className="mt-5">
        <SceneSettingCard sceneId={sceneId} staging={asStaging(s.scene.staging)} hasPictures={s.panels.some((p) => p.imageAssetId)} canAuto={!!getTextProvider()}
          suggestPrompt={s.scene.story.trim() ? stagingPrompt({ story: s.scene.story, venue: s.venue?.name ?? "the venue", characters: chars.filter((c) => castIds.includes(c.slug)).map((c) => ({ id: c.slug, name: c.name, role: c.role })) }) : undefined} />
      </div>

      <div className="mt-5">
        <StoryboardBoard settingEmpty={!asStaging(s.scene.staging).spot && !asStaging(s.scene.staging).crowd} projectId={id} sceneId={sceneId} designHref={`/projects/${id}/scenes/${sceneId}/design`} baseCode={base} size={portrait ? "portrait" : "landscape"} canGenerate={canGenerate}
          panels={s.panels.map((p) => {
            const shot = s.shots.find((x) => x.panelId === p.id);
            const d = p.dialogue[0];
            const prompt = panelPrompt({
              description: p.description, emotion: p.emotion, shot: shot?.spec, cast, profiles, plan: s.plan?.data,
              venueName: s.venue?.name ?? "venue", venueViews: s.venue?.views as { name: string; imageAssetId?: string }[] | undefined, aspect: brief.aspect, genre, style: brief.style,
              continuity: anchor && anchor.panel.id !== p.id ? { assetId: anchor.panel.imageAssetId!, label: `approved scene picture (panel ${anchor.n})` } : undefined,
            });
            return {
              id: p.id, code: p.code, description: p.description, seconds: p.durationSec, status: p.status, imageAssetId: p.imageAssetId ?? undefined,
              speaker: d ? cast.find((c) => c.id === d.characterId)?.name : undefined, line: d?.text,
              hasCamera: !!shot?.spec.cameraId, prompt: prompt.text, attach: prompt.attach,
            };
          })} />
      </div>

      <details className="mt-8 rounded-xl border border-neutral-200 bg-white p-4" data-testid="edit-words">
        <summary className="cursor-pointer font-semibold">Edit the words on a panel</summary>
        <p className="mt-1 text-sm text-neutral-600">Changing a line updates its shot and clip length, and flags the animatic for a re-check.</p>
        <ol className="mt-4 space-y-4">
          {s.panels.map((p, i) => {
            const shot = s.shots.find((x) => x.panelId === p.id);
            const d = p.dialogue[0];
            return (
              <li key={p.id} className="rounded-lg border border-neutral-200 p-3" data-testid={`panel-${p.code}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-sm font-semibold">{i + 1}</span>
                  {shot && <Link className="text-blue-700 underline" href={`/projects/${id}/shots/${shot.id}`}>Shot details</Link>}
                  {recheck[p.id] && <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Animatic re-check</span>}
                </div>
                <PanelEditor key={p.id} sceneId={sceneId} cast={cast.map((c) => ({ id: c.id, name: c.name }))} first={i === 0} last={i === s.panels.length - 1}
                  panel={{ id: p.id, code: p.code, description: p.description, emotion: p.emotion, speakerId: d?.characterId, line: d?.text, durationSec: p.durationSec, status: p.status, version: p.version, hasImage: !!p.imageAssetId }} />
              </li>
            );
          })}
        </ol>
        <div className="mt-4 rounded-lg border border-dashed border-neutral-300 p-3">
          <h3 className="mb-2 text-sm font-semibold">Add a panel</h3>
          <PanelEditor key="new" sceneId={sceneId} cast={cast.map((c) => ({ id: c.id, name: c.name }))} suggestedCode={`P${n}`} />
        </div>
      </details>
    </div>
  );
}
