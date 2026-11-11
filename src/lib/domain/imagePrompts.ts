// GPT image prompts for character reference sheets, venue views and storyboard panels.
// Deterministic text built from approved data, so the same inputs always give the same
// prompt. Lessons applied: character crops no narrower than 1:2 (narrower images were
// rejected); images made in GPT, not Kling (better and cheaper); no text or logos.

import { mainSubjectId } from "./composer";
import { describeFrame, facingOf, PRESET_FOV, planForShot, presetText, readCamera, readProps } from "./geometry";
import { GENRE_PROFILES, type Genre } from "./genre";
import { aimDetail, exitFrom, gestureDetail } from "./gestures";
import { propMoves } from "./story";
import { gazeFor, gazeLine, shotEffect } from "./gaze";
import { bodyEffect, verticalOf } from "./vertical";
import { shotLines } from "./shotLanguage";
import { levelAt, levelLines } from "./levels";
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
  const seenProps = cam && i.plan ? readProps(i.plan, cam).filter((p) => p.inView).map((p) => p.name) : undefined;
  const propPics = (i.plan?.furniture ?? []).filter((f) => f.imageAssetId && (!seenProps || seenProps.includes(f.name)));
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
  if (blocking) attach.unshift({ label: "blocking frame (the shot to finish)", assetId: "", href: i.blockingHref });
  const peopleFrom = blocking ? 1 : 0;

  const lines: string[] = [];
  lines.push(`${(i.style ?? "photorealistic").replace(/^./, (m) => m.toUpperCase())} storyboard frame for a ${i.aspect ?? "9:16"} video, set in the ${i.venueName}.`);
  if (blocking) lines.push(blockingInstruction(attach.slice(1).map((a) => a.label)));
  const people = attach.slice(peopleFrom, peopleFrom + peopleCount);
  if (people.length) lines.push(`Use the attached reference images for ${joinNames([...new Set(people.map((a) => a.label.replace(/ (reference|back)$/, "")))])}; keep their faces, hair and clothes identical, every pattern, stripe and colour block included. Bags and anything carried stay exactly as in the reference, in the same hand or on the same shoulder. Mind the mirror (D31): a bag in someone's left hand is on the right of the picture when they face the camera, and on the left of the picture when they are seen from behind.`);
  const backs = people.filter((a) => a.label.endsWith(" back")).map((a) => a.label.replace(/ back$/, ""));
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
  // A prop this moment moves (D20): it starts where the floor plan puts it; otherwise props never move.
  const moved = propMoves(i.description, (i.plan?.furniture ?? []).map((f) => f.name));
  if (moved.length) lines.push(`In this moment the ${joinNames(moved)} ${moved.length === 1 ? "is" : "are"} being moved: ${moved.length === 1 ? "it starts" : "they start"} in ${moved.length === 1 ? "its" : "their"} usual place shown in the layout. Every other prop stays exactly where it is.`);
  // Moving in this panel (D20): where they started; the picture shows where they end up.
  for (const [id, fromId] of Object.entries(shot?.from ?? {})) {
    const m = i.plan?.actors.find((a) => a.characterId === id)?.marks?.find((x) => x.id === fromId);
    const end = shot?.at?.[id];
    if (m && !end) lines.push(`${name(id)} has just walked over from where they were (${m.label.split(",")[0]}) and is now in their own place with the others, not still on the way.`);
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
  if (crowd) lines.push(`Background: ${sentence(crowd)}${castUp ? ` They are down on the main floor, not up on ${castUp.name} with the characters.` : ""}${layout ? " The grey figures in the layout sketch show where they stand." : ""} Background guests are out of focus, smaller than the main characters and never look at the camera; none of them look like the main characters.`);
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
  // Who looks at whom (D21b), for everyone in the picture.
  if (shot) {
    const inPic = reading ? reading.actors.filter((a) => a.inView && [...shownIds, ...edgeIds].includes(a.characterId) && a.characterId !== fgId).map((a) => a.characterId) : [...shownIds];
    const gz = gazeFor({ shot, description: i.description, people: i.cast.map((c) => ({ id: c.id, name: c.name })), line: (shotPlan ?? i.plan)?.lineOfAction });
    const gl = gazeLine(gz, name, inPic);
    if (gl) lines.push(gl);
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
    // Gestures aimed at the person they look at; walking away while looking back (D30).
    const mainId0 = shot.speakerId ?? shot.subjectId ?? shot.visibleIds[0];
    const tgt = gz.find((g) => g.id === mainId0)?.at;
    // The gaze names people by first name.
    const tgtPerson = tgt ? i.cast.find((c) => c.name === tgt || c.name.split(/\s+/)[0] === tgt) : undefined;
    if (mainId0 && tgtPerson) lines.push(...aimDetail(`${i.description} ${shot.actions ?? ""}`, name(mainId0), tgtPerson.name.split(/\s+/)[0], reading && i.plan ? exitFrom(i.plan.views, reading.forwardDeg) : undefined));
    // Lying down, falling, free fall (D26): how the body and the drop look.
    const mainId = shot.speakerId ?? shot.subjectId ?? shot.visibleIds[0];
    const bx = bodyEffect(`${i.description} ${shot.actions ?? ""}`, mainId ? name(mainId) : "they");
    if (bx) lines.push(`Body and angle: ${bx}.`);
  }

  if (cam && reading && shot) {
    lines.push(presetText(cam).replace(", static camera", "").replace(" static camera,", ""));
    if (shot.shot?.trim()) lines.push(`Shot: ${shot.shot.trim()}.`);
    // Shot size, named framing, lens, point of view and what the angle means (D27).
    lines.push(...shotLines({ cam, kind: verticalOf(cam).kind, fovDeg: cam.fovDeg ?? PRESET_FOV[cam.preset], text: `${i.description} ${shot.actions ?? ""} ${shot.shot ?? ""}`, name }));
    // Raised and lowered floors (D29): who is above or below the camera, and any drop in view.
    lines.push(...levelLines(shotPlan ?? i.plan!, cam, reading.actors.filter((a) => a.inView && [...shownIds, ...edgeIds].includes(a.characterId)).map((a) => a.characterId), name));
    // A strict left-to-right order and head count (D18e): looser wording let GPT swap people or drop them.
    const order = reading.actors.filter((a) => a.inView && [...shownIds, ...edgeIds].includes(a.characterId)).sort((a, b) => a.angleDeg - b.angleDeg);
    if (order.length > 1) {
      lines.push(`Exactly ${order.length} people in this picture, from left to right: ${joinNames(order.map((a) => `${name(a.characterId)}${a.characterId === fgId ? " (in the foreground, seen from behind over the shoulder)" : a.partial ? ` (only partly in the picture, cut by the ${a.angleDeg < 0 ? "left" : "right"} edge: a shoulder, arm and part of the face or back)` : ""}`))}. Keep this left-to-right order; do not swap anyone, and do not leave anyone out.`);
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
        return { id: a.characterId, d, face, text: `${name(a.characterId)} about ${d} m from the camera${face}` };
      });
      const near = Math.min(...parts.map((p) => p.d)), far = Math.max(...parts.map((p) => p.d));
      // Which side of the picture a carried bag is on (D33), when the character's description
      // says which hand: the left hand is on the right of the picture when they face us.
      const bags = parts.flatMap((p) => {
        if (!/facing the camera|seen from behind/.test(p.face)) return [];
        const facing = /facing the camera/.test(p.face);
        const pr = byId(p.id)?.pronoun;
        const poss = pr === "she" ? "her" : pr === "he" ? "his" : "their";
        return carriedItems(i.profiles[p.id]).map((it) => {
          const side = facing ? (it.side === "left" ? "right" : "left") : it.side;
          return `${name(p.id)}'s ${it.what} is ${it.where === "hand" ? "in" : "on"} ${poss} ${it.side} ${it.where}, so it shows on the ${side} of the picture (${facing ? "facing us, mirror-wise" : "seen from behind"})`;
        });
      });
      if (bags.length) lines.push(`Carried: ${bags.join("; ")}. Never swap hands between pictures.`);
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
    // the picture): what the description says wins.
    for (const it of read.items) if (!out.some((o) => itemGroup(o.what) === itemGroup(it.what))) out.push(it);
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
export function blockingInstruction(refLabels: string[]): string {
  return [
    "IMAGE 1 IS THIS SHOT. Turn image 1 into the finished photograph; do not compose a new picture.",
    "Image 1 was built from the approved layout: the real room exactly as this camera sees it, with a pale labelled stand-in for each character.",
    "- Each stand-in becomes the character named on it, standing exactly where the stand-in stands, the same size in the frame, and turned the way its label says (FACING CAMERA, BACK TO CAMERA, or SIDE-ON facing left or right).",
    "- An orange arrow on the floor marks someone walking: they walk exactly along it, in the arrow's direction.",
    "- A yellow tag beside a stand-in marks an item they hold: it is on that side of the picture, in that hand.",
    "- Outlined shapes marked with a prop's name are that prop, in that place, at that size.",
    "- The room, the background, the light, the camera position, the angle and the lens stay exactly as in image 1. Do not move, swap, re-frame, zoom or re-imagine anything.",
    "- Remove every stand-in outline, label, arrow and tag: none of them appear in the finished picture.",
    refLabels.length ? `The other attached images are reference pictures (${refLabels.join(", ")}): use them only for how each character and prop looks, never for where anyone stands or what is behind them.` : "",
  ].filter(Boolean).join("\n");
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
