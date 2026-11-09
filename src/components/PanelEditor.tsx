"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addPanelAction, approvePanelAction, deletePanelAction, movePanelAction, updatePanelAction } from "@/app/studioActions";
import { countWords, deriveDuration } from "@/lib/domain/duration";
import { hasQuotes } from "@/lib/domain/text";
import { ActionButton, DoneBadge } from "./ActionButton";

export interface PanelEditorProps {
  panel?: { id: string; code: string; description: string; emotion: string; speakerId?: string; line?: string; durationSec: number; status: string; version: number; hasImage: boolean };
  sceneId: string;
  cast: { id: string; name: string }[];
  first?: boolean;
  last?: boolean;
  suggestedCode?: string;
}

export function PanelEditor({ panel, sceneId, cast, first, last, suggestedCode }: PanelEditorProps) {
  const router = useRouter();
  const initial = {
    code: panel?.code ?? suggestedCode ?? "", description: panel?.description ?? "", emotion: panel?.emotion ?? "",
    speakerId: panel?.speakerId ?? "", line: panel?.line ?? "", durationSec: panel?.durationSec ?? 4,
  };
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const lineDirty = f.line.trim() !== initial.line.trim() || f.speakerId !== initial.speakerId;
  const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm";
  const input = { code: f.code, description: f.description, emotion: f.emotion, speakerId: f.speakerId || undefined, line: f.line, durationSec: Number(f.durationSec) };

  // After a save the server may adjust values (e.g. clip length from the new line): reload the form.
  const [lastVersion, setLastVersion] = useState(panel?.version);
  if (panel && panel.version !== lastVersion) {
    setLastVersion(panel.version);
    setF(initial);
  }

  // When the suggested code for a new panel moves on (after adding one), start the form afresh.
  const [lastSuggested, setLastSuggested] = useState(suggestedCode);
  if (!panel && suggestedCode !== lastSuggested) {
    setLastSuggested(suggestedCode);
    setF({ ...initial, code: suggestedCode ?? "" });
  }

  const call = async (fn: () => Promise<{ ok: true; value?: unknown } | { ok: false; error: string }>, okText: (v: unknown) => string) => {
    const r = await fn();
    setMsg(r.ok ? { ok: true, text: okText(r.value) } : { ok: false, text: r.error });
    router.refresh();
    return r;
  };
  const act = (fn: Parameters<typeof call>[0], okText: Parameters<typeof call>[1]) => start(async () => { await call(fn, okText); });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        <label className="text-sm">Code<input className={field} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></label>
        <label className="text-sm">Emotion<input className={field} value={f.emotion} onChange={(e) => setF({ ...f, emotion: e.target.value })} placeholder="e.g. smug" /></label>
      </div>
      <label className="block text-sm">What happens
        <textarea className={field} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="panel-description" />
      </label>
      <div className="grid grid-cols-[9rem_1fr] gap-2">
        <label className="text-sm">Speaker
          <select className={field} value={f.speakerId} onChange={(e) => setF({ ...f, speakerId: e.target.value })} data-testid="panel-speaker">
            <option value="">No one (silent)</option>
            {cast.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Line <span className="text-neutral-500">(exact words, no quote marks)</span>
          <input className={field} value={f.line} disabled={!f.speakerId} onChange={(e) => setF({ ...f, line: e.target.value })} data-testid="panel-line" />
        </label>
      </div>
      {f.speakerId && f.line.trim() ? (
        <p className="text-xs text-neutral-600">{countWords(f.line)} words → clip length {deriveDuration(f.line)}s (one speaker per clip).</p>
      ) : (
        <label className="text-xs">Silent panel length
          <input type="number" min={3} max={15} className="ml-1 w-16 rounded border border-neutral-300 px-1 py-0.5" value={f.durationSec}
            onChange={(e) => setF({ ...f, durationSec: Number(e.target.value) })} />s
        </label>
      )}
      {hasQuotes(f.line) && <p className="text-xs text-red-700">Remove the quote marks from the line.</p>}
      {panel && lineDirty && <p className="text-xs text-amber-700">Changing the line updates the shot&apos;s locked dialogue and flags this panel in the animatic for a re-check.</p>}

      <div className="flex flex-wrap items-center gap-2">
        {panel ? (
          <>
            <ActionButton label="Save" busyLabel="Saving…" doneLabel="Saved" disabled={!dirty || pending} resetKey={f}
              onAction={() => call(() => updatePanelAction(panel.id, input), (v) => {
                const c = v as { dialogueChanged: boolean; animaticMarked: boolean };
                return c.dialogueChanged ? `Saved. Shot dialogue updated${c.animaticMarked ? "; animatic flagged for re-check" : ""}.` : "Saved.";
              })} />
            {panel.status === "approved" && !dirty ? <DoneBadge text="Approved" /> : (
              <ActionButton variant="approve" label="Approve" busyLabel="Approving…" doneLabel="Approved" resetKey={f}
                disabled={dirty || pending || !panel.hasImage} title={panel.hasImage ? "" : "Upload the panel image first"}
                onAction={() => call(() => approvePanelAction(panel.id), () => "Panel approved.")} />
            )}
            <button type="button" disabled={first || pending} className="rounded border border-neutral-300 px-2 py-1 text-sm disabled:opacity-40" aria-label="Move up"
              onClick={() => act(() => movePanelAction(panel.id, -1), () => "Moved up.")}>↑</button>
            <button type="button" disabled={last || pending} className="rounded border border-neutral-300 px-2 py-1 text-sm disabled:opacity-40" aria-label="Move down"
              onClick={() => act(() => movePanelAction(panel.id, 1), () => "Moved down.")}>↓</button>
            <button type="button" disabled={pending} className="text-xs text-red-700 underline"
              onClick={() => { if (window.confirm(`Delete panel ${panel.code} and its shot?`)) act(() => deletePanelAction(panel.id), () => "Deleted."); }}>Delete</button>
          </>
        ) : (
          <ActionButton label="Add panel" busyLabel="Adding…" doneLabel="Panel added" doneForMs={2500} disabled={pending || !f.code.trim() || !f.description.trim()}
            onAction={() => call(() => addPanelAction(sceneId, input), () => "Panel added above. Run Design shots to choose its camera.")} />
        )}
        {dirty && panel && <span className="text-xs text-amber-700">Unsaved changes</span>}
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`} role="status">{msg.text}</p>}
    </div>
  );
}
