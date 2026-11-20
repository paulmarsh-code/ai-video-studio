"use client";

// Make the clips (D113): link each character, the venue and each key prop to its Kling Element,
// then copy each clip's request into Kling (Omni-Ref, multi-shot).

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClipJobsAction, requestElementsAction, reviewClipAction, setClipPictureAction, setKlingElementAction } from "@/app/studioActions";
import type { Clip, KlingElement } from "@/lib/domain/clips";
import type { KlingListed } from "@/lib/klingList";
import type { ClipPictureIssues, PictureChoice, SceneClipsView } from "@/lib/sceneClips";
import { ClipFrames, ClipMoments } from "./ClipFrames";
import type { KlingJob } from "@/lib/klingJobs";
import { ofProject } from "@/lib/klingNames";

type Row = { key: string; what: string; kind: string; element?: KlingElement; voice?: KlingElement };
/** Whether the app can make a row's Element from its own pictures, and how the request stands (D127). */
type Making = Record<string, { pictures: number; status?: "ready" | "sent" | "done" | "failed"; error?: string }>;
const MAKING: Record<string, string> = { ready: "waiting for Claude", sent: "being made in Kling", done: "made from the app's pictures", failed: "couldn't be made" };

function ElementRow({ projectId, projectCode, sceneId, row, list, making }: { projectId: string; projectCode: string; sceneId: string; row: Row; list: KlingListed[]; making?: Making[string] }) {
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
  const make = async () => {
    setBusy(true); setError("");
    const r = await requestElementsAction(sceneId, [row.key]);
    setBusy(false);
    if (!r.ok) setError(r.error); else router.refresh();
  };
  return (
    <tr className="border-t border-neutral-100">
      <td className="py-1 pr-2 text-xs text-neutral-500">{row.kind}</td>
      <td className="py-1 pr-3 font-medium">{row.what}</td>
      <td className="py-1 pr-2">
        <select value={current} disabled={busy} onChange={(e) => void pick(e.target.value)} className="w-64 rounded border border-neutral-300 bg-white px-2 py-1 text-sm">
          <option value="">{row.element && !current ? `${row.element.name} (not in the list)` : "— none —"}</option>
          {/* This project's Elements first, by the code their names start with (D128). */}
          <optgroup label={`This project (${projectCode})`}>{list.filter((e) => ofProject(e.name, projectCode)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>
          <optgroup label="Other projects and unsorted">{list.filter((e) => !ofProject(e.name, projectCode)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>
        </select>
      </td>
      <td className="py-1">
        {busy ? <span className="text-xs text-neutral-500">Saving…</span> : row.element ? <span className="text-xs text-green-700">linked</span> : <span className="text-xs text-amber-700">no Element</span>}
        {making?.status && <span className={`ml-2 text-xs ${making.status === "failed" ? "text-red-700" : "text-blue-800"}`}>{MAKING[making.status]}{making.error ? `: ${making.error}` : ""}</span>}
        {error && <span className="ml-2 text-xs text-red-700">{error}</span>}
      </td>
      <td className="py-1 pl-2 text-xs">
        {/* The character's voice (D146): a few seconds of them speaking, sent with every clip they speak in. */}
        {row.kind === "Character" && (
          <span className="mr-3" data-testid={`voice-${row.key}`}>
            Voice: {row.voice ? <span className="text-green-700">{row.voice.name}</span> : <span className="text-amber-700">none</span>}{" "}
            {/* D177: the voice belongs in the Element; until it's remade, the clip sends it as a separate file. */}
            {/* D183: voices go as files with each clip, not inside Elements. */}
            <label className="cursor-pointer text-blue-700 underline">{row.voice ? "change" : "add a voice sample"}
              <input type="file" accept="audio/*,video/mp4,video/quicktime" className="hidden" disabled={busy} onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (!f) return;
                setBusy(true); setError("");
                const form = new FormData(); form.append("file", f);
                const res = await fetch(`/api/voice/${projectId}/${encodeURIComponent(row.key.slice(5))}`, { method: "POST", body: form });
                const body = (await res.json()) as { ok?: boolean; error?: string };
                setBusy(false);
                if (!res.ok || !body.ok) setError(body.error ?? "The voice couldn't be saved."); else router.refresh();
              }} />
            </label>
          </span>
        )}
        {making && making.status !== "ready" && making.status !== "sent" && (
          <button type="button" disabled={busy} onClick={() => void make()} className="text-xs text-blue-700 underline disabled:opacity-50">
            {row.element ? "Make again from the app's pictures" : "Make from the app's pictures"}
          </button>
        )}
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

/** The clip's last moment as a picture (D139), for the next clip to follow on from. */
async function lastFrame(url: string): Promise<{ video: Blob; frame: Blob; atSec: number }> {
  const video = await (await fetch(url)).blob();
  const src = URL.createObjectURL(video);
  try {
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.src = src;
    await new Promise<void>((ok, no) => { v.onloadedmetadata = () => ok(); v.onerror = () => no(new Error("The clip couldn't be read.")); });
    const atSec = Math.max(0, v.duration - 0.1);
    await new Promise<void>((ok) => { v.onseeked = () => ok(); v.currentTime = atSec; });
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    const frame = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("The frame couldn't be taken."))), "image/png"));
    return { video, frame, atSec };
  } finally { URL.revokeObjectURL(src); }
}

/** Frames from the clip as it plays (D144): about one a second, at most 12, for the app's review. */
async function clipFrames(url: string): Promise<{ times: number[]; frames: Blob[] }> {
  const v = document.createElement("video");
  v.muted = true; v.preload = "auto"; v.src = url;
  await new Promise<void>((ok, no) => { v.onloadedmetadata = () => ok(); v.onerror = () => no(new Error("The clip couldn't be read.")); });
  const step = Math.max(0.75, v.duration / 12);
  const times: number[] = [], frames: Blob[] = [];
  const c = document.createElement("canvas");
  for (let t = 0.2; t < v.duration - 0.05; t += step) {
    await new Promise<void>((ok) => { v.onseeked = () => ok(); v.currentTime = t; });
    c.width = Math.round(v.videoWidth / 2); c.height = Math.round(v.videoHeight / 2);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    frames.push(await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("A frame couldn't be taken."))), "image/jpeg", 0.85)));
    times.push(+t.toFixed(2));
  }
  return { times, frames };
}

/** The app's own review of a take (D144): heard and looked at, with one change ready to use. */
function AppReview({ job, onUse }: { job: KlingJob; onUse: (change: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const url = job.localFile ? `/api/kling-clip/${encodeURIComponent(job.localFile)}` : undefined;
  const r = job.aiReview && job.aiReview.take === job.localFile ? job.aiReview : undefined;
  const asked = useRef(false);
  const run = async () => {
    if (!url) return;
    setBusy(true); setErr("");
    try {
      const { times, frames } = await clipFrames(url);
      const form = new FormData();
      form.append("id", job.id); form.append("times", JSON.stringify(times));
      frames.forEach((f, k) => form.append("frame", new File([f], `frame_${k}.jpg`, { type: "image/jpeg" })));
      const res = await fetch("/api/clip-review", { method: "POST", body: form });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "The review didn't work.");
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  // Reviewed by itself as soon as the take is here, once.
  useEffect(() => { if (!r && url && !asked.current) { asked.current = true; void run(); } }, [r, url]); // eslint-disable-line react-hooks/exhaustive-deps
  if (busy) return <p className="mt-2 text-sm text-blue-800">Reviewing the take: listening to the line and checking each shot against its picture…</p>;
  if (err) return <p className="mt-2 text-sm text-red-700">{err} <button type="button" className="underline" onClick={() => void run()}>Try again</button></p>;
  if (!r) return null;
  return (
    <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-2 text-sm" data-testid={`clip-ai-review-${job.clip}`}>
      <p><span className={`mr-2 rounded px-2 py-0.5 text-xs font-semibold ${r.verdict === "approve" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>{r.verdict === "approve" ? "Looks right" : "Worth changing"}</span>{r.summary}</p>
      {r.good.length > 0 && <ul className="mt-1 list-disc pl-5 text-green-800">{r.good.map((g, k) => <li key={k}>{g}</li>)}</ul>}
      {r.problems.length > 0 && <ul className="mt-1 list-disc pl-5 text-amber-900">{r.problems.map((p, k) => <li key={k}>{p.shot ? `Shot ${p.shot}: ` : ""}{p.what}</li>)}</ul>}
      {r.speech.some((x) => x.notes.length) && <ul className="mt-1 list-disc pl-5 text-neutral-700">{r.speech.filter((x) => x.notes.length).map((x) => <li key={x.shot}>Sound, shot {x.shot}: {x.notes.join("; ")}</li>)}</ul>}
      {r.change && (
        <p className="mt-2"><span className="font-medium">Suggested change:</span> {r.change}{" "}
          <button type="button" className="rounded border border-blue-700 px-2 py-0.5 text-xs text-blue-800 hover:bg-blue-50" data-testid={`clip-use-change-${job.clip}`} onClick={() => onUse(r.change)}>Use this change</button></p>
      )}
      <button type="button" className="mt-1 text-xs text-neutral-600 underline" onClick={() => void run()}>Review again</button>
    </div>
  );
}

/**
 * A made clip, reviewed like a storyboard frame (D139): approve it (it becomes a kept take and the
 * next clip follows on from its last moment), say what should change, or make it again.
 */
function ClipReview({ sceneId, job, from, to }: { sceneId: string; job: KlingJob; from: number; to: number }) {
  const router = useRouter();
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const url = job.localFile ? `/api/kling-clip/${encodeURIComponent(job.localFile)}` : undefined;
  const decide = async (d: "approved" | "change" | "again") => {
    setErr(""); setBusy(d);
    try {
      if (d === "approved") {
        if (!url) throw new Error("The clip isn't saved on this computer yet.");
        const { video, frame, atSec } = await lastFrame(url);
        const form = new FormData();
        form.append("video", new File([video], job.localFile!, { type: "video/mp4" }));
        form.append("frame", new File([frame], "frame.png", { type: "image/png" }));
        form.append("from", String(from)); form.append("to", String(to)); form.append("atSec", String(atSec));
        const res = await fetch(`/api/kept/${sceneId}`, { method: "POST", body: form });
        const r = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !r.ok) throw new Error(r.error ?? "The take couldn't be kept.");
      }
      const r = await reviewClipAction(job.id, d, d === "change" ? words : undefined);
      if (!r.ok) throw new Error(r.error);
      setWords("");
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  };
  return (
    <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2" data-testid={`clip-review-${job.clip}`}>
      {url ? <video src={url} controls className="max-h-96 rounded border border-neutral-200" /> : job.videoUrl && <a className="text-sm underline" href={job.videoUrl} target="_blank" rel="noreferrer">Watch (the link lasts 24 hours)</a>}
      <AppReview job={job} onUse={(c) => setWords(c)} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={!!busy || !url} onClick={() => void decide("approved")} data-testid={`clip-approve-${job.clip}`}
          className="rounded bg-green-700 px-3 py-1 text-sm text-white hover:bg-green-800 disabled:opacity-50">{busy === "approved" ? "Keeping…" : "Approve: keep it"}</button>
        <span className="text-xs text-neutral-600">The next clip then follows on from its last moment.</span>
      </div>
      <label className="mt-2 block text-sm font-medium">Change it
        <textarea rows={2} value={words} onChange={(e) => setWords(e.target.value)} data-testid={`clip-words-${job.clip}`}
          placeholder="e.g. she shouldn't smile at the end · Chase drops it in the ice bucket, not on the table · slower, more menace in his voice"
          className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm font-normal" />
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <button type="button" disabled={!!busy || !words.trim()} onClick={() => void decide("change")} data-testid={`clip-change-${job.clip}`}
          className="rounded bg-blue-700 px-3 py-1 text-sm text-white hover:bg-blue-800 disabled:opacity-50">{busy === "change" ? "Asking…" : `Make it with this change · about ${job.credits} credits`}</button>
        <button type="button" disabled={!!busy} onClick={() => void decide("again")} data-testid={`clip-again-${job.clip}`}
          className="rounded border border-neutral-300 bg-white px-3 py-1 text-sm hover:bg-neutral-50 disabled:opacity-50">{busy === "again" ? "Asking…" : `Make it again as it is · about ${job.credits} credits`}</button>
      </div>
      {err && <p className="mt-1 text-sm text-red-700">{err}</p>}
    </div>
  );
}

export function ClipsBoard({ projectId, projectCode, sceneId, rows, clips, list, pictures, jobs, making, issues = [], frameRequests = [], editors = {}, cast = [], aspect = "9:16" }: { projectId: string; projectCode: string; sceneId: string; rows: Row[]; clips: Clip[]; issues?: ClipPictureIssues[]; frameRequests?: SceneClipsView["frameRequests"]; editors?: SceneClipsView["editors"]; cast?: { id: string; name: string }[]; aspect?: "9:16" | "16:9"; list: { elements: KlingListed[]; updatedAt?: string }; pictures: PictureChoice[]; jobs: KlingJob[]; making: Making }) {
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
  const active = jobs.some((j) => j.status === "ready" || j.status === "sent") || Object.values(making).some((m) => m.status === "ready" || m.status === "sent");
  const missingEls = rows.filter((r) => !r.element && making[r.key] && !making[r.key].status);
  const makeMissing = async () => {
    setNote("");
    const r = await requestElementsAction(sceneId);
    if (!r.ok) { setNote(r.error); return; }
    setNote(`${r.value?.count} Element${r.value?.count === 1 ? "" : "s"} ready to make from the app's pictures. Now tell Claude in the chat: "make the elements".`);
    router.refresh();
  };
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
        <p className="text-sm text-neutral-600">Each character, the venue and each key prop is one Kling Element, the same in every clip. The app can have Claude make them from its own approved pictures (the same ones the storyboard is drawn from); one you made yourself in Kling can be picked from the list.</p>
        {missingEls.length > 0 && <button type="button" onClick={() => void makeMissing()} className="mt-2 rounded bg-blue-700 px-3 py-1 text-sm text-white hover:bg-blue-800">Make the {missingEls.length} missing Element{missingEls.length === 1 ? "" : "s"} from the app&apos;s pictures</button>}
        <p className="text-xs text-neutral-500">{list.elements.length ? `Your Kling Elements as of ${list.updatedAt ? new Date(list.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "the last refresh"}. Made a new one? Ask Claude to refresh your Kling Elements.` : "No list of your Kling Elements yet: ask Claude to refresh your Kling Elements."}</p>
        <table className="mt-2 text-sm"><tbody>{rows.map((r) => <ElementRow key={r.key} projectId={projectId} projectCode={projectCode} sceneId={sceneId} row={r} list={list.elements} making={making[r.key]} />)}</tbody></table>
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
          &ldquo;Create&rdquo; hands a clip to Claude with its Elements, its pictures in order and its request; then tell Claude &ldquo;make the clips&rdquo; and it makes them in Kling (Omni-Ref, model 4.0, 720p, sound on) and shows each result here. About {total} credits for the whole scene (10 a second). Each clip opens on its approved start frame and Kling chooses the camera shots. You can still copy a request into the Kling app yourself.
        </p>
        <div className="mt-3 space-y-4">
          {clips.map((c, k) => (
            <div key={k} className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">Clip {k + 1}: panels {c.panels.join(", ")} · {c.seconds} s · about {c.credits} credits{c.continues && <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs font-normal text-green-800">carries on from the kept take of panels {c.continues.from}–{c.continues.to}</span>}</h3>
                <div className="flex flex-wrap gap-2">
                  <Copy text={api ? c.prompt : c.webPrompt} label="Copy the request" />
                  {/* One click, one request (D143): while a clip waits or is being made the button says
                      so and can't be pressed; a made clip is redone from its review below, and Create
                      shows again only when the request itself has changed (a line rewritten). */}
                  {(() => {
                    const j = jobOf(c);
                    const waiting = j && (j.status === "ready" || j.status === "sent");
                    const changed = j && (j.basePrompt ?? j.prompt) !== c.prompt;
                    if (waiting) return <button type="button" disabled className="rounded bg-neutral-300 px-3 py-1 text-sm text-neutral-700">{j.status === "sent" ? "Being made in Kling…" : "Waiting for Claude: say \u201cmake the clips\u201d"}</button>;
                    if (j && j.status === "done" && !changed) return null;
                    // Nothing is spent until the start frame is approved (D164).
                    if (!c.start?.approved) return <button type="button" disabled className="rounded bg-neutral-300 px-3 py-1 text-sm text-neutral-700">{c.start ? "Approve the start frame below first" : "Make the start frame below first"}</button>;
                    return <button type="button" disabled={busy !== null} onClick={() => void create(k + 1)} className="rounded bg-blue-700 px-3 py-1 text-sm text-white hover:bg-blue-800 disabled:opacity-50">{busy === k + 1 ? "Creating…" : j ? "Create again: the request has changed" : "Create this clip"}</button>;
                  })()}
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
                    {j.localFile ? <> · <a className="underline" href={`/api/kling-clip/${encodeURIComponent(j.localFile)}`} target="_blank" rel="noreferrer">watch</a> (saved in data/clips/{j.localFile})</>
                      : j.videoUrl && <> · <a className="underline" href={j.videoUrl} target="_blank" rel="noreferrer">watch or download</a> (the link lasts 24 hours)</>}
                  </p>
                );
              })()}
              {(() => {
                const j = jobOf(c);
                if (!j) return null;
                const from = Math.min(...c.panels), to = Math.max(...c.panels);
                return (
                  <>
                    {j.review && j.status !== "done" && <p className="mt-1 text-sm text-blue-800">{j.review.status === "change" ? `New take asked for, with: ${j.review.words}.` : "New take asked for."} Tell Claude in the chat: &ldquo;make the clips&rdquo;.</p>}
                    {j.status === "done" && (j.localFile || j.videoUrl) && <ClipReview sceneId={sceneId} job={j} from={from} to={to} />}
                    {!!j.takes?.length && <p className="mt-1 text-xs text-neutral-600">Earlier takes: {j.takes.map((t, i) => <span key={i}>{i > 0 && " · "}{t.localFile ? <a className="underline" href={`/api/kling-clip/${encodeURIComponent(t.localFile)}`} target="_blank" rel="noreferrer">take {i + 1}</a> : `take ${i + 1}`}{t.change ? ` (${t.change})` : ""}</span>)}</p>}
                  </>
                );
              })()}
              <p className="mt-1 text-sm text-neutral-600">Elements: {c.elements.length ? c.elements.map((e) => e.name).join(", ") : "none linked yet"}. Kling chooses the camera shots from the start frame and what happens.</p>
              {frameRequests[k] && <ClipFrames projectId={projectId} sceneId={sceneId} clip={c} clipKey={c.panels.join("-")} requests={frameRequests[k]} aspect={aspect} />}
              <ClipMoments sceneId={sceneId} panels={c.panels} editors={editors} cast={cast} />
              {c.missing.length > 0 && <p className="mt-1 text-sm text-amber-800">No Element for {c.missing.join(", ")}: drawn from the words alone, so {c.missing.length === 1 ? "it" : "they"} may not match from clip to clip.</p>}
              <pre className="mt-2 whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs text-neutral-800">{api ? c.prompt : c.webPrompt}</pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
