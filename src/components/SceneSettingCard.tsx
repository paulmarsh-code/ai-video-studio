"use client";

// The scene setting (D18c): where the characters are and who else is there. Used in every
// panel picture and every Kling clip of the scene, so the table, the room and the crowd
// stay the same from shot to shot.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveSceneStagingAction } from "@/app/studioActions";
import { parseStaging, type CrowdLevel, type KeyProp, type SceneStaging } from "@/lib/domain/story";
import { ActionButton } from "./ActionButton";

const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

export function StagingFields({ value, onChange }: { value: SceneStaging; onChange: (v: SceneStaging) => void }) {
  const setProp = (k: number, patch: Partial<KeyProp>) => onChange({ ...value, props: value.props.map((p, i) => (i === k ? { ...p, ...patch } : p)) });
  const levels: { v: CrowdLevel; label: string }[] = [{ v: "none", label: "No one else" }, { v: "few", label: "A few" }, { v: "busy", label: "Busy" }];
  return (
    <div className="space-y-3">
      <label className="block text-sm">Where are they, and do they stand or sit?
        <input className={field} value={value.spot} onChange={(e) => onChange({ ...value, spot: e.target.value })} data-testid="staging-spot"
          placeholder="e.g. standing around the cocktail table, near the bar" />
      </label>
      <div className="text-sm">
        <p>Key props <span className="text-neutral-500">· objects that matter, drawn the same in every shot</span></p>
        {value.props.map((p, k) => (
          <div key={k} className="mt-1 grid gap-2 sm:grid-cols-[12rem_1fr_auto]" data-testid={`staging-prop-${k}`}>
            <input className={field} value={p.name} onChange={(e) => setProp(k, { name: e.target.value })} placeholder="e.g. cocktail table" aria-label="Prop name" />
            <input className={field} value={p.detail} onChange={(e) => setProp(k, { detail: e.target.value })} placeholder="size, height and colour, e.g. round, 70 cm across, chest-high, white cloth" aria-label="Prop detail" />
            <button type="button" className="mt-1 text-xs text-red-700 underline" onClick={() => onChange({ ...value, props: value.props.filter((_, i) => i !== k) })}>Remove</button>
          </div>
        ))}
        <button type="button" className="mt-1 text-xs text-blue-700 underline" data-testid="staging-add-prop" onClick={() => onChange({ ...value, props: [...value.props, { name: "", detail: "" }] })}>+ Add a key prop</button>
      </div>
      <div className="text-sm">
        <p>Other people</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {levels.map((l) => (
            <button key={l.v} type="button" data-testid={`staging-level-${l.v}`} onClick={() => onChange({ ...value, crowdLevel: l.v, crowd: l.v === "none" ? "" : value.crowd })}
              className={`rounded-full border px-3 py-1 text-xs ${value.crowdLevel === l.v ? "border-blue-700 bg-blue-700 text-white" : "border-neutral-300 bg-white"}`}>{l.label}</button>
          ))}
        </div>
        {value.crowdLevel !== "none" && (
          <input className={field} value={value.crowd} onChange={(e) => onChange({ ...value, crowd: e.target.value })} data-testid="staging-crowd"
            placeholder="who they are and what they're doing, e.g. about 40 well-dressed guests mingling with drinks" />
        )}
      </div>
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
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
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
    if (!s.spot && !s.crowd && !s.props.length) { setMsg("Couldn't find SPOT, PROP or OTHER PEOPLE lines in that reply."); return false; }
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
