"use client";

// Full-size venue views (D67): one button on the venue page while any view picture is small.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "./ActionButton";
import { fullSizeViewsAction } from "@/app/studioActions";

export function FullSizeViews({ venueId, small }: { venueId: string; small: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-sm" data-testid="full-size-views">
      <p className="font-medium">{small === 1 ? "One view picture is small" : `${small} view pictures are small`}</p>
      <p className="mt-1 text-neutral-700">Every camera&apos;s background is cut from these, so small pictures make soft backgrounds. GPT can redraw each one at full size: the same place, sharper. Check them afterwards, then approve the venue again.</p>
      <div className="mt-2">
        <ActionButton label={`Make them full size (about ${small * 7}p)`} busyLabel="Redrawing… (about a minute)" doneLabel="Done" testId="full-size-views-go"
          onAction={async () => {
            const r = await fullSizeViewsAction(venueId);
            if (!r.ok) { setMsg({ ok: false, text: r.error }); return false; }
            const made = (r.value ?? []).filter((x) => x.result === "made").map((x) => x.name);
            const kept = (r.value ?? []).filter((x) => x.result === "kept").map((x) => x.name);
            setMsg({ ok: kept.length === 0, text: [made.length ? `Made full size: ${made.join(", ")}.` : "", kept.length ? `Kept as they were: ${kept.join(", ")}. GPT changed the place twice; try again, or keep the small ones.` : ""].filter(Boolean).join(" ") });
            router.refresh();
            return made.length > 0;
          }} />
      </div>
      {msg && <p className={`mt-2 ${msg.ok ? "text-green-700" : "text-amber-800"}`} role="status">{msg.text}</p>}
    </div>
  );
}
