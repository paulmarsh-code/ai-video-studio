"use client";

// Tell the story, get the storyboard (D18):
//   1. Tell the story in your own words, with guide rails beside it (target length, spoken
//      lines found, time left for action, lines too long for one clip).
//   2. Create the panels: one click with GPT, or copy the request into ChatGPT and paste the reply.
//   3. Check the panels: edit, reorder, add or delete; every guide rail is checked live.
//      Save storyboard creates the panels, their shots and a first floor plan in one step.

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { saveSceneStoryAction, saveStoryboardAction } from "@/app/studioActions";
import { countWords } from "@/lib/domain/duration";
import {
  checkStoryboard, estimateStory, MAX_CLIP_SEC, MAX_LINE_WORDS, MIN_CLIP_SEC, panelSeconds, parseStoryReply, SILENT_BEAT_SEC, storyPrompt,
  asStaging, type DraftPanel, type ProjectBrief, type SceneStaging, type StoryCharacter,
} from "@/lib/domain/story";
import { StagingFields } from "./SceneSettingCard";
import { ActionButton } from "./ActionButton";
import { WordsHelp } from "./WordsHelp";

const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";
const TARGETS = [15, 30, 60, 90];

export interface StoryWizardProps {
  sceneId: string;
  sceneTitle: string;
  venueName: string;
  cast: StoryCharacter[];
  brief: ProjectBrief;
  initialStory: string;
  initialTarget: number;
  /** A GPT text model is set up: offer "Create panels with GPT". */
  canAuto: boolean;
  /** The scene already has draft panels that saving will replace. */
  replacing?: boolean;
  /** "Show me an example" for the project's genre (or an advert). */
  example: { title: string; story: string };
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

export function StoryWizard(p: StoryWizardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [story, setStory] = useState(p.initialStory);
  const [target, setTarget] = useState(p.initialTarget);
  const [reply, setReply] = useState("");
  const [panels, setPanels] = useState<DraftPanel[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [staging, setStaging] = useState<SceneStaging>(asStaging({}));
  const [error, setError] = useState("");
  const [showExample, setShowExample] = useState(false);

  const est = estimateStory(story);
  const left = Math.max(0, target - est.talkSec);
  const prompt = storyPrompt({ story, characters: p.cast, venue: p.venueName, targetSec: target, brief: p.brief, sceneTitle: p.sceneTitle });
  const check = checkStoryboard(panels, target);
  const name = (id?: string) => p.cast.find((c) => c.id === id)?.name ?? "";

  async function toPanels() {
    setError("");
    const r = await saveSceneStoryAction(p.sceneId, story, target);
    if (!r.ok) { setError(r.error); return r; }
    setStep(2);
    return r;
  }

  function read(text: string) {
    const r = parseStoryReply(text, p.cast);
    if (!r.panels.length) { setError("Couldn't find any panels in that reply. Check it has lines starting PANEL 1, PANEL 2 and so on."); return false; }
    setPanels(r.panels);
    setStaging(r.staging);
    setUnknown(r.unknownNames);
    setReply(text);
    setError("");
    setStep(3);
    return true;
  }

  async function withGpt() {
    setError("");
    try {
      const res = await fetch("/api/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const body = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !body.text) { setError(body.error ?? "GPT didn't reply. Try again, or do it by hand in ChatGPT below."); return false; }
      return read(body.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  const update = (i: number, patch: Partial<DraftPanel>) => setPanels((xs) => xs.map((x, k) => {
    if (k !== i) return x;
    const n = { ...x, ...patch };
    if (!n.speakerId) n.line = "";
    if (n.speakerId && !n.inFrame.includes(n.speakerId)) n.inFrame = [n.speakerId, ...n.inFrame];
    n.seconds = panelSeconds(n.line, n.seconds);
    return n;
  }));
  const move = (i: number, d: -1 | 1) => setPanels((xs) => { const y = [...xs]; [y[i], y[i + d]] = [y[i + d], y[i]]; return y; });

  async function save() {
    setError("");
    const r = await saveStoryboardAction(p.sceneId, { story, targetSec: target, panels, staging });
    if (!r.ok) { setError(r.error); return r; }
    router.push(pathname); // drops ?story=1 and shows the saved storyboard
    router.refresh();
    return r;
  }

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-blue-700 bg-blue-700 text-white" : "border-neutral-300 bg-white hover:bg-neutral-50"}`;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5" data-testid="story-wizard">
      {step === 1 && (
        <>
          <StepHeader n={1} title="Tell the story" />
          <p className="mb-3 text-sm text-neutral-600">At <strong>{p.venueName}</strong> with {p.cast.map((c) => c.name).join(", ")}.</p>
          <div className="grid gap-4 md:grid-cols-[1fr_17rem]">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <span>Scene length:</span>
                <span className="ml-auto text-xs text-neutral-600">How to describe movement<WordsHelp guide="panel" /></span>
                {TARGETS.map((s) => <button key={s} type="button" className={chip(target === s)} onClick={() => setTarget(s)} data-testid={`story-target-${s}`}>{s} s</button>)}
              </div>
              <textarea className={field} rows={16} value={story} onChange={(e) => setStory(e.target.value)} data-testid="story-text"
                placeholder={"Tell the scene the way you see it: who is there and what each of them wants, then what happens, moment by moment.\n\nPut what people say in quote marks, for example: Chase shrugs and says 'I've seen better'."} />
              {showExample && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-sm" data-testid="story-example">
                  <p className="font-semibold">Example: {p.example.title}</p>
                  <p className="mt-1 whitespace-pre-line text-neutral-800">{p.example.story}</p>
                  <p className="mt-2 text-xs text-neutral-600">Notice who is there and what they want, the moments in order, and the spoken lines in quote marks.</p>
                </div>
              )}
            </div>
            <aside className="space-y-3 rounded-lg bg-neutral-50 p-3 text-sm" data-testid="guide-rails">
              <p className="font-semibold">Guide rails</p>
              <p>Target <strong>{target} s</strong>. Each clip is {MIN_CLIP_SEC} to {MAX_CLIP_SEC} s, with one person speaking.</p>
              <p data-testid="story-estimate">
                {est.lines ? <>Spoken lines found: <strong>{est.lines}</strong>, about <strong>{est.talkSec} s</strong> of talking.</> : "No spoken lines found yet. Put what people say in quote marks."}
              </p>
              {est.lines > 0 && (est.talkSec < target
                ? <p>That leaves about {left} s for action and reactions, roughly {Math.max(1, Math.round(left / SILENT_BEAT_SEC))} moments of {SILENT_BEAT_SEC} s.</p>
                : <p className="text-amber-700">The talking alone is longer than {target} s. Trim some lines or choose a longer scene.</p>)}
              {est.longLines > 0 && <p className="text-amber-700">{est.longLines} line{est.longLines > 1 ? "s are" : " is"} over {MAX_LINE_WORDS} words, too long for one clip. GPT will split {est.longLines > 1 ? "them" : "it"}, or you can.</p>}
              <ul className="list-disc space-y-1 pl-4 text-neutral-700">
                <li>Who is there, and what each of them wants</li>
                <li>The moments in order: arrivals, looks, gestures, exits</li>
                <li>Spoken lines in quote marks</li>
                <li>One person speaks at a time</li>
              </ul>
              <button type="button" onClick={() => setShowExample((x) => !x)} className="text-blue-700 underline" data-testid="story-show-example">
                {showExample ? "Hide the example" : "Show me an example"}
              </button>
            </aside>
          </div>
          <div className="mt-4">
            <ActionButton label="Next" busyLabel="Saving…" doneLabel="Saved" disabled={countWords(story) < 5} onAction={toPanels} testId="story-next" />
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <StepHeader n={2} title="Create the panels" />
          <p className="mb-3 text-sm text-neutral-600">GPT turns your story into panels, one per clip, using the guide rails and your project brief.</p>
          {p.canAuto && (
            <ActionButton label="Create panels with GPT" busyLabel="Working with GPT…" doneLabel="Panels created" onAction={withGpt} testId="story-auto" />
          )}
          <details className="mt-4" open={!p.canAuto}>
            <summary className="cursor-pointer text-sm text-blue-700">{p.canAuto ? "Or do it by hand in ChatGPT" : "Do it in ChatGPT"}</summary>
            <div className="mt-3 space-y-2">
              <ActionButton label="Copy the storyboard request" busyLabel="Copying…" doneLabel="Copied" doneForMs={2500} testId="story-copy"
                onAction={async () => { try { await navigator.clipboard.writeText(prompt); return true; } catch { return false; } }} />
              <p className="text-sm text-neutral-600">Go over to ChatGPT, paste the request, then paste ChatGPT&apos;s whole reply below.</p>
              <textarea className={field} rows={8} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="PANEL 1&#10;ACTION: …" data-testid="story-reply" />
              <button type="button" disabled={!reply.trim()} onClick={() => read(reply)} data-testid="story-read"
                className="rounded-md bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-neutral-400">Read panels</button>
            </div>
          </details>
          <p className="mt-4"><button type="button" onClick={() => setStep(1)} className="text-sm text-neutral-600 underline">Back to the story</button></p>
        </>
      )}

      {step === 3 && (
        <>
          <StepHeader n={3} title="Check the panels" />
          <div className="mb-3 rounded bg-blue-50 px-3 py-2 text-sm text-blue-900" data-testid="story-total">
            {panels.length} panels · about <strong>{check.totalSec} s</strong> · target {target} s
            {check.lengthNote && <span className="block text-amber-800">{check.lengthNote}</span>}
          </div>
          <div className="mb-4 rounded-lg border border-neutral-200 p-3" data-testid="story-staging">
            <p className="mb-2 text-sm font-semibold">Scene setting <span className="font-normal text-neutral-600">· kept the same in every picture and clip</span></p>
            <StagingFields value={staging} onChange={setStaging} />
          </div>
          {unknown.length > 0 && <p className="mb-3 text-sm text-amber-700">GPT also mentioned {unknown.join(", ")}, who {unknown.length > 1 ? "aren't characters" : "isn't a character"} in this scene. They are treated as background.</p>}
          <ol className="space-y-3">
            {panels.map((x, i) => {
              const issues = check.issues.filter((s) => s.panel === i + 1);
              return (
                <li key={i} className={`rounded-lg border p-3 ${issues.length ? "border-red-300" : "border-neutral-200"}`} data-testid={`draft-${i + 1}`}>
                  <div className="mb-2 flex items-center gap-2 text-sm">
                    <span className="font-semibold">{i + 1}</span>
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">{x.line ? `${x.seconds} s, sized to the line` : "silent"}</span>
                    {!x.line && (
                      <label className="text-xs">
                        <input type="number" min={MIN_CLIP_SEC} max={MAX_CLIP_SEC} value={x.seconds} className="w-14 rounded border border-neutral-300 px-1 py-0.5"
                          onChange={(e) => update(i, { seconds: Number(e.target.value) })} /> s
                      </label>
                    )}
                    <span className="ml-auto flex gap-1">
                      <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded border border-neutral-300 px-2 disabled:opacity-40" aria-label="Move up">↑</button>
                      <button type="button" disabled={i === panels.length - 1} onClick={() => move(i, 1)} className="rounded border border-neutral-300 px-2 disabled:opacity-40" aria-label="Move down">↓</button>
                      <button type="button" onClick={() => setPanels((xs) => xs.filter((_, k) => k !== i))} className="px-2 text-xs text-red-700 underline" data-testid={`draft-${i + 1}-delete`}>Delete</button>
                    </span>
                  </div>
                  <label className="block text-sm">What we see<WordsHelp guide="panel" />
                    <textarea className={field} rows={2} value={x.action} onChange={(e) => update(i, { action: e.target.value })} data-testid={`draft-${i + 1}-action`} />
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span>In frame:</span>
                    {p.cast.map((c) => (
                      <label key={c.id} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${x.inFrame.includes(c.id) ? "border-blue-600 bg-blue-50" : "border-neutral-300"}`}>
                        <input type="checkbox" checked={x.inFrame.includes(c.id)} disabled={x.speakerId === c.id}
                          onChange={() => update(i, { inFrame: x.inFrame.includes(c.id) ? x.inFrame.filter((y) => y !== c.id) : [...x.inFrame, c.id] })} />
                        {c.name}
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[9rem_1fr_10rem]">
                    <label className="text-sm">Speaker
                      <select className={field} value={x.speakerId ?? ""} onChange={(e) => update(i, { speakerId: e.target.value || undefined })} data-testid={`draft-${i + 1}-speaker`}>
                        <option value="">No one (silent)</option>
                        {p.cast.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </label>
                    <label className="text-sm">{x.speakerId ? `${name(x.speakerId)} says` : "Line"} <span className="text-neutral-500">(exact words, no quote marks)</span>
                      <input className={field} value={x.line} disabled={!x.speakerId} onChange={(e) => update(i, { line: e.target.value })} data-testid={`draft-${i + 1}-line`} />
                    </label>
                    <label className="text-sm">Emotion
                      <input className={field} value={x.emotion} onChange={(e) => update(i, { emotion: e.target.value })} />
                    </label>
                  </div>
                  {issues.map((s) => <p key={s.text} className="mt-1 text-sm text-red-700">{s.text}</p>)}
                </li>
              );
            })}
          </ol>
          <button type="button" onClick={() => setPanels((xs) => [...xs, { action: "", inFrame: [], line: "", emotion: "", seconds: 4 }])}
            className="mt-3 rounded-md border border-blue-700 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50" data-testid="draft-add">+ Add panel</button>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setStep(2)} className="text-sm text-neutral-600 underline">Back</button>
            <ActionButton label="Save storyboard" busyLabel="Saving…" doneLabel="Saved" disabled={!panels.length || check.issues.length > 0} onAction={save} testId="story-save"
              title={check.issues.length ? "Fix the panels marked in red first" : ""} />
            {check.issues.length > 0 && <span className="text-sm text-red-700">Fix the panels marked in red first.</span>}
            {p.replacing && <span className="text-xs text-amber-700">Saving replaces the scene&apos;s current draft panels.</span>}
          </div>
        </>
      )}
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
