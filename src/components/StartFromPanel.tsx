"use client";

// One flow for creating or changing a character or venue (D16):
//   picture or idea → copy the prompt → in ChatGPT, paste it with the picture →
//   paste the description and upload the image board here → Create.
// Create fills in and saves the fields, cuts the board and attaches the images in one go.
// With a GPT connection set up, "Describe with GPT" can write the description instead.

import { useRef, useState, type ReactNode } from "react";
import { CopyButton } from "./CopyButton";
import { SheetCutter, type Cutter } from "./SheetCutter";
import { ActionButton } from "./ActionButton";
import type { DescribeSource } from "@/lib/domain/describe";

export type CreateResult = { ok: boolean; text: string };

export interface StartFromPanelProps {
  what: "character" | "place";
  projectId: string;
  baseCode: string;
  canDescribe: boolean;
  promptFor: (source: DescribeSource, text: string, personality: string) => string;
  /** Fill in and save the fields from the reply, then attach the cut images. */
  onCreate: (reply: string, pieces: Blob[], board: File) => Promise<CreateResult>;
  /** Shown above the steps in picture mode (e.g. the consent choice); steps stay locked until gateOk. */
  gate?: ReactNode;
  gateOk?: boolean;
  /** Layout of the image board ChatGPT makes. */
  sheet: {
    cols: number;
    rows: number;
    labels: string[];
    minAspect?: number;
    /** Short follow-up to send in the same chat if ChatGPT only wrote the description. */
    prompt: string;
  };
  /** Enables "Change it": the images to attach so ChatGPT keeps everything else the same. */
  change?: { currentImages: { label: string; assetId: string }[] };
  /** Open the panel straight away (nothing has been created yet). */
  defaultOpen?: boolean;
  /** Only offer "Change it" (the item was created with the step-by-step builder). */
  changeOnly?: boolean;
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
  // The starting tab is chosen when the panel opens ("Change it" if there's something to change).
  const [chosen, setMode] = useState<DescribeSource>();
  // Open state is kept here, so the panel stays open after Create even though the item is no longer new.
  const [open, setOpen] = useState(!!p.defaultOpen);
  const mode: DescribeSource = p.changeOnly ? "change" : chosen ?? "image";
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
  const [report, setReport] = useState<CreateResult | null>(null);
  const [board, setBoard] = useState<File>();
  const cutter = useRef<Cutter | null>(null);

  const locked = mode === "image" && p.gateOk === false;
  const prompt = p.promptFor(mode, mode === "change" ? preparedChange : idea, mode === "change" ? "" : personality);
  // In "Change it", the later steps appear once the updated prompt has been created.
  const showSteps = mode !== "change" || !!preparedChange.trim();
  let step = 0;
  const n = () => `${++step}.`;
  const slug = p.what === "character" ? "character" : "place";
  const views = p.sheet.cols * p.sheet.rows;

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

  async function describe() {
    setBusy(true);
    setReport(null);
    try {
      const res = await fetch("/api/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, assetId: mode === "image" ? sourceId : mode === "change" ? p.change?.currentImages[0]?.assetId : undefined }) });
      const body = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !body.text) throw new Error(body.error ?? "Describe failed");
      setReply(body.text);
      return true;
    } catch (e) {
      setReport({ ok: false, text: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setReport(null);
    try {
      if (!reply.trim()) throw new Error("Paste ChatGPT's description first.");
      if (!board || !cutter.current) throw new Error(`Upload the image board (the ${views} views in one image) first.`);
      const pieces = await cutter.current();
      const r = await p.onCreate(reply, pieces, board);
      setReport(r);
      return r;
    } catch (e) {
      const r = { ok: false, text: e instanceof Error ? e.message : String(e) };
      setReport(r);
      return r;
    }
  }

  const tab = (m: DescribeSource, label: string) => (
    <button type="button" onClick={() => { setMode(m); setReport(null); }} data-testid={`tab-${m}`}
      className={`rounded-t-md px-3 py-1 text-sm ${mode === m ? "border border-b-0 border-neutral-300 bg-white font-semibold" : "text-blue-700 underline"}`}>{label}</button>
  );

  return (
    <details className="rounded-lg border border-blue-200 bg-blue-50/40 p-3" data-testid={`start-from-${slug}`} open={open}
      onToggle={(e) => { const o = e.currentTarget.open; setOpen(o); if (o && !chosen && !p.defaultOpen) setMode(p.change ? "change" : "image"); }}>
      <summary className="cursor-pointer text-sm font-semibold text-blue-900">{p.changeOnly ? "Need to change something?" : p.change ? "Change it, or start again from a picture or idea" : "Start from a picture or a one-line idea"}</summary>
      {p.changeOnly && <p className="mt-1 text-xs text-neutral-600">Changes the description and all {p.sheet.cols * p.sheet.rows} images together, so every later prompt stays in step.</p>}
      {!p.changeOnly && <div className="mt-2 flex gap-1">{p.change && tab("change", "Change it")}{tab("image", "From a picture")}{tab("idea", "From an idea")}</div>}
      <div className="space-y-3 rounded-b-md rounded-tr-md border border-neutral-300 bg-white p-3 text-sm">
        {mode === "image" && p.gate}
        {mode === "change" && (
          <div className="space-y-2">
            {!wantChange ? (
              <p className="mt-1 flex flex-wrap items-center gap-2">Is there anything you want to change?
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
                  onAction={() => { setPreparedChange(change); setReply(""); setBoard(undefined); setReport(null); }} resetKey={change} />
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
        <fieldset disabled={locked} className={`space-y-3 ${locked ? "opacity-40" : ""}`}>
          {showSteps && (<>
            {mode === "image" && (
              <div className="flex flex-wrap items-center gap-2">
                <span>{n()} Add your picture:</span>
                {sourceId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/assets/${sourceId}`} alt="Your picture" className="h-12 w-12 rounded object-cover" />
                )}
                <label className="cursor-pointer rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-50">
                  {sourceId ? "Change picture" : "Add picture"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-testid="start-upload"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
                </label>
                <span className="text-xs text-neutral-500">(kept with the project; you also attach it in ChatGPT)</span>
              </div>
            )}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span>{n()} Copy the prompt, then in a new ChatGPT chat paste it{mode === "image" ? " with your picture" : mode === "change" ? " with the current image" : ""}:</span>
                <CopyButton text={prompt} label={mode === "change" ? "Copy change prompt" : "Copy prompt"} />
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
              <p className="text-xs text-neutral-500">ChatGPT replies with a description and one image board showing the {views} views.</p>
            </div>
            <label className="block">{n()} Paste ChatGPT&apos;s description here
              <textarea className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs" rows={5} value={reply} onChange={(e) => setReply(e.target.value)} data-testid="start-reply" />
            </label>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span>{n()} Upload the image board:</span>
                <label className="cursor-pointer rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-50">
                  {board ? "Choose a different board" : "Upload image board"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-testid="sheet-upload"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setReport(null); setBoard(f); } }} />
                </label>
                <span className="text-xs text-neutral-500">No board? Send this in the same chat: <CopyButton text={p.sheet.prompt} label="Copy board request" /></span>
              </div>
              {board && <SheetCutter file={board} cols={p.sheet.cols} rows={p.sheet.rows} labels={p.sheet.labels} minAspect={p.sheet.minAspect} cutterRef={cutter} />}
            </div>
            <div>
              <ActionButton label="Create" busyLabel="Creating…" doneLabel="Created" testId="start-create" disabled={!reply.trim() || !board}
                onAction={create} resetKey={[reply, board?.name, board?.size, board?.lastModified]}
                title={!reply.trim() ? "Paste ChatGPT's description first" : !board ? "Upload the image board first" : ""} />
            </div>
          </>)}
        </fieldset>
        {report && <p className={`text-sm ${report.ok ? "text-green-700" : "text-red-700"}`} role="status">{report.text}</p>}
      </div>
    </details>
  );
}
