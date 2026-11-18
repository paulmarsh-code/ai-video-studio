"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addPanelAction, approvePanelAction, deletePanelAction, movePanelAction, setDeliveryAction, updatePanelAction } from "@/app/studioActions";
import { countWords, deriveDuration } from "@/lib/domain/duration";
import { hasQuotes } from "@/lib/domain/text";
import { ActionButton, DoneBadge } from "./ActionButton";
import { WordsHelp } from "./WordsHelp";

export interface PanelEditorProps {
  panel?: { id: string; code: string; description: string; emotion: string; speakerId?: string; line?: string; durationSec: number; status: string; version: number; hasImage: boolean };
  sceneId: string;
  cast: { id: string; name: string }[];
  first?: boolean;
  last?: boolean;
  suggestedCode?: string;
  /**
   * On the storyboard card (D142): everything about the panel in one form. How the line is said,
   * and what else should change in the picture (people, camera, look), saved with the words.
   */
  card?: { delivery?: string; onPicture: (words: string, descriptionChanged: boolean) => Promise<void>; onClose: () => void; moreHref?: () => void; noPicture?: boolean };
}

export function PanelEditor({ panel, sceneId, cast, first, last, suggestedCode, card }: PanelEditorProps) {
  const router = useRouter();
  const initial = {
    code: panel?.code ?? suggestedCode ?? "", description: panel?.description ?? "", emotion: panel?.emotion ?? "",
    speakerId: panel?.speakerId ?? "", line: panel?.line ?? "", durationSec: panel?.durationSec ?? 4,
  };
  const [f, setF] = useState(initial);
  const [delivery, setDelivery] = useState(card?.delivery ?? "");
  const [picture, setPicture] = useState("");
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
      <label className="block text-sm">What happens<WordsHelp guide="panel" />
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
      {/* The length can be corrected on a spoken panel too (D155): a 4 s shot for a 7-word line left a pause. */}
      <label className="text-xs">{f.speakerId && f.line.trim() ? "Length" : "Silent panel length"}
        <input type="number" min={3} max={15} className="ml-1 w-16 rounded border border-neutral-300 px-1 py-0.5" value={f.durationSec}
          onChange={(e) => setF({ ...f, durationSec: Number(e.target.value) })} data-testid="panel-seconds" />s
        {f.speakerId && f.line.trim() ? <span className="ml-2 text-neutral-600">{countWords(f.line)} words: the app suggests {deriveDuration(f.line)}s. A new line sets it again.</span> : null}
      </label>
      {hasQuotes(f.line) && <p className="text-xs text-red-700">Remove the quote marks from the line.</p>}
      {card && f.speakerId && (
        <label className="block text-sm">How it&apos;s said <span className="text-neutral-500">(who they are in the moment, how the words come out, the face, one small action{lineDirty ? "; leave it and the app writes one for the new line" : ""})</span>
          <textarea className={field} rows={2} value={delivery} onChange={(e) => setDelivery(e.target.value)} data-testid="panel-delivery" />
        </label>
      )}
      {/* On a clip (D164) there's no storyboard picture: the words go straight into the clip. */}
      {card && !card.noPicture && (
        <label className="block text-sm">Anything else to change in the picture <span className="text-neutral-500">(who stands where, the camera, how it looks)</span>
          <textarea className={field} rows={2} value={picture} onChange={(e) => setPicture(e.target.value)} data-testid="panel-picture-change"
            placeholder="e.g. two-shot of Jade and Chase · closer on Chase · Nina stands left of Marcus · she looks less angry" />
          <span className="text-xs text-neutral-500">The picture is drawn again with this{panel?.hasImage ? ", and when what happens changes" : ""}: about 7p. Only this panel changes.</span>
        </label>
      )}
      {panel && lineDirty && <p className="text-xs text-amber-700">Changing the line updates the shot&apos;s locked dialogue and flags this panel in the animatic for a re-check.</p>}

      <div className="flex flex-wrap items-center gap-2">
        {panel ? (
          <>
            {card ? (
              <ActionButton label="Save changes" busyLabel="Saving…" doneLabel="Saved" testId={`panel-${panel.code}-save-all`}
                disabled={pending || (!dirty && delivery.trim() === (card.delivery ?? "").trim() && !picture.trim())} resetKey={[f, delivery, picture]}
                onAction={async () => {
                  const descriptionChanged = f.description.trim() !== initial.description.trim();
                  if (dirty) { const r = await updatePanelAction(panel.id, input); if (!r.ok) { setMsg({ ok: false, text: r.error }); return r; } }
                  // A new line gets a new delivery written by the app, unless one is typed here.
                  const typed = delivery.trim() !== (card.delivery ?? "").trim();
                  if (typed && f.speakerId) { const r = await setDeliveryAction(panel.id, delivery); if (!r.ok) { setMsg({ ok: false, text: r.error }); return r; } }
                  if (!card.noPicture && (picture.trim() || (descriptionChanged && panel.hasImage))) await card.onPicture(picture.trim(), descriptionChanged);
                  setPicture("");
                  router.refresh();
                  card.onClose();
                  return { ok: true as const };
                }} />
            ) : (
            <ActionButton label="Save" busyLabel="Saving…" doneLabel="Saved" disabled={!dirty || pending} resetKey={f}
              onAction={() => call(() => updatePanelAction(panel.id, input), (v) => {
                const c = v as { dialogueChanged: boolean; animaticMarked: boolean };
                return c.dialogueChanged ? `Saved. Shot dialogue updated${c.animaticMarked ? "; animatic flagged for re-check" : ""}.` : "Saved.";
              })} />
            )}
            {card ? <>
              <button type="button" className="text-sm text-neutral-600 underline" onClick={card.onClose}>Cancel</button>
              {card.moreHref && <button type="button" className="text-xs text-blue-700 underline" onClick={card.moreHref}>More: the floor plan, reference pictures</button>}
            </> : panel.status === "approved" && !dirty ? <DoneBadge text="Approved" /> : (
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
            onAction={() => call(() => addPanelAction(sceneId, input), (v) => { const cam = (v as { camera?: string | null } | undefined)?.camera; return cam ? `Panel added above, with its camera: ${cam}. Draw its picture next.` : "Panel added above. Run Design shots on the floor plan to choose its camera."; })} />
        )}
        {dirty && panel && <span className="text-xs text-amber-700">Unsaved changes</span>}
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`} role="status">{msg.text}</p>}
    </div>
  );
}
