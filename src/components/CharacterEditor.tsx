"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CharacterRecord } from "@/lib/studioRepo";
import { approvalProblems } from "@/lib/domain/approval";
import { approveCharacterAction, discardCharacterDraftAction, saveCharacterAction } from "@/app/studioActions";
import type { Pronoun } from "@/lib/domain/types";

export function CharacterEditor({ c }: { c: CharacterRecord }) {
  const router = useRouter();
  const w = c.working;
  const initial = {
    name: c.name, pronoun: c.pronoun, role: c.role,
    appearance: w?.profile.appearance ?? "", wardrobe: w?.profile.wardrobe ?? "", mannerisms: w?.profile.mannerisms ?? "", voiceLock: w?.voiceLock ?? "",
  };
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const problems = approvalProblems({ voiceLock: f.voiceLock, profile: { appearance: f.appearance } });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm";

  const save = () => start(async () => {
    const r = await saveCharacterAction(c.id, { name: f.name, pronoun: f.pronoun as Pronoun, role: f.role }, f);
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
      <label className="block text-sm">Appearance <span className="text-neutral-500">(face, hair, age, build — used in every image prompt)</span>
        <textarea className={field} rows={2} value={f.appearance} onChange={set("appearance")} data-testid="appearance" />
      </label>
      <label className="block text-sm">Wardrobe
        <textarea className={field} rows={2} value={f.wardrobe} onChange={set("wardrobe")} />
      </label>
      <label className="block text-sm">Mannerisms <span className="text-neutral-500">(optional)</span>
        <input className={field} value={f.mannerisms} onChange={set("mannerisms")} />
      </label>
      <label className="block text-sm">Voice lock <span className="text-neutral-500">(how they sound; inserted word for word wherever they speak; no quote marks)</span>
        <textarea className={field} rows={2} value={f.voiceLock} onChange={set("voiceLock")} data-testid="voice-lock" />
      </label>
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
