"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveVenueAction, saveVenueAction } from "@/app/studioActions";
import type { VenueView } from "@/lib/studioRepo";

const DIRECTIONS = [
  { deg: 90, label: "Far end (straight ahead from the entrance)" },
  { deg: 0, label: "Right-hand side" },
  { deg: 180, label: "Left-hand side" },
  { deg: 270, label: "Near end (behind you at the entrance)" },
  { deg: 45, label: "Far right corner" },
  { deg: 135, label: "Far left corner" },
  { deg: 225, label: "Near left corner" },
  { deg: 315, label: "Near right corner" },
];

export function VenueEditor({ venue }: { venue: { id: string; name: string; description: string; status: string; views: VenueView[] } }) {
  const router = useRouter();
  // Images are set beside each view, so they are not part of this form's state.
  const initial = { name: venue.name, description: venue.description, views: venue.views.map((v) => ({ name: v.name, directionDeg: v.directionDeg })) };
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm";

  const save = () => start(async () => {
    const r = await saveVenueAction(venue.id, f);
    setMsg(r.ok ? { ok: true, text: "Saved. The venue is back to draft until you approve it." } : { ok: false, text: r.error });
    router.refresh();
  });
  const approve = () => start(async () => {
    const r = await approveVenueAction(venue.id);
    setMsg(r.ok ? { ok: true, text: "Venue approved." } : { ok: false, text: r.error });
    router.refresh();
  });

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs">
        <span className={`rounded px-2 py-0.5 ${venue.status === "approved" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{venue.status}</span>
      </div>
      <label className="block text-sm">Venue name<input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="block text-sm">Description <span className="text-neutral-500">(layout, décor and light; used in every venue and panel prompt)</span>
        <textarea className={field} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="venue-description" />
      </label>
      <div>
        <p className="text-sm font-medium">Named views</p>
        <p className="text-xs text-neutral-500">What you see looking each way. The floor plan uses these to name each shot&apos;s background, so cuts can be checked for a jumping room.</p>
        <ul className="mt-2 space-y-2">
          {f.views.map((v, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input className="w-48 rounded border border-neutral-300 px-2 py-1 text-sm" value={v.name} aria-label="View name"
                onChange={(e) => setF({ ...f, views: f.views.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
              <select className="rounded border border-neutral-300 px-2 py-1 text-sm" value={v.directionDeg} aria-label="Direction"
                onChange={(e) => setF({ ...f, views: f.views.map((x, k) => (k === i ? { ...x, directionDeg: Number(e.target.value) } : x)) })}>
                {DIRECTIONS.map((d) => <option key={d.deg} value={d.deg}>{d.label}</option>)}
                {!DIRECTIONS.some((d) => d.deg === v.directionDeg) && <option value={v.directionDeg}>{v.directionDeg}°</option>}
              </select>
              <button type="button" className="text-xs text-red-700 underline" onClick={() => setF({ ...f, views: f.views.filter((_, k) => k !== i) })}>Remove</button>
            </li>
          ))}
        </ul>
        <button type="button" className="mt-2 text-sm text-blue-700 underline" onClick={() => setF({ ...f, views: [...f.views, { name: "", directionDeg: 45 }] })}>Add a view</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!dirty || pending} onClick={save} className="rounded-md bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-50">Save</button>
        <button type="button" disabled={dirty || pending || venue.status === "approved"} onClick={approve} className="rounded-md bg-green-700 px-3 py-1 text-sm text-white disabled:opacity-50">Approve venue</button>
        {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`} role="status">{msg.text}</p>}
    </div>
  );
}
