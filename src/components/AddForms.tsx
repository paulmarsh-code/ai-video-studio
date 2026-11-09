"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addCharacterAction, addVenueAction } from "@/app/studioActions";
import type { Pronoun } from "@/lib/domain/types";

export function AddCharacterForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pronoun, setPronoun] = useState<Pronoun>("they");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await addCharacterAction(projectId, name, pronoun);
        if (r.ok) { setName(""); setError(""); router.refresh(); } else setError(r.error);
      });
    }}>
      <label className="text-sm">New character name<input className="mt-1 block rounded border border-neutral-300 px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="text-sm">Pronoun
        <select className="mt-1 block rounded border border-neutral-300 px-2 py-1" value={pronoun} onChange={(e) => setPronoun(e.target.value as Pronoun)}>
          <option value="she">she</option><option value="he">he</option><option value="they">they</option>
        </select>
      </label>
      <button disabled={pending || !name.trim()} className="rounded-md bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">Add character</button>
      {error && <span className="text-sm text-red-700">{error}</span>}
    </form>
  );
}

export function AddVenueForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await addVenueAction(projectId, name);
        if (r.ok) router.push(`/projects/${projectId}/venues/${r.value}`); else setError(r.error);
      });
    }}>
      <label className="text-sm">New venue name<input className="mt-1 block rounded border border-neutral-300 px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <button disabled={pending || !name.trim()} className="rounded-md bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">Add venue</button>
      {error && <span className="text-sm text-red-700">{error}</span>}
    </form>
  );
}
