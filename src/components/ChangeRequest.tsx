"use client";

// "Need to change something?" (D16g): Yes → fill in only what should change → Submit changes.
// Changes to how something looks hand over to the page, which clears and runs the same final
// step as a new character or venue. A change that doesn't affect the look (e.g. only
// personality) is saved straight away with no new images (D16h).

import { useState } from "react";
import { ActionButton } from "./ActionButton";

const QUESTIONS = {
  character: [
    { key: "look", label: "How they look?", short: "How they look", hint: "e.g. shoulder-length hair; a short beard; looks a bit older" },
    { key: "wear", label: "What they're wearing?", short: "What they wear", hint: "e.g. white shirt, navy tie and trousers, gold waistcoat" },
    { key: "personality", label: "Personality or mannerisms?", short: "Personality and mannerisms", hint: "e.g. more nervous and fidgety; dry, deadpan humour", visual: false },
    { key: "other", label: "Anything else?", short: "Also", hint: "e.g. a warmer smile; standing straighter" },
  ],
  place: [
    { key: "place", label: "The place itself?", short: "The place", hint: "e.g. replace the sofas with high bar stools; add plants along the windows" },
    { key: "light", label: "Light and time of day?", short: "Light and time of day", hint: "e.g. night-time with warm lamps; brighter daylight" },
    { key: "other", label: "Anything else?", short: "Also", hint: "e.g. make the screen wall bigger" },
  ],
} as const;

export interface SubmittedChange {
  /** All answers as one sentence, for the ChatGPT prompt. */
  text: string;
  /** Answers by question key. */
  parts: Record<string, string>;
  /** True when how it looks changes, so a new description and image board are needed. */
  visual: boolean;
}

export function ChangeRequest({ what, onSubmit }: { what: "character" | "place"; onSubmit: (change: SubmittedChange) => void | Promise<{ ok: boolean; text: string } | void> }) {
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [yes, setYes] = useState(false);
  const [parts, setParts] = useState<Record<string, string>>({});
  const questions = QUESTIONS[what];
  const answered = questions.filter((q) => parts[q.key]?.trim());
  const change = answered.map((q) => `${q.short}: ${parts[q.key].trim().replace(/[.]$/, "")}`).join(". ");
  const visual = answered.some((q) => !("visual" in q) || q.visual !== false);
  const submitted = { text: change, parts: Object.fromEntries(answered.map((q) => [q.key, parts[q.key].trim()])), visual };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid="change-open"
        className="w-full rounded-lg border border-blue-200 bg-blue-50/40 px-4 py-2 text-left text-sm font-semibold text-blue-900 hover:bg-blue-50">
        Need to change something?
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4 text-sm" data-testid="change-request">
      {!yes ? (
        <p className="flex flex-wrap items-center gap-2">Is there anything you want to change?
          <button type="button" onClick={() => setYes(true)} data-testid="change-yes" className="rounded-md bg-blue-700 px-3 py-1 text-white hover:bg-blue-800">Yes</button>
          <button type="button" onClick={() => setOpen(false)} className="text-neutral-600 underline">No</button>
        </p>
      ) : (
        <>
          <p>Fill in only what should change. Everything else stays the same.</p>
          {questions.map((q) => (
            <label key={q.key} className="block">{q.label}
              <input className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1" value={parts[q.key] ?? ""} placeholder={q.hint}
                data-testid={`change-${q.key}`} onChange={(e) => setParts((x) => ({ ...x, [q.key]: e.target.value }))} />
            </label>
          ))}
          <div className="flex items-center gap-3">
            <ActionButton label="Submit changes" busyLabel="Submitting…" doneLabel="Submitted" testId="change-submit" disabled={!change}
              resetKey={parts}
              onAction={async () => {
                setNote(null);
                if (visual) { setTimeout(() => onSubmit(submitted), 800); return; } // show "✓ Submitted" before the page clears
                const r = await onSubmit(submitted);
                if (r) setNote(r);
                return r ?? undefined;
              }} />
            <button type="button" onClick={() => { setYes(false); setOpen(false); setParts({}); setNote(null); }} className="text-neutral-600 underline">{note?.ok ? "Close" : "Cancel"}</button>
          </div>
          {answered.length > 0 && !visual && !note && <p className="text-xs text-neutral-600">Nothing about how they look is changing, so this is saved straight away. No new images are needed.</p>}
          {note && <p className={`text-sm ${note.ok ? "text-green-700" : "text-red-700"}`} role="status">{note.text}</p>}
        </>
      )}
    </div>
  );
}
