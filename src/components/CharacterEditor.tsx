"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CharacterRecord } from "@/lib/studioRepo";
import { approvalProblems } from "@/lib/domain/approval";
import { approveCharacterAction, discardCharacterDraftAction, saveCharacterAction } from "@/app/studioActions";
import type { Pronoun } from "@/lib/domain/types";
import { characterDescribePrompt, characterFillFromReply } from "@/lib/domain/describe";
import { StartFromPanel } from "./StartFromPanel";

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

  const save = () => start(async () => {
    const r = await saveCharacterAction(c.id, { name: f.name, pronoun: f.pronoun as Pronoun, role: f.role, invented: f.invented, consentRef: f.consentRef },
      { appearance: f.appearance, wardrobe: f.wardrobe, mannerisms: f.mannerisms, anchors: anchorsList, voiceLock: f.voiceLock });
    setMsg(r.ok ? { kind: "ok", text: `Saved as draft version ${r.value}. Approve it to use it in prompts.` } : { kind: "error", text: r.error });
    router.refresh();
  });
  const approve = () => start(async () => {
    const r = await approveCharacterAction(c.id);
    setMsg(r.ok ? { kind: "ok", text: `Version ${r.value} approved. Earlier versions are kept as superseded.` } : { kind: "error", text: r.error });
    router.refresh();
  });
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
        promptFor={characterDescribePrompt}
        onReply={fillFromReply}
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
        <button type="button" disabled={!dirty || pending} onClick={save} className="rounded-md bg-blue-700 px-3 py-1 text-sm text-white disabled:opacity-50">Save draft</button>
        {c.draft ? (
          <button type="button" disabled={dirty || pending || problems.length > 0} onClick={approve}
            title={dirty ? "Save first" : problems.join(" ")} className="rounded-md bg-green-700 px-3 py-1 text-sm text-white disabled:opacity-50">
            Approve v{c.draft.version}
          </button>
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
