"use client";

// New project (D18), one step at a time:
//   1. What are you making? Name, kind of video, how many parts and how long, the shape.
//   2. Who is it for? Audience and where it's shown, genre and look.
//   3. Outline the story: the whole video in a few lines.
// The brief goes to GPT with every scene's story, so lines and reactions fit the whole video.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProjectAction, updateProjectBriefAction } from "@/app/studioActions";
import { GENRE_PROFILES, GENRES, type Genre } from "@/lib/domain/genre";
import { FORMATS, shapeLine } from "@/lib/domain/story";
import { ActionButton } from "./ActionButton";

const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";
const LENGTHS = [15, 30, 60, 90];
const STYLES = ["photorealistic", "cinematic film look", "3D animation", "2D animation", "anime"];

export interface ProjectWizardProps {
  /** Editing an existing project's brief; otherwise a new project. */
  existing?: { id: string; name: string; format: string; parts?: number; partSec?: number; audience: string; outline: string; aspect: "9:16" | "16:9"; style: string; genre: Genre };
}

function StepHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-700 text-sm font-semibold text-white">{n}</span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <span className="ml-auto text-xs text-neutral-500">Step {n} of 3</span>
    </div>
  );
}

export function ProjectWizard({ existing }: ProjectWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState(existing?.name ?? "");
  const [format, setFormat] = useState(existing?.format ?? "");
  const [parts, setParts] = useState(existing?.parts ?? 1);
  const [partSec, setPartSec] = useState(existing?.partSec ?? 30);
  const [aspect, setAspect] = useState<"9:16" | "16:9">(existing?.aspect ?? "9:16");
  const [audience, setAudience] = useState(existing?.audience ?? "");
  const [genre, setGenre] = useState<Genre>(existing?.genre ?? "neutral");
  const [style, setStyle] = useState(existing?.style ?? "photorealistic");
  const [outline, setOutline] = useState(existing?.outline ?? "");
  const [error, setError] = useState("");

  const brief = { name, format, parts, partSec, aspect, audience, genre, style, outline };
  const summary = shapeLine({ format, parts, partSec });

  async function finish() {
    setError("");
    if (existing) {
      const r = await updateProjectBriefAction(existing.id, brief);
      if (!r.ok) { setError(r.error); return r; }
      router.push(`/projects/${existing.id}`);
      return r;
    }
    const r = await createProjectAction(brief);
    if (!r.ok) { setError(r.error); return r; }
    router.push(`/projects/${r.value}`);
    return r;
  }

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-blue-700 bg-blue-700 text-white" : "border-neutral-300 bg-white hover:bg-neutral-50"}`;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5" data-testid="project-wizard">
      {step === 1 && (
        <>
          <StepHeader n={1} title="What are you making?" />
          <label className="block max-w-md text-sm">Project name
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Paid On Time" data-testid="pw-name" />
          </label>
          <p className="mt-4 text-sm font-medium">Kind of video</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {FORMATS.map((f) => (
              <button key={f} type="button" className={chip(format === f)} onClick={() => setFormat(f)} data-testid={`pw-format-${f.toLowerCase().replace(/\s+/g, "-")}`}>{f}</button>
            ))}
          </div>
          <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-[9rem_1fr]">
            <label className="text-sm">How many parts?
              <input type="number" min={1} max={50} className={field} value={parts} onChange={(e) => setParts(Math.max(1, Number(e.target.value) || 1))} data-testid="pw-parts" />
              <span className="mt-1 block text-xs text-neutral-500">Scenes or episodes; 1 for an advert</span>
            </label>
            <div className="text-sm">About how long is each part?
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {LENGTHS.map((s) => <button key={s} type="button" className={chip(partSec === s)} onClick={() => setPartSec(s)} data-testid={`pw-len-${s}`}>{s} s</button>)}
                <input type="number" min={5} max={600} aria-label="Seconds" className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm" value={partSec} onChange={(e) => setPartSec(Math.max(5, Number(e.target.value) || 30))} />
                <span className="text-xs text-neutral-500">seconds</span>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm font-medium">Shape</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={chip(aspect === "9:16")} onClick={() => setAspect("9:16")} data-testid="pw-aspect-portrait">Portrait 9:16 · TikTok, Reels, Shorts</button>
            <button type="button" className={chip(aspect === "16:9")} onClick={() => setAspect("16:9")} data-testid="pw-aspect-landscape">Landscape 16:9 · YouTube, TV</button>
          </div>
          {format && <p className="mt-4 rounded bg-blue-50 px-3 py-2 text-sm text-blue-900" data-testid="pw-summary">{summary}</p>}
          <div className="mt-4">
            <button type="button" disabled={!name.trim() || !format} onClick={() => setStep(2)} data-testid="pw-next-1"
              className="rounded-md bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-neutral-400">Next</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <StepHeader n={2} title="Who is it for?" />
          <label className="block text-sm">Audience, and where it will be shown
            <textarea className={field} rows={2} value={audience} onChange={(e) => setAudience(e.target.value)} data-testid="pw-audience"
              placeholder="e.g. freelance creators aged 25 to 40, watching on TikTok and Instagram" />
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Genre
              <select className={field} value={genre} onChange={(e) => setGenre(e.target.value as Genre)} data-testid="pw-genre">
                {GENRES.map((g) => <option key={g} value={g}>{GENRE_PROFILES[g].label}</option>)}
              </select>
              <span className="mt-1 block text-xs text-neutral-500">{GENRE_PROFILES[genre].summary}</span>
            </label>
            <label className="text-sm">Look
              <select className={field} value={style} onChange={(e) => setStyle(e.target.value)} data-testid="pw-style">
                {STYLES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={() => setStep(1)} className="text-sm text-neutral-600 underline">Back</button>
            <button type="button" onClick={() => setStep(3)} className="rounded-md bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800" data-testid="pw-next-2">Next</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <StepHeader n={3} title="Outline the story" />
          <p className="mb-2 text-sm text-neutral-600">{summary}. In a few lines: who it&apos;s about, what happens, and how it ends. You&apos;ll tell each scene in detail later.</p>
          <textarea className={field} rows={6} value={outline} onChange={(e) => setOutline(e.target.value)} data-testid="pw-outline"
            placeholder="e.g. Jade, a freelance content creator, made the promo for the Glowvane launch. Weeks later she still hasn't been paid. Over four short scenes she chases Chase, the smug marketing director, until she finally gets her money in a way he never sees coming." />
          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={() => setStep(2)} className="text-sm text-neutral-600 underline">Back</button>
            <ActionButton label={existing ? "Save brief" : "Create project"} busyLabel={existing ? "Saving…" : "Creating…"} doneLabel={existing ? "Saved" : "Created"}
              disabled={!outline.trim()} onAction={finish} testId="pw-create" />
          </div>
        </>
      )}
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
