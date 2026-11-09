"use client";

import { useState, useTransition } from "react";
import { setGenreAction } from "@/app/actions";
import { GENRE_PROFILES, GENRES, type Genre } from "@/lib/domain/genre";

/** Genre shapes the app's shot choices, prompt look and animatic pacing. */
export function GenrePicker({ projectId, genre }: { projectId: string; genre: Genre }) {
  const [value, setValue] = useState<Genre>(genre);
  const [pending, start] = useTransition();
  return (
    <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
      <label className="flex flex-wrap items-center gap-3 text-sm font-medium">
        Genre
        <select
          value={value}
          disabled={pending}
          onChange={(e) => {
            const g = e.target.value as Genre;
            setValue(g);
            start(async () => { await setGenreAction(projectId, g); });
          }}
          className="rounded-md border border-neutral-300 px-2 py-1"
        >
          {GENRES.map((g) => <option key={g} value={g}>{GENRE_PROFILES[g].label}</option>)}
        </select>
        {pending && <span className="text-xs text-neutral-500">Saving…</span>}
      </label>
      <p className="mt-1 text-sm text-neutral-600">{GENRE_PROFILES[value].summary}</p>
      <p className="mt-1 text-xs text-neutral-500">Shapes the app&apos;s camera choices, the look and camera movement written into prompts, and animatic pacing. Continuity rules never change.</p>
    </div>
  );
}
