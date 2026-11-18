"use client";

// A clip's start and end frames (D164) and what happens in it, on its card. The start frame is
// the picture the clip opens on: made from the people's, props' and venue's pictures with everyone
// where the panel words put them, or the last frame of the clip before; nothing is spent on the
// clip until it's approved. The end frame is optional, for a clip that has to finish somewhere
// particular. What happens, the lines and how they're said are changed here, on the clip.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { approvePositionsAction, setClipFrameAction, setPositionsAction } from "@/app/studioActions";
import type { Clip } from "@/lib/domain/clips";
import type { FrameRequest, SceneClipsView } from "@/lib/sceneClips";
import { PanelEditor } from "./PanelEditor";
import { PlanThumb } from "./PlanThumb";

async function draw(projectId: string, r: FrameRequest, size: "portrait" | "landscape", change?: string): Promise<string> {
  const res = await fetch("/api/images/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, baseCode: r.baseCode, kind: "start-frame", prompt: change?.trim() ? `${r.prompt}\nChange from the last version: ${change.trim()}` : r.prompt, refAssetIds: r.refAssetIds, size }) });
  const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !j.id) throw new Error(j.error ?? `The picture couldn't be drawn (${res.status}).`);
  return j.id;
}

export function ClipFrames({ projectId, sceneId, clip, clipKey, requests, aspect }: { projectId: string; sceneId: string; clip: Clip; clipKey: string; requests: SceneClipsView["frameRequests"][number]; aspect: "9:16" | "16:9" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [change, setChange] = useState({ start: "", end: "" });
  const size = aspect === "9:16" ? "portrait" : "landscape";
  const run = async (what: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(what); setErr(null);
    try { await fn(); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const make = (which: "start" | "end") => run(which, async () => {
    const id = await draw(projectId, requests[which], size, change[which]);
    const r = await setClipFrameAction(sceneId, clipKey, which === "start" ? { start: id } : { end: id });
    if (!r.ok) throw new Error(r.error);
    setChange((c) => ({ ...c, [which]: "" }));
  });
  const set = (what: string, ch: Parameters<typeof setClipFrameAction>[2]) => run(what, async () => { const r = await setClipFrameAction(sceneId, clipKey, ch); if (!r.ok) throw new Error(r.error); });
  const btn = "rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50";
  const s = clip.start;
  return (
    <div className="mt-2 grid gap-3 sm:grid-cols-2">
      <div className="rounded border border-neutral-200 p-2">
        <p className="text-sm font-medium">Start frame <span className="font-normal text-neutral-600">· the picture the clip opens on</span></p>
        {s ? (
          <>
            <img src={`/api/assets/${s.assetId}`} alt="Start frame" className="mt-1 max-h-72 rounded border border-neutral-200" />
            <p className="mt-1 text-xs text-neutral-600">{s.from === "previous clip" ? "The last frame of the clip before, so this one carries straight on." : "Made for this clip."}</p>
            {s.approved ? <p className="text-sm text-green-700">✓ Approved</p>
              : <button type="button" disabled={!!busy} onClick={() => set("approve", s.from === "previous clip" ? { approve: true } : { approve: true })} className="mt-1 rounded bg-green-700 px-3 py-1 text-sm text-white hover:bg-green-800 disabled:opacity-50">{busy === "approve" ? "Approving…" : "Approve the start frame"}</button>}
          </>
        ) : <p className="mt-1 text-sm text-amber-800">No start frame yet. Make one from the people, props and venue pictures, with everyone where the words put them.</p>}
        <textarea className="mt-2 w-full rounded border border-neutral-300 px-2 py-1 text-xs" rows={2} value={change.start} onChange={(e) => setChange({ ...change, start: e.target.value })}
          placeholder="Anything to change in it: e.g. Jade further back, two guests between her and Chase" />
        <div className="mt-1 flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={() => void make("start")} className={btn}>{busy === "start" ? "Drawing… (about a minute)" : s ? "Make a new start frame · about 5p" : "Make the start frame · about 5p"}</button>
          {s?.from === "chosen" && <button type="button" disabled={!!busy} onClick={() => set("clear", { start: null })} className={btn}>Use the clip before&apos;s last frame instead</button>}
        </div>
      </div>
      <div className="rounded border border-neutral-200 p-2">
        <p className="text-sm font-medium">End frame <span className="font-normal text-neutral-600">· optional, when the clip has to finish somewhere particular</span></p>
        {clip.end ? (
          <>
            <img src={`/api/assets/${clip.end.assetId}`} alt="End frame" className="mt-1 max-h-72 rounded border border-neutral-200" />
            <button type="button" disabled={!!busy} onClick={() => set("noend", { end: null })} className={`${btn} mt-1`}>Remove the end frame</button>
          </>
        ) : <p className="mt-1 text-xs text-neutral-600">None: Kling finishes the clip from what happens.</p>}
        <textarea className="mt-2 w-full rounded border border-neutral-300 px-2 py-1 text-xs" rows={2} value={change.end} onChange={(e) => setChange({ ...change, end: e.target.value })}
          placeholder="Anything particular about how it ends" />
        <button type="button" disabled={!!busy} onClick={() => void make("end")} className={`${btn} mt-1`}>{busy === "end" ? "Drawing… (about a minute)" : clip.end ? "Make a new end frame · about 5p" : "Make an end frame · about 5p"}</button>
      </div>
      {err && <p className="text-sm text-red-700 sm:col-span-2">{err}</p>}
    </div>
  );
}

/** What happens in the clip, moment by moment, each changeable here (D164). */
export function ClipMoments({ sceneId, panels, editors, cast }: { sceneId: string; panels: number[]; editors: SceneClipsView["editors"]; cast: { id: string; name: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="mt-2 rounded border border-neutral-200 p-2">
      <p className="text-sm font-medium">What happens <span className="font-normal text-neutral-600">· change the action, the line, how it&apos;s said or the length here</span></p>
      <ol className="mt-1 space-y-1">
        {panels.map((o) => {
          const e = editors[o];
          if (!e) return null;
          return (
            <li key={o} className="text-sm">
              {open === o ? (
                <PanelEditor key={`${e.panel.id}-${e.panel.version}`} sceneId={sceneId} cast={cast} first={e.first} last={e.last} panel={e.panel}
                  card={{ delivery: e.delivery, noPicture: true, onClose: () => setOpen(null), onPicture: async () => {} }} />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span><span className="text-neutral-500">{e.panel.durationSec} s · </span>{e.panel.description}{e.panel.line ? <> <strong>{cast.find((c) => c.id === e.panel.speakerId)?.name.split(/\s+/)[0]}:</strong> &ldquo;{e.panel.line}&rdquo;</> : null}</span>
                  <button type="button" className="text-xs text-blue-700 underline" onClick={() => setOpen(o)}>Change</button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Where everyone is as the scene starts (D165): the app's floor plan to check, and a box to say in
 * words what's wrong. The words go into every start frame and clip; the plan moves to match where
 * it can.
 */
export function PositionsBox({ sceneId, positions, noThumb, planHref }: { sceneId: string; positions: SceneClipsView["positions"]; noThumb?: boolean; planHref?: string }) {
  const router = useRouter();
  const [words, setWords] = useState(positions.note);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    setBusy("save"); setMsg(null);
    const r = await setPositionsAction(sceneId, words);
    setBusy(null);
    if (!r.ok) setMsg({ ok: false, text: r.error });
    else setMsg({ ok: !r.value!.unclear.length, text: `Saved: every start frame and clip in this scene uses it.${r.value!.moved.length ? ` On the plan: ${r.value!.moved.join("; ")}` : ""}${r.value!.unclear.length ? ` ${r.value!.unclear.join(" ")}` : ""} Check the plan, then approve.` });
    router.refresh();
  };
  const approve = async () => { setBusy("approve"); const r = await approvePositionsAction(sceneId); setBusy(null); if (!r.ok) setMsg({ ok: false, text: r.error }); router.refresh(); };
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-3">
      <h2 className="text-lg font-semibold">Positions {positions.approved && <span className="ml-1 text-sm font-normal text-green-700">✓ Approved</span>}</h2>
      <p className="text-sm text-neutral-600">Where everyone is as the scene starts. If something&apos;s wrong, say what in words: the app places everyone on the plan from them, and every start frame and clip follows them.</p>
      <div className={`mt-2 grid gap-3 ${noThumb ? "" : "md:grid-cols-2"}`}>
        {!noThumb && <div className="max-w-md"><PlanThumb plan={positions.plan} names={positions.names} />{planHref && <a className="text-xs text-blue-700 underline" href={planHref}>Open the floor plan</a>}</div>}
        <div>
          <textarea className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" rows={4} value={words} onChange={(e) => setWords(e.target.value)} data-testid="positions-words"
            placeholder="e.g. Jade is close enough to hear Chase's call but hidden from him, with two or three guests between them; Chase leans on the bar facing it, his back to Jade" />
          <div className="mt-1 flex flex-wrap gap-2">
            <button type="button" disabled={!!busy || !words.trim()} onClick={() => void save()} className="rounded bg-blue-700 px-3 py-1 text-sm text-white hover:bg-blue-800 disabled:opacity-50">{busy === "save" ? "Placing everyone… (up to a minute)" : "Save and place everyone"}</button>
            {!positions.approved && <button type="button" disabled={!!busy} onClick={() => void approve()} className="rounded bg-green-700 px-3 py-1 text-sm text-white hover:bg-green-800 disabled:opacity-50">{busy === "approve" ? "Approving…" : "Approve positions"}</button>}
          </div>
          {msg && <p className={`mt-1 text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
        </div>
      </div>
    </section>
  );
}
