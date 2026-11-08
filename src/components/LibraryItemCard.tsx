"use client";

import { useState, useTransition } from "react";
import { copyLibraryItemAction } from "@/app/actions";

export function LibraryItemCard(props: {
  item: { id: string; name: string; kind: string; version: number; sourceName: string | null; data: string; visibility: string };
  stats: { uses: number; firstTakeApproval: number | null; takesPerApprovedClip: number | null };
}) {
  const { item, stats } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(`${item.name} (copy)`);
  const [data, setData] = useState(item.data);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{item.name}</p>
          <p className="text-xs text-neutral-500">
            {item.kind} · v{item.version} · {item.visibility}
            {item.sourceName && <> · copied from &ldquo;{item.sourceName}&rdquo;</>}
          </p>
        </div>
        <button type="button" onClick={() => setEditing((e) => !e)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs">
          {editing ? "Cancel" : "Copy and change"}
        </button>
      </div>
      <p className="mt-3 text-sm">
        {stats.uses === 0 ? (
          <span className="text-neutral-500">No logged takes yet.</span>
        ) : (
          <>
            Used in {stats.uses} take{stats.uses === 1 ? "" : "s"}
            {stats.firstTakeApproval !== null && <> · {Math.round(stats.firstTakeApproval * 100)}% first-take approval</>}
            {stats.takesPerApprovedClip !== null && <> · {stats.takesPerApprovedClip.toFixed(1)} takes per approved clip</>}
          </>
        )}
      </p>
      {editing && (
        <div className="mt-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <textarea value={data} onChange={(e) => setData(e.target.value)} rows={10} className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs" />
          <button type="button" disabled={pending}
            onClick={() => start(async () => {
              const r = await copyLibraryItemAction(item.id, name, data);
              setMsg(r.ok ? "Copy saved. The original is unchanged." : (r.error ?? "Could not save"));
              if (r.ok) setEditing(false);
            })}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50">
            Save as new copy
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
    </div>
  );
}
