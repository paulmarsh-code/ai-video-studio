"use client";

// Save a finished project to the library, bring one back, or delete one (D22).

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteProjectAction, restoreProjectAction, saveProjectToLibraryAction } from "@/app/studioActions";

export function ProjectActions({ projectId, name, saved }: { projectId: string; name: string; saved: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>, after: () => void) {
    setBusy(true); setMsg("");
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? "That didn't work."); return; }
    after();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="project-actions">
      {saved ? (
        <button type="button" disabled={busy} className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 hover:bg-neutral-50" data-testid="restore-project"
          onClick={() => act(() => restoreProjectAction(projectId), () => router.refresh())}>Bring back to live projects</button>
      ) : (
        <button type="button" disabled={busy} className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 hover:bg-neutral-50" data-testid="save-project-library"
          title="Moves it off your live projects into the library, whole. You can bring it back any time."
          onClick={() => act(() => saveProjectToLibraryAction(projectId), () => router.push("/library"))}>Save project to library</button>
      )}
      {!confirming ? (
        <button type="button" className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-red-700 hover:bg-red-50" data-testid="delete-project" onClick={() => setConfirming(true)}>Delete project</button>
      ) : (
        <span className="flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2">
          <span className="text-red-800">This deletes {name} and all its characters, venues, scenes and pictures. It can&apos;t be undone. Type its name to confirm:</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Project name to confirm" className="rounded border border-red-300 px-2 py-1" data-testid="delete-confirm-name" />
          <button type="button" disabled={busy || typed.trim().toLowerCase() !== name.trim().toLowerCase()} className="rounded-md bg-red-700 px-3 py-1.5 text-white disabled:opacity-40" data-testid="delete-confirm"
            onClick={() => act(() => deleteProjectAction(projectId, typed), () => router.push("/"))}>Delete for good</button>
          <button type="button" className="underline" onClick={() => { setConfirming(false); setTyped(""); }}>Cancel</button>
        </span>
      )}
      {msg && <span className="text-red-700" role="alert">{msg}</span>}
    </div>
  );
}
