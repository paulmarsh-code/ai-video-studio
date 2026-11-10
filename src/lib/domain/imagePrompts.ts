// GPT image prompts for character reference sheets, venue views and storyboard panels.
// Deterministic text built from approved data, so the same inputs always give the same
// prompt. Lessons applied: character crops no narrower than 1:2 (narrower images were
// rejected); images made in GPT, not Kling (better and cheaper); no text or logos.

import { mainSubjectId } from "./composer";
import { describeFrame, facingOf, planForShot, PRESET_TEXT, readCamera, readProps } from "./geometry";
import { GENRE_PROFILES, type Genre } from "./genre";
import { gestureDetail } from "./gestures";
import { joinNames, stripQuotes } from "./text";
import type { CastMember, GeometryPlanData, ShotSpec } from "./types";

export interface CharacterProfile {
  appearance?: string;
  wardrobe?: string;
  mannerisms?: string;
  /** 3–5 features that must match in every image (from "Start from a picture" or typed). */
  anchors?: string[];
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
    profile.anchors?.length ? `Identity anchors, which must match exactly: ${profile.anchors.map(stripQuotes).join("; ")}.` : "",
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
  /** The layout sketch for this shot (D18f): the floor plan seen through its camera. */
  layoutHref?: string;
  /**
   * An approved picture of this scene (D18c), attached so later panels keep the same spot,
   * furniture, background guests, light and clothes. Not used for the panel's own picture.
   */
  continuity?: { assetId: string; label: string };
}

export interface PanelPrompt {
  text: string;
  /** Reference images to attach in ChatGPT, in order. A generated one has an href instead of an asset. */
  attach: { label: string; assetId: string; href?: string }[];
}

export function panelPrompt(i: PanelPromptInput): PanelPrompt {
  const genre = i.genre ?? "neutral";
  const shot = i.shot;
  const byId = (id: string) => i.cast.find((c) => c.id === id);
  const subjectId = shot ? mainSubjectId(shot) : undefined;
  const name = (id: string) => byId(id)?.name ?? id;

  // Read the shot's camera first: it decides who is seen from behind and which view is the background.
  const cam = shot && i.plan?.cameras.find((c) => c.id === shot.cameraId);
  const shotPlan = i.plan ? planForShot(i.plan, shot) : undefined; // anyone on a mark stands there (D19b)
  const reading = cam && shotPlan ? readCamera(shotPlan, cam) : undefined;
  // A close-up shows its subject only (D18d): anyone between the lens and the subject is out of frame.
  const closeUp = !!cam && (cam.preset === "single-cu" || cam.preset === "insert") && !!subjectId;
  const shownIds = closeUp ? [subjectId!] : (shot?.visibleIds ?? []);
  const visible = shownIds.map(byId).filter((c): c is CastMember => !!c);
  // Over-the-shoulder foreground: only on an over-the-shoulder camera, a non-subject person,
  // and only when two or more are visible (same rule as the Kling prompt).
  const ots = !!cam && (cam.preset === "main-ots" || cam.preset === "reverse-ots");
  const fgId = ots && reading && shot && visible.length > 1
    ? reading.actors.find((a) => a.foreground && a.characterId !== subjectId && shot.visibleIds.includes(a.characterId))?.characterId
    : undefined;
  // Others at the same spot whom this camera would see (D18d): partly in frame, not banned.
  const edgeIds = reading && shot && !closeUp
    ? reading.actors.filter((a) => a.inView && !shownIds.includes(a.characterId) && !shot.excludedIds.includes(a.characterId) && shot.presentIds.includes(a.characterId)).map((a) => a.characterId)
    : [];
  const edge = edgeIds.map(byId).filter((c): c is CastMember => !!c);

  const attach: PanelPrompt["attach"] = [];
  for (const c of [...visible, ...edge]) {
    const refs = i.profiles[c.id]?.refs ?? {};
    // Someone seen from behind gets their back image; everyone else their front (or face).
    const pick = c.id === fgId ? (refs.back ?? refs.front) : (refs.front ?? refs.face);
    if (pick) attach.push({ label: `${c.name} ${c.id === fgId && refs.back ? "back" : "reference"}`, assetId: pick });
  }
  const peopleCount = attach.length;
  if (i.continuity) attach.push({ label: i.continuity.label, assetId: i.continuity.assetId });
  // Key props with a reference picture (D19c): the ones this camera sees, or all of them
  // without a camera, so the prop looks the same in every shot.
  const seenProps = cam && i.plan ? readProps(i.plan, cam).filter((p) => p.inView).map((p) => p.name) : undefined;
  const propPics = (i.plan?.furniture ?? []).filter((f) => f.imageAssetId && (!seenProps || seenProps.includes(f.name)));
  for (const f of propPics) attach.push({ label: `${f.name} picture`, assetId: f.imageAssetId! });
  const bgView = reading?.backgroundView;
  const bgImage = bgView ? i.venueViews?.find((v) => v.name === bgView)?.imageAssetId : undefined;
  if (bgImage) attach.push({ label: `${bgView} view`, assetId: bgImage });
  const layout = !!(i.layoutHref && reading);
  if (layout) attach.push({ label: "layout sketch", assetId: "", href: i.layoutHref });

  const lines: string[] = [];
  lines.push(`${(i.style ?? "photorealistic").replace(/^./, (m) => m.toUpperCase())} storyboard frame for a ${i.aspect ?? "9:16"} video, set in the ${i.venueName}.`);
  const people = attach.slice(0, peopleCount);
  if (people.length) lines.push(`Use the attached reference images for ${joinNames(people.map((a) => a.label.replace(/ (reference|back)$/, "")))}; keep their faces, hair and clothes identical, every pattern, stripe and colour block included. Bags and anything carried stay exactly as in the reference, in the same hand or on the same shoulder.`);
  if (bgImage) lines.push(`Use the attached ${bgView} image as the background, seen across the room several metres behind the characters: same place, layout and light.${shot?.crowd?.trim() ? " It shows the room empty; fill it with the background guests described below." : ""}`);
  const spot = shot?.spot?.trim();
  const crowd = shot?.crowd?.trim();
  // An older approved picture may show an empty room: keep its spot and look, but add the crowd.
  if (i.continuity) lines.push(`Use the attached ${i.continuity.label} for continuity: the same spot, the same furniture at the same height and size, the same light and clothes${crowd ? ". If it shows fewer background guests than described below, add them" : ", and the same background guests"}. Change only the camera angle and the moment.`);
  if (spot) lines.push(`Where: ${sentence(spot)} Keep it in the picture wherever the camera would see it, always the same height and size. Everyone keeps their own place and posture around it${/\b(sit|sits|sitting|seated|sofa|couch|bench)\b/i.test(spot) ? "" : ", standing upright"}; no one leans on it or on the bar unless the moment says so.`);
  // The floor plan's props are the approved list (D19a); the shot's copy is the fallback.
  const planProps = (i.plan?.furniture ?? []).map((f) => ({ name: f.name, detail: f.detail ?? "" }));
  const props = planProps.length ? planProps : shot?.props ?? [];
  if (props.length) lines.push(`Key props, identical in every picture of this scene: ${props.map((p) => `${p.name}${p.detail ? ` (${stripQuotes(p.detail).replace(/[.]$/, "")})` : ""}`).join("; ")}. Show each exactly as described, every time, with nothing extra on or around it.`);
  if (propPics.length) lines.push(`Use the attached ${joinNames(propPics.map((f) => `${f.name} picture`))} for exactly how ${propPics.length === 1 ? "it looks" : "they look"}: same shape, colours, materials and everything on ${propPics.length === 1 ? "it" : "them"}. Only its place and size in the frame come from the layout.`);
  if (cam && i.plan) {
    // Where each prop is, including how far away (D19c): without a distance, a display stand
    // several metres behind the group got drawn right beside someone.
    const sp = shotPlan ?? i.plan;
    const seen = readProps(sp, cam).filter((p) => p.inView);
    const castDepths = cam ? readCamera(sp, cam).actors.filter((a) => a.inView && !a.foreground).map((a) => a.depthM) : [];
    const groupFar = castDepths.length ? Math.max(...castDepths) : undefined;
    const groupNear = castDepths.length ? Math.min(...castDepths) : undefined;
    const where = (p: { depthM: number }) => groupFar === undefined ? "" : p.depthM > groupFar + 1 ? `, behind everyone, about ${Math.round(p.depthM - groupFar)} m further back than the furthest person` : groupNear !== undefined && p.depthM < groupNear - 0.5 ? ", in front of everyone, nearer the camera" : ", among the people";
    if (seen.length) lines.push(`In this picture: ${joinNames(seen.map((p) => `the ${p.name} (${p.frame === "centre" ? "centre" : p.frame.replace("frame-", "")}, about ${Math.max(1, Math.round(p.depthM))} m from the camera${where(p)})`))}. ${seen.length === 1 ? "It must be" : "They must be"} clearly visible, at exactly that distance; nothing else like ${seen.length === 1 ? "it" : "them"} anywhere else in the picture.`);
  }
  // Someone on a mark (D19b): say where they are, so the picture doesn't put them with the group.
  for (const [id, markId] of Object.entries(shot?.at ?? {})) {
    const m = i.plan?.actors.find((a) => a.characterId === id)?.marks?.find((x) => x.id === markId);
    if (m) lines.push(`${name(id)} is ${m.label}.`);
  }
  if (crowd) lines.push(`Background: ${sentence(crowd)}${layout ? " The grey figures in the layout sketch show where they stand." : ""} Background guests are out of focus, smaller than the main characters and never look at the camera; none of them look like the main characters.`);
  for (const c of visible) {
    const p = i.profiles[c.id];
    const parts = [p?.appearance, p?.wardrobe ? `wearing ${p.wardrobe}` : ""].filter(Boolean).map((x) => stripQuotes(x!).replace(/[.!?]+$/, ""));
    if (parts.length) lines.push(`${c.name}: ${parts.join("; ")}.`);
    if (p?.anchors?.length) lines.push(`${c.name} must keep: ${p.anchors.map(stripQuotes).join("; ")}.`);
  }
  for (const c of edge) {
    const p = i.profiles[c.id];
    if (p?.anchors?.length) lines.push(`${c.name} must keep: ${p.anchors.map(stripQuotes).join("; ")}.`);
  }
  lines.push(`Moment: ${sentence(i.description)}`);
  if (i.emotion) lines.push(`Emotion: ${sentence(i.emotion)}`);
  if (shot?.actions) lines.push(sentence(shot.actions));
  lines.push(...gestureDetail(i.description, shot?.actions));

  if (cam && reading && shot) {
    lines.push(PRESET_TEXT[cam.preset].replace(", static camera", "").replace(" static camera,", ""));
    // A strict left-to-right order and head count (D18e): looser wording let GPT swap people or drop them.
    const order = reading.actors.filter((a) => a.inView && [...shownIds, ...edgeIds].includes(a.characterId)).sort((a, b) => a.angleDeg - b.angleDeg);
    if (order.length > 1) {
      lines.push(`Exactly ${order.length} people in this picture, from left to right: ${joinNames(order.map((a) => `${name(a.characterId)}${a.characterId === fgId ? " (in the foreground, seen from behind over the shoulder)" : ""}`))}. Keep this left-to-right order; do not swap anyone.`);
      if (reading.backgroundView && subjectId) lines.push(`Behind ${name(subjectId)}, across the room several metres away: the ${reading.backgroundView}. Nothing stands right behind them.`);
    } else {
      const frame = describeFrame(reading, i.cast, [...shownIds, ...edgeIds], subjectId);
      if (frame) lines.push(`Positions: ${frame}.`);
      if (fgId) lines.push(`${name(fgId)} in the soft foreground, seen from behind over the shoulder.`);
    }
    // Depth and facing (D19c): a left-to-right list alone let GPT line everyone up side by side
    // like a group photo. Each person's distance from the camera and which way they face come
    // from the floor plan.
    const placed = order.filter((a) => a.characterId !== fgId);
    if (placed.length && shotPlan) {
      const parts = placed.map((a) => {
        const pos = shotPlan.actors.find((x) => x.characterId === a.characterId)?.position;
        const fwd = facingOf(shotPlan, a.characterId, shotPlan.lineOfAction);
        let face = "";
        if (pos && fwd) {
          const vx = cam.position.x - pos.x, vy = cam.position.y - pos.y, l = Math.hypot(vx, vy) || 1;
          const c = (fwd.x * vx + fwd.y * vy) / l;
          face = c > 0.5 ? ", facing the camera" : c > -0.35 ? ", seen side-on" : ", seen from behind";
        }
        const d = Math.max(0.5, Math.round(a.depthM * 2) / 2);
        return { id: a.characterId, d, text: `${name(a.characterId)} about ${d} m from the camera${face}` };
      });
      const near = Math.min(...parts.map((p) => p.d)), far = Math.max(...parts.map((p) => p.d));
      lines.push(`Distance and direction: ${parts.map((p) => p.text).join("; ")}.${far >= near * 1.6 && parts.length > 1 ? ` Keep these distances: whoever is further away is smaller and further back in the room, not lined up beside ${parts.find((p) => p.d === near) ? name(parts.find((p) => p.d === near)!.id) : "the nearer people"}.` : ""}`);
    }
    if (layout) lines.push("Use the attached layout sketch, drawn from the floor plan through this camera, for where each person stands in the frame, how big they appear, the camera angle and the table's height and place. It is only a guide made of labelled shapes: draw real people in the real room and copy nothing of its style, shapes, colours or text.");
    if (edge.length) lines.push(`${joinNames(edge.map((c) => c.name))} ${edge.length === 1 ? "is" : "are"} clearly in the picture, standing in ${edge.length === 1 ? "their place" : "their places"} with the others and listening, less prominent than ${subjectId ? name(subjectId) : "the main characters"} but never left out.`);
    if (closeUp && (shot.visibleIds.length > 1)) lines.push(`Close on ${name(subjectId!)}; the others are out of frame.`);
  }
  lines.push(`Look: ${GENRE_PROFILES[genre].look}.`);
  if (visible.length === 1 && edge.length) lines.push(`Exactly one of each person: ${joinNames([...visible, ...edge].map((c) => c.name))}. ${visible[0].name} is the main subject.`);
  else if (visible.length === 1) lines.push(crowd ? `Only ${visible[0].name} in the foreground; other guests only in the background.` : `Only ${visible[0].name} in frame.`);
  else if (visible.length > 1) lines.push(`Exactly one of each person: ${joinNames([...visible, ...edge].map((c) => c.name))}. No other people in the foreground.`);
  lines.push("No text, no logos, no speech bubbles, no watermark.");
  return { text: lines.join("\n"), attach };
}

/**
 * Change one image: attach the current image in ChatGPT and change only what the user asked.
 * The original brief is repeated so framing, background and rules stay the same.
 */
export function imageChangePrompt(change: string, originalPrompt: string): string {
  return [
    "Edit the attached image.",
    `Change only this: ${stripQuotes(change).trim() || "(describe the change here)"}`,
    "Keep everything else exactly the same: the same people, faces, hair, clothes, framing, camera angle, background and lighting. Same size and aspect ratio.",
    "",
    "For reference, the original brief for this image was:",
    originalPrompt,
  ].join("\n");
}
