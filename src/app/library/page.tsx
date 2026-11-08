import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import { LibraryItemCard } from "@/components/LibraryItemCard";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  venue: "Venue and plan",
  "shot-setup": "Shot set-up",
  character: "Character",
  "prompt-template": "Prompt template",
  "scene-kit": "Scene kit",
};

export default function LibraryPage() {
  const db = getDb();
  const items = repo.listLibrary(db).map((i) => ({ ...i, stats: repo.libraryStats(db, i.id) }));
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold">Your library</h1>
      <p className="mt-1 text-neutral-600">
        Private to you. Save venues, floor plans, shot set-ups and characters from any project, then copy and change them. The original
        always stays as it was, and stats come only from logged takes.
      </p>
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
