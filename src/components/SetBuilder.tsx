"use client";

// The "Build the set" page (D98): make each of the set's own pictures once, check it, use it; then
// see the 360° from every camera position and each shot's slice of it.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { chooseSetPictureAction } from "@/app/studioActions";

type What = { kind: "wall"; view: string } | { kind: "floor" } | { kind: "piece"; furnitureId: string; from: string };

const CHECKER = { backgroundImage: "repeating-conic-gradient(#e5e5e5 0% 25%, #ffffff 0% 50%)", backgroundSize: "16px 16px" };

function Item(p: { title: string; sub?: string; what: What; sceneId: string; venueId: string; canMake: boolean; fallbackAssetId?: string; fallbackLabel: string; ownAssetId?: string; cutOut?: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<"" | "make" | "use" | "upload">("");
  const [candidate, setCandidate] = useState<{ assetId: string; note?: string } | null>(null);
  const [error, setError] = useState("");
  const key = p.what.kind === "piece" ? { kind: "piece" as const, from: p.what.from } : p.what;

  const make = async () => {
    setBusy("make"); setError("");
    try {
      const body = p.what.kind === "piece" ? { kind: "piece", furnitureId: p.what.furnitureId } : p.what;
      const res = await fetch(`/api/set/${p.sceneId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const r = (await res.json()) as { assetId?: string; note?: string; error?: string };
      if (!res.ok || !r.assetId) throw new Error(r.error ?? "GPT didn't return a picture.");
      setCandidate({ assetId: r.assetId, note: r.note });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(""); }
  };
  // A picture of their own (D101): a cut-out made elsewhere, a photo of the real wall.
  const upload = async (file: File) => {
    setBusy("upload"); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("what", JSON.stringify(p.what.kind === "piece" ? { kind: "piece", furnitureId: p.what.furnitureId } : p.what));
      const res = await fetch(`/api/set/${p.sceneId}`, { method: "POST", body: form });
      const r = (await res.json()) as { assetId?: string; note?: string; error?: string };
      if (!res.ok || !r.assetId) throw new Error(r.error ?? "The picture couldn't be read.");
      setCandidate({ assetId: r.assetId, note: r.note });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(""); }
  };
  const ownFile = (
    <label className={`cursor-pointer rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50 ${busy ? "pointer-events-none opacity-50" : ""}`}>
      {busy === "upload" ? "Adding…" : "Use my own picture"}
      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
    </label>
  );
  const use = async (assetId: string | null) => {
    setBusy("use"); setError("");
    const r = await chooseSetPictureAction(p.venueId, key, assetId);
    setBusy("");
    if (!r.ok) { setError(r.error); return; }
    setCandidate(null);
    p.onChanged();
  };

  const shown = p.ownAssetId ?? p.fallbackAssetId;
  const pic = (id: string, label: string) => (
    <figure className="flex-1">
      <div className="flex h-40 items-center justify-center overflow-hidden rounded border border-neutral-200" style={p.cutOut ? CHECKER : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/assets/${id}`} alt={label} className="max-h-full max-w-full object-contain" />
      </div>
      <figcaption className="mt-1 text-xs text-neutral-500">{label}</figcaption>
    </figure>
  );

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{p.title}</h3>
        {p.ownAssetId ? <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">own picture in use</span> : <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{p.fallbackLabel}</span>}
      </div>
      {p.sub && <p className="text-xs text-neutral-500">{p.sub}</p>}
      <div className="mt-2 flex gap-2">
        {shown ? pic(shown, p.ownAssetId ? "In use" : "Used now") : <div className="flex h-40 flex-1 items-center justify-center rounded border border-dashed text-xs text-neutral-500">No picture yet</div>}
        {candidate && pic(candidate.assetId, "New: check it")}
      </div>
      {candidate?.note && <p className="mt-1 text-xs text-amber-800">{candidate.note}</p>}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        {candidate ? (
          <>
            <button type="button" disabled={!!busy} onClick={() => use(candidate.assetId)} className="rounded bg-green-700 px-3 py-1 text-white hover:bg-green-800 disabled:opacity-50">{busy === "use" ? "Using…" : "Use this"}</button>
            <button type="button" disabled={!!busy} onClick={() => setCandidate(null)} className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50">Discard</button>
            <button type="button" disabled={!!busy || !p.canMake} onClick={make} className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50 disabled:opacity-50">{busy === "make" ? "Making… (about a minute)" : "Try again"}</button>
            {ownFile}
          </>
        ) : (
          <>
            <button type="button" disabled={!!busy || !p.canMake} onClick={make} className="rounded bg-blue-700 px-3 py-1 text-white hover:bg-blue-800 disabled:opacity-50">
              {busy === "make" ? "Making… (about a minute)" : p.ownAssetId ? "Make a new one" : "Make with GPT"}
            </button>
            {ownFile}
            {p.ownAssetId && <button type="button" disabled={!!busy} onClick={() => use(null)} className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50">Go back to the venue&apos;s picture</button>}
          </>
        )}
      </div>
    </div>
  );
}

export function SetBuilder(props: {
  sceneId: string;
  venueId: string;
  canMake: boolean;
  outdoors: boolean;
  views: { name: string; wall?: string; viewAssetId: string; ownAssetId?: string }[];
  floorAssetId?: string;
  pieces: { id: string; name: string; propAssetId?: string; ownAssetId?: string }[];
  positions: { shots: { shotId: string; code: string; camera: string }[] }[];
}) {
  const router = useRouter();
  const [stamp, setStamp] = useState(0);
  const changed = () => { setStamp((n) => n + 1); router.refresh(); };
  const common = { sceneId: props.sceneId, venueId: props.venueId, canMake: props.canMake, onChanged: changed };

  return (
    <div className="mt-6 space-y-8">
      {!props.canMake && <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">No image provider is connected, so the set&apos;s pictures can&apos;t be made here. The previews below still show the set as it is.</p>}

      <section>
        <h2 className="text-lg font-semibold">{props.outdoors ? "Scenery" : "Walls"}</h2>
        <p className="text-sm text-neutral-600">Each one straight on, {props.outdoors ? "ground to sky" : "floor to ceiling"}, with nothing standing in front of it.</p>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {props.views.map((v) => (
            <Item key={v.name} {...common} title={v.name} sub={v.wall ? `Covers the ${v.wall} ${props.outdoors ? "side" : "wall"} of the floor plan.` : undefined}
              what={{ kind: "wall", view: v.name }} ownAssetId={v.ownAssetId} fallbackAssetId={v.viewAssetId} fallbackLabel="using the venue view" />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">{props.outdoors ? "Ground" : "Floor"}</h2>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <Item {...common} title={props.outdoors ? "Ground" : "Floor"} sub="Seen from above and repeated across the set." what={{ kind: "floor" }} ownAssetId={props.floorAssetId} fallbackLabel="using a strip of a venue view" />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Set pieces</h2>
        <p className="text-sm text-neutral-600">The things standing on the floor that stay where the floor plan puts them, each cut out from its prop picture. Your own picture works too: a PNG with a clear background is best.</p>
        {props.pieces.length === 0 && <p className="mt-2 text-sm text-neutral-500">This scene has no set pieces on its floor plan.</p>}
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {props.pieces.map((f) => f.propAssetId ? (
            <Item key={f.id} {...common} title={f.name} what={{ kind: "piece", furnitureId: f.id, from: f.propAssetId }} ownAssetId={f.ownAssetId} fallbackAssetId={f.propAssetId} fallbackLabel="using the prop picture" cutOut />
          ) : (
            <div key={f.id} className="rounded-lg border border-neutral-200 bg-white p-3 text-sm"><strong>{f.name}</strong>: no prop picture yet. Add one in the scene setting first; until then it stands in the set as a grey block.</div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">The set from each camera position</h2>
        <p className="text-sm text-neutral-600">The full 360° around where the camera stands, turning clockwise from left to right, with each shot&apos;s slice framed. Below it, what each shot sees, with no people.</p>
        <div className="mt-3 space-y-6">
          {props.positions.map((p, k) => (
            <div key={k} className="rounded-lg border border-neutral-200 bg-white p-3">
              <h3 className="font-semibold">Position {k + 1}: {p.shots.map((x) => x.code).join(", ")}</h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/set/${props.sceneId}?pos=${k}&v=${stamp}`} alt={`360° from position ${k + 1}`} loading="lazy" className="mt-2 w-full rounded" />
              <div className="mt-2 flex flex-wrap gap-3">
                {p.shots.map((x) => (
                  <figure key={x.shotId} className="w-36">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/set/${props.sceneId}?shot=${x.shotId}&v=${stamp}`} alt={x.code} loading="lazy" className="w-full rounded border border-neutral-200" />
                    <figcaption className="mt-1 text-xs text-neutral-600"><strong>{x.code}</strong> {x.camera}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
