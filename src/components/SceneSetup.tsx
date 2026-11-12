"use client";

// + Add scene (D18): a name, where it happens and who is in it. Only approved venues and
// characters can be chosen, because the storyboard and prompts are built from them.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addSceneAction } from "@/app/studioActions";
import { ActionButton } from "./ActionButton";

const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

export function SceneSetup({ projectId, venues, characters }: {
  projectId: string;
  venues: { id: string; name: string; approved: boolean }[];
  characters: { id: string; name: string; role: string; approved: boolean }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [venueId, setVenueId] = useState(venues.filter((v) => v.approved).length === 1 ? venues.find((v) => v.approved)!.id : "");
  const [cast, setCast] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [made, setMade] = useState("");
  const toggle = (id: string) => setCast((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5" data-testid="scene-setup">
      <label className="block max-w-md text-sm">Scene name
        <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Launch night" data-testid="scene-title" />
      </label>

      <p className="mt-5 text-sm font-medium">Where does it happen?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {venues.map((v) => (
          <label key={v.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${!v.approved ? "border-neutral-200 text-neutral-400" : venueId === v.id ? "border-blue-600 bg-blue-50" : "border-neutral-200"}`}>
            <input type="radio" name="venue" disabled={!v.approved} checked={venueId === v.id} onChange={() => setVenueId(v.id)} data-testid={`scene-venue-${v.id}`} />
            {v.name}{!v.approved && " (not approved yet)"}
          </label>
        ))}
        {!venues.length && <p className="text-sm text-neutral-600">No venues yet. <a className="text-blue-700 underline" href={`/projects/${projectId}/venues?new=1`}>Create one</a>.</p>}
      </div>

      <p className="mt-5 text-sm font-medium">Who is in it?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {characters.map((c) => (
          <label key={c.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${!c.approved ? "border-neutral-200 text-neutral-400" : cast.includes(c.id) ? "border-blue-600 bg-blue-50" : "border-neutral-200"}`}>
            <input type="checkbox" disabled={!c.approved} checked={cast.includes(c.id)} onChange={() => toggle(c.id)} data-testid={`scene-cast-${c.id}`} />
            {c.name}{c.role && <span className="text-xs text-neutral-500">{c.role}</span>}{!c.approved && " (not approved yet)"}
          </label>
        ))}
        {!characters.length && <p className="text-sm text-neutral-600">No characters yet. <a className="text-blue-700 underline" href={`/projects/${projectId}/characters?new=1`}>Create one</a>.</p>}
      </div>

      <div className="mt-5">
        <ActionButton label="Next: tell the story" busyLabel="Saving…" doneLabel="Saved: opening the story…" disabled={!title.trim() || !venueId || !cast.length || !!made} testId="scene-create"
          onAction={async () => {
            setError("");
            const r = await addSceneAction(projectId, { title, venueId, castIds: cast });
            if (!r.ok) { setError(r.error); return r; }
            setMade(r.value ?? "");
            router.push(`/projects/${projectId}/scenes/${r.value}/storyboard`);
            return r;
          }} />
        {/* The first time after a restart, the story page can take a while to open. */}
        {made && <p className="mt-2 text-sm text-neutral-600">The first time after starting the app this can take up to a minute. <a className="text-blue-700 underline" href={`/projects/${projectId}/scenes/${made}/storyboard`} data-testid="scene-open">Open the scene now</a></p>}
      </div>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
