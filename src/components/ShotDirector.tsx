"use client";

// Shot Director (Stage 6) with live checks (Stage 8) and the composed prompt (Stage 7).
// The rules engine runs in the browser as you type; saving is server-side.

import { useMemo, useState, useTransition } from "react";
import { addShotToLibraryAction, savePromptAction, saveShotAction } from "@/app/actions";
import { composeKlingPrompt } from "@/lib/domain/composer";
import { deriveDuration } from "@/lib/domain/duration";
import type { AudioMode, CastMember, DistancePreset, Finding, GeometryPlanData, Intensity, ShotSpec } from "@/lib/domain/types";
import { validatePrompt, validateShot } from "@/lib/domain/validator";
import { CopyButton } from "./CopyButton";
import { FindingList } from "./FindingList";

type Presence = "visible" | "offscreen" | "excluded" | "absent";

function presenceOf(spec: ShotSpec, id: string): Presence {
  if (spec.visibleIds.includes(id)) return "visible";
  if (spec.excludedIds.includes(id)) return "excluded";
  if (spec.presentIds.includes(id)) return "offscreen";
  return "absent";
}

function withPresence(spec: ShotSpec, id: string, p: Presence): ShotSpec {
  const drop = (xs: string[]) => xs.filter((x) => x !== id);
  const next = { ...spec, visibleIds: drop(spec.visibleIds), excludedIds: drop(spec.excludedIds), presentIds: drop(spec.presentIds) };
  if (p !== "absent") next.presentIds = [...next.presentIds, id];
  if (p === "visible") next.visibleIds = [...next.visibleIds, id];
  if (p === "excluded") next.excludedIds = [...next.excludedIds, id];
  return next;
}

const label = "block text-sm font-medium text-neutral-700";
const input = "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm";

export function ShotDirector(props: {
  projectId: string;
  shotId: string;
  initial: ShotSpec;
  cast: CastMember[];
  plan?: GeometryPlanData;
  promptVersions: { version: number; createdAt: string }[];
}) {
  const { cast, plan } = props;
  const [spec, setSpec] = useState<ShotSpec>(props.initial);
  const [saved, setSaved] = useState<ShotSpec>(props.initial);
  const [status, setStatus] = useState<string>("");
  const [pending, start] = useTransition();
  const set = <K extends keyof ShotSpec>(k: K, v: ShotSpec[K]) => setSpec((s) => ({ ...s, [k]: v }));

  const composed = useMemo(() => composeKlingPrompt(spec, cast, plan), [spec, cast, plan]);
  const findings: Finding[] = useMemo(
    () => [...validateShot(spec, cast, plan), ...validatePrompt(composed.text, spec, cast)],
    [spec, cast, plan, composed.text],
  );
  const suggested = deriveDuration(spec.dialogue);
  const speaker = cast.find((c) => c.id === spec.speakerId);
  const dirty = JSON.stringify(spec) !== JSON.stringify(saved);
  const hasErrors = findings.some((f) => f.severity === "error");

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      {/* ---------- Form ---------- */}
      <section className="space-y-5 rounded-xl border border-neutral-200 bg-white p-5">
        <div>
          <span className={label}>Speaker and dialogue (locked)</span>
          <div className="mt-1 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
            {speaker ? (
              <>🔒 <strong>{speaker.name}</strong> says exactly: “{spec.dialogue}”</>
            ) : (
              <>🔒 Silent shot: no one speaks.</>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">Approved dialogue can only be changed in the storyboard (Stage 4), never here.</p>
        </div>

        <fieldset>
          <legend className={label}>Who is in the shot</legend>
          <div className="mt-2 space-y-2">
            {cast.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="w-20 font-medium">{c.name}</span>
                <select
                  aria-label={`${c.name} presence`}
                  value={presenceOf(spec, c.id)}
                  onChange={(e) => setSpec((s) => withPresence(s, c.id, e.target.value as Presence))}
                  className="flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1"
                >
                  <option value="visible">Visible on camera</option>
                  <option value="offscreen">Present, off camera</option>
                  <option value="excluded">Excluded from camera</option>
                  <option value="absent">Not in this scene</option>
                </select>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-neutral-500">Excluded characters stay in the scene record and are never named in the prompt.</p>
        </fieldset>

        <label className={label}>
          Main subject (who the shot is about)
          <select className={input} value={spec.subjectId ?? ""} onChange={(e) => set("subjectId", e.target.value || undefined)}>
            <option value="">
              {(() => {
                const auto = cast.find((c) => c.id === (spec.speakerId ?? spec.visibleIds[0]));
                return auto ? `${auto.name} (automatic: ${speaker ? "the speaker" : "first visible"})` : "Nobody visible";
              })()}
            </option>
            {cast.filter((c) => spec.visibleIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name} (chosen)</option>)}
          </select>
        </label>

        <label className={label}>
          Story moment (no quoted dialogue)
          <textarea className={input} rows={2} value={spec.sceneContext} onChange={(e) => set("sceneContext", e.target.value)} />
        </label>
        <label className={label}>
          Actions and gestures
          <textarea className={input} rows={3} value={spec.actions} onChange={(e) => set("actions", e.target.value)} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Emotion
            <input className={input} value={spec.emotion ?? ""} onChange={(e) => set("emotion", e.target.value)} />
          </label>
          <label className={label}>
            Performance intensity
            <select className={input} value={spec.intensity ?? "natural"} onChange={(e) => set("intensity", e.target.value as Intensity)}>
              <option value="subtle">Subtle</option>
              <option value="natural">Natural</option>
              <option value="big">Big</option>
            </select>
          </label>
          <label className={label}>
            Camera (from floor plan)
            <select className={input} value={spec.cameraId ?? ""} onChange={(e) => set("cameraId", e.target.value || undefined)}>
              <option value="">No camera selected</option>
              {plan?.cameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className={label}>
            Distance
            <select className={input} value={spec.distance ?? ""} onChange={(e) => set("distance", (e.target.value || undefined) as DistancePreset | undefined)}>
              <option value="">Not set</option>
              <option value="conversational">Conversational (arm&apos;s length)</option>
              <option value="social-group">Social group</option>
              <option value="across-room">Across the room</option>
            </select>
          </label>
          <label className={label}>
            Duration (seconds)
            <div className="mt-1 flex gap-2">
              <input type="number" min={3} max={15} className="w-24 rounded-md border border-neutral-300 px-3 py-2 text-sm" value={spec.durationSec} onChange={(e) => set("durationSec", Number(e.target.value))} />
              {spec.dialogue && spec.durationSec !== suggested && (
                <button type="button" onClick={() => set("durationSec", suggested)} className="rounded-md border border-neutral-300 px-2 text-xs hover:bg-neutral-100">
                  Use {suggested}s (from dialogue)
                </button>
              )}
            </div>
          </label>
          <label className={label}>
            Native audio
            <select className={input} value={spec.audioMode} onChange={(e) => set("audioMode", e.target.value as AudioMode)}>
              <option value="native-on">On</option>
              <option value="off">Off</option>
            </select>
          </label>
        </div>

        <label className={label}>
          Start frame asset code (optional)
          <input className={input} placeholder="e.g. POT_EP01_S01_C4a_START_v01.png" value={spec.startFrameAssetCode ?? ""} onChange={(e) => set("startFrameAssetCode", e.target.value || undefined)} />
        </label>

        {spec.audioReferenceCodes && spec.audioReferenceCodes.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
            Audio references attached: {spec.audioReferenceCodes.join(", ")}{" "}
            <button type="button" className="underline" onClick={() => set("audioReferenceCodes", [])}>Remove</button>
          </div>
        )}

        <label className={label}>
          Additional instructions
          <textarea className={input} rows={2} value={spec.additionalInstructions ?? ""} onChange={(e) => set("additionalInstructions", e.target.value || undefined)} />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !dirty}
            onClick={() => start(async () => { await saveShotAction(props.shotId, spec); setSaved(spec); setStatus("Shot saved."); })}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Save shot
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { await addShotToLibraryAction(props.shotId, `${spec.code} set-up`); setStatus("Shot set-up saved to your library."); })}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm"
          >
            Save set-up to library
          </button>
          {status && <span className="text-sm text-green-700">{status}</span>}
        </div>
      </section>

      {/* ---------- Prompt and checks ---------- */}
      <section className="space-y-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Kling prompt</h2>
            <div className="flex gap-2">
              <CopyButton text={composed.text} />
              <button
                type="button"
                disabled={pending || dirty || hasErrors}
                title={dirty ? "Save the shot first" : hasErrors ? "Fix errors first" : ""}
                onClick={() => start(async () => { const r = await savePromptAction(props.shotId, props.projectId); setStatus(`Prompt version v${r.version} recorded.`); })}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-50"
              >
                Record prompt version
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-neutral-600">
            {composed.settings.model} · {composed.settings.resolution} · {composed.settings.durationSec}s · native audio {composed.settings.nativeAudio}
            {composed.settings.nativeAudio !== composed.settings.recommendedAudio && ` (recommended ${composed.settings.recommendedAudio})`} · multi-shot off · no audio references
          </p>
          <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-neutral-900 p-4 text-sm text-neutral-100">{composed.text}</pre>
          <p className="mt-2 text-xs text-neutral-500">
            {composed.text.length} characters. Recorded versions: {props.promptVersions.length ? props.promptVersions.map((v) => `v${v.version}`).join(", ") : "none yet"}.
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Pre-generation checks</h2>
          <FindingList findings={findings} />
        </div>
      </section>
    </div>
  );
}
