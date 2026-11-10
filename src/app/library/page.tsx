import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import { LibraryItemCard } from "@/components/LibraryItemCard";
import Link from "next/link";
import { ProjectActions } from "@/components/ProjectActions";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  venue: "Venue and plan",
  "shot-setup": "Shot set-up",
  character: "Character",
  "prompt-template": "Prompt template",
  "scene-kit": "Scene kit",
};

export default async function LibraryPage() {
  const db = await getDb();
  const items = repo.listLibrary(db).map((i) => ({ ...i, stats: repo.libraryStats(db, i.id) }));
  const saved = repo.listProjects(db, "saved");
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold">Your library</h1>
      <p className="mt-1 text-neutral-600">
        Private to you. Save venues, floor plans, shot set-ups and characters from any project, then copy and change them. The original
        always stays as it was, and stats come only from logged takes.
      </p>
      <h2 className="mt-6 text-lg font-semibold">Finished projects</h2>
      {saved.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600">None yet. Use &ldquo;Save project to library&rdquo; on a project you&apos;ve finished: it moves here, whole, off your live projects.</p>
      ) : (
        <ul className="mt-2 space-y-2" data-testid="saved-projects">
          {saved.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3">
              <Link href={`/projects/${p.id}`} className="font-medium text-blue-700 underline">{p.name}</Link>
              <span className="text-xs text-neutral-500">saved {new Date(p.archivedAt!).toLocaleDateString("en-GB")}</span>
              <span className="ml-auto"><ProjectActions projectId={p.id} name={p.name} saved /></span>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-8 text-lg font-semibold">Saved pieces</h2>
      {items.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-600">
          Nothing saved yet. Use &ldquo;Save to library&rdquo; on a character, a floor plan or a shot.
        </p>
      )}
      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        {items.map((i) => (
          <li key={i.id}>
            <LibraryItemCard
              item={{ id: i.id, name: i.name, kind: KIND_LABEL[i.kind] ?? i.kind, version: i.version, sourceName: i.sourceName, data: JSON.stringify(i.data, null, 2), visibility: i.visibility }}
              stats={i.stats}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
