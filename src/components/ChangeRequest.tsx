"use client";

// "Need to change something?" (D16g): Yes → fill in only what should change → Submit changes.
// Changes to how something looks hand over to the page, which clears and runs the same final
// step as a new character or venue. A change that doesn't affect the look (e.g. only
// personality) is saved straight away with no new images (D16h).
// Each "looks" question can also take a picture to illustrate it ("clothes like this"), which
// is referenced in the change prompt alongside the words (D17b).

import { useState } from "react";
import { ActionButton } from "./ActionButton";
import { uploadBlob } from "@/lib/clientUpload";
import { WordsHelp } from "./WordsHelp";

const QUESTIONS = {
  character: [
    { key: "look", label: "How they look?", short: "How they look", hint: "e.g. shoulder-length hair; a short beard; looks a bit older" },
    { key: "wear", label: "What they're wearing?", short: "What they wear", hint: "e.g. white shirt, navy tie and trousers, gold waistcoat" },
    { key: "personality", label: "Personality or mannerisms?", short: "Personality and mannerisms", hint: "e.g. more nervous and fidgety; dry, deadpan humour", visual: false },
    { key: "other", label: "Anything else?", short: "Also", hint: "e.g. a warmer smile; standing straighter" },
  ],
  panel: [
    { key: "place", label: "Is anyone in the wrong place, facing the wrong way or in the wrong posture?", short: "Who stands where", hint: "e.g. move Jade closer to Nina and have Marcus walk off to the right" },
    { key: "picture", label: "What else should change in this picture?", short: "Change", hint: "e.g. he holds a glass; she looks angrier" },
    { key: "other", label: "Anything else?", short: "Also", hint: "e.g. warmer light; more guests in the background" },
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
  /** Pictures added to illustrate a change, in question order. */
  refs: { for: string; assetId: string }[];
}

export interface ChangeRequestProps {
  what: "character" | "place" | "panel";
  /** Where pictures added to a change are stored. */
  projectId: string;
  baseCode: string;
  onSubmit: (change: SubmittedChange) => void | Promise<{ ok: boolean; text: string } | void>;
}

export function ChangeRequest({ what, projectId, baseCode, onSubmit }: ChangeRequestProps) {
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [yes, setYes] = useState(false);
  const [parts, setParts] = useState<Record<string, string>>({});
  const [pics, setPics] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [picError, setPicError] = useState("");
  const questions = QUESTIONS[what];
  const looks = (q: (typeof questions)[number]) => !("visual" in q) || q.visual !== false;
  const answered = questions.filter((q) => parts[q.key]?.trim() || pics[q.key]);
  const line = (q: (typeof questions)[number]) => {
    const words = parts[q.key]?.trim().replace(/[.]$/, "");
    if (!pics[q.key]) return `${q.short}: ${words}`;
    return words ? `${q.short}: ${words} (see the reference picture)` : `${q.short}: like the reference picture`;
  };
  const change = answered.map(line).join(". ");
  const visual = answered.some(looks);
  const refs = questions.filter((q) => pics[q.key] && looks(q)).map((q) => ({ for: q.short, assetId: pics[q.key] }));
  const submitted = { text: change, parts: Object.fromEntries(answered.map((q) => [q.key, parts[q.key]?.trim() ?? ""])), visual, refs };

  async function addPicture(key: string, file: File) {
    setPicError("");
    if (!file.type.startsWith("image/")) { setPicError("Choose an image file (PNG, JPG or WebP)."); return; }
    setUploading(key);
    try {
      const id = await uploadBlob(projectId, `${baseCode}_CHANGEREF_${key.toUpperCase()}`, "change-reference", file, file.name);
      setPics((x) => ({ ...x, [key]: id }));
    } catch (e) {
      setPicError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
    }
  }

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
            <div key={q.key}>
              <label className="block">{q.label}{what === "panel" && q.key === "place" && <WordsHelp guide="change" />}
                <input className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1" value={parts[q.key] ?? ""} placeholder={q.hint}
                  data-testid={`change-${q.key}`} onChange={(e) => setParts((x) => ({ ...x, [q.key]: e.target.value }))} />
              </label>
              {looks(q) && (pics[q.key] ? (
                <div className="mt-1 flex items-center gap-2" data-testid={`change-pic-${q.key}-added`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${pics[q.key]}`} alt={`Picture for ${q.short.toLowerCase()}`} className="h-14 w-14 rounded object-cover" />
                  <span className="text-xs text-green-700">✓ Picture added</span>
                  <button type="button" className="text-xs text-neutral-600 underline" onClick={() => setPics((x) => { const y = { ...x }; delete y[q.key]; return y; })}>Remove</button>
                </div>
              ) : (
                <label className="mt-1 inline-block cursor-pointer text-xs text-blue-700 underline">
                  {uploading === q.key ? "Uploading…" : "Add a picture to show what you mean (optional)"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={!!uploading} data-testid={`change-pic-${q.key}`}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addPicture(q.key, f); }} />
                </label>
              ))}
            </div>
          ))}
          {what === "panel" && <p className="text-xs text-neutral-600">Anything about who stands where opens this panel&apos;s floor plan with your words applied, so you can see it before the picture is redrawn. It carries on to the next panels unless you tick &ldquo;This panel only&rdquo;.</p>}
          {Object.keys(pics).length > 0 && <p className="text-xs text-neutral-600">A picture is only used for what you added it to. {what === "place" ? "People, signs and text in it are left out." : "The faces and features stay the same."}</p>}
          {picError && <p className="text-xs text-red-700" role="alert">{picError}</p>}
          <div className="flex items-center gap-3">
            <ActionButton label="Submit changes" busyLabel="Submitting…" doneLabel="Submitted" testId="change-submit" disabled={!change || !!uploading}
              resetKey={[parts, pics]}
              onAction={async () => {
                setNote(null);
                if (visual) { setTimeout(() => onSubmit(submitted), 800); return; } // show "✓ Submitted" before the page clears
                const r = await onSubmit(submitted);
                if (r) setNote(r);
                return r ?? undefined;
              }} />
            <button type="button" onClick={() => { setYes(false); setOpen(false); setParts({}); setPics({}); setNote(null); }} className="text-neutral-600 underline">{note?.ok ? "Close" : "Cancel"}</button>
          </div>
          {answered.length > 0 && !visual && !note && <p className="text-xs text-neutral-600">Nothing about how they look is changing, so this is saved straight away. No new images are needed.</p>}
          {note && <p className={`text-sm ${note.ok ? "text-green-700" : "text-red-700"}`} role="status">{note.text}</p>}
        </>
      )}
    </div>
  );
}
