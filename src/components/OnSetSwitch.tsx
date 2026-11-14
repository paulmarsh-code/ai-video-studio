"use client";

// Draw this scene on its fixed set (D103): image 1 is the set from each camera, GPT draws only the
// people, and the room is pasted back, so it can't change between panels.

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { setSceneOnSetAction } from "@/app/studioActions";

export function OnSetSwitch({ sceneId, on, setHref }: { sceneId: string; on: boolean; setHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const flip = async () => {
    setBusy(true); setError("");
    const r = await setSceneOnSetAction(sceneId, !on);
    setBusy(false);
    if (!r.ok) setError(r.error); else router.refresh();
  };
  return (
    <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm ${on ? "border-green-300 bg-green-50" : "border-neutral-200 bg-white"}`}>
      <label className="flex cursor-pointer items-center gap-2 font-medium">
        <input type="checkbox" checked={on} disabled={busy} onChange={flip} />
        Use the fixed set as the background
      </label>
      <span className="text-neutral-600">
        {on ? "Each picture starts from the set as this panel's camera sees it, with the floor plan's stand-ins and the characters' and props' pictures; the words are the shot and what everyone does. The storyboard is the plan and preview for the clips: accurate, not perfect."
          : <>Off: each picture starts from the venue&apos;s views. Turn on once the set is built (<Link className="text-blue-700 underline" href={setHref}>Build the set</Link>) to keep the venue, props and positions the same in every panel.</>}
      </span>
      {error && <span className="text-red-700">{error}</span>}
    </div>
  );
}
