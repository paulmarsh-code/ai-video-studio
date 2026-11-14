"use client";

// Make the clips (D113): link each character, the venue and each key prop to its Kling Element,
// then copy each clip's request into Kling (Omni-Ref, multi-shot).

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setKlingElementAction } from "@/app/studioActions";
import type { Clip, KlingElement } from "@/lib/domain/clips";
import type { KlingListed } from "@/lib/klingList";

type Row = { key: string; what: string; kind: string; element?: KlingElement };

function ElementRow({ projectId, row, list }: { projectId: string; row: Row; list: KlingListed[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Picked from the list of your Kling Elements (D114); saved as soon as it's picked.
  const pick = async (id: string) => {
    const el = list.find((e) => e.id === id);
    setBusy(true); setError("");
    const r = await setKlingElementAction(projectId, row.key, el?.id ?? "", el?.name ?? "");
    setBusy(false);
    if (!r.ok) setError(r.error); else router.refresh();
  };
  const current = row.element?.id && list.some((e) => e.id === row.element!.id) ? row.element.id : "";
  return (
    <tr className="border-t border-neutral-100">
      <td className="py-1 pr-2 text-xs text-neutral-500">{row.kind}</td>
      <td className="py-1 pr-3 font-medium">{row.what}</td>
      <td className="py-1 pr-2">
        <select value={current} disabled={busy} onChange={(e) => void pick(e.target.value)} className="w-64 rounded border border-neutral-300 bg-white px-2 py-1 text-sm">
          <option value="">{row.element && !current ? `${row.element.name} (not in the list)` : "— none —"}</option>
          {list.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </td>
      <td className="py-1">
        {busy ? <span className="text-xs text-neutral-500">Saving…</span> : row.element ? <span className="text-xs text-green-700">linked</span> : <span className="text-xs text-amber-700">no Element</span>}
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

export function ClipsBoard({ projectId, rows, clips, list }: { projectId: string; rows: Row[]; clips: Clip[]; list: { elements: KlingListed[]; updatedAt?: string } }) {
  const [api, setApi] = useState(false);
  const total = clips.reduce((t, c) => t + c.credits, 0);
  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="text-lg font-semibold">Kling Elements</h2>
        <p className="text-sm text-neutral-600">Make each one once in Kling (Elements → Create, with its approved picture as the cover and 1–3 more angles), then pick it here.</p>
        <p className="text-xs text-neutral-500">{list.elements.length ? `Your Kling Elements as of ${list.updatedAt ? new Date(list.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "the last refresh"}. Made a new one? Ask Claude to refresh your Kling Elements.` : "No list of your Kling Elements yet: ask Claude to refresh your Kling Elements."}</p>
        <table className="mt-2 text-sm"><tbody>{rows.map((r) => <ElementRow key={r.key} projectId={projectId} row={r} list={list.elements} />)}</tbody></table>
      </section>
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Clips</h2>
          <label className="flex items-center gap-2 text-sm text-neutral-600"><input type="checkbox" checked={api} onChange={(e) => setApi(e.target.checked)} /> Show the version with Element ids (for the API)</label>
        </div>
        <p className="text-sm text-neutral-600">
          In Kling: Video → Omni-Ref, model 4.0, 9:16, add the Elements listed, then each clip&apos;s storyboard pictures in order, paste the request, set the length, sound on. About {total} credits for the whole scene at 720p (10 a second).
        </p>
        <div className="mt-3 space-y-4">
          {clips.map((c, k) => (
            <div key={k} className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">Clip {k + 1}: panels {c.panels.join(", ")} · {c.seconds} s · about {c.credits} credits</h3>
                <Copy text={api ? c.prompt : c.webPrompt} label="Copy the request" />
              </div>
              <p className="mt-1 text-sm text-neutral-600">Elements: {c.elements.length ? c.elements.map((e) => e.name).join(", ") : "none linked yet"}</p>
              {c.pictures.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-neutral-600">Then add these storyboard pictures as images, in this order: Kling stages each shot from its picture (who stands where, the camera angle). {c.pictures.length < c.panels.length && <span className="text-amber-800">Panels without a picture yet are staged from the words alone.</span>}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {c.pictures.map((x, n) => (
                      <a key={x.assetId} href={`/api/assets/${x.assetId}`} download={`clip${k + 1}_picture${n + 1}_panel${x.panel}.png`} className="w-24 text-xs text-neutral-600 hover:underline">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/assets/${x.assetId}`} alt={`Picture ${n + 1}`} className="w-full rounded border border-neutral-200" />
                        Picture {n + 1}: shot {x.shot} (panel {x.panel}) · save
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {c.missing.length > 0 && <p className="mt-1 text-sm text-amber-800">No Element for {c.missing.join(", ")}: drawn from the words alone, so {c.missing.length === 1 ? "it" : "they"} may not match from clip to clip.</p>}
              <pre className="mt-2 whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs text-neutral-800">{api ? c.prompt : c.webPrompt}</pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
