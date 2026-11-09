"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { approveVenueAction, saveVenueAction, setVenueViewImageAction } from "@/app/studioActions";
import { uploadBlob } from "@/lib/clientUpload";
import type { VenueView } from "@/lib/studioRepo";
import { VENUE_SHEET, venueChangePrompt, venueDescribePrompt, venueFillFromReply, venueSheetRequest, type DescribeSource } from "@/lib/domain/describe";
import { StartFromPanel } from "./StartFromPanel";
import { ActionButton, DoneBadge } from "./ActionButton";

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

export function VenueEditor({ venue, projectId, baseCode, canDescribe, images }: { projectId: string; baseCode: string; canDescribe: boolean; images?: ReactNode; venue: { id: string; name: string; description: string; setting: string; status: string; views: VenueView[] } }) {
  const router = useRouter();
  // Images are set beside each view, so they are not part of this form's state.
  const initial = { name: venue.name, description: venue.description, setting: (venue.setting === "exterior" ? "exterior" : "interior") as "interior" | "exterior", views: venue.views.map((v) => ({ name: v.name, directionDeg: v.directionDeg })) };
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm";

  // Create: fill in and save the description and views, then attach the cut views in order.
  const create = async (reply: string, pieces: Blob[], board: File) => {
    const r = venueFillFromReply(reply);
    if (!r.description) return { ok: false, text: "Couldn't find the labelled description in that reply. Check you pasted all of ChatGPT's answer." };
    const views = r.views.length === 4 ? r.views : f.views;
    const next = { ...f, setting: r.setting, description: r.description, views };
    const saved = await saveVenueAction(venue.id, next);
    if (!saved.ok) return { ok: false, text: saved.error };
    await uploadBlob(projectId, `${baseCode}_SHEET`, "reference-sheet", board, board.name);
    const n = Math.min(views.length, pieces.length);
    for (let i = 0; i < n; i++) {
      const v = views[i];
      const code = `${baseCode}_${v.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
      const id = await uploadBlob(projectId, code, "venue-ref", pieces[i], `${v.name}.png`);
      const a = await setVenueViewImageAction(venue.id, v.name, id);
      if (!a.ok) return { ok: false, text: a.error };
    }
    setF(next);
    setMsg(null);
    router.refresh();
    return {
      ok: true,
      text: [
        `Created: description and ${views.length} views saved, and ${n} view images are on the right. Check them, then approve the venue.`,
        views.length !== 4 ? `The board has 4 panels but the venue has ${views.length} views, so only ${n} were matched.` : "",
        r.missing.length ? `Not in the reply: ${r.missing.map((m) => m.toLowerCase()).join(", ")}.` : "",
      ].filter(Boolean).join(" "),
    };
  };

  const save = async () => {
    const r = await saveVenueAction(venue.id, f);
    setMsg(r.ok ? { ok: true, text: "Saved. The venue is back to draft until you approve it." } : { ok: false, text: r.error });
    router.refresh();
    return r;
  };
  const approve = async () => {
    const r = await approveVenueAction(venue.id);
    setMsg(r.ok ? { ok: true, text: "Venue approved." } : { ok: false, text: r.error });
    router.refresh();
    return r;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]" data-testid="venue-details">
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs">
        <span className={`rounded px-2 py-0.5 ${venue.status === "approved" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{venue.status}</span>
      </div>
      <label className="block text-sm">Venue name<input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
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
        <ActionButton label="Save" busyLabel="Saving…" doneLabel="Saved" disabled={!dirty} onAction={save} resetKey={f} />
        {venue.status === "approved" && !dirty ? <DoneBadge text="Venue approved" /> : (
          <ActionButton variant="approve" label="Approve venue" busyLabel="Approving…" doneLabel="Venue approved" disabled={dirty} onAction={approve} resetKey={f} />
        )}
        {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`} role="status">{msg.text}</p>}
    </div>
    <div className="space-y-3 self-start">
      {images}
      <StartFromPanel what="place" projectId={projectId} baseCode={`${baseCode}_SOURCE`} canDescribe={canDescribe} changeOnly
        promptFor={(src: DescribeSource, text: string) => src === "change"
          ? venueChangePrompt({ setting: f.setting, description: f.description, views: f.views.map((v) => v.name) }, text)
          : venueDescribePrompt(src, text)}
        change={{ currentImages: venue.views.filter((v) => v.imageAssetId).map((v) => ({ label: `${v.name} view`, assetId: v.imageAssetId! })) }}
        onCreate={create}
        sheet={{
          cols: VENUE_SHEET.cols, rows: VENUE_SHEET.rows,
          labels: f.views.length === 4 ? f.views.map((v) => v.name) : ["view 1", "view 2", "view 3", "view 4"],
          prompt: venueSheetRequest(f.views.length === 4 ? f.views.map((v) => v.name) : undefined),
        }} />
    </div>
    </div>
  );
}
