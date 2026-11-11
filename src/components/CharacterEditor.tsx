"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import type { CharacterRecord } from "@/lib/studioRepo";
import { approvalProblems } from "@/lib/domain/approval";
import { approveCharacterAction, discardCharacterDraftAction, saveCharacterAction } from "@/app/studioActions";
import { uploadBlob } from "@/lib/clientUpload";
import { MIN_REF_ASPECT } from "@/lib/domain/imagePrompts";
import type { Pronoun } from "@/lib/domain/types";
import { CHARACTER_SHEET, characterChangePrompt, characterFillFromReply, characterSheetRequest } from "@/lib/domain/describe";
import { ChangeRequest, type SubmittedChange } from "./ChangeRequest";
import { CreateStep } from "./CreateStep";
import { downloadBoard } from "@/lib/board";
import { gptCreate } from "@/lib/gptClient";
import { ActionButton, DoneBadge } from "./ActionButton";
import { WordsHelp } from "./WordsHelp";

export function CharacterEditor({ c, projectId, baseCode, images, canAuto }: { c: CharacterRecord; projectId: string; baseCode: string; images?: ReactNode; canAuto?: boolean }) {
  const router = useRouter();
  const w = c.working;
  const initial = {
    name: c.name, pronoun: c.pronoun, role: c.role, invented: c.invented, consentRef: c.consentRef,
    appearance: w?.profile.appearance ?? "", wardrobe: w?.profile.wardrobe ?? "", mannerisms: w?.profile.mannerisms ?? "",
    anchors: (w?.profile.anchors ?? []).join("\n"), voiceLock: w?.voiceLock ?? "",
  };
  const [f, setF] = useState(initial);
  // Keep unsaved work when a draft is created (save or image upload); reload only when a
  // draft is discarded and the editor falls back to the approved version.
  const [wid, setWid] = useState(w?.id);
  if (wid !== w?.id) {
    setWid(w?.id);
    if (w?.status === "approved") setF(initial);
  }
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const [voiceSuggestion, setVoiceSuggestion] = useState("");
  const [changing, setChanging] = useState<{ text: string; refs: SubmittedChange["refs"] } | null>(null);
  const problems = approvalProblems({ voiceLock: f.voiceLock, profile: { appearance: f.appearance }, invented: f.invented, consentRef: f.consentRef });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const anchorsList = f.anchors.split("\n").map((x) => x.trim()).filter(Boolean);

  // Create: fill in and save the description as a draft, then attach the cut views.
  const create = async (reply: string, pieces: Blob[], board: File) => {
    const r = characterFillFromReply(reply);
    if (!r.appearance && !r.wardrobe) return { ok: false, text: "Couldn't find the labelled description in that reply. Check you pasted all of ChatGPT's answer." };
    const next = {
      ...f,
      appearance: r.appearance || f.appearance,
      wardrobe: r.wardrobe || f.wardrobe,
      mannerisms: r.mannerisms || f.mannerisms,
      anchors: r.anchors.length ? r.anchors.join("\n") : f.anchors,
      voiceLock: f.voiceLock.trim() ? f.voiceLock : r.voice,
    };
    // Upload first, then save text and images together in one step (D17a).
    await uploadBlob(projectId, `${baseCode}_SHEET`, "reference-sheet", board, board.name);
    const refs: Record<string, string> = {};
    for (const [i, view] of CHARACTER_SHEET.views.entries()) refs[view] = await uploadBlob(projectId, `${baseCode}_${view.toUpperCase()}`, "character-ref", pieces[i], `${view}.png`);
    const saved = await saveCharacterAction(c.id, { name: next.name, pronoun: next.pronoun as Pronoun, role: next.role, invented: next.invented, consentRef: next.consentRef },
      { appearance: next.appearance, wardrobe: next.wardrobe, mannerisms: next.mannerisms, anchors: next.anchors.split("\n").map((x) => x.trim()).filter(Boolean), voiceLock: next.voiceLock }, refs);
    if (!saved.ok) return { ok: false, text: saved.error };
    setF(next);
    setVoiceSuggestion(f.voiceLock.trim() && r.voice && r.voice !== f.voiceLock ? r.voice : "");
    setMsg(null);
    router.refresh();
    return {
      ok: !r.known,
      text: [
        `Created: description saved as draft v${saved.value}, and the front, back and face images are on the right. Check them, then approve.`,
        r.missing.length ? `Not in the reply: ${r.missing.map((m) => m.toLowerCase()).join(", ")}.` : "",
        r.known ? "ChatGPT says the picture shows a known person or character, so it described a different original character. Check the result isn't a lookalike." : "",
      ].filter(Boolean).join(" "),
    };
  };
  // A brand-new character shows only the start panel until Create fills in the details.
  const hasRefs = !!(w?.profile.refs?.front || w?.profile.refs?.back || w?.profile.refs?.face);
  const [byHand, setByHand] = useState(false);
  const showDetails = byHand || hasRefs || !!f.appearance.trim() || !!f.wardrobe.trim();
  const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm";

  const save = async () => {
    const r = await saveCharacterAction(c.id, { name: f.name, pronoun: f.pronoun as Pronoun, role: f.role, invented: f.invented, consentRef: f.consentRef },
      { appearance: f.appearance, wardrobe: f.wardrobe, mannerisms: f.mannerisms, anchors: anchorsList, voiceLock: f.voiceLock });
    setMsg(r.ok ? { kind: "ok", text: `Saved as draft version ${r.value}. Approve it to use it in prompts.` } : { kind: "error", text: r.error });
    router.refresh();
    return r;
  };
  const approve = async () => {
    const r = await approveCharacterAction(c.id);
    setMsg(r.ok ? { kind: "ok", text: `Version ${r.value} approved. Earlier versions are kept as superseded.` } : { kind: "error", text: r.error });
    router.refresh();
    return r;
  };
  const discard = () => start(async () => {
    const r = await discardCharacterDraftAction(c.id);
    setMsg(r.ok ? { kind: "ok", text: "Draft discarded." } : { kind: "error", text: r.error });
    router.refresh();
  });

  // A change that doesn't affect the look (only personality or mannerisms) is saved straight
  // away as a new draft; the images stay. Anything visual goes through the image flow below.
  const submitChange = async (ch: SubmittedChange) => {
    if (ch.visual) { setChanging({ text: ch.text, refs: ch.refs }); return; }
    const raw = ch.parts.personality ?? "";
    const mannerisms = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).replace(/[.]?$/, ".") : f.mannerisms;
    const saved = await saveCharacterAction(c.id, { name: f.name, pronoun: f.pronoun as Pronoun, role: f.role, invented: f.invented, consentRef: f.consentRef },
      { appearance: f.appearance, wardrobe: f.wardrobe, mannerisms, anchors: anchorsList, voiceLock: f.voiceLock });
    if (!saved.ok) return { ok: false, text: saved.error };
    setF((x) => ({ ...x, mannerisms }));
    router.refresh();
    return { ok: true, text: `Mannerisms updated and saved as draft v${saved.value}; images unchanged. Check the voice lock still fits, then approve.` };
  };

  // After "Submit changes" the page clears and runs the same final step as a new character.
  if (changing) {
    const board = [w?.profile.refs?.front, w?.profile.refs?.back, w?.profile.refs?.face];
    const haveBoard = board.every(Boolean);
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-5" data-testid="change-flow">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-700 text-sm font-semibold text-white">2</span>
          <h2 className="text-lg font-semibold">Create the updated {c.name}</h2>
          <span className="ml-auto text-xs text-neutral-500">Step 2 of 2</span>
        </div>
        <p className="mb-4 rounded bg-neutral-50 p-2 text-sm text-neutral-700"><span className="font-medium">Your changes:</span> {changing.text}</p>
        {changing.refs.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-3" data-testid="change-refs">
            {changing.refs.map((r) => (
              <figure key={r.assetId} className="text-xs text-neutral-600">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/assets/${r.assetId}`} alt={`Reference: ${r.for}`} className="h-20 w-20 rounded object-cover" />
                <figcaption>{r.for}</figcaption>
              </figure>
            ))}
          </div>
        )}
        <CreateStep
          id="chg"
          action="Recreate"
          copyLabel={`Copy ${c.name}'s updated description`}
          prompt={characterChangePrompt({ appearance: f.appearance, wardrobe: f.wardrobe, mannerisms: f.mannerisms, anchors: anchorsList }, changing.text, changing.refs)}
          instruction={<>Go over to ChatGPT, paste the copied description and upload the current image board{haveBoard && <> (<button type="button" className="text-blue-700 underline" data-testid="download-board"
            onClick={() => void downloadBoard(board as string[], CHARACTER_SHEET.cols, CHARACTER_SHEET.rows, `${baseCode}_current_board.png`)}>download it here</button>)</>}.{changing.refs.length > 0 && <> Then also upload {changing.refs.length === 1 ? "your reference picture" : "your reference pictures"}, after the board: {changing.refs.map((r, i) => <span key={r.assetId}>{i > 0 && ", "}<a className="text-blue-700 underline" href={`/api/assets/${r.assetId}`} download data-testid={`download-ref-${i}`}>{r.for.toLowerCase()}</a></span>)}.</>}</>}
          sheet={{ cols: CHARACTER_SHEET.cols, rows: CHARACTER_SHEET.rows, labels: () => ["Front", "Back", "Face"], minAspect: MIN_REF_ASPECT, request: characterSheetRequest() }}
          onCreate={async (reply, pieces, file) => { const r = await create(reply, pieces, file); if (!r.ok) return r.text; setChanging(null); }}
          // The current views go to GPT so it keeps the same person and changes only what was asked.
          auto={canAuto ? () => gptCreate({
            projectId, what: "character", baseCode,
            prompt: characterChangePrompt({ appearance: f.appearance, wardrobe: f.wardrobe, mannerisms: f.mannerisms, anchors: anchorsList }, changing.text, changing.refs),
            describeImageIds: board[0] ? [board[0]] : [], boardRefIds: board.filter((x): x is string => !!x), references: changing.refs,
          }) : undefined}
          footer={<button type="button" onClick={() => setChanging(null)} className="text-sm text-neutral-600 underline" data-testid="change-cancel">Cancel changes</button>}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]" data-testid={`character-${c.slug}`}>
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {c.approved && <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">v{c.approved.version} approved</span>}
        {c.draft && <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">v{c.draft.version} draft, not used in prompts yet</span>}
        {!c.approved && <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Not approved: this character can&apos;t be used in shots yet</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Name<input className={field} value={f.name} onChange={set("name")} /></label>
        <label className="text-sm">Pronoun
          <select className={field} value={f.pronoun} onChange={set("pronoun")}>
            <option value="she">she</option><option value="he">he</option><option value="they">they</option>
          </select>
        </label>
        <label className="text-sm">Role in the story<input className={field} value={f.role} onChange={set("role")} placeholder="e.g. creator, brand manager" /></label>
      </div>
      {!f.invented && (
        <label className="block text-sm">Consent record <span className="text-neutral-500">(real person: who agreed, when and how; needed before approval)</span>
          <input className={field} value={f.consentRef} onChange={set("consentRef")} data-testid="consent-ref" placeholder="e.g. Sam Lee, signed release form, 9 Nov 2026" />
        </label>
      )}
      {!showDetails ? (
        <button type="button" className="text-xs text-neutral-500 underline" onClick={() => setByHand(true)}>Or fill in the details by hand</button>
      ) : (<>
      <label className="block text-sm">Appearance <span className="text-neutral-500">(face, hair, age, build — used in every image prompt)</span>
        <textarea className={field} rows={2} value={f.appearance} onChange={set("appearance")} data-testid="appearance" />
      </label>
      <label className="block text-sm">Wardrobe<WordsHelp guide="character" />
        <textarea className={field} rows={2} value={f.wardrobe} onChange={set("wardrobe")} />
      </label>
      <label className="block text-sm">Identity anchors <span className="text-neutral-500">(one per line: the 3–5 features that must match in every image)</span>
        <textarea className={field} rows={3} value={f.anchors} onChange={set("anchors")} data-testid="anchors" placeholder={"e.g. chin-length bob with blunt fringe\nblack cat-eye liner\ntangerine-and-ivory shift dress"} />
      </label>
      <label className="block text-sm">Mannerisms <span className="text-neutral-500">(optional)</span>
        <input className={field} value={f.mannerisms} onChange={set("mannerisms")} />
      </label>
      <label className="block text-sm">Voice lock <span className="text-neutral-500">(how they sound; inserted word for word wherever they speak; no quote marks)</span>
        <textarea className={field} rows={2} value={f.voiceLock} onChange={set("voiceLock")} data-testid="voice-lock" />
      </label>
      {voiceSuggestion && voiceSuggestion !== f.voiceLock && (
        <p className="text-xs text-neutral-600">Suggested voice: <span className="italic">{voiceSuggestion}</span>{" "}
          <button type="button" className="text-blue-700 underline" onClick={() => setF((x) => ({ ...x, voiceLock: voiceSuggestion }))}>Use this instead</button></p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton label="Save draft" busyLabel="Saving…" doneLabel="Saved" disabled={!dirty || pending} onAction={save} resetKey={f} />
        {c.draft ? (
          <ActionButton variant="approve" label={`Approve v${c.draft.version}`} busyLabel="Approving…" doneLabel={`v${c.draft.version} approved`}
            disabled={dirty || pending || problems.length > 0} title={dirty ? "Save first" : problems.join(" ")} onAction={approve} resetKey={c.draft.id} />
        ) : c.approved && !dirty && msg?.text.startsWith("Version") ? (
          <DoneBadge text={`v${c.approved.version} approved`} />
        ) : (
          !dirty && <span className="text-xs text-neutral-500">Approved. Saving a change starts v{(c.versions[0]?.version ?? 0) + 1} as a draft.</span>
        )}
        {c.draft && c.approved && <button type="button" disabled={pending} onClick={discard} className="text-sm text-neutral-600 underline">Discard draft</button>}
        {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
      </div>
      {(c.draft || dirty) && problems.length > 0 && <ul className="list-disc pl-5 text-xs text-amber-800">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {msg && <p className={`text-sm ${msg.kind === "ok" ? "text-green-700" : "text-red-700"}`} role="status">{msg.text}</p>}
      </>)}
      {c.versions.length > 1 && (
        <details className="text-xs text-neutral-600">
          <summary className="cursor-pointer">Version history ({c.versions.length})</summary>
          <ul className="mt-1 space-y-1">
            {c.versions.map((v) => <li key={v.id}>v{v.version} — {v.status}: <span className="italic">{v.voiceLock || "(no voice lock)"}</span></li>)}
          </ul>
        </details>
      )}
    </div>
    <div className="space-y-3 self-start">
      {images}
      <ChangeRequest what="character" projectId={projectId} baseCode={baseCode} onSubmit={submitChange} />
    </div>
    </div>
  );
}
