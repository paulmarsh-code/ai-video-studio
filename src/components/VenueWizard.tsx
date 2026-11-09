"use client";

// Venue creation, one step at a time (D16f), the same shape as characters:
//   1. Venue name, and where the look comes from (a picture of the place, or an idea) → upload.
//   2. Setting and atmosphere (indoors/outdoors, light, time of day, mood).
//   3. Copy the venue's description prompt → in ChatGPT paste it with the picture →
//      paste ChatGPT's reply and upload the 4-view image board here → Create.
// Create saves the description and the four named views, and attaches the four images.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addVenueAction, saveVenueAction } from "@/app/studioActions";
import { uploadBlob } from "@/lib/clientUpload";
import { VENUE_SHEET, venueDescribePrompt, venueFillFromReply, venueSheetRequest } from "@/lib/domain/describe";
import type { VenueView } from "@/lib/studioRepo";
import { ActionButton } from "./ActionButton";
import { CreateStep } from "./CreateStep";
import { gptCreate } from "@/lib/gptClient";
import { goTo } from "@/lib/nav";

type Source = "picture" | "idea";

export interface VenueWizardProps {
  projectId: string;
  projectCode: string;
  /** Resume a venue that exists but hasn't been created from a picture yet. */
  existing?: { id: string; name: string; views: VenueView[] };
  /** A GPT link is set up: offer "Create with GPT". */
  canAuto?: boolean;
}

const field = "mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";
const boardLabels = (reply: string) => { const v = venueFillFromReply(reply).views; return v.length === 4 ? v.map((x) => x.name) : ["view 1", "view 2", "view 3", "view 4"]; };
const codeName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

function StepHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-700 text-sm font-semibold text-white">{n}</span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <span className="ml-auto text-xs text-neutral-500">Step {n} of 3</span>
    </div>
  );
}

export function VenueWizard({ projectId, projectCode, existing, canAuto }: VenueWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [venueId, setVenueId] = useState<string | null>(existing?.id ?? null);
  const [name, setName] = useState(existing?.name ?? "");
  const [source, setSource] = useState<Source | "">("");
  const [picture, setPicture] = useState<string>();
  const [idea, setIdea] = useState("");
  const [setting, setSetting] = useState<"interior" | "exterior">("interior");
  const [atmosphere, setAtmosphere] = useState("");
  const [error, setError] = useState("");

  const shown = name.trim() || "your venue";
  const possessive = name.trim() ? `${name.trim()}'s` : "your venue's";
  const baseCode = `${projectCode}_VEN_${codeName(name).slice(0, 24)}`;

  /** Create the venue record the first time, or rename it when resuming. */
  async function ensureVenue() {
    if (venueId) {
      const r = await saveVenueAction(venueId, { name, description: "", setting, views: existing?.views ?? [] });
      if (!r.ok) throw new Error(r.error);
      return venueId;
    }
    const r = await addVenueAction(projectId, name);
    if (!r.ok) throw new Error(r.error);
    setVenueId(r.value!);
    return r.value!;
  }

  async function uploadPicture(file: File) {
    setError("");
    try {
      if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG, JPG or WebP).");
      await ensureVenue();
      setPicture(await uploadBlob(projectId, `${baseCode}_SOURCE`, "source-picture", file, file.name));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function ideaNext() {
    setError("");
    try {
      await ensureVenue();
      setStep(2);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  const mood = [setting === "exterior" ? "outdoors" : "indoors", atmosphere.trim()].filter(Boolean).join(", ");
  const promptText = venueDescribePrompt(source === "idea" ? "idea" : "image", idea, mood);

  async function create(reply: string, pieces: Blob[], board: File): Promise<string | void> {
    if (!venueId) return "Go back to step 1 and save the venue first.";
    const r = venueFillFromReply(reply);
    if (!r.description) return "Couldn't find the labelled description in that reply. Check you pasted all of ChatGPT's answer.";
    if (r.views.length !== 4) return `ChatGPT's reply lists ${r.views.length} views; the image board has 4. Ask ChatGPT for exactly four VIEWS lines, one per direction.`;
    // Upload the board and the four views first; then save text and images in one step (D17a).
    await uploadBlob(projectId, `${baseCode}_SHEET`, "reference-sheet", board, board.name);
    const views: VenueView[] = [];
    for (const [i, v] of r.views.entries()) views.push({ ...v, imageAssetId: await uploadBlob(projectId, `${baseCode}_${codeName(v.name)}`, "venue-ref", pieces[i], `${v.name}.png`) });
    const saved = await saveVenueAction(venueId, { name, description: r.description, setting: r.setting, views });
    if (!saved.ok) return saved.error;
    goTo(router, `?v=${venueId}`);
  }

  const choice = (value: Source, title: string, detail: string) => (
    <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${source === value ? "border-blue-600 bg-blue-50" : "border-neutral-200 bg-white"}`}>
      <input type="radio" name="venue-source" className="mt-1" checked={source === value} onChange={() => { setSource(value); setPicture(undefined); }} data-testid={`vsource-${value}`} />
      <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-neutral-600">{detail}</span></span>
    </label>
  );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5" data-testid="venue-wizard">
      {step === 1 && (
        <>
          <StepHeader n={1} title="Venue name" />
          <label className="block max-w-md text-sm">Name<input className={field} value={name} onChange={(e) => setName(e.target.value)} data-testid="vwiz-name" placeholder="e.g. Rooftop bar" /></label>
          <p className="mt-5 text-sm font-medium">Where does the look come from?</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {choice("picture", "A picture of the place", "A photo or image of a similar place. People, business names and signs are left out.")}
            {choice("idea", "No picture", "Describe the place in a sentence instead.")}
          </div>
          {source === "idea" ? (
            <div className="mt-4 space-y-2">
              <label className="block text-sm">Describe {shown} in a sentence
                <input className={field} value={idea} onChange={(e) => setIdea(e.target.value)} data-testid="vwiz-idea" placeholder="e.g. a rooftop bar in London at dusk" />
              </label>
              <ActionButton label="Next" doneLabel="Saved" disabled={!name.trim() || !idea.trim()} onAction={ideaNext} testId="vwiz-next-1" />
            </div>
          ) : source && (
            <div className="mt-4">
              {!picture ? (
                <label className={`inline-block rounded-md px-4 py-2 text-sm text-white ${name.trim() ? "cursor-pointer bg-blue-700 hover:bg-blue-800" : "cursor-not-allowed bg-neutral-400"}`}
                  title={name.trim() ? "" : "Enter the venue name first"}>
                  Upload picture
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={!name.trim()} data-testid="vwiz-picture"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadPicture(f); }} />
                </label>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${picture}`} alt="Uploaded picture" className="h-20 w-28 rounded object-cover" />
                  <p className="text-green-700" role="status">✓ Picture uploaded successfully</p>
                  <button type="button" onClick={() => setStep(2)} className="rounded-md bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800" data-testid="vwiz-next-1">Next</button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <StepHeader n={2} title={`Describe ${possessive} atmosphere`} />
          <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
            <label className="text-sm">Setting
              <select className={field} value={setting} onChange={(e) => setSetting(e.target.value as "interior" | "exterior")} data-testid="vwiz-setting">
                <option value="interior">Indoors</option>
                <option value="exterior">Outdoors</option>
              </select>
            </label>
            <label className="text-sm">Light, time of day and mood
              <input className={field} value={atmosphere} onChange={(e) => setAtmosphere(e.target.value)} data-testid="vwiz-atmosphere"
                placeholder="e.g. evening, warm low lighting, busy and upmarket" />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={() => setStep(1)} className="text-sm text-neutral-600 underline">Back</button>
            <button type="button" onClick={() => setStep(3)} className="rounded-md bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800" data-testid="vwiz-next-2">Next</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <StepHeader n={3} title={`Create ${shown}`} />
          <CreateStep
            id="vwiz"
            copyLabel={`Copy ${possessive} description`}
            prompt={promptText}
            instruction={`Go over to ChatGPT, paste the copied description${source === "idea" ? "" : " and upload the picture you used"}.`}
            sheet={{ cols: VENUE_SHEET.cols, rows: VENUE_SHEET.rows, labels: boardLabels, request: venueSheetRequest() }}
            onCreate={create}
            auto={canAuto && venueId ? () => gptCreate({
              projectId, what: "place", prompt: promptText, baseCode,
              describeImageIds: picture ? [picture] : [], boardRefIds: picture ? [picture] : [],
            }) : undefined}
            footer={<button type="button" onClick={() => setStep(2)} className="text-sm text-neutral-600 underline">Back</button>}
          />
        </>
      )}
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
