"use client";

// Shows a reference sheet with draggable cut lines (placed automatically on the joins),
// then cuts it into separate images, padding any piece narrower than the minimum aspect.

import { useEffect, useRef, useState } from "react";
import { detectCuts, paddedWidth, pieceRects } from "@/lib/domain/sheet";

export interface SheetCutterProps {
  file: File;
  cols: number;
  rows: number;
  labels: string[];
  minAspect?: number;
  busy?: boolean;
  onCut: (pieces: Blob[]) => void;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file could not be read as an image."));
    img.src = url;
  });
}

function luminance(img: HTMLImageElement, w = 400) {
  const h = Math.max(1, Math.round((img.naturalHeight * w) / img.naturalWidth));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const data = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  return { w, h, data };
}

function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image."))), "image/png"));
}

export function SheetCutter({ file, cols, rows, labels, minAspect, busy, onCut }: SheetCutterProps) {
  const [url, setUrl] = useState<string>();
  const [img, setImg] = useState<HTMLImageElement>();
  const [xs, setXs] = useState<number[]>([]);
  const [ys, setYs] = useState<number[]>([]);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ axis: "x" | "y"; i: number } | null>(null);

  useEffect(() => {
    // In development React runs this twice and abandons the first run; only the live run may report.
    const u = URL.createObjectURL(file);
    setUrl(u);
    setError("");
    let live = true;
    loadImage(u).then((im) => {
      if (!live) return;
      const lum = luminance(im);
      setImg(im);
      setXs(detectCuts(lum, cols, "x"));
      setYs(detectCuts(lum, rows, "y"));
    }).catch((e: Error) => { if (live) setError(e.message); });
    // Revoke a moment later, so an <img> still showing this URL doesn't log a load error.
    return () => { live = false; setTimeout(() => URL.revokeObjectURL(u), 2000); };
  }, [file, cols, rows]);

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const f = d.axis === "x" ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
    const list = d.axis === "x" ? xs : ys;
    const lo = (list[d.i - 1] ?? 0) + 0.05;
    const hi = (list[d.i + 1] ?? 1) - 0.05;
    const next = list.map((v, k) => (k === d.i ? Math.min(hi, Math.max(lo, f)) : v));
    (d.axis === "x" ? setXs : setYs)(next);
  };

  async function cut() {
    if (!img) return;
    setError("");
    try {
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const blobs: Blob[] = [];
      for (const r of pieceRects(W, H, xs, ys)) {
        const outW = minAspect ? paddedWidth(r.w, r.h, minAspect) : r.w;
        const c = document.createElement("canvas");
        c.width = outW;
        c.height = r.h;
        const ctx = c.getContext("2d")!;
        if (outW > r.w) {
          // Pad with the sheet's background: stretch the piece's own edge columns outwards.
          const pad = Math.floor((outW - r.w) / 2);
          ctx.drawImage(img, r.x, r.y, 2, r.h, 0, 0, pad + 1, r.h);
          ctx.drawImage(img, r.x + r.w - 2, r.y, 2, r.h, pad + r.w - 1, 0, outW - pad - r.w + 1, r.h);
          ctx.drawImage(img, r.x, r.y, r.w, r.h, pad, 0, r.w, r.h);
        } else {
          ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        }
        blobs.push(await toBlob(c));
      }
      onCut(blobs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const xb = [0, ...xs, 1];
  const yb = [0, ...ys, 1];
  return (
    <div className="space-y-2" data-testid="sheet-cutter">
      <p className="text-xs text-neutral-600">The cut lines are placed on the joins automatically. Drag a line if it&apos;s off, then cut.</p>
      {url && (
        <div ref={box} className="relative w-full select-none touch-none" onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Reference sheet" className="block w-full rounded" draggable={false} />
          {xs.map((x, i) => (
            <div key={`x${i}`} role="separator" aria-label={`Cut line ${i + 1}`} data-testid={`cut-x-${i}`}
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { axis: "x", i }; }}
              className="absolute top-0 h-full w-4 -translate-x-1/2 cursor-col-resize" style={{ left: `${x * 100}%` }}>
              <div className="mx-auto h-full w-0.5 bg-red-600 shadow-[0_0_0_1px_white]" />
            </div>
          ))}
          {ys.map((y, i) => (
            <div key={`y${i}`} role="separator" aria-label={`Cut line ${xs.length + i + 1}`} data-testid={`cut-y-${i}`}
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { axis: "y", i }; }}
              className="absolute left-0 h-4 w-full -translate-y-1/2 cursor-row-resize" style={{ top: `${y * 100}%` }}>
              <div className="my-auto mt-[7px] h-0.5 w-full bg-red-600 shadow-[0_0_0_1px_white]" />
            </div>
          ))}
          {yb.slice(0, -1).map((y0, r) => xb.slice(0, -1).map((x0, c) => (
            <span key={`${r}-${c}`} className="pointer-events-none absolute rounded bg-black/60 px-1.5 py-0.5 text-xs text-white"
              style={{ left: `${(x0 + xb[c + 1]) * 50}%`, top: `${y0 * 100 + 2}%`, transform: "translateX(-50%)" }}>
              {labels[r * cols + c]}
            </span>
          )))}
        </div>
      )}
      <button type="button" disabled={!img || busy} onClick={() => void cut()} data-testid="sheet-cut"
        className="rounded-md bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-50">
        {busy ? "Saving…" : `Cut into ${cols * rows} and attach`}
      </button>
      {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
    </div>
  );
}
