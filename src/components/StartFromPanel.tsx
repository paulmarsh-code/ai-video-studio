"use client";

// "Start from a picture or a one-line idea" (D16). Manual route: copy the prompt into
// ChatGPT with the picture, paste the reply back, and the fields fill in. With a GPT
// connection set up, "Describe with GPT" does the round trip in one click.

import { useState, type ReactNode } from "react";
import { CopyButton } from "./CopyButton";
import { SheetCutter } from "./SheetCutter";
import type { DescribeSource } from "@/lib/domain/describe";

export interface StartFromPanelProps {
  what: "character" | "place";
  projectId: string;
  baseCode: string;
  canDescribe: boolean;
  promptFor: (source: DescribeSource, idea: string) => string;
  /** Apply the reply to the form; returns a short report for the user. */
  onReply: (reply: string) => { ok: boolean; text: string };
  /** Shown above the steps in picture mode (e.g. the consent choice); steps stay locked until gateOk. */
  gate?: ReactNode;
  gateOk?: boolean;
  /** Step 4: upload the one-image reference sheet and cut it into views. */
  sheet?: {
    cols: number;
    rows: number;
    labels: string[];
    minAspect?: number;
    /** Short follow-up to send in the same chat if ChatGPT only wrote the description. */
    prompt: string;
    /** Why the sheet can't be used yet (e.g. save the views first). */
    blockedReason?: string;
    onPieces: (sheet: File, pieces: Blob[]) => Promise<{ ok: boolean; text: string }>;
  };
}

export function StartFromPanel(p: StartFromPanelProps) {
  const [mode, setMode] = useState<DescribeSource>("image");
  const [idea, setIdea] = useState("");
  const [sourceId, setSourceId] = useState<string>();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ ok: boolean; text: string } | null>(null);
  const [sheetFile, setSheetFile] = useState<File>();
  const [cutting, setCutting] = useState(false);

  async function cutDone(pieces: Blob[]) {
    if (!p.sheet || !sheetFile) return;
    setCutting(true);
    try {
      const r = await p.sheet.onPieces(sheetFile, pieces);
      setReport(r);
      if (r.ok) setSheetFile(undefined);
    } catch (e) {
      setReport({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setCutting(false);
    }
  }
  const locked = mode === "image" && p.gateOk === false;
  const prompt = p.promptFor(mode, idea);
  const slug = p.what === "character" ? "character" : "place";

  async function upload(file: File) {
    setReport(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("projectId", p.projectId);
    fd.set("baseCode", p.baseCode);
    fd.set("kind", "source-picture");
    const res = await fetch("/api/assets", { method: "POST", body: fd });
    const body = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !body.id) setReport({ ok: false, text: body.error ?? "Upload failed" });
    else setSourceId(body.id);
  }

  function apply(text: string) {
    if (!text.trim()) { setReport({ ok: false, text: "Paste ChatGPT's reply first." }); return; }
    setReport(p.onReply(text));
  }

  async function describe() {
    setBusy(true);
    setReport(null);
    try {
      const res = await fetch("/api/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, assetId: mode === "image" ? sourceId : undefined }) });
      const body = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !body.text) throw new Error(body.error ?? "Describe failed");
      setReply(body.text);
      apply(body.text);
    } catch (e) {
      setReport({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: DescribeSource, label: string) => (
    <button type="button" onClick={() => { setMode(m); setReport(null); }} data-testid={`tab-${m}`}
      className={`rounded-t-md px-3 py-1 text-sm ${mode === m ? "border border-b-0 border-neutral-300 bg-white font-semibold" : "text-blue-700 underline"}`}>{label}</button>
  );

  return (
    <details className="rounded-lg border border-blue-200 bg-blue-50/40 p-3" data-testid={`start-from-${slug}`}>
      <summary className="cursor-pointer text-sm font-semibold text-blue-900">Start from a picture or a one-line idea</summary>
      <p className="mt-1 text-xs text-neutral-600">No need to write a detailed description: the app gets ChatGPT to write one in the format it needs, and fills in the fields below for you to check.</p>
      <div className="mt-2 flex gap-1">{tab("image", "From a picture")}{tab("idea", "From an idea")}</div>
      <div className="space-y-2 rounded-b-md rounded-tr-md border border-neutral-300 bg-white p-3 text-sm">
        {mode === "image" && p.gate}
        {mode === "idea" && (
          <label className="block">Your idea in a sentence
            <input className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" value={idea} onChange={(e) => setIdea(e.target.value)} data-testid="start-idea"
              placeholder={p.what === "character" ? "e.g. a mid-20s 1960s-style PR exec, sharp and witty" : "e.g. a rooftop bar in London at dusk"} />
          </label>
        )}
        <fieldset disabled={locked} className={locked ? "opacity-40" : ""}>
          {mode === "image" && (
            <div className="flex flex-wrap items-center gap-2">
              <span>1. Your picture:</span>
              {sourceId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/assets/${sourceId}`} alt="Your picture" className="h-12 w-12 rounded object-cover" />
              )}
              <label className="cursor-pointer text-blue-700 underline">
                {sourceId ? "Change picture" : p.canDescribe ? "Upload it" : "Upload it here to keep it with the project (optional)"}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-testid="start-upload"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
              </label>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span>{mode === "image" ? "2." : "1."} Copy this prompt into a new ChatGPT chat{mode === "image" ? " and attach your picture" : ""}:</span>
            <CopyButton text={prompt} label="Copy describe prompt" />
            {p.canDescribe && (
              <button type="button" disabled={busy || (mode === "image" && !sourceId) || (mode === "idea" && !idea.trim())} onClick={() => void describe()}
                className="rounded-md border border-blue-700 px-3 py-1 text-sm text-blue-700 disabled:opacity-50">{busy ? "Describing…" : "Or: describe with GPT"}</button>
            )}
          </div>
          <details className="mt-1 text-xs"><summary className="cursor-pointer text-blue-700">See the prompt</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-2">{prompt}</pre></details>
          <label className="mt-2 block">{mode === "image" ? "3." : "2."} Paste ChatGPT&apos;s reply here
            <textarea className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs" rows={5} value={reply} onChange={(e) => setReply(e.target.value)} data-testid="start-reply" />
          </label>
          <button type="button" onClick={() => apply(reply)} className="mt-1 rounded-md bg-blue-700 px-3 py-1 text-sm text-white" data-testid="start-fill">Fill in the fields</button>
          {p.sheet && (
            <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3">
              <p>{mode === "image" ? "4." : "3."} Upload the reference sheet ChatGPT made ({p.sheet.cols * p.sheet.rows} views in one image). The app cuts it into {p.sheet.labels.join(", ")}.</p>
              <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">No sheet? If ChatGPT only wrote the description, send this in the same chat:
                <CopyButton text={p.sheet.prompt} label="Copy sheet request" /></p>
              {p.sheet.blockedReason ? (
                <p className="text-xs text-amber-700">{p.sheet.blockedReason}</p>
              ) : (
                <label className="inline-block cursor-pointer rounded-md bg-blue-700 px-3 py-1 text-sm text-white">
                  {sheetFile ? "Choose a different sheet" : "Upload sheet"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-testid="sheet-upload"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setReport(null); setSheetFile(f); } }} />
                </label>
              )}
              {sheetFile && !p.sheet.blockedReason && (
                <SheetCutter file={sheetFile} cols={p.sheet.cols} rows={p.sheet.rows} labels={p.sheet.labels} minAspect={p.sheet.minAspect} busy={cutting} onCut={(b) => void cutDone(b)} />
              )}
            </div>
          )}
        </fieldset>
        {report && <p className={`text-sm ${report.ok ? "text-green-700" : "text-red-700"}`} role="status">{report.text}</p>}
      </div>
    </details>
  );
}
