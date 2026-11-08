// Phase 1 checkpoint page: shows the rules engine working on the Paid On Time demo shots.
// The full Shot Director form, geometry editor and persistence come next.

import { composeKlingPrompt } from "@/lib/domain/composer";
import type { ShotSpec } from "@/lib/domain/types";
import { validatePrompt, validateShot } from "@/lib/domain/validator";
import { ALL_IDS, CAST, SCENE1_PLAN } from "@/lib/demo/paidOnTime";
import { CopyButton } from "./CopyButton";

const venueName = "GLOWVANE launch-party venue";

const SHOTS: ShotSpec[] = [
  {
    code: "EP01_S01_C4b",
    venueName,
    sceneContext: "At the launch party, Chase answers Jade's question at the cocktail table.",
    presentIds: ALL_IDS,
    visibleIds: ["chase", "jade"],
    excludedIds: ["marcus", "nina"],
    speakerId: "chase",
    dialogue: "You're lucky we booked you at all.",
    actions: "Chase smirks and leans back slightly.",
    emotion: "smug, dismissive",
    intensity: "natural",
    cameraId: "reverse",
    distance: "conversational",
    durationSec: 4,
    audioMode: "native-on",
  },
  {
    code: "EP01_S01_C4a",
    venueName,
    sceneContext: "Jade reacts to Chase's put-down.",
    presentIds: ALL_IDS,
    visibleIds: ["jade"],
    excludedIds: ["chase", "marcus", "nina"],
    speakerId: "jade",
    dialogue: "Unbelievable.",
    actions: "Jade stares at Chase in disbelief.",
    emotion: "angry",
    intensity: "big",
    cameraId: "jade-cu",
    durationSec: 3,
    audioMode: "native-on",
  },
  {
    code: "EP01_S01_C4c-2",
    venueName,
    sceneContext: "Marcus and Nina react to what just happened.",
    presentIds: ALL_IDS,
    visibleIds: ["marcus", "nina"],
    excludedIds: ["chase", "jade"],
    actions: 'Marcus and Nina look utterly shocked, as if thinking "did that just happen".',
    intensity: "big",
    cameraId: "main",
    durationSec: 3,
    audioMode: "native-on",
  },
];

const tone = {
  error: "border-red-300 bg-red-50 text-red-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-sky-300 bg-sky-50 text-sky-900",
} as const;

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p className="text-sm uppercase tracking-wide text-neutral-500">Mind First · Phase 1 checkpoint</p>
      <h1 className="mt-1 text-3xl font-semibold">AI Video Production Studio</h1>
      <p className="mt-2 text-neutral-700">
        Paid On Time demo data (illustrative). Each shot is checked by the deterministic rules engine
        before a single credit is spent, then composed into the proven Kling prompt.
      </p>

      {SHOTS.map((shot) => {
        const composed = composeKlingPrompt(shot, CAST, SCENE1_PLAN);
        const findings = [
          ...validateShot(shot, CAST, SCENE1_PLAN),
          ...validatePrompt(composed.text, shot, CAST),
        ];
        return (
          <section key={shot.code} className="mt-8 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">{shot.code}</h2>
              <CopyButton text={composed.text} />
            </div>
            <p className="mt-1 text-sm text-neutral-600">
              {composed.settings.model} · {composed.settings.resolution} · {composed.settings.durationSec}s ·
              native audio {composed.settings.nativeAudio} (recommended {composed.settings.recommendedAudio}) ·
              multi-shot off · no audio references
            </p>
            <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-neutral-900 p-4 text-sm text-neutral-100">
              {composed.text}
            </pre>
            <h3 className="mt-4 font-medium">Checks ({findings.length})</h3>
            {findings.length === 0 && <p className="text-sm text-green-700">All checks passed.</p>}
            <ul className="mt-2 space-y-2">
              {findings.map((f, i) => (
                <li key={i} className={`rounded-md border px-3 py-2 text-sm ${tone[f.severity]}`}>
                  <strong className="uppercase">{f.severity}</strong> · {f.message}
                  {f.fix && <div className="mt-1 opacity-80">Fix: {f.fix}</div>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
