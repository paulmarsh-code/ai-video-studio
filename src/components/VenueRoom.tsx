"use client";

// Room size for a venue (D29): guessed from its words until you set it. Saving it brings every
// scene's floor plan here to the new size, keeping everyone in the same place relative to each other.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setVenueRoomAction } from "@/app/studioActions";
import { ActionButton } from "./ActionButton";

const PRESETS: [string, number, number][] = [
  ["Tiny (lift, car, booth)", 2.5, 3], ["Small room", 4.5, 5.5], ["Medium room", 7, 8], ["Large room (bar, restaurant)", 10, 11],
  ["Hall", 18, 22], ["Outdoors", 30, 30],
];

export function VenueRoom({ venueId, widthM, depthM, guessed, label }: { venueId: string; widthM: number; depthM: number; guessed: boolean; label: string }) {
  const router = useRouter();
  const [w, setW] = useState(widthM);
  const [d, setD] = useState(depthM);
  const [msg, setMsg] = useState("");
  const changed = w !== widthM || d !== depthM;
  const save = async (room: { widthM: number; depthM: number } | null) => {
    const r = await setVenueRoomAction(venueId, room);
    if (!r.ok) { setMsg(r.error); return r; }
    setMsg(r.value ? `Saved. ${r.value} floor plan${r.value === 1 ? "" : "s"} brought to the new size: check the positions and choose the cameras again.` : "Saved. New floor plans for this venue will use it.");
    router.refresh();
    return r;
  };
  const num = "w-20 rounded border border-neutral-300 px-2 py-1";
  return (
    <div className="mb-4 rounded-lg border border-neutral-200 bg-white p-3 text-sm" data-testid="venue-room">
      <p className="font-medium">Room size</p>
      <p className="text-neutral-600">{guessed ? `About ${widthM} × ${depthM} m, guessed from the venue (${label}). Set the real size if you know it.` : `${widthM} × ${depthM} m, set by you.`} It sets how far away the walls are in every shot.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label>Width <input type="number" min={1.5} max={200} step={0.5} className={num} value={w} onChange={(e) => setW(Number(e.target.value))} data-testid="venue-room-width" /> m</label>
        <label>Depth <input type="number" min={1.5} max={200} step={0.5} className={num} value={d} onChange={(e) => setD(Number(e.target.value))} data-testid="venue-room-depth" /> m</label>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-xs">
        {PRESETS.map(([l, pw, pd]) => (
          <button key={l} type="button" className={`rounded border px-2 py-0.5 ${w === pw && d === pd ? "border-blue-700 bg-blue-50" : "border-neutral-300"}`} onClick={() => { setW(pw); setD(pd); }}>{l}</button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <ActionButton label={guessed && !changed ? "Use this size" : "Save room size"} busyLabel="Saving…" doneLabel="Saved" testId="venue-room-save" resetKey={`${w}x${d}`}
          onAction={() => save({ widthM: w, depthM: d })} />
        {!guessed && <button type="button" className="text-xs underline" onClick={() => void save(null)}>Go back to the guess</button>}
        {msg && <span className="text-neutral-700" role="status">{msg}</span>}
      </div>
    </div>
  );
}
