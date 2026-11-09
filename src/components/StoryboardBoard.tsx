"use client";

// The storyboard after the story is saved (D18a): one screen, in order.
//   1. Cameras: one click and the app chooses a camera for every panel (film grammar rules).
//   2. Pictures: one click draws every panel with GPT, using the chosen camera, the approved
//      characters and the venue view behind them. Or make each one in ChatGPT and upload it.
//   3. Need to change something? on any picture (words, plus an optional reference picture),
//      then approve each picture, or all of them at once.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { approvePanelAction, approvePanelsAction, chooseCamerasAction, setPanelImageAction } from "@/app/studioActions";
import { uploadBlob } from "@/lib/clientUpload";
import { imageChangePrompt } from "@/lib/domain/imagePrompts";
import { ActionButton, DoneBadge } from "./ActionButton";
import { ChangeRequest, type SubmittedChange } from "./ChangeRequest";

export interface BoardPanel {
  id: string;
  code: string;
  description: string;
  speaker?: string;
  line?: string;
  seconds: number;
  status: string;
  imageAssetId?: string;
  hasCamera: boolean;
  /** The GPT picture request, built from the camera, characters and venue. */
  prompt: string;
  attach: { label: string; assetId: string }[];
}

export interface StoryboardBoardProps {
  projectId: string;
  sceneId: string;
  designHref: string;
  baseCode: string;
  size: "portrait" | "landscape";
  canGenerate: boolean;
  panels: BoardPanel[];
}

/** OpenAI's error, said plainly, with what to do about it. */
export function plainReason(error: string): string {
  if (/safety|moderation|content[_ ]policy|rejected/i.test(error)) return "GPT's safety check refused the picture request. Use \"Edit the words on a panel\" to soften strong words (swearing, rude gestures, violence), then try again.";
  if (/\b(429|rate limit|quota|billing|insufficient)/i.test(error)) return "OpenAI says the account has hit a limit (credit or rate). Check the OpenAI billing page, wait a minute, then try again.";
  if (/\b(timeout|timed out|ETIMEDOUT|ECONNRESET|fetch failed|socket)/i.test(error)) return "The request to OpenAI timed out. Try again.";
  if (/\b(400)\b/.test(error)) return `OpenAI didn't accept the request: ${error.replace(/^.*?\(400\):\s*/, "").slice(0, 160)}`;
  return `GPT said: ${error.slice(0, 200)}`;
}

async function drawPicture(p: { projectId: string; baseCode: string; prompt: string; refs: string[]; size: "portrait" | "landscape" }) {
  const res = await fetch("/api/images/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: p.projectId, baseCode: p.baseCode, kind: "panel", prompt: p.prompt, refAssetIds: p.refs, size: p.size }),
  });
  const body = (await res.json()) as { id?: string; error?: string };
  if (!res.ok || !body.id) throw new Error(body.error ?? "GPT didn't return a picture.");
  return body.id;
}

/** The change request for one picture: the current picture first, then any reference pictures. */
function changeRequestFor(p: BoardPanel, ch: SubmittedChange) {
  const refNote = ch.refs.length
    ? `\nThe last ${ch.refs.length === 1 ? "attached picture is a reference" : `${ch.refs.length} attached pictures are references`} for: ${ch.refs.map((r) => r.for.toLowerCase()).join("; ")}. Use ${ch.refs.length === 1 ? "it" : "them"} only for that; faces and people come from the current picture.`
    : "";
  return {
    prompt: imageChangePrompt(ch.text, p.prompt) + refNote,
    refs: [p.imageAssetId!, ...p.attach.map((a) => a.assetId), ...ch.refs.map((r) => r.assetId)],
  };
}

function CopyButton({ text, label, testId }: { text: string; label: string; testId?: string }) {
  return <ActionButton label={label} busyLabel="Copying…" doneLabel="Copied" doneForMs={2500} testId={testId}
    onAction={async () => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }} />;
}

/** Make or change a picture in ChatGPT: copy the request, attach the listed pictures, upload the result. */
function ByHand({ p, prompt, attach, projectId, baseCode, onUploaded }: { p: BoardPanel; prompt: string; attach: { label: string; assetId: string }[]; projectId: string; baseCode: string; onUploaded: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 text-sm">
      <CopyButton text={prompt} label="Copy the picture request" testId={`hand-${p.code}-copy`} />
      {attach.length > 0 && (
        <p className="text-neutral-700">In ChatGPT, attach: {attach.map((a, i) => <span key={a.assetId}>{i > 0 && ", "}<a className="text-blue-700 underline" href={`/api/assets/${a.assetId}`} download>{a.label}</a></span>)}.</p>
      )}
      <label className="inline-block cursor-pointer rounded-md border border-blue-700 px-3 py-1.5 text-blue-700 hover:bg-blue-50">
        {busy ? "Uploading…" : "Upload the picture"}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy} data-testid={`hand-${p.code}-upload`}
          onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f) return;
            setError(""); setBusy(true);
            try {
              const id = await uploadBlob(projectId, `${baseCode}_${p.code}_PANEL`, "panel", f, f.name);
              const r = await setPanelImageAction(p.id, id);
              if (!r.ok) throw new Error(r.error);
              onUploaded();
            } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
          }} />
      </label>
      {error && <p className="text-red-700" role="alert">{error}</p>}
    </div>
  );
}

export function StoryboardBoard(b: StoryboardBoardProps) {
  const router = useRouter();
  const [drawing, setDrawing] = useState<Record<string, string>>({}); // panel id → "Drawing…" / "Redrawing…"
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [handChange, setHandChange] = useState<Record<string, SubmittedChange>>({});

  const camerasDone = b.panels.every((p) => p.hasCamera);
  const missing = b.panels.filter((p) => !p.imageAssetId);
  const withPictures = b.panels.filter((p) => p.imageAssetId);
  const toApprove = withPictures.filter((p) => p.status !== "approved");
  const allApproved = b.panels.length > 0 && b.panels.every((p) => p.status === "approved");
  const codeOf = (p: BoardPanel) => `${b.baseCode}_${p.code}_PANEL`;

  async function chooseCameras() {
    setMsg(null);
    const r = await chooseCamerasAction(b.sceneId);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return r; }
    const v = r.value!;
    setMsg({ ok: true, text: `The app chose a camera for ${v.chosen} panel${v.chosen === 1 ? "" : "s"}.${v.missing.length ? ` No good camera for ${v.missing.join(", ")}: check who is in frame.` : ""}` });
    router.refresh();
    return r;
  }

  async function drawAll(list: BoardPanel[] = missing, verb = "Drawing") {
    setMsg(null); setFailed({});
    let done = 0, bad = 0;
    const reasons = new Set<string>();
    for (const p of list) {
      setProgress(`${verb} ${done + bad + 1} of ${list.length}…`);
      setDrawing((x) => ({ ...x, [p.id]: `${verb}…` }));
      try {
        const id = await drawPicture({ projectId: b.projectId, baseCode: codeOf(p), prompt: p.prompt, refs: p.attach.map((a) => a.assetId), size: b.size });
        const r = await setPanelImageAction(p.id, id);
        if (!r.ok) throw new Error(r.error);
        done++;
      } catch (e) {
        bad++;
        const why = e instanceof Error ? e.message : String(e);
        reasons.add(plainReason(why));
        setFailed((x) => ({ ...x, [p.id]: why }));
      } finally {
        setDrawing((x) => { const y = { ...x }; delete y[p.id]; return y; });
      }
    }
    setProgress("");
    setMsg(bad ? { ok: false, text: `${done} picture${done === 1 ? "" : "s"} drawn; ${bad} failed. ${[...reasons].join(" ")} The reason is also shown under each panel.` } : { ok: true, text: `${done} picture${done === 1 ? "" : "s"} drawn.` });
    router.refresh();
    return bad === 0;
  }

  async function redraw(p: BoardPanel, ch: SubmittedChange) {
    if (!b.canGenerate) { setHandChange((x) => ({ ...x, [p.id]: ch })); return; }
    setFailed((x) => { const y = { ...x }; delete y[p.id]; return y; });
    setDrawing((x) => ({ ...x, [p.id]: "Redrawing…" }));
    try {
      const req = changeRequestFor(p, ch);
      const id = await drawPicture({ projectId: b.projectId, baseCode: codeOf(p), prompt: req.prompt, refs: req.refs, size: b.size });
      const r = await setPanelImageAction(p.id, id);
      if (!r.ok) throw new Error(r.error);
    } catch (e) {
      setFailed((x) => ({ ...x, [p.id]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setDrawing((x) => { const y = { ...x }; delete y[p.id]; return y; });
      router.refresh();
    }
  }

  const step = (n: number, title: string, done: boolean, body: React.ReactNode, testId: string) => (
    <div className={`rounded-xl border p-4 ${done ? "border-green-200 bg-green-50/40" : "border-neutral-200 bg-white"}`} data-testid={testId}>
      <p className="flex items-center gap-2 font-semibold">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs text-white ${done ? "bg-green-600" : "bg-blue-700"}`}>{done ? "✓" : n}</span>{title}
      </p>
      <div className="mt-2 text-sm">{body}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {step(1, "Cameras", camerasDone, camerasDone ? (
          <p>The app has chosen a camera for every panel. <Link className="text-blue-700 underline" href={b.designHref}>Review or change them</Link></p>
        ) : (
          <>
            <p className="mb-2 text-neutral-700">The app chooses each camera from the floor plan and film grammar, so the pictures match the real shots.</p>
            <ActionButton label="Let the app choose the cameras" busyLabel="Choosing…" doneLabel="Chosen" onAction={chooseCameras} testId="choose-cameras" />
          </>
        ), "step-cameras")}
        {step(2, "Pictures", missing.length === 0, missing.length === 0 ? (
          <>
            <p>Every panel has a picture.</p>
            {b.canGenerate && toApprove.length > 0 && (
              <div className="mt-2">
                <ActionButton label={`Redraw the ${toApprove.length} unapproved`} busyLabel={progress || "Redrawing…"} doneLabel="Redrawn" variant="secondary"
                  onAction={() => drawAll(toApprove, "Redrawing")} testId="redraw-unapproved" />
                <p className="mt-1 text-xs text-neutral-600">Uses the scene setting{b.panels.some((p) => p.status === "approved") ? " and your approved pictures for continuity" : ""}. About 5p each.</p>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mb-2 text-neutral-700">{withPictures.length} of {b.panels.length} done.{b.canGenerate ? ` About 4p each with GPT.` : " Make each one in ChatGPT using the steps on the panel."}</p>
            {b.canGenerate && (
              <ActionButton label={`Create ${missing.length} picture${missing.length === 1 ? "" : "s"} with GPT`} busyLabel={progress || "Drawing…"} doneLabel="Drawn"
                disabled={!camerasDone} title={camerasDone ? "" : "Let the app choose the cameras first"} onAction={() => drawAll()} testId="draw-all" />
            )}
            {!camerasDone && <p className="mt-1 text-xs text-amber-700">Choose the cameras first, so each picture matches its shot.</p>}
            {b.canGenerate && camerasDone && toApprove.length > 0 && (
              <div className="mt-2">
                <ActionButton label={`Redraw the ${toApprove.length} unapproved`} busyLabel={progress || "Redrawing…"} doneLabel="Redrawn" variant="secondary"
                  onAction={() => drawAll(toApprove, "Redrawing")} testId="redraw-unapproved" />
              </div>
            )}
          </>
        ), "step-pictures")}
        {step(3, "Approve", allApproved, allApproved ? <p>All pictures approved. <Link className="text-blue-700 underline" href={b.designHref.replace(/design$/, "animatic")}>Next: the animatic</Link></p> : (
          <>
            <p className="mb-2 text-neutral-700">{b.panels.filter((p) => p.status === "approved").length} of {b.panels.length} approved. Check each picture; change any that are wrong.</p>
            {toApprove.length > 0 && (
              <ActionButton variant="approve" label={`Approve ${toApprove.length === withPictures.length && missing.length === 0 ? "all" : toApprove.length} picture${toApprove.length === 1 ? "" : "s"}`} busyLabel="Approving…" doneLabel="Approved"
                onAction={async () => { const r = await approvePanelsAction(toApprove.map((p) => p.id)); router.refresh(); return r; }} testId="approve-all" />
            )}
          </>
        ), "step-approve")}
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`} role="status">{msg.text}</p>}

      <ol className={`grid gap-4 ${b.size === "portrait" ? "sm:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2"}`}>
        {b.panels.map((p, i) => (
          <li key={p.id} className="rounded-xl border border-neutral-200 bg-white p-3" data-testid={`board-${p.code}`}>
            <div className={`relative overflow-hidden rounded-lg bg-neutral-100 ${b.size === "portrait" ? "aspect-[2/3]" : "aspect-[3/2]"}`}>
              {p.imageAssetId
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/api/assets/${p.imageAssetId}`} alt={`Panel ${i + 1}`} className="h-full w-full object-cover" />
                : <span className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">No picture yet</span>}
              {drawing[p.id] && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-medium" data-testid={`board-${p.code}-drawing`}>{drawing[p.id]}</span>}
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="font-semibold">{i + 1}</span>
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">{p.seconds} s</span>
              {p.status === "approved" ? <DoneBadge text="Approved" /> : p.imageAssetId ? <span className="text-xs text-amber-700">to check</span> : null}
              {!p.hasCamera && <span className="text-xs text-amber-700">no camera yet</span>}
            </div>
            <p className="mt-1 text-sm">{p.line ? <><span className="font-medium">{p.speaker}:</span> {p.line}</> : <span className="text-neutral-500">Silent</span>}</p>
            <p className="mt-1 text-xs text-neutral-600">{p.description}</p>
            {failed[p.id] && <p className="mt-1 text-xs text-red-700" role="alert" data-testid={`board-${p.code}-failed`}>GPT couldn&apos;t draw this one. {plainReason(failed[p.id])}</p>}

            <div className="mt-3 space-y-2">
              {p.imageAssetId && p.status !== "approved" && (
                <ActionButton variant="approve" label="Approve" busyLabel="Approving…" doneLabel="Approved" testId={`board-${p.code}-approve`}
                  onAction={async () => { const r = await approvePanelAction(p.id); router.refresh(); return r; }} />
              )}
              {p.imageAssetId && (
                <ChangeRequest key={p.imageAssetId} what="panel" projectId={b.projectId} baseCode={codeOf(p)} onSubmit={(ch) => redraw(p, ch)} />
              )}
              {handChange[p.id] && (() => {
                const req = changeRequestFor(p, handChange[p.id]);
                return (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3" data-testid={`board-${p.code}-hand-change`}>
                    <p className="mb-2 text-sm font-medium">Make the change in ChatGPT</p>
                    <ByHand p={p} prompt={req.prompt} projectId={b.projectId} baseCode={b.baseCode}
                      attach={[{ label: "the current picture", assetId: p.imageAssetId! }, ...p.attach, ...handChange[p.id].refs.map((r) => ({ label: `reference: ${r.for.toLowerCase()}`, assetId: r.assetId }))]}
                      onUploaded={() => { setHandChange((x) => { const y = { ...x }; delete y[p.id]; return y; }); router.refresh(); }} />
                  </div>
                );
              })()}
              {!p.imageAssetId && (
                <details open={!b.canGenerate}>
                  <summary className="cursor-pointer text-sm text-blue-700">{b.canGenerate ? "Or make it in ChatGPT" : "Make it in ChatGPT"}</summary>
                  <div className="mt-2"><ByHand p={p} prompt={p.prompt} attach={p.attach} projectId={b.projectId} baseCode={b.baseCode} onUploaded={() => router.refresh()} /></div>
                </details>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
