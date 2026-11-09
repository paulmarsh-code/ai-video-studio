"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveVenueAction, saveVenueAction } from "@/app/studioActions";
import type { VenueView } from "@/lib/studioRepo";
import { venueDescribePrompt, venueFillFromReply } from "@/lib/domain/describe";
import { StartFromPanel } from "./StartFromPanel";

// Directions are as seen from the main viewpoint (where scenes here usually start).
const DIRECTIONS = [
  { deg: 90, label: "Ahead (far side)" },
  { deg: 0, label: "To the right" },
  { deg: 180, label: "To the left" },
  { deg: 270, label: "Behind (near side)" },
  { deg: 45, label: "Ahead and right" },
  { deg: 135, label: "Ahead and left" },
  { deg: 225, label: "Behind and left" },
  { deg: 315, label: "Behind and right" },
];

export function VenueEditor({ venue, projectId, baseCode, canDescribe }: { projectId: string; baseCode: string; canDescribe: boolean; venue: { id: string; name: string; description: string; setting: string; status: string; views: VenueView[] } }) {
  const router = useRouter();
  // Images are set beside each view, so they are not part of this form's state.
  const initial = { name: venue.name, description: venue.description, setting: (venue.setting === "exterior" ? "exterior" : "interior") as "interior" | "exterior", views: venue.views.map((v) => ({ name: v.name, directionDeg: v.directionDeg })) };
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm";

  const fillFromReply = (reply: string) => {
    const r = venueFillFromReply(reply);
    if (!r.description && !r.views.length) return { ok: false, text: "Couldn't find the labelled lines in that reply. Check you pasted all of ChatGPT's answer." };
    // Views that already have images keep their names; new suggestions are added after them.
    const keep = venue.views.filter((v) => v.imageAssetId).map((v) => ({ name: v.name, directionDeg: v.directionDeg }));
    const added = r.views.filter((v) => !keep.some((k) => k.name.toLowerCase() === v.name.toLowerCase()));
    setF((x) => ({ ...x, setting: r.setting, description: r.description || x.description, views: r.views.length ? [...keep, ...added] : x.views }));
    return {
      ok: true,
      text: [
        `Filled in the setting (${r.setting === "exterior" ? "outdoors" : "indoors"}), description${r.views.length ? ` and ${r.views.length} views` : ""}.`,
        keep.length ? `Kept ${keep.length} view${keep.length > 1 ? "s" : ""} that already have images.` : "",
        r.missing.length ? `Not in the reply: ${r.missing.map((m) => m.toLowerCase()).join(", ")}.` : "",
        "Check and edit, then Save.",
      ].filter(Boolean).join(" "),
    };
  };

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
      <StartFromPanel what="place" projectId={projectId} baseCode={`${baseCode}_SOURCE`} canDescribe={canDescribe} promptFor={venueDescribePrompt} onReply={fillFromReply} />
      <label className="block text-sm">Setting
        <select className={field} value={f.setting} onChange={(e) => setF({ ...f, setting: e.target.value as "interior" | "exterior" })} data-testid="venue-setting">
          <option value="interior">Indoors (a room, hall, office, shop…)</option>
          <option value="exterior">Outdoors (a street, park, beach, pitch…)</option>
        </select>
      </label>
      <label className="block text-sm">Description <span className="text-neutral-500">(what the place is, its layout, materials, time of day and light; used in every venue and panel prompt)</span>
        <textarea className={field} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="venue-description" />
      </label>
      <div>
        <p className="text-sm font-medium">Named views</p>
        <p className="text-xs text-neutral-500">What you see looking each way from the main viewpoint, e.g. a back wall, a shop window, the pier. The floor plan uses these to name each shot&apos;s background, so cuts can be checked for a jumping room.</p>
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
