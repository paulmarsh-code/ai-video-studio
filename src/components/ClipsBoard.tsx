"use client";

// Make the clips (D113): link each character, the venue and each key prop to its Kling Element,
// then copy each clip's request into Kling (Omni-Ref, multi-shot).

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setKlingElementAction } from "@/app/studioActions";
import type { Clip, KlingElement } from "@/lib/domain/clips";

type Row = { key: string; what: string; kind: string; element?: KlingElement };

function ElementRow({ projectId, row }: { projectId: string; row: Row }) {
  const router = useRouter();
  const [id, setId] = useState(row.element?.id ?? "");
  const [name, setName] = useState(row.element?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = id !== (row.element?.id ?? "") || name !== (row.element?.name ?? "");
  const save = async () => {
    setBusy(true); setError("");
    const r = await setKlingElementAction(projectId, row.key, id, name);
    setBusy(false);
    if (!r.ok) setError(r.error); else router.refresh();
  };
  return (
    <tr className="border-t border-neutral-100">
      <td className="py-1 pr-2 text-xs text-neutral-500">{row.kind}</td>
      <td className="py-1 pr-2 font-medium">{row.what}</td>
      <td className="py-1 pr-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Element name in Kling" className="w-48 rounded border border-neutral-300 px-2 py-1 text-sm" /></td>
      <td className="py-1 pr-2"><input value={id} onChange={(e) => setId(e.target.value)} placeholder="Element id (optional)" className="w-48 rounded border border-neutral-300 px-2 py-1 font-mono text-xs" /></td>
      <td className="py-1">
        {dirty ? <button type="button" disabled={busy} onClick={save} className="rounded bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
          : row.element ? <span className="text-xs text-green-700">linked</span> : <span className="text-xs text-amber-700">no Element</span>}
        {error && <span className="ml-2 text-xs text-red-700">{error}</span>}
      </td>
    </tr>
  );
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* the text is shown below to copy by hand */ } }}>
      {done ? "Copied" : label}
    </button>
  );
}

export function ClipsBoard({ projectId, rows, clips }: { projectId: string; rows: Row[]; clips: Clip[] }) {
  const [api, setApi] = useState(false);
  const total = clips.reduce((t, c) => t + c.credits, 0);
  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="text-lg font-semibold">Kling Elements</h2>
        <p className="text-sm text-neutral-600">Make each one once in Kling (Elements → Create, with its approved picture as the cover and 1–3 more angles), then type its name here as it is in Kling. The id is only needed when Claude sends the clip for you.</p>
        <table className="mt-2 text-sm"><tbody>{rows.map((r) => <ElementRow key={r.key} projectId={projectId} row={r} />)}</tbody></table>
      </section>
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Clips</h2>
          <label className="flex items-center gap-2 text-sm text-neutral-600"><input type="checkbox" checked={api} onChange={(e) => setApi(e.target.checked)} /> Show the version with Element ids (for the API)</label>
        </div>
        <p className="text-sm text-neutral-600">
          In Kling: Video → Omni-Ref, model 4.0, 9:16, add the Elements listed, paste the request, set the length, sound on. About {total} credits for the whole scene at 720p (10 a second).
        </p>
        <div className="mt-3 space-y-4">
          {clips.map((c, k) => (
            <div key={k} className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">Clip {k + 1}: panels {c.panels.join(", ")} · {c.seconds} s · about {c.credits} credits</h3>
                <Copy text={api ? c.prompt : c.webPrompt} label="Copy the request" />
              </div>
              <p className="mt-1 text-sm text-neutral-600">Elements: {c.elements.length ? c.elements.map((e) => e.name).join(", ") : "none linked yet"}</p>
              {c.missing.length > 0 && <p className="mt-1 text-sm text-amber-800">No Element for {c.missing.join(", ")}: drawn from the words alone, so {c.missing.length === 1 ? "it" : "they"} may not match from clip to clip.</p>}
              <pre className="mt-2 whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs text-neutral-800">{api ? c.prompt : c.webPrompt}</pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
