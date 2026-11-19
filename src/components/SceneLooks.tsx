"use client";

// What each person wears in this scene (D174). Their usual clothes come from their character;
// a scene can dress someone differently (Jade at home in casual clothes, not her launch outfit).
// The app draws the same person in the new clothes, front and back, from their own pictures; those
// make the look's own Kling Element, used in this scene's start frames and clips.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestElementsAction, setSceneLookAction } from "@/app/studioActions";
import { elementKey } from "@/lib/domain/clips";
import type { SceneClipsView } from "@/lib/sceneClips";

export function lookPrompt(which: "front" | "back", wardrobe: string): string {
  return [
    "A full-length photograph of the same person as in the reference pictures: exactly the same face, hair, skin tone, age and build.",
    `They are now wearing: ${wardrobe.trim().replace(/\.$/, "")}.`,
    which === "front" ? "Standing straight, facing the camera, arms relaxed at their sides." : "Standing straight, seen from directly behind, arms relaxed at their sides.",
    "The whole body from head to shoes in frame, plain light-grey studio background, soft even light. One person only. No text.",
  ].join(" ");
}

async function draw(projectId: string, baseCode: string, prompt: string, refs: string[]): Promise<string> {
  const res = await fetch("/api/images/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, baseCode, kind: "character-look", prompt, refAssetIds: refs, size: "portrait" }) });
  const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !j.id) throw new Error(j.error ?? `The picture couldn't be drawn (${res.status}).`);
  return j.id;
}

export function SceneLooks({ projectId, projectCode, sceneId, people }: { projectId: string; projectCode: string; sceneId: string; people: SceneClipsView["people"] }) {
  return (
    <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4" data-testid="scene-looks">
      <h2 className="text-lg font-semibold">Clothes in this scene</h2>
      <p className="text-sm text-neutral-600">Everyone wears their usual clothes unless you say otherwise here. The app draws the same person in the new clothes and makes a Kling Element of them for this scene only.</p>
      <div className="mt-3 space-y-4">{people.map((p) => <LookRow key={p.slug} projectId={projectId} projectCode={projectCode} sceneId={sceneId} person={p} />)}</div>
    </section>
  );
}

function LookRow({ projectId, projectCode, sceneId, person }: { projectId: string; projectCode: string; sceneId: string; person: SceneClipsView["people"][number] }) {
  const router = useRouter();
  const [words, setWords] = useState(person.look?.wardrobe ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const base = [person.base.front, person.base.face].filter(Boolean) as string[];
  const make = async () => {
    setBusy(true); setMsg(null);
    try {
      const code = `${projectCode}_${person.slug.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_LOOK_${sceneId.slice(0, 6).toUpperCase()}`;
      const [front, back] = await Promise.all([draw(projectId, `${code}_FRONT`, lookPrompt("front", words), base), draw(projectId, `${code}_BACK`, lookPrompt("back", words), base)]);
      const r = await setSceneLookAction(sceneId, person.slug, { wardrobe: words.trim(), refs: { front, back, face: person.base.face } });
      if (!r.ok) throw new Error(r.error);
      await requestElementsAction(sceneId, [elementKey.look(person.slug, sceneId)]);
      setMsg("Drawn. Check the pictures; Claude makes the Kling Element when you say \"make the elements\".");
      router.refresh();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const clear = async () => { setBusy(true); await setSceneLookAction(sceneId, person.slug, null); setWords(""); setBusy(false); router.refresh(); };
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto]" data-testid={`look-${person.slug}`}>
      <div>
        <div className="text-sm font-medium">{person.name}</div>
        <div className="text-xs text-neutral-500">Usual: {person.usual ? person.usual.slice(0, 160) + (person.usual.length > 160 ? "…" : "") : "as in their pictures"}</div>
        <textarea className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm" rows={2} value={words} onChange={(e) => setWords(e.target.value)}
          placeholder="Leave empty for their usual clothes, or describe what they wear in this scene, e.g. casual: a fitted cream roll-neck, high-waisted wide-leg jeans, loafers" />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy || !words.trim() || base.length === 0} onClick={make} className="rounded-md bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-40">
            {busy ? "Drawing… (up to a minute)" : person.look?.refs?.front ? "Draw again · about 10p" : "Dress them for this scene · about 10p"}
          </button>
          {person.look && <button type="button" disabled={busy} onClick={clear} className="text-xs text-neutral-600 underline">Back to their usual clothes</button>}
          {msg && <span className="text-xs text-neutral-700">{msg}</span>}
        </div>
      </div>
      {person.look?.refs?.front && (
        <div className="flex gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/assets/${person.look.refs.front}`} alt={`${person.name} front`} className="h-40 rounded border" />
          {person.look.refs.back && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/assets/${person.look.refs.back}`} alt={`${person.name} back`} className="h-40 rounded border" />}
        </div>
      )}
    </div>
  );
}
