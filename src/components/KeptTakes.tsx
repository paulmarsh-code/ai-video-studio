"use client";

// Finished takes kept for some panels (D130). Choose the clip, the panels it covers, and the moment
// the next clip should open on: play or scrub to it, then keep it. The frame is taken here in the
// browser, so it is exactly the picture you see.

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { KeptTakeRecord } from "@/lib/studioRepo";

export function KeptTakes({ sceneId, kept, panels }: { sceneId: string; kept: KeptTakeRecord[]; panels: { order: number; description: string }[] }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [from, setFrom] = useState(panels[0]?.order ?? 1);
  const [to, setTo] = useState(panels[0]?.order ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const choose = (f: File | undefined) => {
    setError("");
    if (url) URL.revokeObjectURL(url);
    setFile(f ?? null);
    setUrl(f ? URL.createObjectURL(f) : "");
  };

  const keep = async () => {
    const v = video.current;
    if (!v || !file) return;
    setBusy(true); setError("");
    try {
      // The frame on screen, at the clip's own size.
      const c = document.createElement("canvas");
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      const frame = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("The frame couldn't be taken."))), "image/png"));
      const form = new FormData();
      form.append("video", file);
      form.append("frame", new File([frame], "frame.png", { type: "image/png" }));
      form.append("from", String(from)); form.append("to", String(to)); form.append("atSec", String(v.currentTime));
      const res = await fetch(`/api/kept/${sceneId}`, { method: "POST", body: form });
      const r = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !r.ok) throw new Error(r.error ?? "The take couldn't be kept.");
      choose(undefined);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const remove = async (k: KeptTakeRecord) => {
    setBusy(true);
    await fetch(`/api/kept/${sceneId}?from=${k.from}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  };

  const label = (o: number) => `Panel ${o}: ${panels.find((p) => p.order === o)?.description.slice(0, 50) ?? ""}`;

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">Kept takes</h2>
      <p className="text-sm text-neutral-600">
        Footage you already have and want to keep. Its panels get no new clip, and the next clip opens on the moment you choose from it, so new footage carries straight on from the old.
      </p>

      {kept.length > 0 && (
        <ul className="mt-2 space-y-2">
          {kept.map((k) => (
            <li key={k.from} className="flex items-center gap-3 rounded border border-neutral-200 bg-white p-2 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/assets/${k.frameAssetId}`} alt="Frame the next clip opens on" className="h-20 rounded border border-neutral-200" />
              <div className="flex-1">
                <div><strong>Panels {k.from}–{k.to}</strong> kept: {k.name}</div>
                <div className="text-neutral-600">The next clip opens on this frame, at {k.atSec.toFixed(1)} s.</div>
              </div>
              <button type="button" disabled={busy} onClick={() => void remove(k)} className="text-xs text-red-700 underline disabled:opacity-50">Stop keeping it</button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm">
        <label className="inline-block cursor-pointer rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50">
          {file ? "Choose a different clip" : "Add a take you want to keep"}
          <input type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {file && (
          <div className="mt-3 flex flex-wrap gap-4">
            <video ref={video} src={url} controls className="max-h-96 rounded border border-neutral-200" onLoadedMetadata={(e) => { e.currentTarget.currentTime = Math.max(0, e.currentTarget.duration - 0.1); }} />
            <div className="flex max-w-sm flex-col gap-2">
              <div>It covers</div>
              <select value={from} onChange={(e) => { const v = Number(e.target.value); setFrom(v); if (to < v) setTo(v); }} className="rounded border border-neutral-300 px-2 py-1">
                {panels.map((p) => <option key={p.order} value={p.order}>{label(p.order)}</option>)}
              </select>
              <div>to</div>
              <select value={to} onChange={(e) => setTo(Number(e.target.value))} className="rounded border border-neutral-300 px-2 py-1">
                {panels.filter((p) => p.order >= from).map((p) => <option key={p.order} value={p.order}>{label(p.order)}</option>)}
              </select>
              <p className="text-neutral-600">Play or drag the clip to the moment the next clip should open on (it starts at the end), then keep it. Choose a moment in the same place and light as what comes next.</p>
              <button type="button" disabled={busy} onClick={() => void keep()} className="rounded bg-green-700 px-3 py-1 text-white hover:bg-green-800 disabled:opacity-50">{busy ? "Keeping…" : "Keep it, opening the next clip on this frame"}</button>
              {error && <p className="text-red-700">{error}</p>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
