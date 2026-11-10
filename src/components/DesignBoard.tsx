"use client";

import Link from "next/link";
import { useState } from "react";
import { applyShotDesignAction } from "@/app/actions";
import type { SceneDesign, ShotInput } from "@/lib/domain/director";
import type { CastMember, GeometryPlanData } from "@/lib/domain/types";
import { CameraView } from "./CameraView";
import { ActionButton } from "./ActionButton";

const MOMENT_LABEL = {
  establishing: "Establishing",
  dialogue: "Dialogue",
  peak: "Emotional peak",
  reaction: "Reaction",
  exit: "Exit",
} as const;

export function DesignBoard(props: {
  projectId: string;
  sceneId: string;
  plan: GeometryPlanData;
  cast: CastMember[];
  design: SceneDesign;
  shots: ShotInput[];
}) {
  const { design, plan, cast } = props;
  const [picked, setPicked] = useState<Record<string, number>>(() => Object.fromEntries(design.shots.map((s) => [s.shotId, 0])));
  const [status, setStatus] = useState("");
  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const ready = design.shots.every((s) => s.options.length > 0);

  return (
    <div className="mt-6 space-y-6">
      {design.lineOfAction && (
        <p className="rounded-lg bg-neutral-100 px-4 py-2 text-sm">
          Line of action: <strong>{name(design.lineOfAction[0])}</strong> to <strong>{name(design.lineOfAction[1])}</strong>. All cameras stay on one side of it. The viewfinders are sketches from the floor plan, not renders; the black blurred shape is the over-the-shoulder person seen from behind.
        </p>
      )}

      {design.shots.map((s) => {
        const shot = props.shots.find((x) => x.id === s.shotId)!;
        return (
          <section key={s.shotId} className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="font-mono text-lg font-semibold">{s.shotCode}</h2>
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">{MOMENT_LABEL[s.moment]}</span>
              <span className="text-sm text-neutral-600">
                {shot.spec.speakerId ? `${name(shot.spec.speakerId)}: “${shot.spec.dialogue}”` : shot.description ?? shot.spec.actions}
              </span>
            </div>
            {s.warning && <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{s.warning}</p>}
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              {s.options.map((o, i) => {
                const sel = picked[s.shotId] === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPicked((p) => ({ ...p, [s.shotId]: i }))}
                    className={`rounded-lg border p-2 text-left ${sel ? "border-blue-600 ring-2 ring-blue-200" : "border-neutral-200 hover:border-neutral-400"}`}
                  >
                    <CameraView plan={{ ...plan, cameras: [o.camera] }} cameraId={o.camera.id} cast={cast} onlyIds={o.camera.preset === "single-cu" ? [shot.spec.subjectId ?? shot.spec.speakerId ?? ""] : shot.spec.visibleIds} subjectId={shot.spec.subjectId ?? shot.spec.speakerId} compact />
                    <p className="mt-2 text-sm font-semibold">{i === 0 ? "Recommended: " : "Option: "}{o.kind}</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-neutral-600">
                      {o.reasons.slice(0, 4).map((r) => <li key={r}>• {r}</li>)}
                    </ul>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {design.multiShot.length > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Suggested multi-shot clips</h2>
          <p className="text-sm text-neutral-600">These shots can be generated as one Kling multi-shot clip (one speaker plus silent cutaways, within 15 s and 6 cuts).</p>
          <ul className="mt-2 space-y-1 text-sm">
            {design.multiShot.map((g) => (
              <li key={g.shotIds.join()}>
                <strong className="font-mono">{g.shotCodes.join(" + ")}</strong> ({g.durationSec}s): {g.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-neutral-200 bg-neutral-50 py-3">
        <ActionButton label="Apply these cameras to the floor plan" busyLabel="Applying…" doneLabel="Cameras applied" disabled={!ready} resetKey={picked}
          onAction={async () => {
            const choices = design.shots.map((s) => ({ shotId: s.shotId, shotCode: s.shotCode, option: s.options[picked[s.shotId]] }));
            const r = await applyShotDesignAction(props.sceneId, choices, design.lineOfAction);
            if ("error" in r && r.error) { setStatus(r.error); return false; }
            setStatus(`Applied as floor plan v${r.version}. Every shot now uses its chosen camera.`);
          }} />
        {status && (
          <span className="text-sm text-green-700">
            {status} <Link className="underline" href={`/projects/${props.projectId}/scenes/${props.sceneId}/plan`}>Open floor plan</Link>
          </span>
        )}
      </div>
    </div>
  );
}
