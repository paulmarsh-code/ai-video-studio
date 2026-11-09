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

const REF_FRAMING: Record<RefView, string> = {
  front: "Full-body front view, standing naturally, arms relaxed, facing the camera",
  back: "Full-body back view, standing naturally, facing away from the camera, same outfit and hairstyle",
  face: "Head-and-shoulders portrait, facing the camera, neutral expression",
};

/** Minimum width ÷ height for character reference images (narrower images were rejected by image models). */
export const MIN_REF_ASPECT = 0.5;

export function characterRefPrompt(name: string, profile: CharacterProfile, view: RefView, style = "photorealistic"): string {
  return [
    `${style.charAt(0).toUpperCase() + style.slice(1)} character reference image of ${name}.`,
    profile.appearance ? `${name}: ${stripQuotes(profile.appearance)}.` : "",
    profile.wardrobe ? `Wearing ${stripQuotes(profile.wardrobe)}.` : "",
    `${REF_FRAMING[view]}.`,
    view !== "front" && profile.refs?.front ? "Same person as the attached front reference: identical face, hair and clothes." : "",
    "Plain light-grey studio background, soft even lighting, sharp focus.",
    "Portrait orientation, 2:3 aspect ratio (not narrower than 1:2).",
    "Exactly one person. No text, no logos, no watermark.",
  ].filter(Boolean).join(" ");
}

export function venueViewPrompt(venueName: string, description: string, viewName: string, genre: Genre = "neutral", style = "photorealistic"): string {
  return [
    `${style.charAt(0).toUpperCase() + style.slice(1)} interior reference image of ${venueName}.`,
    description ? `${stripQuotes(description)}.` : "",
    `View looking towards the ${viewName}, eye level, wide lens.`,
    `Lighting and mood: ${GENRE_PROFILES[genre].look}.`,
    "No people. Landscape 16:9. No text, no logos, no watermark.",
  ].filter(Boolean).join(" ");
}

export interface PanelPromptInput {
  description: string;
  emotion?: string;
  shot?: ShotSpec;
  cast: CastMember[];
  profiles: Record<string, CharacterProfile>;
  plan?: GeometryPlanData;
  venueName: string;
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
  const attach: PanelPrompt["attach"] = [];
  for (const c of visible) {
    const refs = i.profiles[c.id]?.refs ?? {};
    const pick = refs.front ?? refs.face;
    if (pick) attach.push({ label: `${c.name} reference`, assetId: pick });
  }
  const lines: string[] = [];
  lines.push(`${(i.style ?? "photorealistic").replace(/^./, (m) => m.toUpperCase())} storyboard frame for a ${i.aspect ?? "9:16"} video, set in the ${i.venueName}.`);
  if (attach.length) lines.push(`Use the attached reference images for ${joinNames(attach.map((a) => a.label.replace(" reference", "")))}; keep their faces, hair and clothes identical.`);
  for (const c of visible) {
    const p = i.profiles[c.id];
    if (p?.appearance || p?.wardrobe) lines.push(`${c.name}: ${[p.appearance, p.wardrobe ? `wearing ${p.wardrobe}` : ""].filter(Boolean).map((x) => stripQuotes(x!)).join(", ")}.`);
  }
  lines.push(`Moment: ${stripQuotes(i.description)}.`);
  if (i.emotion) lines.push(`Emotion: ${stripQuotes(i.emotion)}.`);
  if (shot?.actions) lines.push(stripQuotes(shot.actions));

  const cam = shot && i.plan?.cameras.find((c) => c.id === shot.cameraId);
  if (cam && i.plan && shot) {
    const reading = readCamera(i.plan, cam);
    lines.push(PRESET_TEXT[cam.preset].replace(", static camera", "").replace(" static camera,", ""));
    const frame = describeFrame(reading, i.cast, shot.visibleIds, mainSubjectId(shot));
    if (frame) lines.push(`Positions: ${frame}.`);
    const fg = reading.actors.find((a) => a.foreground && shot.visibleIds.includes(a.characterId));
    if (fg) lines.push(`${i.cast.find((c) => c.id === fg.characterId)?.name} in the soft foreground, seen from behind over the shoulder.`);
  }
  lines.push(`Look: ${GENRE_PROFILES[genre].look}.`);
  if (visible.length === 1) lines.push(`Only ${visible[0].name} in frame.`);
  else if (visible.length > 1) lines.push(`Exactly one of each person: ${joinNames(visible.map((c) => c.name))}. No other people in the foreground.`);
  lines.push("No text, no logos, no speech bubbles, no watermark.");
  return { text: lines.join("\n"), attach };
}
