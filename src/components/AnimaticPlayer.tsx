"use client";

// Animatic Preview Studio — Release 1 (Stage 4A.6): a timed storyboard player.
// Panels play in order at their durations, dialogue shows as subtitles with emotion tags,
// and each line can have an uploaded recording. No speech service is involved.
// Preview audio is never sent to Kling (spec v1.3 rule).

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveAnimaticAction } from "@/app/actions";
import { countWords, spokenSeconds } from "@/lib/domain/duration";
import type { CastMember } from "@/lib/domain/types";
import type { AnimaticTimeline, PanelRow } from "@/lib/repo";

const PRE_GAP = 0.3;
const POST_GAP = 0.5;

export function AnimaticPlayer(props: {
  projectId: string;
  sceneId: string;
  baseCode: string; // e.g. POT_EP01_S01
  panels: PanelRow[];
  cast: CastMember[];
  initial: AnimaticTimeline;
  version: number;
}) {
  const { panels, cast } = props;
  const [timeline, setTimeline] = useState<AnimaticTimeline>(props.initial);
  const [saved, setSaved] = useState<AnimaticTimeline>(props.initial);
  const [savedVersion, setSavedVersion] = useState(props.version);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [subtitles, setSubtitles] = useState(true);
  const [status, setStatus] = useState("");
  const [pending, start] = useTransition();
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const last = useRef<number | null>(null);

  const durationOf = (p: PanelRow) => timeline.durations[p.id] ?? p.durationSec;
  const segments = useMemo(() => {
    let t = 0;
    return panels.map((p) => {
      const seg = { panel: p, start: t, end: t + (timeline.durations[p.id] ?? p.durationSec) };
      t = seg.end;
      return seg;
    });
  }, [panels, timeline.durations]);
  const total = segments.at(-1)?.end ?? 0;
  const current = segments.find((s) => time >= s.start && time < s.end) ?? segments.at(-1);

  // Clock.
  useEffect(() => {
    if (!playing) { last.current = null; return; }
    let raf = 0;
    const tick = (now: number) => {
      if (last.current !== null) {
        const dt = (now - last.current) / 1000;
        setTime((t) => {
          const n = t + dt;
          if (n >= total) { setPlaying(false); return total; }
          return n;
        });
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  // Keep uploaded line audio in step with the clock.
  useEffect(() => {
    for (const seg of segments) {
      const el = audioRefs.current[seg.panel.id];
      if (!el) continue;
      const offset = time - seg.start - PRE_GAP;
      const active = seg === current && playing && offset >= 0 && offset < (el.duration || Infinity);
      if (active && el.paused) { el.currentTime = offset; void el.play().catch(() => {}); }
      if (!active && !el.paused) el.pause();
    }
  }, [time, playing, segments, current]);

  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const line = current?.panel.dialogue[0];
  const lineVisible = !!line && current && time - current.start >= PRE_GAP;
  const sceneDirty = JSON.stringify(timeline) !== JSON.stringify(saved);

  async function upload(panel: PanelRow, file: File) {
    setStatus(`Uploading ${file.name}…`);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("projectId", props.projectId);
    fd.set("baseCode", `${props.baseCode}_${panel.code}_AUDIO`);
    fd.set("kind", "audio");
    const res = await fetch("/api/assets", { method: "POST", body: fd });
    const body = await res.json();
    if (!res.ok) { setStatus(body.error ?? "Upload failed"); return; }
    const durationSec = await new Promise<number | undefined>((resolve) => {
      const a = new Audio(URL.createObjectURL(file));
      a.addEventListener("loadedmetadata", () => resolve(Number.isFinite(a.duration) ? a.duration : undefined));
      a.addEventListener("error", () => resolve(undefined));
    });
    setTimeline((tl) => ({ ...tl, lineAudio: { ...tl.lineAudio, [panel.id]: { assetId: body.id, durationSec } } }));
    setStatus(`Saved as ${body.assetCode}. Remember to save the animatic.`);
  }

  /** Suggested panel length: pause + line + pause (measured recording if present, else estimate). */
  const suggestedFor = (p: PanelRow) => {
    const text = p.dialogue[0]?.text;
    if (!text) return undefined;
    const spoken = timeline.lineAudio[p.id]?.durationSec ?? spokenSeconds(text);
    return Math.round((PRE_GAP + spoken + POST_GAP) * 10) / 10;
  };

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div>
        {/* Screen */}
        <div className="relative mx-auto aspect-[9/16] max-h-[70vh] overflow-hidden rounded-xl bg-neutral-900 text-white">
          {current && (
            current.panel.imageAssetId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/assets/${current.panel.imageAssetId}`} alt={current.panel.description} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs uppercase tracking-wide text-amber-300">Placeholder: no panel image yet</span>
                <span className="mt-3 font-mono text-2xl">{current.panel.code}</span>
                <p className="mt-2 text-sm text-neutral-300">{current.panel.description}</p>
              </div>
            )
          )}
          <span className="absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 text-xs">ANIMATIC: NOT FINAL</span>
          {subtitles && lineVisible && line && (
            <div className="absolute inset-x-3 bottom-6 rounded-md bg-black/70 px-3 py-2 text-center text-sm">
              {current?.panel.emotion && <span className="mr-1 font-semibold text-amber-300">[{current.panel.emotion}]</span>}
              <span className="text-neutral-300">{name(line.characterId)}:</span> {line.text}
            </div>
          )}
        </div>

        {/* Transport */}
        <div className="mx-auto mt-4 max-w-xl space-y-2">
          <input type="range" aria-label="Seek" min={0} max={total} step={0.05} value={time}
            onChange={(e) => { setTime(Number(e.target.value)); }} className="w-full" />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button type="button" onClick={() => { if (time >= total) setTime(0); setPlaying((p) => !p); }}
              className="rounded-md bg-neutral-900 px-4 py-2 text-white">{playing ? "Pause" : "Play"}</button>
            <button type="button" onClick={() => { setTime(0); setPlaying(false); }} className="rounded-md border border-neutral-300 px-3 py-2">Rewind</button>
            <button type="button" onClick={() => { if (current) setTime(current.start); }} className="rounded-md border border-neutral-300 px-3 py-2">Replay shot</button>
            <label className="ml-2 flex items-center gap-1"><input type="checkbox" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)} /> Subtitles</label>
            <span className="ml-auto font-mono">{time.toFixed(1)}s / {total.toFixed(1)}s</span>
          </div>
          <p className="text-xs text-neutral-500">
            Preview only: checks story, timing and sequence. The final performance and voices come from Kling. Preview audio is never sent to Kling.
          </p>
        </div>
      </div>

      {/* Timeline list */}
      <div className="space-y-3">
        {segments.map((seg) => {
          const p = seg.panel;
          const d = p.dialogue[0];
          const audio = timeline.lineAudio[p.id];
          const suggested = suggestedFor(p);
          const isCurrent = seg === current;
          return (
            <div key={p.id} className={`rounded-lg border bg-white p-3 text-sm ${isCurrent ? "border-blue-500" : "border-neutral-200"}`}>
              <div className="flex items-center justify-between gap-2">
                <button type="button" className="font-mono font-semibold text-blue-700 underline" onClick={() => setTime(seg.start)}>{p.code}</button>
                <span className="text-neutral-500">{seg.start.toFixed(1)}–{seg.end.toFixed(1)}s</span>
              </div>
              <p className="mt-1 text-neutral-700">{p.description}</p>
              {d && (
                <p className="mt-1">
                  <span className="text-neutral-500">{name(d.characterId)}:</span> {d.text}{" "}
                  <span className="text-xs text-neutral-500">({countWords(d.text)} words)</span>
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="text-xs">
                  Duration
                  <input type="number" min={1} max={15} step={0.1} value={durationOf(p)}
                    onChange={(e) => setTimeline((tl) => ({ ...tl, durations: { ...tl.durations, [p.id]: Number(e.target.value) } }))}
                    className="ml-1 w-16 rounded border border-neutral-300 px-1 py-0.5" />s
                </label>
                {suggested !== undefined && Math.abs(suggested - durationOf(p)) > 0.25 && (
                  <button type="button" className="rounded border border-neutral-300 px-2 py-0.5 text-xs"
                    onClick={() => setTimeline((tl) => ({ ...tl, durations: { ...tl.durations, [p.id]: suggested } }))}>
                    Fit to line: {suggested}s
                  </button>
                )}
              </div>
              {d && (
                <div className="mt-2 text-xs">
                  {audio ? (
                    <div className="flex items-center gap-2">
                      <audio ref={(el) => { audioRefs.current[p.id] = el; }} src={`/api/assets/${audio.assetId}`} preload="auto" />
                      <span className="text-green-700">Recording attached{audio.durationSec ? ` (${audio.durationSec.toFixed(1)}s)` : ""}</span>
                      <button type="button" className="underline" onClick={() => setTimeline((tl) => { const la = { ...tl.lineAudio }; delete la[p.id]; return { ...tl, lineAudio: la }; })}>Remove</button>
                    </div>
                  ) : (
                    <label className="cursor-pointer text-blue-700 underline">
                      Upload a recording of this line (optional)
                      <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(p, f); }} />
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!sceneDirty || pending}
            onClick={() => start(async () => { const r = await saveAnimaticAction(props.sceneId, timeline); setSaved(timeline); setSavedVersion(r.version); setStatus(`Animatic saved as version ${r.version}.`); })}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">
            Save animatic (new version)
          </button>
          <span className="text-sm text-neutral-600">{savedVersion ? `Current: v${savedVersion}` : "Not saved yet"}</span>
        </div>
        {status && <p className="text-sm text-green-700">{status}</p>}
      </div>
    </div>
  );
}
