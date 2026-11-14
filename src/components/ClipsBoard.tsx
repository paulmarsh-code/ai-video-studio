"use client";

// Make the clips (D113): link each character, the venue and each key prop to its Kling Element,
// then copy each clip's request into Kling (Omni-Ref, multi-shot).

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClipJobsAction, setClipPictureAction, setKlingElementAction } from "@/app/studioActions";
import type { Clip, KlingElement } from "@/lib/domain/clips";
import type { KlingListed } from "@/lib/klingList";
import type { PictureChoice } from "@/lib/sceneClips";
import type { KlingJob } from "@/lib/klingJobs";

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

/** The picture Kling gets for one shot (D123): the storyboard's, another version, or none. */
function PictureSlot({ sceneId, shot, choice }: { sceneId: string; shot: number; choice: PictureChoice }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const value = choice.how === "none" ? "none" : choice.how === "own" ? choice.chosen ?? "" : "";
  const pick = async (v: string) => { setBusy(true); const r = await setClipPictureAction(sceneId, choice.panelId, v); setBusy(false); if (r.ok) router.refresh(); };
  return (
    <div className="w-36 text-xs text-neutral-600">
      {choice.chosen && choice.how !== "none" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/assets/${choice.chosen}`} alt={`Shot ${shot}`} className="w-full rounded border border-neutral-200" />
      ) : <div className="flex h-24 items-center justify-center rounded border border-dashed border-neutral-300">no picture</div>}
      <div className="mt-1">Shot {shot} · panel {choice.order}</div>
      <select value={value} disabled={busy} onChange={(e) => void pick(e.target.value)} className="mt-1 w-full rounded border border-neutral-300 bg-white px-1 py-0.5">
        <option value="">The storyboard&apos;s picture</option>
        {choice.options.map((o) => <option key={o.assetId} value={o.assetId}>{o.label}</option>)}
        <option value="none">No picture (words only)</option>
      </select>
    </div>
  );
}

const STATUS: Record<KlingJob["status"], string> = { ready: "Waiting for Claude to make it", sent: "Being made in Kling", done: "Made", failed: "Failed" };

export function ClipsBoard({ projectId, sceneId, rows, clips, list, pictures, jobs }: { projectId: string; sceneId: string; rows: Row[]; clips: Clip[]; list: { elements: KlingListed[]; updatedAt?: string }; pictures: PictureChoice[]; jobs: KlingJob[] }) {
  const router = useRouter();
  const [api, setApi] = useState(false);
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [note, setNote] = useState("");
  const total = clips.reduce((t, c) => t + c.credits, 0);
  // Hand clips to Claude (D123): written to the jobs file, made in Kling through Claude's connection.
  const create = async (which: number | "all") => {
    setBusy(which); setNote("");
    const r = await createClipJobsAction(sceneId, which === "all" ? undefined : [which]);
    setBusy(null);
    if (!r.ok) { setNote(r.error); return; }
    setNote(`${r.value?.count} clip${r.value?.count === 1 ? "" : "s"} ready, about ${r.value?.credits} credits. Now tell Claude in the chat: "make the clips".`);
    router.refresh();
  };
  const jobOf = (c: Clip) => jobs.find((j) => j.panels.join() === c.panels.join());
  // While clips are waiting or being made, the page uploads their pictures with Claude's tickets
  // (D125) and picks up the results Claude writes back.
  const active = jobs.some((j) => j.status === "ready" || j.status === "sent");
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/kling-uploads", { method: "POST" });
        const j = (await r.json()) as { uploaded: number; failed: number };
        if (!stop && (j.uploaded || j.failed)) router.refresh();
      } catch { /* try again next time */ }
    };
    void tick();
    const t = setInterval(() => { void tick(); router.refresh(); }, 5000);
    return () => { stop = true; clearInterval(t); };
  }, [active, router]);
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
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-600"><input type="checkbox" checked={api} onChange={(e) => setApi(e.target.checked)} /> Show the version with Element ids</label>
            <button type="button" disabled={busy !== null} onClick={() => void create("all")} className="rounded bg-blue-700 px-3 py-1 text-sm text-white hover:bg-blue-800 disabled:opacity-50">{busy === "all" ? "Creating…" : "Create all clips"}</button>
          </div>
        </div>
        {note && <p className="mt-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{note}</p>}
        <p className="text-sm text-neutral-600">
          &ldquo;Create&rdquo; hands a clip to Claude with its Elements, its pictures in order and its request; then tell Claude &ldquo;make the clips&rdquo; and it makes them in Kling (Omni-Ref, model 4.0, 720p, sound on) and shows each result here. About {total} credits for the whole scene (10 a second). A clip holds at most two camera angles, so a panel that would bring a third starts the next clip. You can still copy a request into the Kling app yourself.
        </p>
        <div className="mt-3 space-y-4">
          {clips.map((c, k) => (
            <div key={k} className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">Clip {k + 1}: panels {c.panels.join(", ")} · {c.seconds} s · about {c.credits} credits</h3>
                <div className="flex flex-wrap gap-2">
                  <Copy text={api ? c.prompt : c.webPrompt} label="Copy the request" />
                  <button type="button" disabled={busy !== null} onClick={() => void create(k + 1)} className="rounded bg-blue-700 px-3 py-1 text-sm text-white hover:bg-blue-800 disabled:opacity-50">{busy === k + 1 ? "Creating…" : jobOf(c) ? "Create again" : "Create this clip"}</button>
                </div>
              </div>
              {(() => {
                const j = jobOf(c);
                if (!j) return null;
                return (
                  <p className={`mt-1 text-sm ${j.status === "failed" ? "text-red-700" : j.status === "done" ? "text-green-700" : "text-blue-800"}`}>
                    {STATUS[j.status]}{j.error ? `: ${j.error}` : ""}
                    {j.pictures.some((p) => p.uploadError) && <> · {j.pictures.filter((p) => p.uploadError).map((p) => `picture ${p.n}: ${p.uploadError}`).join("; ")}</>}
                    {j.status !== "done" && j.pictures.length > 0 && <> · pictures sent to Kling: {j.pictures.filter((p) => p.klingUrl).length} of {j.pictures.length}</>}
                    {j.videoUrl && <> · <a className="underline" href={j.videoUrl} target="_blank" rel="noreferrer">watch or download</a> (the link lasts 24 hours)</>}
                  </p>
                );
              })()}
              <p className="mt-1 text-sm text-neutral-600">Elements: {c.elements.length ? c.elements.map((e) => e.name).join(", ") : "none linked yet"}</p>
              <div className="mt-2">
                <p className="text-sm text-neutral-600">Pictures, one per shot, in order: Kling stages each shot from its picture (who stands where, the camera angle). Pick another version, or none, if a picture isn&apos;t right.</p>
                <div className="mt-1 flex flex-wrap gap-3">
                  {c.panels.map((order, n) => { const ch = pictures.find((x) => x.order === order); return ch ? <PictureSlot key={ch.panelId} sceneId={sceneId} shot={n + 1} choice={ch} /> : null; })}
                </div>
              </div>
              {c.missing.length > 0 && <p className="mt-1 text-sm text-amber-800">No Element for {c.missing.join(", ")}: drawn from the words alone, so {c.missing.length === 1 ? "it" : "they"} may not match from clip to clip.</p>}
              <pre className="mt-2 whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs text-neutral-800">{api ? c.prompt : c.webPrompt}</pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
