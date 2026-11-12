// GPT image prompts for character reference sheets, venue views and storyboard panels.
// Deterministic text built from approved data, so the same inputs always give the same
// prompt. Lessons applied: character crops no narrower than 1:2 (narrower images were
// rejected); images made in GPT, not Kling (better and cheaper); no text or logos.

import { mainSubjectId } from "./composer";
import { describeFrame, facingOf, framedSize, pictureShare, PRESET_FOV, planForShot, presetText, readCamera, readProps } from "./geometry";
import { GENRE_PROFILES, type Genre } from "./genre";
import { aimDetail, exitFrom, gestureDetail } from "./gestures";
import { propMoves } from "./story";
import { gazeFor, gazeLine, shotEffect } from "./gaze";
import { bodyEffect, verticalOf } from "./vertical";
import { namedShot, shotLines, withoutMove, withSize } from "./shotLanguage";
import { levelAt, levelLines } from "./levels";
import { joinNames, stripQuotes } from "./text";
import { postureWords } from "./panelWords";
import { noTextRule } from "./signage";
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
  /** The venue's description (D31): its lighting is held the same in every picture. */
  venueDescription?: string;
  /** Venue views with their approved reference images, so the background can be attached. */
  venueViews?: { name: string; imageAssetId?: string }[];
  aspect?: string; // e.g. "9:16"
  genre?: Genre;
  style?: string;
  /** The layout sketch for this shot (D18f): the floor plan seen through its camera. */
  layoutHref?: string;
  /** The background cut from the venue's 360° ring for this camera (D20), when the venue has one. */
  backgroundHref?: string;
  /**
   * The blocking frame (D34): the shot itself, with the 360° background and labelled stand-ins.
   * When given it goes first and replaces the separate background and layout sketch.
   */
  blockingHref?: string;
  /**
   * Image 1 over the venue photo ("photo", the default) or as a grey-box room from the plan
   * ("box", D60 test B): then the room's look from this camera goes as image 2.
   */
  frame?: "photo" | "box";
  /**
   * An approved picture of this scene (D18c), attached so later panels keep the same spot,
   * furniture, background guests, light and clothes. Not used for the panel's own picture.
   */
  continuity?: { assetId: string; label: string };
}

export interface PanelPrompt {
  text: string;
  /**
   * The same request, short (B3): built in the same pass from the same values, so the two can be
   * compared on equal terms. Only when image 1 is a blocking frame; otherwise the full request.
   */
  short?: string;
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
  // A point of view (D27) is someone's eyes: they are not in their own picture.
  const povId = cam?.povId;
  const closeUp = !!cam && !povId && (cam.preset === "single-cu" || cam.preset === "insert") && !!subjectId;
  const shownIds = (closeUp ? [subjectId!] : (shot?.visibleIds ?? [])).filter((id) => id !== povId);
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

  // Who this camera sees from behind (D19f): the over-the-shoulder figure, and anyone whose back
  // is to the camera by the floor plan (someone walking in, say). They get their back image, so
  // the back of their clothes is copied, not invented; the front image comes too, for colours.
  const fromBehind = new Set<string>(fgId ? [fgId] : []);
  if (cam && shotPlan) for (const a of shotPlan.actors) {
    const fwd = facingOf(shotPlan, a.characterId, shotPlan.lineOfAction);
    if (!fwd) continue;
    const vx = cam.position.x - a.position.x, vy = cam.position.y - a.position.y, l = Math.hypot(vx, vy) || 1;
    if ((fwd.x * vx + fwd.y * vy) / l < -0.35) fromBehind.add(a.characterId);
  }
  // Anyone walking in this panel (D20, D35): an arrival from the words, or a walk set on the plan.
  const walkerIds = shot && shotPlan ? [
    ...Object.entries(shot.at ?? {}).filter(([id, mark]) => ["arriving", "crossing", "approaching"].includes(mark) && !shotPlan.actors.find((x) => x.characterId === id)?.to).map(([id]) => id),
    ...shotPlan.actors.filter((x) => x.to).map((x) => x.characterId),
  ] : [];
  // The short request (B3), filled as the same values are worked out below.
  const S: Record<string, string[]> = { refs: [], people: [], props: [], moment: [], camera: [], keep: [] };
  const attach: PanelPrompt["attach"] = [];
  for (const c of [...visible, ...edge]) {
    const refs = i.profiles[c.id]?.refs ?? {};
    if (fromBehind.has(c.id) && refs.back) {
      attach.push({ label: `${c.name} back`, assetId: refs.back });
      if (c.id !== fgId && refs.front) attach.push({ label: `${c.name} reference`, assetId: refs.front });
    } else {
      const pick = refs.front ?? refs.face ?? refs.back;
      if (pick) attach.push({ label: `${c.name} reference`, assetId: pick });
    }
  }
  const peopleCount = attach.length;
  if (i.continuity) attach.push({ label: i.continuity.label, assetId: i.continuity.assetId });
  // Key props with a reference picture (D19c): the ones this camera sees, or all of them
  // without a camera, so the prop looks the same in every shot.
  // Props come from this panel's plan (D35): one taken away on an earlier panel isn't here.
  const seenProps = cam && shotPlan ? readProps(shotPlan, cam).filter((p) => p.inView).map((p) => p.name) : undefined;
  const propPics = ((shotPlan ?? i.plan)?.furniture ?? []).filter((f) => f.imageAssetId && (!seenProps || seenProps.includes(f.name)));
  for (const f of propPics) attach.push({ label: `${f.name} picture`, assetId: f.imageAssetId! });
  const bgView = reading?.backgroundView;
  // The ring background (D20) replaces the single nearest view: it is exactly what this camera
  // sees behind the people, from where it stands, at its angle and lens.
  const blocking = !!(i.blockingHref && reading);
  const ring = !blocking && !!(i.backgroundHref && reading);
  const bgImage = !ring && !blocking && bgView ? i.venueViews?.find((v) => v.name === bgView)?.imageAssetId : undefined;
  if (ring) attach.push({ label: "background", assetId: "", href: i.backgroundHref });
  if (bgImage) attach.push({ label: `${bgView} view`, assetId: bgImage });
  const layout = !blocking && !!(i.layoutHref && reading);
  if (layout) attach.push({ label: "layout sketch", assetId: "", href: i.layoutHref });
  // The blocking frame is image 1 (D34): the picture to finish. Everything else follows it.
  // In test B (D60) it's a grey-box room, and the room's look from this camera is image 2.
  const box = blocking && i.frame === "box" && !!i.backgroundHref;
  if (box) attach.unshift({ label: "the room's look from this camera", assetId: "", href: i.backgroundHref });
  if (blocking) attach.unshift({ label: "blocking frame (the shot to finish)", assetId: "", href: i.blockingHref });
  const peopleFrom = blocking ? (box ? 2 : 1) : 0;

  const lines: string[] = [];
  lines.push(`${(i.style ?? "photorealistic").replace(/^./, (m) => m.toUpperCase())} storyboard frame for a ${i.aspect ?? "9:16"} video, set in the ${i.venueName}.`);
  if (blocking) lines.push(blockingInstruction(attach.slice(box ? 2 : 1).map((a) => a.label), box));
  const people = attach.slice(peopleFrom, peopleFrom + peopleCount);
  if (people.length) lines.push(`Use the attached reference images for ${joinNames([...new Set(people.map((a) => a.label.replace(/ (reference|back)$/, "")))])}; keep their faces, hair and clothes identical, every pattern, stripe and colour block included. Bags and anything carried stay exactly as in the reference, in the same hand or on the same shoulder. Mind the mirror: a bag in someone's left hand is on the right of the picture when they face the camera, and on the left of the picture when they are seen from behind.`);
  const backs = people.filter((a) => a.label.endsWith(" back")).map((a) => a.label.replace(/ back$/, ""));
  if (blocking) S.refs.push(`The other images show only how people and props look (${attach.slice(box ? 2 : 1).map((a) => a.label).join(", ")}): copy faces, hair, clothes, carried things and props exactly; never take positions or background from them.`);
  if (backs.length) S.refs.push(`${joinNames(backs)} ${backs.length === 1 ? "is" : "are"} seen from behind: copy the back of the clothes, hair and bag from the back ${backs.length === 1 ? "image" : "images"}.`);
  if (i.continuity) S.refs.push(`The ${i.continuity.label} shows how the room, light and clothes look; never copy its framing or positions.`);
  if (backs.length) lines.push(`${joinNames(backs)} ${backs.length === 1 ? "is" : "are"} seen from behind: copy the back of their clothes, hair and bag exactly from the attached back ${backs.length === 1 ? "image" : "images"}.`);
  if (ring) lines.push(`Use the attached background picture as the room behind the characters: it is cut from the venue's 360° view for exactly this camera position, angle and lens, so what is on its left stays on the left and what is on its right stays on the right. Same place, layout and light, seen across the room several metres behind them.${shot?.crowd?.trim() ? " Fill it with the background guests described below." : ""}`);
  if (bgImage) lines.push(`Use the attached ${bgView} image as the background, seen across the room several metres behind the characters: same place, layout and light.${shot?.crowd?.trim() ? " It shows the room empty; fill it with the background guests described below." : ""}`);
  // The room keeps its order in every shot (D19f): what lies left and right of the background.
  const sides = reading?.sideViews;
  if (bgView && (sides?.left || sides?.right)) lines.push(`The room around it, never swapped: ${[sides.left ? `the ${sides.left} is to the left of the ${bgView}` : "", sides.right ? `the ${sides.right} is to the right of the ${bgView}` : ""].filter(Boolean).join("; ")}. Anything of ${sides.left && sides.right ? "them" : "it"} in the picture stays on that side.`);
  const spot = shot?.spot?.trim();
  const crowd = shot?.crowd?.trim();
  // An older approved picture may show an empty room: keep its spot and look, but add the crowd.
  if (i.continuity) lines.push(`Use the attached ${i.continuity.label} for continuity: the same spot, the same furniture at the same height and size, the same light and clothes${crowd ? ". If it shows fewer background guests than described below, add them" : ", and the same background guests"}. Change only the camera angle and the moment.`);
  // The same light in every picture (D31): one picture came out much darker than the rest.
  const light = lightingOf(i.venueDescription ?? "");
  if (light) lines.push(`Lighting, identical in every picture of this scene: ${light} Same brightness, colour and mood as the other pictures of the scene; not darker, not brighter.`);
  // Posture (D37): anyone not simply standing is said, so no one stands who should be lying.
  const posed = Object.entries(shot?.posture ?? {}).filter(([, e]) => e.pose !== "standing" || e.from);
  // Someone walking in isn't at the spot yet (B3): "everyone around the table" contradicted it.
  const walkingIn = walkerIds.filter((id) => shownIds.includes(id)).map(name);
  if (spot) lines.push(`Where: ${sentence(spot)} Keep it in the picture wherever the camera would see it, always the same height and size. ${walkingIn.length ? `Everyone else keeps their own place and posture around it (${joinNames(walkingIn)} ${walkingIn.length === 1 ? "is" : "are"} walking in, not there yet)` : "Everyone keeps their own place and posture around it"}${/\b(sit|sits|sitting|seated|sofa|couch|bench|lie|lies|lying|bed)\b/i.test(spot) || posed.length ? "" : ", standing upright"}; no one leans on it or on the bar unless the moment says so.`);
  // The floor plan's props are the approved list (D19a); the shot's copy is the fallback.
  const planProps = ((shotPlan ?? i.plan)?.furniture ?? []).map((f) => ({ name: f.name, detail: f.detail ?? "", pic: !!f.imageAssetId }));
  const props = planProps.length ? planProps : (shot?.props ?? []).map((p) => ({ ...p, pic: false }));
  // A prop with a picture is described by its picture alone (B3): its words had disagreed with it.
  const propWords = (p: { name: string; detail?: string; pic?: boolean }) => p.pic ? `${p.name} (exactly as in its picture)` : `${p.name}${p.detail ? ` (${stripQuotes(p.detail).replace(/[.]$/, "")})` : ""}`;
  if (props.length) lines.push(`Key props, identical in every picture of this scene: ${props.map(propWords).join("; ")}. Show each exactly as described, every time, with nothing extra on or around it.`);
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
    // How big a tall prop is in the picture (D48): a backdrop well behind the group was drawn close.
    const tall = (p: { id: string; depthM: number }) => {
      const f = sp.furniture?.find((x) => x.id === p.id);
      if (!f || (f.heightM ?? 0) < 1.5) return "";
      const s0 = pictureShare(sp, cam, f.position, f.heightM!, p.depthM);
      return s0.share < 0.85 ? `, about ${Math.round(s0.share * 100)}% of the picture's height` : "";
    };
    if (seen.length) S.props.push(`Props, each where and as big as its outline in image 1: ${joinNames(seen.map((p) => { const pp = props.find((x) => x.name === p.name); const size = tall(p).replace(/^, /, ""); const w = pp ? propWords(pp) : p.name; return `the ${size ? (w.endsWith(")") ? `${w.slice(0, -1)}, ${size})` : `${w} (${size})`) : w}`; }))}. Nothing else like them anywhere in the picture.`);
    if (seen.length) lines.push(`In this picture: ${joinNames(seen.map((p) => `the ${p.name} (${p.frame === "centre" ? "centre" : p.frame.replace("frame-", "")}, about ${Math.max(1, Math.round(p.depthM))} m from the camera${where(p)}${tall(p)})`))}. ${seen.length === 1 ? "It must be" : "They must be"} clearly visible, at exactly that distance; nothing else like ${seen.length === 1 ? "it" : "them"} anywhere else in the picture.`);
  }
  if (posed.length) {
    const ws = posed.filter(([id]) => shownIds.includes(id) || !shot?.visibleIds?.length).map(([id, e]) => postureWords(name(id), e, byId(id)?.pronoun as "she" | "he" | "they" | undefined)).filter(Boolean);
    if (ws.length) lines.push(`Posture: ${ws.join("; ")}. Show exactly this; the body stays as it was unless this says it changed.`);
    if (ws.length) S.people.push(`Posture: ${ws.join("; ")}.`);
  }
  // Someone on a mark (D19b): say where they are, so the picture doesn't put them with the group.
  for (const [id, markId] of Object.entries(shot?.at ?? {})) {
    if (shot?.blocking?.[id]) continue; // placed on the floor plan for this panel (D35)
    const m = i.plan?.actors.find((a) => a.characterId === id)?.marks?.find((x) => x.id === markId);
    if (m) lines.push(`${name(id)} is ${m.label}.`);
  }
  // A prop this moment moves (D20): it starts where the floor plan puts it; otherwise props never move.
  const moved = propMoves(i.description, (i.plan?.furniture ?? []).map((f) => f.name));
  if (moved.length) lines.push(`In this moment the ${joinNames(moved)} ${moved.length === 1 ? "is" : "are"} being moved: ${moved.length === 1 ? "it starts" : "they start"} in ${moved.length === 1 ? "its" : "their"} usual place shown in the layout. Every other prop stays exactly where it is.`);
  // Moving in this panel (D20): where they started; the picture shows where they end up.
  for (const [id, fromId] of Object.entries(shot?.from ?? {})) {
    const m = i.plan?.actors.find((a) => a.characterId === id)?.marks?.find((x) => x.id === fromId);
    const end = shot?.at?.[id];
    if (m && !end && !shot?.blocking?.[id]) lines.push(`${name(id)} has just walked over from where they were (${m.label.split(",")[0]}) and is now in their own place with the others, not still on the way.`);
  }
  // Where everyone stands relative to the focal prop, and whom they face (D20): no one talking
  // to the group from metres away unless the plan puts them there.
  const focal = (shotPlan ?? i.plan)?.furniture?.find((f) => f.id === "spot") ?? (shotPlan ?? i.plan)?.furniture?.[0];
  if (focal && cam && shotPlan && reading) {
    const f = { x: cam.lookAt.x - cam.position.x, y: cam.lookAt.y - cam.position.y };
    const fl = Math.hypot(f.x, f.y) || 1;
    const fw = { x: f.x / fl, y: f.y / fl }, rt = { x: fw.y, y: -fw.x };
    const inFrame = reading.actors.filter((a) => a.inView && [...shownIds, ...edgeIds].includes(a.characterId));
    const parts = inFrame.map((a) => {
      const pos = shotPlan.actors.find((x) => x.characterId === a.characterId)!.position;
      const dx = pos.x - focal.position.x, dy = pos.y - focal.position.y;
      const gap = Math.max(0, Math.hypot(dx, dy) - focal.radiusM);
      const lat = dx * rt.x + dy * rt.y, dep = dx * fw.x + dy * fw.y;
      const side = Math.abs(lat) >= Math.abs(dep) ? (lat < 0 ? "on its left" : "on its right") : dep > 0 ? "behind it" : "in front of it";
      const where = gap <= 1.2 ? `at the ${focal.name}, ${side}` : `about ${Math.round(gap)} m from the ${focal.name}, not at it`;
      const fwd = facingOf(shotPlan, a.characterId, shotPlan.lineOfAction);
      let faces = "";
      if (fwd) {
        // Whom they face: the person or prop most nearly straight ahead of them.
        const targets = [...shotPlan.actors.filter((x) => x.characterId !== a.characterId).map((x) => ({ n: name(x.characterId), p: x.position })), { n: `the ${focal.name}`, p: focal.position }];
        const best = targets.map((t) => { const vx = t.p.x - pos.x, vy = t.p.y - pos.y, l = Math.hypot(vx, vy) || 1; return { n: t.n, c: (vx * fwd.x + vy * fwd.y) / l }; }).sort((x, y) => y.c - x.c)[0];
        if (best && best.c > 0.8) faces = `, facing ${best.n}`;
      }
      return `${name(a.characterId)} ${where}${faces}`;
    });
    if (parts.length) lines.push(`Around the ${focal.name}: ${parts.join("; ")}. Nobody stands anywhere else.`);
  }
  // The cast up on a stage or balcony (D29): the crowd stays down on the main floor.
  const castUp = i.plan?.levels?.length ? i.plan.levels.find((l) => l.heightM > 0 && i.plan!.actors.some((a) => levelAt(i.plan!, a.position) === l)) : undefined;
  if (crowd) S.people.push(`Background: ${sentence(crowd).split(/(?<=[.!?])\s+/)[0]} Out of focus, smaller than the main characters, never looking at the camera, none like them.`);
  if (crowd) lines.push(`Background: ${sentence(crowd)}${castUp ? ` They are down on the main floor, not up on ${castUp.name} with the characters.` : ""}${layout ? " The grey figures in the layout sketch show where they stand." : ""} Background guests are out of focus, smaller than the main characters and never look at the camera; none of them look like the main characters.`);
  for (const c of visible) {
    const p = i.profiles[c.id];
    const parts = [p?.appearance, p?.wardrobe ? `wearing ${p.wardrobe}` : ""].filter(Boolean).map((x) => sceneDescription(stripQuotes(x!)).replace(/[.!?]+$/, "")).filter(Boolean);
    if (parts.length) lines.push(`${c.name}: ${parts.join("; ")}.`);
    if (p?.anchors?.length) lines.push(`${c.name} must keep: ${p.anchors.map((a) => sceneDescription(stripQuotes(a))).join("; ")}.`);
  }
  for (const c of edge) {
    const p = i.profiles[c.id];
    if (p?.anchors?.length) lines.push(`${c.name} must keep: ${p.anchors.map((a) => sceneDescription(stripQuotes(a))).join("; ")}.`);
  }
  // In the short request, only the "must keep" of anyone whose face we see (B3).
  for (const c of [...visible, ...edge]) {
    const a = i.profiles[c.id]?.anchors;
    if (a?.length && !fromBehind.has(c.id)) S.keep.push(`${c.name}: ${a.map((x) => sceneDescription(stripQuotes(x))).join("; ")}`);
  }
  lines.push(`Moment: ${sentence(i.description)}`);
  if (i.emotion) lines.push(`Emotion: ${sentence(i.emotion)}`);
  // The panel's actions are often its description again (B3): said once.
  const sameWords = (a: string, b: string) => a.toLowerCase().replace(/[^a-z]/g, "") === b.toLowerCase().replace(/[^a-z]/g, "");
  if (shot?.actions && !sameWords(shot.actions, i.description)) lines.push(sentence(shot.actions));
  S.moment.push(`Moment: ${sentence(i.description)}${i.emotion ? ` Emotion: ${sentence(i.emotion)}` : ""}${shot?.actions && !sameWords(shot.actions, i.description) ? ` ${sentence(shot.actions)}` : ""}`);
  const gestures = gestureDetail(i.description, shot?.actions);
  lines.push(...gestures);
  S.moment.push(...gestures);
  // Who looks at whom (D21b), for everyone in the picture.
  if (shot) {
    const inPic = reading ? reading.actors.filter((a) => a.inView && [...shownIds, ...edgeIds].includes(a.characterId) && a.characterId !== fgId).map((a) => a.characterId) : [...shownIds];
    const gz = gazeFor({ shot, description: i.description, people: i.cast.map((c) => ({ id: c.id, name: c.name })), line: (shotPlan ?? i.plan)?.lineOfAction });
    const gl = gazeLine(gz, name, inPic);
    if (gl) lines.push(gl);
    if (gl) S.people.push(gl);
    // Eye lines in the frame (D31): "looks at Jade" alone let GPT turn faces to the lens. Which
    // side of the picture each look goes to comes from the floor plan.
    if (reading) {
      const idOf = (n: string) => i.cast.find((c) => c.name === n || c.name.split(/\s+/)[0] === n)?.id;
      const eyes = gz.filter((g) => inPic.includes(g.id)).flatMap((g) => {
        const t = idOf(g.at);
        const L = reading.actors.find((a) => a.characterId === g.id), T = t ? reading.actors.find((a) => a.characterId === t) : undefined;
        if (!L || !T || T.depthM <= 0) return [];
        const d = T.angleDeg - L.angleDeg;
        const way = Math.abs(d) <= 3 ? (T.depthM < L.depthM ? "towards the camera's side but past the lens" : "straight ahead into the scene") : `to the ${d > 0 ? "right" : "left"} of the picture`;
        // At the over-the-shoulder person (D33): looking near the lens, so say plainly whose eyes.
        if (t === fgId) return [`${name(g.id)} looks at ${name(t!)}'s face, ${name(t!)} being the person in the foreground with their back to us: ${name(g.id)}'s eyes meet theirs, ${way === "straight ahead into the scene" ? "just past the lens" : way}, never into the lens`];
        return [`${name(g.id)} looks ${way}, at ${name(t!)}`];
      });
      if (eyes.length) lines.push(`Eye lines: ${eyes.join("; ")}. Eyes and head turned that way; no one looks into the lens.`);
    }
    // Looking through something has its own look (D25): binoculars, keyhole, mirror, window…
    const fx = shotEffect(gz, shot.speakerId ?? shot.subjectId ?? shot.visibleIds[0]);
    if (fx) lines.push(`Shot effect: ${fx}.`);
    if (fx) S.moment.push(`Shot effect: ${fx}.`);
    // Gestures aimed at the person they look at; walking away while looking back (D30).
    const mainId0 = shot.speakerId ?? shot.subjectId ?? shot.visibleIds[0];
    const tgt = gz.find((g) => g.id === mainId0)?.at;
    // The gaze names people by first name.
    const tgtPerson = tgt ? i.cast.find((c) => c.name === tgt || c.name.split(/\s+/)[0] === tgt) : undefined;
    if (mainId0 && tgtPerson) S.moment.push(...aimDetail(`${i.description} ${shot.actions ?? ""}`, name(mainId0), tgtPerson.name.split(/\s+/)[0], reading && i.plan ? exitFrom(i.plan.views, reading.forwardDeg) : undefined));
    if (mainId0 && tgtPerson) lines.push(...aimDetail(`${i.description} ${shot.actions ?? ""}`, name(mainId0), tgtPerson.name.split(/\s+/)[0], reading && i.plan ? exitFrom(i.plan.views, reading.forwardDeg) : undefined));
    // Lying down, falling, free fall (D26): how the body and the drop look.
    const mainId = shot.speakerId ?? shot.subjectId ?? shot.visibleIds[0];
    const bx = bodyEffect(`${i.description} ${shot.actions ?? ""}`, mainId ? name(mainId) : "they");
    if (bx) lines.push(`Body and angle: ${bx}.`);
    if (bx) S.moment.push(`Body and angle: ${bx}.`);
  }

  if (cam && reading && shot) {
    // The size the picture really gives the main person (D48): a "full shot" whose feet the
    // picture cuts is said as what it is, so GPT doesn't move the camera back to show them.
    const subjRead = subjectId ? reading.actors.find((a) => a.characterId === subjectId && a.inView) : undefined;
    const subjAt = subjRead ? (shotPlan ?? i.plan!).actors.find((a) => a.characterId === subjectId)?.position : undefined;
    const said = cam.size ?? namedShot(shot.shot ?? "").size;
    const framed = subjAt && subjRead ? framedSize(shotPlan ?? i.plan!, cam, subjAt, subjRead.depthM) : undefined;
    const cutFull = !!said && ["fs", "ls", "ws"].includes(said) && !!framed && framed.bottomM > 0;
    // Only just cut (at the ankles): still a full shot, said as the picture shows it; cut higher: named for what it is.
    const fix = cutFull && framed!.bottomM > 0.3 ? framed!.size : undefined;
    const camW = fix ? { ...cam, size: fix } : cam;
    const preset = presetText(camW).replace(", static camera", "").replace(" static camera,", "");
    lines.push(preset);
    // A still has no camera move (B3): "tracking shot" is for the video, not the picture.
    const shotWords = withoutMove(fix ? withSize(shot.shot?.trim() ?? "", fix) : shot.shot?.trim() ?? "");
    if (shotWords) lines.push(`Shot: ${shotWords}.`);
    // Shot size, named framing, lens, point of view and what the angle means (D27).
    const camLines = shotLines({ cam: camW, kind: verticalOf(cam).kind, fovDeg: cam.fovDeg ?? PRESET_FOV[cam.preset], text: withoutMove(`${i.description} ${shot.actions ?? ""} ${shotWords}`), name })
      .map((l) => (cutFull && !fix && l.startsWith("Framing:") ? `Framing: full shot, but the bottom edge cuts ${name(subjectId!)} at the ankles, exactly as in the layout; do not move the camera back or tilt it down to show the feet.` : l));
    lines.push(...camLines);
    S.camera.push(preset, ...camLines.filter((l) => /^(Framing|Lens|Point of view|Angle):/.test(l)), "A level camera at image 1's height and angle: don't move, tilt or zoom it.");
    // Raised and lowered floors (D29): who is above or below the camera, and any drop in view.
    lines.push(...levelLines(shotPlan ?? i.plan!, cam, reading.actors.filter((a) => a.inView && [...shownIds, ...edgeIds].includes(a.characterId)).map((a) => a.characterId), name));
    // A strict left-to-right order and head count (D18e): looser wording let GPT swap people or drop them.
    const order = reading.actors.filter((a) => a.inView && [...shownIds, ...edgeIds].includes(a.characterId)).sort((a, b) => a.angleDeg - b.angleDeg);
    if (order.length > 1) {
      const who = joinNames(order.map((a) => `${name(a.characterId)}${a.characterId === fgId ? " (in the foreground, seen from behind over the shoulder)" : a.partial ? ` (only partly in the picture, cut by the ${a.angleDeg < 0 ? "left" : "right"} edge: a shoulder, arm and part of the face or back)` : ""}`));
      // "Main characters", not "people" (B3): the background guests are people too.
      lines.push(`Exactly ${order.length} main characters in this picture, from left to right: ${who}. Keep this left-to-right order; do not swap anyone, and do not leave anyone out.`);
      S.people.unshift(`Exactly ${order.length} main characters, left to right: ${who}; background guests apart.`);
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
    // Walking (D34b): which way across the picture and whether away from or towards the camera,
    // in words as well as the frame's arrow. GPT turned an arriving walker to face the lens.
    if (shotPlan && i.plan) {
      const f0 = { x: cam.lookAt.x - cam.position.x, y: cam.lookAt.y - cam.position.y };
      const fl0 = Math.hypot(f0.x, f0.y) || 1;
      const fw = { x: f0.x / fl0, y: f0.y / fl0 }, rt = { x: fw.y, y: -fw.x };
      // Arrivals from the panel's words, and walks set on the storyboard (D35).
      const walkers = [
        ...Object.entries(shot.at ?? {}).filter(([id, mark]) => ["arriving", "crossing", "approaching"].includes(mark) && !shotPlan.actors.find((x) => x.characterId === id)?.to).map(([id]) => id),
        ...shotPlan.actors.filter((x) => x.to).map((x) => x.characterId),
      ];
      for (const id of walkers) {
        if (!order.some((a) => a.characterId === id)) continue;
        const me = shotPlan.actors.find((x) => x.characterId === id);
        const from = me?.position;
        const to = me?.to ?? i.plan.actors.find((x) => x.characterId === id)?.position;
        if (!from || !to) continue;
        const d = { x: to.x - from.x, y: to.y - from.y };
        const dl = Math.hypot(d.x, d.y) || 1;
        const across = (d.x * rt.x + d.y * rt.y) / dl, away = (d.x * fw.x + d.y * fw.y) / dl;
        const parts = [Math.abs(across) > 0.3 ? `towards the ${across > 0 ? "right" : "left"} of the picture` : "", away > 0.3 ? "away from the camera" : away < -0.3 ? "towards the camera" : ""].filter(Boolean);
        const seen = away > 0.5 ? "we see their back" : away < -0.5 ? "we see their front" : `we see their ${across > 0 ? "left" : "right"} side and the side of their face, not their face full-on`;
        lines.push(`Walking: ${name(id)} is mid-stride, walking ${parts.join(" and ") || "on"}, ${me?.to ? "from where their stand-in is, the way the orange arrow points" : "from where their stand-in is, heading for the group the way the orange arrow points"}; ${seen}. Body, feet and eyes all point the way they walk, never at the camera.`);
        S.people.push(`${name(id)} walks ${parts.join(" and ") || "on"}, mid-stride, from where their stand-in is, the way the orange arrow points (they appear once, at the stand-in); ${seen}; body, feet and eyes the way they walk.`);
      }
    }
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
        // How big in the picture (D48), for anyone standing: in words as well as in the frame.
        const me = shotPlan.actors.find((x) => x.characterId === a.characterId);
        const big = pos && (!me?.pose || me.pose === "standing") ? pictureShare(shotPlan, cam, pos, 1.72, a.depthM) : undefined;
        const size = !big || big.share >= 0.85 ? "" : big.cut ? `, from the head down past the bottom edge of the picture` : `, head to toe about ${Math.round(big.share * 100)}% of the picture's height`;
        return { id: a.characterId, d, face, size, text: `${name(a.characterId)} about ${d} m from the camera${face}${size}` };
      });
      const near = Math.min(...parts.map((p) => p.d)), far = Math.max(...parts.map((p) => p.d));
      // Which side of the picture a carried bag is on (D33), when the character's description
      // says which hand: the left hand is on the right of the picture when they face us.
      const bags = parts.flatMap((p) => {
        if (!/facing the camera|seen from behind/.test(p.face)) return [];
        const facing = /facing the camera/.test(p.face);
        const pr = byId(p.id)?.pronoun;
        const poss = pr === "she" ? "her" : pr === "he" ? "his" : "their";
        return [...carriedItems(i.profiles[p.id]), ...heldProps(shotPlan, p.id, i.profiles[p.id])].map((it) => {
          const side = facing ? (it.side === "left" ? "right" : "left") : it.side;
          return `${name(p.id)}'s ${it.what} is ${it.where === "hand" ? "in" : "on"} ${poss} ${it.side} ${it.where}, so it shows on the ${side} of the picture (${facing ? "facing us, mirror-wise" : "seen from behind"})`;
        });
      });
      if (bags.length) lines.push(`Carried: ${bags.join("; ")}. Never swap hands between pictures.`);
      // Short request: what's carried in a hand or on a shoulder (wrist things are too small to matter).
      const bagsShort = parts.flatMap((p) => {
        if (!/facing the camera|seen from behind/.test(p.face)) return [];
        const facing = /facing the camera/.test(p.face);
        const pr = byId(p.id)?.pronoun;
        const poss = pr === "she" ? "her" : pr === "he" ? "his" : "their";
        return carriedItems(i.profiles[p.id]).filter((it) => it.where !== "wrist").map((it) => `${name(p.id)}'s ${itemNoun(it.what)} ${it.where === "hand" ? "in" : "on"} ${poss} ${it.side} ${it.where} (${facing ? (it.side === "left" ? "right" : "left") : it.side} of the picture)`);
      });
      if (bagsShort.length) S.people.push(`Carried: ${bagsShort.join("; ")}.`);
      // Picked up in this moment (D36): whoever has the prop holds it, whichever way they face.
      const holding = parts.flatMap((p) => heldProps(shotPlan, p.id, i.profiles[p.id]).map((it) => {
        const f = shotPlan.furniture?.find((x) => x.heldBy === p.id && x.name === it.what);
        const pr = byId(p.id)?.pronoun;
        return `${name(p.id)} has the ${it.what}${f?.detail ? ` (${stripQuotes(f.detail).replace(/[.]$/, "")})` : ""} in ${pr === "she" ? "her" : pr === "he" ? "his" : "their"} ${it.side} hand`;
      }));
      if (holding.length) lines.push(`Holding: ${holding.join("; ")}. It is in their hand, not on any table or surface.`);
      if (holding.length) S.people.push(`Holding: ${holding.join("; ")}.`);
      S.people.push(`Sizes: ${parts.map((p) => `${name(p.id)} about ${p.d} m from the camera${p.size}`).join("; ")}.`);
      lines.push(`Distance and direction: ${parts.map((p) => p.text).join("; ")}.${far >= near * 1.6 && parts.length > 1 ? ` Keep these distances: whoever is further away is smaller and further back in the room, not lined up beside ${parts.find((p) => p.d === near) ? name(parts.find((p) => p.d === near)!.id) : "the nearer people"}.` : ""}`);
    }
    if (layout) lines.push("Use the attached layout sketch, drawn from the floor plan through this camera, for where each person stands in the frame, how big they appear, the camera angle and the table's height and place. It is only a guide made of labelled shapes: draw real people in the real room and copy nothing of its style, shapes, colours or text.");
    if (edge.length) lines.push(`${joinNames(edge.map((c) => c.name))} ${edge.length === 1 ? "is" : "are"} clearly in the picture, standing in ${edge.length === 1 ? "their place" : "their places"} with the others and listening, less prominent than ${subjectId ? name(subjectId) : "the main characters"} but never left out.`);
    if (closeUp && (shot.visibleIds.length > 1)) lines.push(`Close on ${name(subjectId!)}; the others are out of frame.`);
    if (closeUp && (shot.visibleIds.length > 1)) S.camera.push(`Close on ${name(subjectId!)}; the others are out of frame.`);
  }
  // One light (B3): the venue's lighting wins; the genre's look keeps only what isn't lighting.
  const look = light ? GENRE_PROFILES[genre].look.split(/,\s*/).filter((x) => !/\blight/i.test(x)) : [GENRE_PROFILES[genre].look];
  if (look.length && (look.length > 1 || /\s/.test(look[0]))) lines.push(`Look: ${look.join(", ")}.`);
  if (visible.length === 1 && edge.length) lines.push(`Exactly one of each person: ${joinNames([...visible, ...edge].map((c) => c.name))}. ${visible[0].name} is the main subject.`);
  else if (visible.length === 1) lines.push(crowd ? `Only ${visible[0].name} in the foreground; other guests only in the background.` : `Only ${visible[0].name} in frame.`);
  else if (visible.length > 1) lines.push(`Exactly one of each person: ${joinNames([...visible, ...edge].map((c) => c.name))}. No other people in the foreground.`);
  // A logo or sign that is part of the scene is the one exception (D47).
  const noText = noTextRule(props, ["no speech bubbles", "no watermark"], propPics.map((f) => f.name));
  lines.push(noText);
  // The short request (B3): image 1 holds where everything is, the pictures how it looks; the
  // words say only what neither shows. Same values as above, so the two never disagree.
  const short = blocking ? [
    lines[0],
    blockingShort(box),
    ...S.refs,
    ...S.people,
    ...S.props,
    ...(S.keep.length ? [`Keep: ${S.keep.join("; ")}.`] : []),
    ...S.moment,
    ...S.camera,
    ...(light ? [`Light, the same in every picture of this scene: ${light.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ")}`] : []),
    noText,
  ].filter(Boolean).join("\n") : undefined;
  return { text: lines.join("\n"), attach, ...(short ? { short } : {}) };
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

/** The lighting sentences of a venue description (D31), to hold the light the same in every picture. */
export function lightingOf(text: string): string {
  // Words about the light itself, not the time of day ("an evening launch party" is not lighting).
  const LIGHT = /\b(light|lights|lighting|lit|glow|glowing|lamp|lamps|candle|candles|candlelight|neon|uplighting|uplit|spotlights?|haze|daylight|sunlight|moonlight|dimly|brightly|festoon|shadows?)\b/i;
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter((x) => LIGHT.test(x) && !/screen|display|logo|banner/i.test(x));
  let out = "";
  for (const x of sentences) { if ((out + " " + x).length > 420) break; out = `${out} ${x}`.trim(); }
  return out;
}

/**
 * Anything a character holds, carries or wears on one side, when their description says which
 * (D33): "a satchel in her left hand", "phone in his right hand", "a guitar over her left
 * shoulder", "a watch on his left wrist". Any item, any character.
 */
/**
 * Props someone has picked up in this panel (D36), as held items: in the free hand, the right
 * unless the right already holds something they always carry. The same answer for the blocking
 * frame, the picture prompt and the check.
 */
export function heldProps(plan: Pick<GeometryPlanData, "furniture"> | undefined, id: string, p: CharacterProfile | undefined): { side: "left" | "right"; what: string; where: string }[] {
  const mine = (plan?.furniture ?? []).filter((f) => f.heldBy === id);
  if (!mine.length) return [];
  const busy = new Set(carriedItems(p).filter((x) => x.where === "hand").map((x) => x.side));
  const sides: ("left" | "right")[] = ["right", "left"].filter((x) => !busy.has(x as "left" | "right")) as ("left" | "right")[];
  return mine.map((f, k) => ({ side: sides[k] ?? (k % 2 ? "left" : "right"), what: f.name, where: "hand" }));
}

export function carriedItems(p: CharacterProfile | undefined): { side: "left" | "right"; what: string; where: string }[] {
  const text = `${p?.wardrobe ?? ""}. ${p?.appearance ?? ""}. ${(p?.anchors ?? []).join(". ")}`.replace(/\s+/g, " ");
  const out: { side: "left" | "right"; what: string; where: string }[] = [];
  const add = (what: string, side: string, where: string) => {
    // Only a phrase that names a thing (D34): "phone consistently" keeps "phone"; words that
    // name nothing are skipped rather than guessed.
    const words = what.trim().toLowerCase().replace(/[^a-z' -]/g, " ").split(/\s+/).filter(Boolean);
    const k = words.findIndex((x) => ITEM_NOUNS.test(x));
    if (k < 0) return;
    const w = words.slice(Math.max(0, k - 3), k + 1).filter((x) => !/^(?:a|an|the|her|his|their|and|with|always|usually|consistently|often|held|carried|worn)$/.test(x)).join(" ");
    if (!w || out.some((o) => itemGroup(o.what) === itemGroup(w))) return;
    out.push({ side: side.toLowerCase() as "left" | "right", what: w, where: where.toLowerCase() });
  };
  const SIDE = String.raw`(?:in|on|over|across|under)\s+(?:her|his|their|the)\s+(left|right)\s+(hand|arm|shoulder|wrist|hip|side)`;
  // "<item …> in her left hand": the last thing named earlier in the same clause, however many
  // words describe it ("satchel with a brass clasp and polished metal fittings in her left hand").
  for (const m of text.matchAll(new RegExp(String.raw`([^.;:!?]{0,200}?)\s+(?:held\s+|carried\s+|worn\s+|kept\s+|hanging\s+|slung\s+)?${SIDE}\b`, "gi"))) {
    const words = m[1].trim().split(/\s+/);
    // Back from the side phrase to the nearest thing named, then its describing words.
    let k = words.length - 1;
    while (k >= 0 && !ITEM_NOUNS.test(words[k].toLowerCase().replace(/[^a-z'-]/g, ""))) k--;
    if (k < 0) continue;
    let j = k;
    while (j > 0 && k - j < 4 && !/^(?:a|an|the|her|his|their|carries|carrying|holds|holding|wears|wearing|with|and)$/i.test(words[j - 1])) j--;
    add(words.slice(j, k + 1).join(" "), m[2], m[3]);
  }
  // "in her left hand, a tan satchel"
  for (const m of text.matchAll(new RegExp(String.raw`${SIDE}\s*,?\s+(?:she|he|they)?\s*(?:holds|carries|wears|has)?\s*((?:a|an|the)\s+(?:[\w'-]+\s+){0,4}[\w'-]+)`, "gi"))) add(m[3], m[1], m[2]);
  // What the reference picture itself shows (D34), read once and kept with the character; the
  // description wins where both name the same thing.
  const read = (p as { held?: { ref?: string; v?: number; items?: { side: "left" | "right"; what: string; where: string }[] } } | undefined)?.held;
  // Only a current reading of the current picture (older readings could mix up left and right).
  if (read?.items && read.ref === p?.refs?.front && (read.v ?? 1) >= 2) {
    // The same kind of thing counts once (a "satchel" in the description is the "handbag" in
    // the picture). The reference picture wins on which side (D34b): it is what GPT copies,
    // and a description easily gives the side of the picture instead of the person's own hand.
    for (const it of read.items) {
      const k = out.findIndex((o) => itemGroup(o.what) === itemGroup(it.what));
      if (k < 0) out.push(it);
      else out[k] = { ...out[k], side: it.side, where: it.where };
    }
  }
  return out.filter((o) => !/^(?:hand|arm|shoulder|wrist|hip|side|her|his|their)$/.test(o.what));
}

/** Things people hold, carry or wear on one side (D34), for picking the item out of a phrase. */
const ITEM_NOUNS = /^(?:wristwatch|bag|bags|handbag|satchel|clutch|purse|tote|briefcase|backpack|rucksack|holdall|suitcase|case|phone|smartphone|mobile|tablet|laptop|book|notebook|folder|clipboard|file|envelope|letter|card|cards|ticket|tickets|glass|flute|drink|cup|mug|coffee|bottle|can|cigarette|cigar|vape|umbrella|cane|stick|keys|key|lanyard|camera|microphone|mic|pen|watch|bracelet|bracelets|bangle|ring|rings|glove|guitar|flowers|bouquet|gift|box|tray|plate|newspaper|magazine|map|sword|gun|torch|lantern|leash|lead|dog|baby|child|coat|jacket|scarf|hat)$/;
/** The thing an item phrase names: "tan leather satchel" → "satchel". */
export function itemNoun(what: string): string {
  const words = what.toLowerCase().split(/\s+/);
  return [...words].reverse().find((x) => ITEM_NOUNS.test(x)) ?? words[words.length - 1];
}

/**
 * The first and governing instruction when a blocking frame is attached (D34). Image 1 is the
 * shot itself; GPT finishes it rather than composing its own. Written so each element of the
 * frame has one meaning and one job.
 */
export function blockingInstruction(refLabels: string[], box = false): string {
  return [
    "IMAGE 1 IS THIS SHOT. Turn image 1 into the finished photograph; do not compose a new picture.",
    box
      ? "Image 1 was built from the approved layout: a plain grey model of the room exactly as this camera sees it (its floor and walls, with a one-metre grid on the floor for scale, and the props in place), with a pale labelled stand-in for each character."
      : "Image 1 was built from the approved layout: the real room exactly as this camera sees it, with a pale labelled stand-in for each character.",
    "- Each stand-in becomes the character named on it, standing exactly where the stand-in stands, the same size in the frame, and turned the way its label says (FACING CAMERA, BACK TO CAMERA, or SIDE-ON facing left or right).",
    "- An orange arrow on the floor shows which way someone is walking from their stand-in; it is never a second place for them, so each character appears once.",
    "- A yellow tag beside a stand-in marks an item they hold: it is on that side of the picture, in that hand.",
    "- Outlined shapes marked with a prop's name are that prop, in that place, at that size.",
    box
      ? "- Image 2 shows how this room looks from this camera: paint image 1's grey floor and walls to look like it (its walls, bar, windows, lights, colours and materials). The camera position, angle, lens, floor, walls, positions and sizes stay exactly as in image 1; take no furniture and no people from image 2."
      : "- The room, the background, the light, the camera position, the angle and the lens stay exactly as in image 1. Do not move, swap, re-frame, zoom or re-imagine anything.",
    "- Remove every stand-in outline, label, arrow and tag: none of them appear in the finished picture.",
    refLabels.length ? `The other attached images are reference pictures (${refLabels.join(", ")}): use them only for how each character and prop looks, never for where anyone stands or what is behind them.` : "",
  ].filter(Boolean).join("\n");
}

/** Image 1's instruction in the short request (B3): the same meaning as `blockingInstruction`, said once. */
export function blockingShort(box = false): string {
  return (box ? "Image 1 is this exact shot as a plain grey model of the room; image 2 shows how the room looks from this camera, so paint image 1's grey floor and walls to look like it, taking no furniture or people from image 2. " : "") + "Image 1 is this exact shot: keep its framing, eye level, perspective, positions and the size of everyone and everything in it. Each pale stand-in becomes the person named on it, exactly where it stands and turned as its label says; an orange arrow only shows which way a walker is heading from their stand-in, never a second place for them, so everyone appears once; a yellow tag marks something held, on that side of the picture; an outline is the named prop. Remove every label, outline, arrow and tag.";
}

/**
 * A character's description as a scene picture needs it (B3). Which hand holds what is said once,
 * from the reference picture (D34b), so the description's own "in her left hand" goes; and
 * instructions written for making the reference sheets ("the facial close-up must…", "across
 * front, rear and facial reference views") mean nothing in a scene and go too.
 */
export function sceneDescription(text: string): string {
  const t = text.replace(/\.\s*,\s*/g, ". ")
    .replace(/,?\s*(?:held\s+|carried\s+|worn\s+)?(?:in|on|over|across)\s+(?:her|his|their|the)\s+(?:left|right)\s+(?:hand|shoulder|arm|wrist|hip)\b/gi, "");
  return t.split(/(?<=[.!?;])\s+/)
    .filter((x) => !/\b(?:reference|references)\b|\bfront,\s*rear\b|\brear and facial\b|\bfacial close-up\b|\bclose-up must\b/i.test(x))
    .join(" ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Contradictions left in a request (B3), checked before it is sent: a hand stated both ways for
 * the same thing, the same line twice, an internal note, "no logos" beside a logo, "head to toe"
 * beside a cut at the bottom edge, or two lighting looks. Empty when it is consistent.
 */
export function requestConflicts(text: string): string[] {
  const out: string[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const dup = lines.filter((l, k) => l.length > 20 && lines.indexOf(l) !== k);
  if (dup.length) out.push(`A line is repeated: "${dup[0].slice(0, 60)}…"`);
  if (/\(D\d+[a-z]?\)/.test(text)) out.push("An internal decision number is in the request.");
  if (/\bNo text, no logos\b/.test(text) && /\blogo\b/i.test(text.replace(/No text, no logos/g, ""))) out.push("It asks for a logo and also says \"no logos\".");
  if (/whole body head to toe/.test(text) && /(past the bottom edge|cuts \w[\w ]* at the ankles)/.test(text)) out.push("It says \"head to toe\" but the frame cuts the feet.");
  if (/^Look:.*\blight/im.test(text) && /^(Lighting|Light)\b/im.test(text)) out.push("It gives two different lighting looks.");
  // The same carried thing in both hands.
  for (const m of text.matchAll(/\b([A-Z][a-z]+)'s ([a-z][a-z -]*?) (?:is )?(?:in|on) (?:her|his|their) (left|right) (hand|shoulder)/g)) {
    const other = m[3] === "left" ? "right" : "left";
    const noun = m[2].trim().split(/\s+/).pop()!;
    if (new RegExp(`\\b${m[1]}[^.\\n]*\\b${noun}\\b[^.\\n]*\\bin (?:her|his|their) ${other} ${m[4]}`, "i").test(text) || new RegExp(`\\b${noun}\\b[^.\\n]{0,60}\\bin (?:her|his|their) ${other} ${m[4]}`, "i").test(text)) {
      out.push(`${m[1]}'s ${noun} is said to be in both hands.`);
      break;
    }
  }
  return out;
}

/** Kinds of carried thing (D34): different words for the same thing count as one item. */
const ITEM_GROUPS: [RegExp, string][] = [
  [/^(?:bag|bags|handbag|satchel|clutch|purse|tote|briefcase|backpack|rucksack|holdall|suitcase|case)$/, "bag"],
  [/^(?:phone|smartphone|mobile)$/, "phone"],
  [/^(?:glass|flute|drink|cup|mug|coffee|bottle|can)$/, "drink"],
  [/^(?:watch|wristwatch)$/, "watch"],
  [/^(?:bracelet|bracelets|bangle)$/, "bracelet"],
  [/^(?:book|notebook|folder|clipboard|file|tablet|laptop)$/, "document"],
];
export function itemGroup(what: string): string {
  const n = itemNoun(what);
  return ITEM_GROUPS.find(([re]) => re.test(n))?.[1] ?? n;
}

/**
 * Where a character's description and their reference picture disagree about which side
 * something is on (D34b), in plain words for the user. Pictures follow the reference.
 */
export function heldConflicts(name: string, p: CharacterProfile | undefined, pronoun: "she" | "he" | "they" = "they"): string[] {
  const read = (p as { held?: { ref?: string; v?: number; items?: { side: "left" | "right"; what: string; where: string }[] } } | undefined)?.held;
  if (!read?.items || read.ref !== p?.refs?.front || (read.v ?? 1) < 2) return [];
  const poss = pronoun === "she" ? "her" : pronoun === "he" ? "his" : "their";
  const desc = carriedItems({ ...p, held: undefined } as CharacterProfile);
  return desc.flatMap((d) => {
    const r = read.items!.find((x) => itemGroup(x.what) === itemGroup(d.what));
    if (!r || r.side === d.side) return [];
    return [`${name}: the description says the ${itemNoun(d.what)} is in ${poss} ${d.side} ${d.where}, but the reference picture shows it in ${poss} ${r.side} ${r.where} (on the ${r.side === "left" ? "right" : "left"} of the picture, as ${pronoun === "they" ? "they face" : `${pronoun} faces`} us). Pictures follow the reference; correct the description to match.`];
  });
}
