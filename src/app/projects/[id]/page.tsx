import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import { LibraryButton } from "@/components/LibraryButton";
import { addCharacterToLibraryAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const project = repo.getProject(db, id);
  if (!project) notFound();
  const cast = repo.getCast(db, id);
  const scenes = repo.listScenes(db, id);

  return (
    <div className="max-w-5xl">
      <p className="text-sm text-neutral-500"><Link href="/">Projects</Link> /</p>
      <h1 className="text-2xl font-semibold">{project.name}</h1>
      {project.demo && <p className="mt-1 text-sm text-amber-700">Demo project. All data is illustrative and editable, not approved production assets.</p>}

      <h2 className="mt-8 text-lg font-semibold">Scenes</h2>
      <ul className="mt-3 space-y-2">
        {scenes.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3">
            <span className="font-mono text-sm">EP{String(s.episode).padStart(2, "0")} S{String(s.number).padStart(2, "0")}</span>
            <span className="flex-1">{s.title}</span>
            <Link className="text-sm text-blue-700 underline" href={`/projects/${id}/scenes/${s.id}`}>Shots</Link>
            <Link className="text-sm text-blue-700 underline" href={`/projects/${id}/scenes/${s.id}/plan`}>Floor plan</Link>
            <Link className="text-sm text-blue-700 underline" href={`/projects/${id}/scenes/${s.id}/animatic`}>Animatic</Link>
          </li>
        ))}
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
