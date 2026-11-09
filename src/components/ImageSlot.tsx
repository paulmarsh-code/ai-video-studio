"use client";

// One image step: the app writes the GPT prompt, the user makes the image in ChatGPT and
// uploads it here. If a GPT connection is configured (D15), a Generate button also appears.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CopyButton } from "./CopyButton";

type Result = { ok: true } | { ok: false; error: string };

export interface ImageSlotProps {
  label: string;
  projectId: string;
  baseCode: string;
  kind: string;
  assetId?: string;
  prompt: string;
  attach?: { label: string; assetId: string }[];
  /** Reject images narrower than this (width ÷ height). */
  minAspect?: number;
  shape: "portrait" | "landscape";
  canGenerate: boolean;
  onAttach: (assetId: string) => Promise<Result>;
}

function imageAspect(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img.naturalWidth / img.naturalHeight); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error("That file could not be read as an image.")); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

export function ImageSlot(p: ImageSlotProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "upload" | "generate">("");
  const [justDone, setJustDone] = useState<"" | "upload" | "generate">("");
  useEffect(() => {
    if (!justDone) return;
    const t = setTimeout(() => setJustDone(""), 3000);
    return () => clearTimeout(t);
  }, [justDone]);
  const [error, setError] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const testId = p.baseCode.toLowerCase();

  async function finish(id: string) {
    const r = await p.onAttach(id);
    if (!r.ok) throw new Error(r.error);
    setJustDone(busy || "upload");
    router.refresh();
  }

  async function upload(file: File) {
    setError("");
    setBusy("upload");
    try {
      if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG, JPG or WebP).");
      const aspect = await imageAspect(file);
      if (p.minAspect && aspect < p.minAspect - 0.005) {
        throw new Error(`This image is too narrow (${aspect.toFixed(2)}:1). Use at least 1:2 width to height, for example 2:3. Narrower character images were rejected in testing.`);
      }
      const fd = new FormData();
      fd.set("file", file);
      fd.set("projectId", p.projectId);
      fd.set("baseCode", p.baseCode);
      fd.set("kind", p.kind);
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? "Upload failed");
      await finish(body.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function generate() {
    setError("");
    setBusy("generate");
    try {
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.projectId, baseCode: p.baseCode, kind: p.kind, prompt: p.prompt, refAssetIds: (p.attach ?? []).map((a) => a.assetId), size: p.shape }),
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? "Generation failed");
      await finish(body.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3" data-testid={`slot-${testId}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{p.label}</span>
        {p.assetId ? <span className="text-xs text-green-700">Image attached</span> : <span className="text-xs text-neutral-500">No image yet</span>}
      </div>
      <div className={`mt-2 flex items-center justify-center overflow-hidden rounded bg-neutral-100 ${p.shape === "portrait" ? "aspect-[2/3]" : "aspect-video"}`}>
        {p.assetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/assets/${p.assetId}`} alt={p.label} className="h-full w-full object-contain" />
        ) : (
          <span className="px-3 text-center text-xs text-neutral-500">1. Copy the GPT prompt. 2. Make the image in ChatGPT{p.attach?.length ? ", attaching the reference images listed below" : ""}. 3. Upload it here.</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <CopyButton text={p.prompt} label="Copy GPT prompt" />
        <button type="button" className="text-xs text-blue-700 underline" onClick={() => setShowPrompt((s) => !s)}>{showPrompt ? "Hide prompt" : "Show prompt"}</button>
        <label className={`cursor-pointer rounded-md px-3 py-1 text-sm ${justDone === "upload" ? "border border-green-600 bg-green-50 text-green-800" : busy ? "bg-neutral-400 text-white" : "bg-blue-700 text-white hover:bg-blue-800"}`}>
          {busy === "upload" ? "Uploading…" : justDone === "upload" ? "✓ Uploaded" : p.assetId ? "Replace image" : "Upload image"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={!!busy} data-testid={`upload-${testId}`}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
        </label>
        {p.canGenerate && (
          <button type="button" disabled={!!busy} onClick={() => void generate()} className="rounded-md border border-blue-700 px-3 py-1 text-sm text-blue-700 disabled:opacity-50">
            {busy === "generate" ? "Generating…" : justDone === "generate" ? "✓ Generated" : "Generate with GPT"}
          </button>
        )}
      </div>
      {showPrompt && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs">{p.prompt}</pre>}
      {!!p.attach?.length && (
        <div className="mt-2 rounded border border-neutral-200 bg-neutral-50 p-2 text-xs text-neutral-700">
          <p>Reference for ChatGPT (attach it alongside the prompt; it is not uploaded here):</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {p.attach.map((a) => (
              <a key={a.assetId} className="flex items-center gap-1 text-blue-700 underline" href={`/api/assets/${a.assetId}`} download title="Download to attach in ChatGPT">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/assets/${a.assetId}`} alt="" className="h-10 w-7 rounded object-cover" />
                Download {a.label}
              </a>
            ))}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}
    </div>
  );
}
