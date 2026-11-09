// GPT image prompts for character reference sheets, venue views and storyboard panels.
// Deterministic text built from approved data, so the same inputs always give the same
// prompt. Lessons applied: character crops no narrower than 1:2 (narrower images were
// rejected); images made in GPT, not Kling (better and cheaper); no text or logos.

import { mainSubjectId } from "./composer";
import { describeFrame, PRESET_TEXT, readCamera } from "./geometry";
import { GENRE_PROFILES, type Genre } from "./genre";
import { joinNames, stripQuotes } from "./text";
import type { CastMember, GeometryPlanData, ShotSpec } from "./types";

export interface CharacterProfile {
  appearance?: string;
  wardrobe?: string;
  mannerisms?: string;
  refs?: Partial<Record<RefView, string>>; // asset ids
}

export type RefView = "front" | "back" | "face";
export const REF_VIEWS: RefView[] = ["front", "back", "face"];

// The view comes first and is repeated last, so a long description can't bury it.
const REF_VIEW: Record<RefView, { title: string; framing: string; reminder: string }> = {
  front: {
    title: "FRONT VIEW",
    framing: "Full body, head to toe, standing naturally, arms relaxed, facing the camera.",
    reminder: "Front view: full body, facing the camera.",
  },
  back: {
    title: "BACK VIEW",
    framing: "Full body, head to toe, seen from directly behind, facing away from the camera. The face is not visible. Show the back of the hair, the back of the outfit, and how the bag and shoes look from behind.",
    reminder: "Back view only: the person faces away from the camera and the face must not be visible.",
  },
  face: {
    title: "FACE CLOSE-UP",
    framing: "Head and shoulders only, facing the camera straight on, neutral relaxed expression, eyes to camera. Face fills most of the frame.",
    reminder: "Face close-up: head and shoulders only, not full body.",
  },
};

/** Minimum width ÷ height for character reference images (narrower images were rejected by image models). */
export const MIN_REF_ASPECT = 0.5;

/** End a user-written sentence with exactly one full stop. */
function sentence(text: string): string {
  const t = stripQuotes(text).trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

export function characterRefPrompt(name: string, profile: CharacterProfile, view: RefView, style = "photorealistic"): string {
  const v = REF_VIEW[view];
  const hasFront = view !== "front" && !!profile.refs?.front;
  const styleWord = style.charAt(0).toUpperCase() + style.slice(1);
  return [
    `${v.title}: ${styleWord} character reference image of ${name}. ${v.framing}`,
    hasFront ? `Use the attached front reference image: this is the same person, with identical face, hair, outfit, bag and shoes. Change only the camera view.` : "",
    profile.appearance ? `Appearance: ${sentence(profile.appearance)}` : "",
    profile.wardrobe ? `Outfit: ${sentence(profile.wardrobe)}` : "",
    "Plain light-grey studio background, soft even lighting, sharp focus. Portrait orientation, 2:3 aspect ratio (not narrower than 1:2). Exactly one person. No text, no logos, no watermark.",
    `Reminder: ${v.reminder}`,
  ].filter(Boolean).join("\n\n");
}

export type VenueSetting = "interior" | "exterior";

/** One view of a location: works for any setting (a room, a street, a beach), not just party venues. */
export function venueViewPrompt(
  venue: { name: string; description: string; setting?: VenueSetting },
  viewName: string,
  genre: Genre = "neutral",
  style = "photorealistic",
): string {
  const kind = venue.setting === "exterior" ? "outdoor location" : "indoor location";
  const styleWord = style.charAt(0).toUpperCase() + style.slice(1);
  return [
    `VIEW TOWARDS THE ${viewName.toUpperCase()}: ${styleWord} location reference image of ${stripQuotes(venue.name)} (${kind}).`,
    venue.description.trim() ? `The place: ${sentence(venue.description)}` : "",
    `Camera at eye level near the middle of the space, looking towards the ${stripQuotes(viewName)}, wide lens, so the ${stripQuotes(viewName)} fills the background clearly. This is one of several views of the same place, so keep the layout, materials and light consistent with the description.`,
    `Lighting and mood: ${GENRE_PROFILES[genre].look}.`,
    "No people. Landscape 16:9. No text, no logos, no watermark.",
  ].filter(Boolean).join("\n\n");
}

export interface PanelPromptInput {
  description: string;
  emotion?: string;
  shot?: ShotSpec;
  cast: CastMember[];
  profiles: Record<string, CharacterProfile>;
  plan?: GeometryPlanData;
  venueName: string;
  /** Venue views with their approved reference images, so the background can be attached. */
  venueViews?: { name: string; imageAssetId?: string }[];
  aspect?: string; // e.g. "9:16"
  genre?: Genre;
  style?: string;
}

export interface PanelPrompt {
  text: string;
  /** Reference images to attach in ChatGPT, in order. */
  attach: { label: string; assetId: string }[];
}

export function panelPrompt(i: PanelPromptInput): PanelPrompt {
  const genre = i.genre ?? "neutral";
  const shot = i.shot;
  const visible = (shot?.visibleIds ?? []).map((id) => i.cast.find((c) => c.id === id)).filter((c): c is CastMember => !!c);
  const subjectId = shot ? mainSubjectId(shot) : undefined;
  const name = (id: string) => i.cast.find((c) => c.id === id)?.name ?? id;

  // Read the shot's camera first: it decides who is seen from behind and which view is the background.
  const cam = shot && i.plan?.cameras.find((c) => c.id === shot.cameraId);
  const reading = cam && i.plan ? readCamera(i.plan, cam) : undefined;
  // Over-the-shoulder foreground: a non-subject person, only when two or more are visible (same rule as the Kling prompt).
  const fgId = reading && shot && visible.length > 1
    ? reading.actors.find((a) => a.foreground && a.characterId !== subjectId && shot.visibleIds.includes(a.characterId))?.characterId
    : undefined;

  const attach: PanelPrompt["attach"] = [];
  for (const c of visible) {
    const refs = i.profiles[c.id]?.refs ?? {};
    // Someone seen from behind gets their back image; everyone else their front (or face).
    const pick = c.id === fgId ? (refs.back ?? refs.front) : (refs.front ?? refs.face);
    if (pick) attach.push({ label: `${c.name} ${c.id === fgId && refs.back ? "back" : "reference"}`, assetId: pick });
  }
  const bgView = reading?.backgroundView;
  const bgImage = bgView ? i.venueViews?.find((v) => v.name === bgView)?.imageAssetId : undefined;
  if (bgImage) attach.push({ label: `${bgView} view`, assetId: bgImage });

  const lines: string[] = [];
  lines.push(`${(i.style ?? "photorealistic").replace(/^./, (m) => m.toUpperCase())} storyboard frame for a ${i.aspect ?? "9:16"} video, set in the ${i.venueName}.`);
  const people = attach.filter((a) => !a.label.endsWith(" view"));
  if (people.length) lines.push(`Use the attached reference images for ${joinNames(people.map((a) => a.label.replace(/ (reference|back)$/, "")))}; keep their faces, hair and clothes identical.`);
  if (bgImage) lines.push(`Use the attached ${bgView} image as the background: same place, layout and light.`);
  for (const c of visible) {
    const p = i.profiles[c.id];
    const parts = [p?.appearance, p?.wardrobe ? `wearing ${p.wardrobe}` : ""].filter(Boolean).map((x) => stripQuotes(x!).replace(/[.!?]+$/, ""));
    if (parts.length) lines.push(`${c.name}: ${parts.join("; ")}.`);
  }
  lines.push(`Moment: ${sentence(i.description)}`);
  if (i.emotion) lines.push(`Emotion: ${sentence(i.emotion)}`);
  if (shot?.actions) lines.push(sentence(shot.actions));

  if (cam && reading && shot) {
    lines.push(PRESET_TEXT[cam.preset].replace(", static camera", "").replace(" static camera,", ""));
    const frame = describeFrame(reading, i.cast, shot.visibleIds, subjectId);
    if (frame) lines.push(`Positions: ${frame}.`);
    if (fgId) lines.push(`${name(fgId)} in the soft foreground, seen from behind over the shoulder.`);
  }
  lines.push(`Look: ${GENRE_PROFILES[genre].look}.`);
  if (visible.length === 1) lines.push(`Only ${visible[0].name} in frame.`);
  else if (visible.length > 1) lines.push(`Exactly one of each person: ${joinNames(visible.map((c) => c.name))}. No other people in the foreground.`);
  lines.push("No text, no logos, no speech bubbles, no watermark.");
  return { text: lines.join("\n"), attach };
}
