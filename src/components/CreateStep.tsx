"use client";

// The last step, shared by new characters, new venues and changes (D16g):
//   copy the description prompt → paste it into ChatGPT (with the picture or current board) →
//   paste ChatGPT's reply and upload the image board here → Create.

import { useRef, useState, type ReactNode } from "react";
import { ActionButton } from "./ActionButton";
import { CopyButton } from "./CopyButton";
import { SheetCutter, type Cutter } from "./SheetCutter";

export interface CreateStepProps {
  /** Prefix for test ids: `${id}-reply`, `${id}-board`, `${id}-create`. */
  id: string;
  copyLabel: string;
  prompt: string;
  /** What to do in ChatGPT, shown beside the copy button. */
  instruction: ReactNode;
  sheet: { cols: number; rows: number; labels: (reply: string) => string[]; minAspect?: number; request: string };
  /** Save everything; return an error message, or nothing on success. */
  onCreate: (reply: string, pieces: Blob[], board: File) => Promise<string | void>;
  footer?: ReactNode;
}

const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs";

export function CreateStep(p: CreateStepProps) {
  const [reply, setReply] = useState("");
  const [board, setBoard] = useState<File>();
  const cutter = useRef<Cutter | null>(null);
  const [error, setError] = useState("");
  const views = p.sheet.cols * p.sheet.rows;

  async function create() {
    setError("");
    try {
      if (!board || !cutter.current) throw new Error("Upload the image board first.");
      const problem = await p.onCreate(reply, await cutter.current(), board);
      if (problem) throw new Error(problem);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <CopyButton text={p.prompt} label={p.copyLabel} />
        <span className="text-neutral-700">{p.instruction} ChatGPT replies with a written description and one image board showing the {views} views.</span>
      </div>
      <label className="block">Paste ChatGPT&apos;s reply here
        <textarea className={field} rows={6} value={reply} onChange={(e) => setReply(e.target.value)} data-testid={`${p.id}-reply`} />
      </label>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-50">
            {board ? "Choose a different image board" : "Upload the image board"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-testid={`${p.id}-board`}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setError(""); setBoard(f); } }} />
          </label>
          <span className="text-xs text-neutral-500">No image board? Send this in the same chat: <CopyButton text={p.sheet.request} label="Copy board request" /></span>
        </div>
        {board && <SheetCutter file={board} cols={p.sheet.cols} rows={p.sheet.rows} labels={p.sheet.labels(reply)} minAspect={p.sheet.minAspect} cutterRef={cutter} />}
      </div>
      <div className="flex items-center gap-3">
        {p.footer}
        <ActionButton label="Create" busyLabel="Creating…" doneLabel="Created" testId={`${p.id}-create`} disabled={!reply.trim() || !board}
          title={!reply.trim() ? "Paste ChatGPT's reply first" : !board ? "Upload the image board first" : ""}
          onAction={create} resetKey={[reply, board?.name, board?.lastModified]} />
      </div>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
