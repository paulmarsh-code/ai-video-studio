import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import { LibraryButton } from "@/components/LibraryButton";
import { ProjectActions } from "@/components/ProjectActions";
import { GENRE_PROFILES } from "@/lib/domain/genre";
import { shapeLine } from "@/lib/domain/story";
import { addCharacterToLibraryAction } from "@/app/actions";
import * as studio from "@/lib/studioRepo";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const project = repo.getProject(db, id);
  if (!project) notFound();
  const cast = repo.getCast(db, id);
  const scenes = repo.listScenes(db, id);
  const chars = studio.listCharacters(db, id);
  const venues = studio.listVenues(db, id);
  const charsReady = chars.length > 0 && chars.every((c) => c.approved && !c.draft);
  const venuesReady = venues.length > 0 && venues.every((v) => v.status === "approved");
  const brief = studio.briefOf(project);

  return (
    <div className="max-w-5xl">
      <p className="text-sm text-neutral-500"><Link href="/">Projects</Link> /</p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <ProjectActions projectId={id} name={project.name} saved={!!project.archivedAt} />
      </div>
      {project.archivedAt && <p className="mt-1 text-sm text-neutral-600" data-testid="project-saved-note">Saved to the library on {new Date(project.archivedAt).toLocaleDateString("en-GB")}. It isn&apos;t on your live projects; bring it back to work on it there.</p>}
      {project.demo && <p className="mt-1 text-sm text-amber-700">Demo project. All data is illustrative and editable, not approved production assets.</p>}

      <section className="mt-5 rounded-xl border border-neutral-200 bg-white p-4" data-testid="brief">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-1 text-sm">
            <p className="font-semibold">{shapeLine(brief) || "No brief yet"}</p>
            <p className="text-neutral-600">{GENRE_PROFILES[brief.genre].label} · {brief.style} · {brief.aspect === "16:9" ? "Landscape 16:9" : "Portrait 9:16"}{brief.audience ? ` · For ${brief.audience}` : ""}</p>
            {brief.outline && <p className="text-neutral-700">{brief.outline}</p>}
          </div>
          <Link href={`/projects/${id}/brief`} className="text-sm text-blue-700 underline" data-testid="edit-brief">Edit brief</Link>
        </div>
      </section>

      <h2 className="mt-8 text-lg font-semibold">Production steps</h2>
      <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <li className="rounded-lg border border-neutral-200 bg-white p-3">
          <p className="font-semibold">1. <Link className="text-blue-700 underline" href={`/projects/${id}/characters`}>Characters</Link></p>
          <p className="text-neutral-600">{chars.length} characters · {chars.filter((c) => c.approved).length} approved{chars.some((c) => c.draft) ? " · drafts waiting" : ""}</p>
          <p className={charsReady ? "text-green-700" : "text-amber-700"}>{charsReady ? "Ready" : "Needs approval"}</p>
        </li>
        <li className="rounded-lg border border-neutral-200 bg-white p-3">
          <p className="font-semibold">2. <Link className="text-blue-700 underline" href={`/projects/${id}/venues`}>Venues</Link></p>
          <p className="text-neutral-600">{venues.length} venue{venues.length === 1 ? "" : "s"} · {venues.filter((v) => v.status === "approved").length} approved</p>
          <p className={venuesReady ? "text-green-700" : "text-amber-700"}>{venuesReady ? "Ready" : venues.length ? "Needs approval" : "No venue yet"}</p>
        </li>
        <li className="rounded-lg border border-neutral-200 bg-white p-3">
          <p className="font-semibold">3. Scenes and storyboard</p>
          <p className="text-neutral-600">{scenes.length} scene{scenes.length === 1 ? "" : "s"}{brief.parts ? ` of ${brief.parts} planned` : ""}. Tell each scene&apos;s story; the app turns it into panels.</p>
        </li>
      </ol>

      <div className="mt-8 flex items-center gap-3">
        <h2 className="text-lg font-semibold">Scenes</h2>
        <Link href={`/projects/${id}/scenes/new`} className="rounded-md bg-blue-700 px-4 py-1.5 text-sm text-white hover:bg-blue-800" data-testid="add-scene">+ Add scene</Link>
      </div>
      {!scenes.length && <p className="mt-2 text-sm text-neutral-600">No scenes yet. {charsReady && venuesReady ? "Add the first one." : "Create and approve your characters and venue first, then add a scene."}</p>}
      <ul className="mt-3 space-y-2">
        {scenes.map((s) => {
          const sc = repo.getScene(db, s.id)!;
          const secs = sc.panels.reduce((n, p) => n + p.durationSec, 0);
          const pics = sc.panels.filter((p) => p.imageAssetId).length;
          const ok = sc.panels.filter((p) => p.status === "approved").length;
          const who = (cid?: string) => cast.find((c) => c.id === cid)?.name;
          return (
            <li key={s.id} className="rounded-lg border border-neutral-200 bg-white" data-testid={`scene-${s.number}`}>
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
                  <span className="font-mono text-sm">Scene {s.number}</span>
                  <span className="flex-1 font-medium">{s.title}</span>
                  <span className="text-sm text-neutral-600">
                    {sc.panels.length ? `${sc.panels.length} panels · about ${secs} s · ${pics} picture${pics === 1 ? "" : "s"} · ${ok} approved` : "No storyboard yet"}
                  </span>
                  <Link className="rounded-md bg-blue-700 px-3 py-1 text-sm text-white hover:bg-blue-800" href={`/projects/${id}/scenes/${s.id}/storyboard`}>Open storyboard</Link>
                </summary>
                <div className="border-t border-neutral-100 px-4 py-3">
                  {sc.panels.length ? (
                    <ol className="flex gap-3 overflow-x-auto pb-2" data-testid={`scene-${s.number}-panels`}>
                      {sc.panels.map((p, i) => {
                        const d = (p.dialogue as { characterId: string; text: string }[])[0];
                        return (
                          <li key={p.id} className="w-36 shrink-0 text-xs">
                            <div className={`overflow-hidden rounded bg-neutral-100 ${brief.aspect === "16:9" ? "aspect-[3/2]" : "aspect-[2/3]"}`}>
                              {p.imageAssetId
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={`/api/assets/${p.imageAssetId}`} alt={`Panel ${i + 1}`} className="h-full w-full object-cover" />
                                : <span className="flex h-full items-center justify-center text-neutral-400">No picture</span>}
                            </div>
                            <p className="mt-1"><span className="font-semibold">{i + 1}</span> · {p.durationSec} s{p.status === "approved" && <span className="text-green-700"> · ✓</span>}</p>
                            <p className="line-clamp-3 text-neutral-600">{d ? `${who(d.characterId) ?? ""}: ${d.text}` : p.description}</p>
                          </li>
                        );
                      })}
                    </ol>
                  ) : <p className="text-sm text-neutral-600">Tell this scene&apos;s story to create its panels.</p>}
                  <p className="mt-2 flex flex-wrap gap-4 text-sm">
                    <Link className="text-blue-700 underline" href={`/projects/${id}/scenes/${s.id}/design`}>Cameras</Link>
                    <Link className="text-blue-700 underline" href={`/projects/${id}/scenes/${s.id}/plan`}>Floor plan</Link>
                    <Link className="text-blue-700 underline" href={`/projects/${id}/scenes/${s.id}`}>Shots and prompts</Link>
                    <Link className="text-blue-700 underline" href={`/projects/${id}/scenes/${s.id}/animatic`}>Animatic</Link>
                  </p>
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Cast and voice locks</h2>
      <p className="text-sm text-neutral-600">Each voice lock is injected word for word into every prompt where the character speaks. Final voices come from Kling native audio only.</p>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {cast.map((c) => (
          <li key={c.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{c.name}</span>
              <LibraryButton label="Save to library" action={addCharacterToLibraryAction.bind(null, id, c.id)} />
            </div>
            <p className="mt-2 text-sm italic text-neutral-700">{c.voiceLock}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
