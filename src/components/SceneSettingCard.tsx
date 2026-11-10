"use client";

// The scene setting (D18c): where the characters are and who else is there. Used in every
// panel picture and every Kling clip of the scene, so the table, the room and the crowd
// stay the same from shot to shot.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveSceneStagingAction } from "@/app/studioActions";
import { mergeSuggestion, parseStaging, type CrowdLevel, type KeyProp, type SceneStaging } from "@/lib/domain/story";
import { uploadBlob } from "@/lib/clientUpload";
import { ActionButton } from "./ActionButton";

const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

export function StagingFields({ value, onChange, propsLocked, projectId }: {
  value: SceneStaging; onChange: (v: SceneStaging) => void; propsLocked?: boolean;
  /** With a project, each prop can have a reference picture (D19c). */
  projectId?: string;
}) {
  const setProp = (k: number, patch: Partial<KeyProp>) => onChange({ ...value, props: value.props.map((p, i) => (i === k ? { ...p, ...patch } : p)) });
  const [uploading, setUploading] = useState<number | null>(null);
  const [upErr, setUpErr] = useState("");
  async function addPicture(k: number, file: File) {
    if (!projectId) return;
    setUploading(k); setUpErr("");
    try {
      const name = (value.props[k]?.name || `prop ${k + 1}`).replace(/[^\w]+/g, "_").toUpperCase();
      const id = await uploadBlob(projectId, `PROP_${name}`, "prop-reference", file, file.name);
      setProp(k, { imageAssetId: id });
    } catch (e) { setUpErr(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(null); }
  }
  const levels: { v: CrowdLevel; label: string }[] = [{ v: "none", label: "No one else" }, { v: "few", label: "A few" }, { v: "busy", label: "Busy" }];
  return (
    <div className="space-y-3">
      <label className="block text-sm">Where are they, and do they stand or sit?
        <input className={field} value={value.spot} onChange={(e) => onChange({ ...value, spot: e.target.value })} data-testid="staging-spot"
          placeholder="e.g. standing around the cocktail table, near the bar" />
      </label>
      <div className="text-sm">
        <p>Key props <span className="text-neutral-500">· {propsLocked ? "what they are and where they stand are locked with the positions; you can still correct how they look, including what's on them" : "objects that matter, drawn the same in every shot, including what's on them"}</span></p>
        {value.props.map((p, k) => (
          <div key={k} className="mt-1 grid items-start gap-2 sm:grid-cols-[12rem_1fr_auto]" data-testid={`staging-prop-${k}`}>
            <input className={`${field} ${propsLocked ? "bg-neutral-100 text-neutral-600" : ""}`} value={p.name} readOnly={propsLocked} title={propsLocked ? "To change what this prop is, change the positions first" : undefined}
              onChange={(e) => setProp(k, { name: e.target.value })} placeholder="e.g. cocktail table" aria-label="Prop name" />
            <input className={field} value={p.detail} onChange={(e) => setProp(k, { detail: e.target.value })} placeholder="size, height, colour and what's on it, e.g. round, chest-high, white floor-length cloth, three champagne flutes on top" aria-label="Prop detail" data-testid={`staging-prop-${k}-detail`} />
            <div className="mt-1 flex items-center gap-2 text-xs">
              {projectId && (p.imageAssetId ? (
                <>
                  <img src={`/api/assets/${p.imageAssetId}`} alt={`Picture of the ${p.name}`} className="h-10 w-10 rounded object-cover" data-testid={`staging-prop-${k}-thumb`} />
                  <button type="button" className="text-red-700 underline" onClick={() => setProp(k, { imageAssetId: undefined })}>Remove picture</button>
                </>
              ) : (
                <label className="cursor-pointer text-blue-700 underline">
                  {uploading === k ? "Uploading…" : "Add a picture"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading !== null} data-testid={`staging-prop-${k}-pic`}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void addPicture(k, f); e.target.value = ""; }} />
                </label>
              ))}
              {!propsLocked && <button type="button" className="text-red-700 underline" onClick={() => onChange({ ...value, props: value.props.filter((_, i) => i !== k) })}>Remove</button>}
            </div>
          </div>
        ))}
        {projectId && value.props.length > 0 && <p className="mt-1 text-xs text-neutral-500">A picture keeps a prop looking the same in every shot better than words alone. It is sent with every panel picture the prop is in.</p>}
        {upErr && <p className="mt-1 text-xs text-red-700">{upErr}</p>}
        {!propsLocked && <button type="button" className="mt-1 text-xs text-blue-700 underline" data-testid="staging-add-prop" onClick={() => onChange({ ...value, props: [...value.props, { name: "", detail: "" }] })}>+ Add a key prop</button>}
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

export function SceneSettingCard({ sceneId, projectId, staging, hasPictures, suggestPrompt, canAuto, propsLocked }: {
  sceneId: string; projectId?: string; staging: SceneStaging; hasPictures: boolean;
  /** Positions are approved: the key props come from the floor plan and can't be edited here. */
  propsLocked?: boolean;
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
  // Suggesting saves straight away: one click, nothing left half done. It only fills gaps:
  // anything already written or attached here, saved or not, is kept (D19c).
  const use = async (text: string) => {
    const s = parseStaging(text);
    if (!s.spot && !s.crowd && !s.props.length) { setMsg("Couldn't find SPOT, PROP or OTHER PEOPLE lines in that reply."); return false; }
    const merged = mergeSuggestion(v, s, propsLocked);
    const changed = JSON.stringify(merged) !== JSON.stringify(v);
    const r = await save(merged, changed ? "Suggestions added where the setting was empty; everything you wrote was kept. Saved." : "Nothing to add: everything was already filled in, and your words were kept. Saved.");
    return r.ok;
  };
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4" data-testid="scene-setting">
      <p className="font-semibold">Scene setting</p>
      <p className="mb-2 text-sm text-neutral-600">Kept the same in every picture and every clip of this scene.</p>
      <StagingFields value={v} onChange={setV} propsLocked={propsLocked} projectId={projectId} />
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
