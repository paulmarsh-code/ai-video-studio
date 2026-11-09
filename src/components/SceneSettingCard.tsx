"use client";

// The scene setting (D18c): where the characters are and who else is there. Used in every
// panel picture and every Kling clip of the scene, so the table, the room and the crowd
// stay the same from shot to shot.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveSceneStagingAction } from "@/app/studioActions";
import { parseStaging, type SceneStaging } from "@/lib/domain/story";
import { ActionButton } from "./ActionButton";

const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

export function StagingFields({ value, onChange }: { value: SceneStaging; onChange: (v: SceneStaging) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm">Where are they?
        <input className={field} value={value.spot} onChange={(e) => onChange({ ...value, spot: e.target.value })} data-testid="staging-spot"
          placeholder="e.g. around a tall round cocktail table with a white cloth, near the bar" />
      </label>
      <label className="text-sm">Who else is there?
        <input className={field} value={value.crowd} onChange={(e) => onChange({ ...value, crowd: e.target.value })} data-testid="staging-crowd"
          placeholder="e.g. about 30 well-dressed guests mingling with drinks; leave empty if no one" />
      </label>
    </div>
  );
}

export function SceneSettingCard({ sceneId, staging, hasPictures, suggestPrompt, canAuto }: {
  sceneId: string; staging: SceneStaging; hasPictures: boolean;
  /** The setting-only request built from the saved story; absent when there is no story. */
  suggestPrompt?: string;
  canAuto: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(staging);
  const [saved, setSaved] = useState(staging);
  const [msg, setMsg] = useState("");
  const dirty = v.spot !== saved.spot || v.crowd !== saved.crowd;
  const [reply, setReply] = useState("");
  async function save(next: SceneStaging, how: string) {
    const r = await saveSceneStagingAction(sceneId, next);
    if (!r.ok) { setMsg(r.error); return r; }
    setV(r.value!.staging); setSaved(r.value!.staging);
    setMsg(`${how}${r.value!.replanned ? " The floor plan now has everyone around the spot: let the app choose the cameras again, then redraw." : hasPictures ? " Redraw pictures to use it." : ""}`);
    router.refresh();
    return r;
  }
  // Suggesting saves straight away: one click, nothing left half done.
  const use = async (text: string) => {
    const s = parseStaging(text);
    if (!s.spot && !s.crowd) { setMsg("Couldn't find SPOT and BACKGROUND lines in that reply."); return false; }
    const r = await save(s, "Suggested from the story and saved.");
    return r.ok;
  };
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4" data-testid="scene-setting">
      <p className="font-semibold">Scene setting</p>
      <p className="mb-2 text-sm text-neutral-600">Kept the same in every picture and every clip of this scene.</p>
      <StagingFields value={v} onChange={setV} />
      {suggestPrompt && (
        <div className="mt-2 flex flex-wrap items-start gap-3 text-sm">
          {canAuto && (
            <ActionButton label="Suggest from the story" busyLabel="Reading the story…" doneLabel="Suggested" variant="secondary" doneForMs={2500} testId="staging-suggest"
              onAction={async () => {
                setMsg("");
                const res = await fetch("/api/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: suggestPrompt }) });
                const body = (await res.json()) as { text?: string; error?: string };
                if (!res.ok || !body.text) { setMsg(body.error ?? "GPT didn't reply. Try again."); return false; }
                return await use(body.text);
              }} />
          )}
          <details open={!canAuto}>
            <summary className="cursor-pointer text-blue-700">{canAuto ? "Or ask ChatGPT" : "Suggest it with ChatGPT"}</summary>
            <div className="mt-2 space-y-2">
              <ActionButton label="Copy the request" busyLabel="Copying…" doneLabel="Copied" doneForMs={2500} variant="secondary" testId="staging-copy"
                onAction={async () => { try { await navigator.clipboard.writeText(suggestPrompt); return true; } catch { return false; } }} />
              <textarea className={field} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Paste ChatGPT's reply here" data-testid="staging-reply" />
              <button type="button" disabled={!reply.trim()} onClick={() => void use(reply)} className="rounded-md border border-blue-700 px-3 py-1 text-blue-700 disabled:opacity-40" data-testid="staging-use">Use this</button>
            </div>
          </details>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <ActionButton label="Save setting" busyLabel="Saving…" doneLabel="Saved" disabled={!dirty} resetKey={v} testId="staging-save"
          onAction={() => save(v, "Saved.")} />
        {msg && <span className="text-sm text-neutral-700" role="status">{msg}</span>}
      </div>
    </section>
  );
}
