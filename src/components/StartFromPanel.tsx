"use client";

// "Start from a picture or a one-line idea" (D16). Manual route: copy the prompt into
// ChatGPT with the picture, paste the reply back, and the fields fill in. With a GPT
// connection set up, "Describe with GPT" does the round trip in one click.

import { useState, type ReactNode } from "react";
import { CopyButton } from "./CopyButton";
import { SheetCutter } from "./SheetCutter";
import { ActionButton } from "./ActionButton";
import type { DescribeSource } from "@/lib/domain/describe";

export interface StartFromPanelProps {
  what: "character" | "place";
  projectId: string;
  baseCode: string;
  canDescribe: boolean;
  promptFor: (source: DescribeSource, text: string, personality: string) => string;
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
  /** Enables "Change it": the images to attach so ChatGPT keeps everything else the same. */
  change?: { currentImages: { label: string; assetId: string }[] };
}

const CHANGE_QUESTIONS = {
  character: [
    { key: "look", label: "How they look?", short: "How they look", hint: "e.g. shoulder-length hair; a short beard; looks a bit older" },
    { key: "wear", label: "What they're wearing?", short: "What they wear", hint: "e.g. a lilac dress instead of orange; swap the satchel for a small black clutch" },
    { key: "personality", label: "Personality or mannerisms?", short: "Personality and mannerisms", hint: "e.g. more nervous and fidgety; dry, deadpan humour" },
    { key: "other", label: "Anything else?", short: "Also", hint: "e.g. a warmer smile; standing straighter" },
  ],
  place: [
    { key: "place", label: "The place itself?", short: "The place", hint: "e.g. replace the sofas with high bar stools; add plants along the windows" },
    { key: "light", label: "Light and time of day?", short: "Light and time of day", hint: "e.g. night-time with warm lamps; brighter daylight" },
    { key: "other", label: "Anything else?", short: "Also", hint: "e.g. make the screen wall bigger" },
  ],
} as const;

export function StartFromPanel(p: StartFromPanelProps) {
  // The starting tab is chosen when the panel is opened ("Change it" if there's something to
  // change), so filling in the fields never switches tabs under the user.
  const [chosen, setMode] = useState<DescribeSource>();
  const mode: DescribeSource = chosen ?? "image";
  // "Change it" asks guided questions; the answers are combined into one change request.
  const [wantChange, setWantChange] = useState(false);
  const [parts, setParts] = useState<Record<string, string>>({});
  const questions = CHANGE_QUESTIONS[p.what];
  const change = questions.filter((q) => parts[q.key]?.trim()).map((q) => `${q.short}: ${parts[q.key].trim().replace(/[.]$/, "")}`).join(". ");
  const [preparedChange, setPreparedChange] = useState("");
  const [idea, setIdea] = useState("");
  const [personality, setPersonality] = useState("");
  const [sourceId, setSourceId] = useState<string>();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ ok: boolean; text: string } | null>(null);
  const [sheetFile, setSheetFile] = useState<File>();
  const [cutting, setCutting] = useState(false);

  async function cutDone(pieces: Blob[]) {
    if (!p.sheet || !sheetFile) return { ok: false };
    setCutting(true);
    try {
      const r = await p.sheet.onPieces(sheetFile, pieces);
      setReport(r);
      return r;
    } catch (e) {
      setReport({ ok: false, text: e instanceof Error ? e.message : String(e) });
      return { ok: false };
    } finally {
      setCutting(false);
    }
  }
  const locked = mode === "image" && p.gateOk === false;
  const prompt = p.promptFor(mode, mode === "change" ? preparedChange : idea, mode === "change" ? "" : personality);
  // In "Change it", the later steps appear once the updated prompt has been created.
  const showSteps = mode !== "change" || !!preparedChange.trim();
  let step = 0;
  const n = () => `${++step}.`;
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
    if (!text.trim()) { const r = { ok: false, text: "Paste ChatGPT's reply first." }; setReport(r); return r; }
    const r = p.onReply(text);
    setReport(r);
    return r;
  }

  async function describe() {
    setBusy(true);
    setReport(null);
    try {
      const res = await fetch("/api/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, assetId: mode === "image" ? sourceId : mode === "change" ? p.change?.currentImages[0]?.assetId : undefined }) });
      const body = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !body.text) throw new Error(body.error ?? "Describe failed");
      setReply(body.text);
      return apply(body.text);
    } catch (e) {
      setReport({ ok: false, text: e instanceof Error ? e.message : String(e) });
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: DescribeSource, label: string) => (
    <button type="button" onClick={() => { setMode(m); setReport(null); }} data-testid={`tab-${m}`}
      className={`rounded-t-md px-3 py-1 text-sm ${mode === m ? "border border-b-0 border-neutral-300 bg-white font-semibold" : "text-blue-700 underline"}`}>{label}</button>
  );

  return (
    <details className="rounded-lg border border-blue-200 bg-blue-50/40 p-3" data-testid={`start-from-${slug}`}
      onToggle={(e) => { if (e.currentTarget.open && !chosen) setMode(p.change ? "change" : "image"); }}>
      <summary className="cursor-pointer text-sm font-semibold text-blue-900">{p.change ? "Change it, or start again from a picture or idea" : "Start from a picture or a one-line idea"}</summary>
      <p className="mt-1 text-xs text-neutral-600">No need to write a detailed description: the app gets ChatGPT to write one in the format it needs, and fills in the fields below for you to check.</p>
      <div className="mt-2 flex gap-1">{p.change && tab("change", "Change it")}{tab("image", "From a picture")}{tab("idea", "From an idea")}</div>
      <div className="space-y-2 rounded-b-md rounded-tr-md border border-neutral-300 bg-white p-3 text-sm">
        {mode === "image" && p.gate}
        {mode === "change" && (
          <div className="space-y-2">
            {!wantChange ? (
              <p className="flex flex-wrap items-center gap-2">Is there anything you want to change?
                <button type="button" onClick={() => setWantChange(true)} data-testid="change-yes"
                  className="rounded-md bg-blue-700 px-3 py-1 text-sm text-white hover:bg-blue-800">Yes</button></p>
            ) : (
              <>
                <p>{n()} Fill in only what should change. Everything else stays the same.</p>
                {questions.map((q) => (
                  <label key={q.key} className="block">{q.label}
                    <input className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" value={parts[q.key] ?? ""} placeholder={q.hint}
                      data-testid={`change-${q.key}`} onChange={(e) => setParts((x) => ({ ...x, [q.key]: e.target.value }))} />
                  </label>
                ))}
                <ActionButton label="Create updated prompt" doneLabel="Prompt updated" testId="change-create" disabled={!change}
                  onAction={() => { setPreparedChange(change); setReply(""); setReport(null); }} resetKey={change} />
              </>
            )}
          </div>
        )}
        {mode === "idea" && (
          <label className="block">Your idea in a sentence
            <input className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" value={idea} onChange={(e) => setIdea(e.target.value)} data-testid="start-idea"
              placeholder={p.what === "character" ? "e.g. a mid-20s 1960s-style PR exec, sharp and witty" : "e.g. a rooftop bar in London at dusk"} />
          </label>
        )}
        {p.what === "character" && mode !== "change" && (
          <label className="block">Personality and mannerisms <span className="text-neutral-500">(a picture can&apos;t show this; optional but recommended)</span>
            <input className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" value={personality} onChange={(e) => setPersonality(e.target.value)} data-testid="start-personality"
              placeholder="e.g. confident and a little smug; quick-witted; talks with her hands" />
          </label>
        )}
        <fieldset disabled={locked} className={locked ? "opacity-40" : ""}>
          {showSteps && mode === "image" && (
            <div className="flex flex-wrap items-center gap-2">
              <span>{n()} Your picture:</span>
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
          {showSteps && (<>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span>{n()} Copy this prompt into a new ChatGPT chat{mode === "image" ? " and attach your picture" : mode === "change" ? " and attach the current image" : ""}:</span>
            <CopyButton text={prompt} label={mode === "change" ? "Copy change prompt" : "Copy describe prompt"} />
            {p.canDescribe && (
              <ActionButton variant="secondary" label="Or: describe with GPT" busyLabel="Describing…" doneLabel="Described"
                disabled={busy || (mode === "image" && !sourceId) || (mode === "idea" && !idea.trim())}
                onAction={describe} resetKey={[mode, idea, sourceId, preparedChange, personality]} />
            )}
          </div>
          {mode === "change" && !!p.change?.currentImages.length && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">Current image to attach:
              {p.change.currentImages.map((a) => (
                <a key={a.assetId} className="flex items-center gap-1 text-blue-700 underline" href={`/api/assets/${a.assetId}`} download>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${a.assetId}`} alt="" className="h-10 w-7 rounded object-cover" />Download {a.label}
                </a>
              ))}
            </p>
          )}
          <details className="mt-1 text-xs"><summary className="cursor-pointer text-blue-700">See the prompt</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-2">{prompt}</pre></details>
          <label className="mt-2 block">{n()} Paste ChatGPT&apos;s reply here
            <textarea className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs" rows={5} value={reply} onChange={(e) => setReply(e.target.value)} data-testid="start-reply" />
          </label>
          <div className="mt-1"><ActionButton label="Fill in the fields" doneLabel="Fields filled in" testId="start-fill" disabled={locked}
            onAction={() => apply(reply)} resetKey={reply} /></div>
          {p.sheet && (
            <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3">
              <p>{n()} Upload the reference sheet ChatGPT made ({p.sheet.cols * p.sheet.rows} views in one image). The app cuts it into {p.sheet.labels.join(", ")}.</p>
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
                <SheetCutter file={sheetFile} cols={p.sheet.cols} rows={p.sheet.rows} labels={p.sheet.labels} minAspect={p.sheet.minAspect} busy={cutting} onCut={cutDone} />
              )}
            </div>
          )}
          </>)}
        </fieldset>
        {report && <p className={`text-sm ${report.ok ? "text-green-700" : "text-red-700"}`} role="status">{report.text}</p>}
      </div>
    </details>
  );
}
