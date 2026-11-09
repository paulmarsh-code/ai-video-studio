"use client";

// Character creation, one step at a time (D16d):
//   1. Name, pronoun, role, and where the look comes from (inspiration picture, a real person
//      with an uploaded consent form, or an idea) → upload the picture.
//   2. Personality and mannerisms (a picture can't show these).
//   3. Copy the character's description prompt → in ChatGPT paste it with the picture →
//      paste ChatGPT's reply and upload the image board here → Create.
// Create saves the description and attaches front, back and face; the page then shows the
// character's full details.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveCharacterAction, setCharacterRefAction, upsertCharacterBasicsAction } from "@/app/studioActions";
import { uploadBlob } from "@/lib/clientUpload";
import { CHARACTER_SHEET, characterDescribePrompt, characterFillFromReply, characterSheetRequest } from "@/lib/domain/describe";
import { MIN_REF_ASPECT } from "@/lib/domain/imagePrompts";
import type { Pronoun } from "@/lib/domain/types";
import { ActionButton } from "./ActionButton";
import { CreateStep } from "./CreateStep";
import { gptCreate } from "@/lib/gptClient";

type Source = "inspiration" | "real" | "idea";

export interface CharacterWizardProps {
  projectId: string;
  projectCode: string;
  /** Resume a character that exists but hasn't been created from a picture yet. */
  existing?: { id: string; slug: string; name: string; pronoun: Pronoun; role: string; invented: boolean; consentRef: string; voiceLock: string };
  /** A GPT link is set up: offer "Create with GPT". */
  canAuto?: boolean;
}

const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

function StepHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-700 text-sm font-semibold text-white">{n}</span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <span className="ml-auto text-xs text-neutral-500">Step {n} of 3</span>
    </div>
  );
}

export function CharacterWizard({ projectId, projectCode, existing, canAuto }: CharacterWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [ref, setRef] = useState<{ id: string; slug: string } | null>(existing ? { id: existing.id, slug: existing.slug } : null);
  const [name, setName] = useState(existing?.name ?? "");
  const [pronoun, setPronoun] = useState<Pronoun>(existing?.pronoun ?? "she");
  const [role, setRole] = useState(existing?.role ?? "");
  const [source, setSource] = useState<Source | "">(existing && !existing.invented ? "real" : "");
  const [consent, setConsent] = useState<{ assetId: string; code: string } | null>(null);
  const [picture, setPicture] = useState<string>();
  const [idea, setIdea] = useState("");
  const [personality, setPersonality] = useState("");
  const [error, setError] = useState("");

  const shown = name.trim() || "your character";
  const possessive = name.trim() ? `${name.trim()}'s` : "your character's";
  const codeFor = (slug: string) => `${projectCode}_CHR_${slug.toUpperCase().replace(/-/g, "_")}`;
  const basicsReady = !!name.trim() && !!source && (source !== "real" || !!consent);

  /** Create the character record (first time) and save name, pronoun, role and consent. */
  async function ensureCharacter() {
    const r = await upsertCharacterBasicsAction(projectId, ref?.id ?? null, {
      name, pronoun, role, invented: source !== "real",
      consentRef: source === "real" && consent ? `Consent form ${consent.code}, uploaded ${new Date().toLocaleDateString("en-GB")}` : "",
    });
    if (!r.ok) throw new Error(r.error);
    setRef(r.value!);
    return r.value!;
  }

  async function uploadConsent(file: File) {
    setError("");
    try {
      if (!name.trim()) throw new Error("Enter the character's name first.");
      const id = await uploadBlob(projectId, `${projectCode}_CONSENT_${name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`, "consent-form", file, file.name);
      setConsent({ assetId: id, code: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function uploadPicture(file: File) {
    setError("");
    try {
      if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG, JPG or WebP).");
      const c = await ensureCharacter();
      const id = await uploadBlob(projectId, `${codeFor(c.slug)}_SOURCE`, "source-picture", file, file.name);
      setPicture(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function ideaNext() {
    setError("");
    try {
      await ensureCharacter();
      setStep(2);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  const promptText = characterDescribePrompt(source === "idea" ? "idea" : "image", idea, personality);

  async function create(reply: string, pieces: Blob[], board: File): Promise<string | void> {
    if (!ref) return "Go back to step 1 and save the character first.";
    const r = characterFillFromReply(reply);
    if (!r.appearance && !r.wardrobe) return "Couldn't find the labelled description in that reply. Check you pasted all of ChatGPT's answer.";
    const saved = await saveCharacterAction(ref.id,
      { name, pronoun, role, invented: source !== "real", consentRef: source === "real" && consent ? `Consent form ${consent.code}` : existing?.consentRef ?? "" },
      { appearance: r.appearance, wardrobe: r.wardrobe, mannerisms: r.mannerisms, anchors: r.anchors, voiceLock: existing?.voiceLock?.trim() || r.voice });
    if (!saved.ok) return saved.error;
    const code = codeFor(ref.slug);
    await uploadBlob(projectId, `${code}_SHEET`, "reference-sheet", board, board.name);
    for (const [i, view] of CHARACTER_SHEET.views.entries()) {
      const id = await uploadBlob(projectId, `${code}_${view.toUpperCase()}`, "character-ref", pieces[i], `${view}.png`);
      const a = await setCharacterRefAction(ref.id, view, id);
      if (!a.ok) return a.error;
    }
    router.push(`?c=${ref.slug}`);
    router.refresh();
  }

  const choice = (value: Source, title: string, detail: string) => (
    <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${source === value ? "border-blue-600 bg-blue-50" : "border-neutral-200 bg-white"}`}>
      <input type="radio" name="source" className="mt-1" checked={source === value} onChange={() => { setSource(value); setPicture(undefined); }} data-testid={`source-${value}`} />
      <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-neutral-600">{detail}</span></span>
    </label>
  );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5" data-testid="character-wizard">
      {step === 1 && (
        <>
          <StepHeader n={1} title="Character name" />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">Name<input className={field} value={name} onChange={(e) => setName(e.target.value)} data-testid="wiz-name" /></label>
            <label className="text-sm">Pronoun
              <select className={field} value={pronoun} onChange={(e) => setPronoun(e.target.value as Pronoun)}>
                <option value="she">she</option><option value="he">he</option><option value="they">they</option>
              </select>
            </label>
            <label className="text-sm">Role in the story<input className={field} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. creator, brand manager" /></label>
          </div>
          <p className="mt-5 text-sm font-medium">Where does the look come from?</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {choice("inspiration", "An inspiration picture", "The app creates an invented character with a similar look, not a copy of anyone.")}
            {choice("real", "A real person who has agreed", "Upload their signed consent form first.")}
            {choice("idea", "No picture", "Describe the character in a sentence instead.")}
          </div>
          {source === "real" && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-medium">Consent form</p>
              <p className="text-xs text-neutral-700">Only portray real people who have signed a consent form. Don&apos;t use pictures of celebrities.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="cursor-pointer rounded-md border border-neutral-300 bg-white px-3 py-1 hover:bg-neutral-50">
                  {consent ? "Replace consent form" : "Upload consent form"}
                  <input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" data-testid="wiz-consent"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadConsent(f); }} />
                </label>
                {consent && <span className="text-green-700" role="status">✓ {consent.code} uploaded</span>}
              </div>
            </div>
          )}
          {source === "idea" ? (
            <div className="mt-4 space-y-2">
              <label className="block text-sm">Describe {shown} in a sentence
                <input className={field} value={idea} onChange={(e) => setIdea(e.target.value)} data-testid="wiz-idea" placeholder="e.g. a mid-20s 1960s-style PR exec, sharp and witty" />
              </label>
              <ActionButton label="Next" doneLabel="Saved" disabled={!name.trim() || !idea.trim()} onAction={ideaNext} testId="wiz-next-1" />
            </div>
          ) : source && (
            <div className="mt-4 space-y-3">
              {!picture ? (
                <label className={`inline-block rounded-md px-4 py-2 text-sm text-white ${basicsReady ? "cursor-pointer bg-blue-700 hover:bg-blue-800" : "cursor-not-allowed bg-neutral-400"}`}
                  title={!name.trim() ? "Enter the name first" : source === "real" && !consent ? "Upload the consent form first" : ""}>
                  Upload picture
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={!basicsReady} data-testid="wiz-picture"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadPicture(f); }} />
                </label>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${picture}`} alt="Uploaded picture" className="h-20 w-20 rounded object-cover" />
                  <p className="text-green-700" role="status">✓ Picture uploaded successfully</p>
                  <button type="button" onClick={() => setStep(2)} className="rounded-md bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800" data-testid="wiz-next-1">Next</button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <StepHeader n={2} title={`Describe ${possessive} personality`} />
          <label className="block text-sm">Personality and mannerisms <span className="text-neutral-500">(a picture can&apos;t show these: how they behave, move and come across)</span>
            <textarea className={field} rows={3} value={personality} onChange={(e) => setPersonality(e.target.value)} data-testid="wiz-personality"
              placeholder="e.g. quietly confident with a dry wit; talks with her hands; never quite sits still" />
          </label>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={() => setStep(1)} className="text-sm text-neutral-600 underline">Back</button>
            <button type="button" onClick={() => setStep(3)} className="rounded-md bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800" data-testid="wiz-next-2">Next</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <StepHeader n={3} title={`Create ${shown}`} />
          <CreateStep
            id="wiz"
            copyLabel={`Copy ${possessive} description`}
            prompt={promptText}
            instruction={`Go over to ChatGPT, paste the copied description${source === "idea" ? "" : " and upload the picture you used"}.`}
            sheet={{ cols: CHARACTER_SHEET.cols, rows: CHARACTER_SHEET.rows, labels: () => ["Front", "Back", "Face"], minAspect: MIN_REF_ASPECT, request: characterSheetRequest() }}
            onCreate={create}
            // Inspiration pictures are only described, never drawn from, so a stranger's face isn't copied.
            // A consented real person's photo is drawn from, for the likeness.
            auto={canAuto && ref ? () => gptCreate({
              projectId, what: "character", prompt: promptText, baseCode: codeFor(ref.slug),
              describeImageIds: picture ? [picture] : [], boardRefIds: source === "real" && picture ? [picture] : [],
            }) : undefined}
            footer={<button type="button" onClick={() => setStep(2)} className="text-sm text-neutral-600 underline">Back</button>}
          />
        </>
      )}
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
