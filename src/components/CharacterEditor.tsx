"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CharacterRecord } from "@/lib/studioRepo";
import { approvalProblems } from "@/lib/domain/approval";
import { approveCharacterAction, discardCharacterDraftAction, saveCharacterAction, setCharacterRefAction } from "@/app/studioActions";
import { uploadBlob } from "@/lib/clientUpload";
import { MIN_REF_ASPECT } from "@/lib/domain/imagePrompts";
import type { Pronoun } from "@/lib/domain/types";
import { CHARACTER_SHEET, characterChangePrompt, characterDescribePrompt, characterFillFromReply, characterSheetRequest, type DescribeSource } from "@/lib/domain/describe";
import { StartFromPanel } from "./StartFromPanel";
import { ActionButton, DoneBadge } from "./ActionButton";

export function CharacterEditor({ c, projectId, baseCode, canDescribe }: { c: CharacterRecord; projectId: string; baseCode: string; canDescribe: boolean }) {
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
  const [who, setWho] = useState<"" | "invented" | "real">(c.invented ? "" : "real");
  const [voiceSuggestion, setVoiceSuggestion] = useState("");
  const problems = approvalProblems({ voiceLock: f.voiceLock, profile: { appearance: f.appearance }, invented: f.invented, consentRef: f.consentRef });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const anchorsList = f.anchors.split("\n").map((x) => x.trim()).filter(Boolean);

  const fillFromReply = (reply: string) => {
    const r = characterFillFromReply(reply);
    const got = [r.appearance && "appearance", r.wardrobe && "wardrobe", r.mannerisms && "mannerisms", r.anchors.length && "identity anchors"].filter(Boolean) as string[];
    if (!got.length) return { ok: false, text: "Couldn't find the labelled lines in that reply. Check you pasted all of ChatGPT's answer." };
    setF((x) => ({
      ...x,
      appearance: r.appearance || x.appearance,
      wardrobe: r.wardrobe || x.wardrobe,
      mannerisms: r.mannerisms || x.mannerisms,
      anchors: r.anchors.length ? r.anchors.join("\n") : x.anchors,
      voiceLock: x.voiceLock.trim() ? x.voiceLock : r.voice,
    }));
    setVoiceSuggestion(f.voiceLock.trim() && r.voice ? r.voice : "");
    const notes = [
      `Filled in ${got.join(", ")}${!f.voiceLock.trim() && r.voice ? " and a suggested voice lock" : ""}.`,
      r.missing.length ? `Not in the reply: ${r.missing.map((m) => m.toLowerCase()).join(", ")}.` : "",
      r.known ? "ChatGPT says the picture shows a known person or character, so it described a different original character. Check the result isn't a lookalike." : "",
      "Check and edit the fields, then Save draft.",
    ];
    return { ok: !r.known, text: notes.filter(Boolean).join(" ") };
  };
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
  const attachSheet = async (sheet: File, pieces: Blob[]) => {
    await uploadBlob(projectId, `${baseCode}_SHEET`, "reference-sheet", sheet, sheet.name);
    for (const [i, view] of CHARACTER_SHEET.views.entries()) {
      const id = await uploadBlob(projectId, `${baseCode}_${view.toUpperCase()}`, "character-ref", pieces[i], `${view}.png`);
      const r = await setCharacterRefAction(c.id, view, id);
      if (!r.ok) throw new Error(r.error);
    }
    router.refresh();
    return { ok: true, text: "Front, back and face attached to the draft (on the right). Check them, save any field changes, then approve." };
  };

  const discard = () => start(async () => {
    const r = await discardCharacterDraftAction(c.id);
    setMsg(r.ok ? { kind: "ok", text: "Draft discarded." } : { kind: "error", text: r.error });
    router.refresh();
  });

  return (
    <div className="space-y-3" data-testid={`character-${c.slug}`}>
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
      <StartFromPanel
        what="character"
        projectId={projectId}
        baseCode={`${baseCode}_SOURCE`}
        canDescribe={canDescribe}
        promptFor={(src: DescribeSource, text: string, personality: string) => src === "change"
          ? characterChangePrompt({ appearance: f.appearance, wardrobe: f.wardrobe, mannerisms: f.mannerisms, anchors: anchorsList }, text)
          : characterDescribePrompt(src, text, personality)}
        change={f.appearance.trim() || w?.profile.refs?.front ? {
          currentImages: [
            w?.profile.refs?.front && { label: `${c.name}'s front image`, assetId: w.profile.refs.front },
            w?.profile.refs?.face && { label: `${c.name}'s face image`, assetId: w.profile.refs.face },
          ].filter((x): x is { label: string; assetId: string } => !!x),
        } : undefined}
        onReply={fillFromReply}
        sheet={{ cols: CHARACTER_SHEET.cols, rows: CHARACTER_SHEET.rows, labels: ["Front", "Back", "Face"], minAspect: MIN_REF_ASPECT, prompt: characterSheetRequest(), onPieces: attachSheet }}
        gateOk={who === "invented" || (who === "real" && !!f.consentRef.trim())}
        gate={
          <div className="space-y-1 rounded border border-amber-200 bg-amber-50 p-2 text-xs">
            <p className="font-semibold">Who is in the picture?</p>
            <label className="flex items-start gap-2"><input type="radio" name={`who-${c.id}`} checked={who === "invented"} data-testid="who-invented"
              onChange={() => { setWho("invented"); setF((x) => ({ ...x, invented: true })); }} />
              <span>Inspiration only. This will be an invented character with a similar look, not a copy of anyone.</span></label>
            <label className="flex items-start gap-2"><input type="radio" name={`who-${c.id}`} checked={who === "real"} data-testid="who-real"
              onChange={() => { setWho("real"); setF((x) => ({ ...x, invented: false })); }} />
              <span>A real person who has agreed to be portrayed. Record their consent in the field above first.</span></label>
            <p className="text-neutral-600">Don&apos;t use pictures of celebrities or of people who haven&apos;t agreed.</p>
          </div>
        }
      />
      <label className="block text-sm">Appearance <span className="text-neutral-500">(face, hair, age, build — used in every image prompt)</span>
        <textarea className={field} rows={2} value={f.appearance} onChange={set("appearance")} data-testid="appearance" />
      </label>
      <label className="block text-sm">Wardrobe
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
      {c.versions.length > 1 && (
        <details className="text-xs text-neutral-600">
          <summary className="cursor-pointer">Version history ({c.versions.length})</summary>
          <ul className="mt-1 space-y-1">
            {c.versions.map((v) => <li key={v.id}>v{v.version} — {v.status}: <span className="italic">{v.voiceLock || "(no voice lock)"}</span></li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
