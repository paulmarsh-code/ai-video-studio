// A scene's clips as the clips page shows them and as they are sent to Kling (D113, D123): one
// place, so what Paul sees is exactly what is sent.

import type { DB } from "@/db/client";
import { and, eq } from "drizzle-orm";
import * as t from "@/db/schema";
import { planForShot } from "./domain/geometry";
import { carryBlocking } from "./domain/blocking";
import type { GeometryPlanData, ShotSpec } from "./domain/types";
export type { ClipFrames };
import * as repo from "./repo";
import * as studio from "./studioRepo";
import { WEARS_OUTER, clipKey, elementKey, whenLine, sceneClips, type Clip, type ClipFrames, type ClipPanel } from "./domain/clips";
import { isSetPiece } from "./domain/setRender";
import { withPiecePictures } from "./setImage";
import { setPicturesOf } from "./domain/setPictures";

/** The venue's picture towards each wall (D178): the set's own wall picture, else the view's. */
export function venueWalls(venue: { views?: unknown; setPictures?: unknown } | null | undefined): { name: string; assetId: string }[] {
  if (!venue) return [];
  const walls = setPicturesOf(venue.setPictures as never).walls ?? {};
  return ((venue.views ?? []) as { name: string; imageAssetId?: string }[]).flatMap((v) => { const id = walls[v.name] ?? v.imageAssetId; return id ? [{ name: v.name, assetId: id }] : []; });
}
import { klingElementList, type KlingListed } from "./klingList";

export interface PictureChoice {
  panelId: string;
  order: number;
  /** The picture Kling gets for this panel: the storyboard's, another version, or none. */
  chosen?: string;
  /** "storyboard" when it's the panel's own picture; "own" when picked; "none" when left out. */
  how: "storyboard" | "own" | "none";
  options: { assetId: string; label: string }[];
}

export interface SceneClipsView {
  clips: Clip[];
  rows: { key: string; what: string; kind: string; element?: { id: string; name: string }; voice?: { id: string; name: string } }[];
  listed: { elements: KlingListed[]; updatedAt?: string };
  pictures: PictureChoice[];
  aspect: "9:16" | "16:9";
  sceneTitle: string;
  /** Finished takes kept for some panels (D130). */
  kept: studio.KeptTakeRecord[];
  /** Every panel, for choosing what a kept take covers. */
  allPanels: { order: number; description: string }[];
  /** Each clip's pictures that are out of date (D151), in the clips' order. */
  issues: ClipPictureIssues[];
  /** For each clip, in order: the request for a start frame and for an end frame (D164). */
  frameRequests: { start: FrameRequest; end: FrameRequest }[];
  /** The scene's positions (D165): the plan, who's who, the user's words, and whether approved. */
  when: string;
  people: { slug: string; name: string; usual: string; base: { front?: string; face?: string }; look?: import("./domain/clips").SceneLook }[];
  positions: { plan: GeometryPlanData; names: Record<string, string>; note: string; approved: boolean };
  /** Each panel's words, for changing them on its clip (D164), by order. */
  editors: Record<number, { panel: { id: string; code: string; description: string; emotion: string; speakerId?: string; line?: string; durationSec: number; status: string; version: number; hasImage: boolean }; delivery?: string; first: boolean; last: boolean }>;
}

/** A picture to draw (D164): its words and reference pictures, sent to the app's picture route. */
export interface FrameRequest { baseCode: string; prompt: string; refAssetIds: string[] }

/**
 * The words for a clip's start or end frame (D164): a still from the film, drawn from the
 * characters' and props' pictures and the venue's views, with everyone where the panel words put
 * them. The same kind of picture as scene 4's three scene pictures (17 Nov), which matched the
 * room, the clothes and the hands first time.
 */
export function framePrompt(o: { which: "start" | "end"; positions?: string; venue: string; venueDescription?: string; crowd?: string; aspect: "9:16" | "16:9"; people: { name: string; where?: string }[]; props: { name: string; detail?: string }[]; moment: string; change?: string; when?: string }): string {
  return [
    `A photorealistic still from a live-action film, ${o.aspect === "9:16" ? "9:16 portrait" : "16:9 landscape"}, natural cinematic lighting, at eye level: the ${o.which === "start" ? "first" : "last"} frame of a short clip.`,
    `The place: ${o.venue}${o.venueDescription ? `, ${o.venueDescription.replace(/\.$/, "")}` : ""}${o.crowd ? `; ${o.crowd.replace(/\.$/, "")}` : ""}. The attached venue pictures show this room: keep its look exactly.`,
    o.when?.trim() ? whenLine(o.when) : "",
    // The user's own positions words win (D167): the panels' place words ("just behind Chase")
    // were drawn literally beside them and put Jade at Chase's shoulder in plain view.
    o.people.length ? `The people, each exactly as in their attached picture (the same face, hair and clothes): ${o.people.map((p) => `${p.name}${p.where && !o.positions?.trim() ? `, ${p.where.replace(/\.$/, "")}` : ""}`).join("; ")}.` : "",
    o.props.length ? `Props, each as in its attached picture where there is one: ${o.props.map((p) => `${p.name}${p.detail ? ` (${p.detail.replace(/;\s*see (?:the )?reference image.*$/i, "")})` : ""}`).join("; ")}.` : "",
    o.positions?.trim() ? `Where everyone is: ${o.positions.trim().replace(/\.$/, "")}.` : "",
    `${o.which === "start" ? "The moment the clip starts" : "The moment the clip ends"}: ${o.moment.trim().replace(/\.$/, "")}.`,
    "Frame it as a film would open on this moment, so everyone who matters is in the picture and where they stand relative to each other is clear.",
    // Facing and hiding as the words say, not posed for the camera (D167): Chase faced the
    // camera with Jade at his shoulder when he was meant to face the bar with his back to her.
    "Everyone faces where the words say, not the camera: someone facing a counter or a wall is seen side-on or from behind, and someone with their back to another person really has their back to them. Choose the camera's side so this is clear. Anyone hidden from someone stands where that person can't see them, with guests' heads and shoulders between them, partly covering them.",
    // Never alone on open floor (Paul, D164): Jade stood by herself in the open, in plain view,
    // where she was meant to be hidden among guests.
    o.crowd ? "Other guests stand around and between the people, as at a busy party: nobody stands alone on open floor, and anyone meant to be hidden or half-hidden has guests between them and whoever mustn't see them." : "",
    o.change?.trim() ? `Change from the last version: ${o.change.trim()}` : "",
    `Exactly one of each person; no guest looks or dresses like any of them. No text, no logos.`,
  ].filter(Boolean).join("\n");
}

/**
 * A clip's storyboard pictures checked before it goes to Kling (D151). Clip 2 went out with three
 * pictures drawn on floor plan 32 and 33 when the plan was on 35: no ice bucket, the old small
 * table, the group in a row. Kept because Paul had approved them earlier (D19e), and nothing on
 * the clips page said so.
 */
export interface ClipPictureIssues {
  /** Drawn on an earlier floor plan: the clip can't be created until they're redrawn (or left out). */
  redraw: { panel: number; why: string }[];
  /** Failed the app's picture check but approved: shown, not blocking. */
  warn: { panel: number; why: string }[];
}

export function pictureIssues(clip: Pick<Clip, "pictures">, panels: { order: number; check?: unknown }[], how: (order: number) => PictureChoice["how"] | undefined, planVersion: number, sameLayout?: (order: number, drawnOnPlan: number) => boolean): ClipPictureIssues {
  const redraw: ClipPictureIssues["redraw"] = [], warn: ClipPictureIssues["warn"] = [];
  for (const x of clip.pictures) {
    // The frame from a kept take is the footage itself, and a version the user picked is theirs.
    if (x.continuity || how(x.panel) !== "storyboard") continue;
    const ck = (panels.find((p) => p.order === x.panel)?.check ?? {}) as { drawnOnPlan?: number; pass?: boolean; problems?: string[] };
    // A later floor plan that changed nothing this panel shows (another panel's camera, D156)
    // leaves its picture current.
    if (ck.drawnOnPlan === undefined || (ck.drawnOnPlan < planVersion && !sameLayout?.(x.panel, ck.drawnOnPlan))) redraw.push({ panel: x.panel, why: `Panel ${x.panel}'s picture was drawn on an earlier floor plan (${ck.drawnOnPlan === undefined ? "an unknown version" : `version ${ck.drawnOnPlan}`}; it's now on ${planVersion}), so people, props or the camera may not match. Redraw it on the storyboard first, or pick "none" for it below.` });
    else if (ck.pass === false) warn.push({ panel: x.panel, why: `Panel ${x.panel}'s picture didn't pass the app's picture check${ck.problems?.[0] ? `: ${ck.problems[0]}` : ""}.` });
  }
  return { redraw, warn };
}

/**
 * What one panel's picture is drawn from in the floor plan (D156): its camera, where everyone
 * stands for it, and the set pieces with their detail. Two plan versions with the same key look
 * the same in that panel.
 */
export function panelLayoutKey(plan: GeometryPlanData, spec: ShotSpec): string {
  const cam = plan.cameras.find((c) => c.id === spec.cameraId);
  const shot = planForShot(plan, spec);
  const r = (n: number | undefined) => (n === undefined ? null : Math.round(n * 100) / 100);
  return JSON.stringify({
    cam: cam ? [r(cam.position.x), r(cam.position.y), r(cam.lookAt.x), r(cam.lookAt.y), r(cam.fovDeg), r(cam.heightM), r(cam.tiltDeg), r(cam.rollDeg)] : null,
    actors: shot.actors.map((a) => [a.characterId, r(a.position.x), r(a.position.y), r((a as { facingDeg?: number }).facingDeg)]),
    furniture: (plan.furniture ?? []).map((f) => [f.id, r(f.position.x), r(f.position.y), r(f.radiusM), r(f.heightM), f.detail ?? ""]),
  });
}

/** The error that stops a clip with out-of-date pictures (D151), or nothing. */
export function outOfDateError(n: number, issues: ClipPictureIssues | undefined): string | null {
  if (!issues?.redraw.length) return null;
  const ps = issues.redraw.map((r) => r.panel);
  return `Clip ${n}: the picture${ps.length > 1 ? "s" : ""} for panel${ps.length > 1 ? "s" : ""} ${ps.join(", ")} ${ps.length > 1 ? "were" : "was"} drawn on an earlier floor plan. Redraw ${ps.length > 1 ? "them" : "it"} on the storyboard first, so Kling gets the people, props and camera as they are now.`;
}

export function buildSceneClips(db: DB, sceneId: string): SceneClipsView | null {
  const s = repo.getScene(db, sceneId);
  if (!s || !s.venue || !s.plan) return null;
  const projectId = s.scene.projectId;
  const project = repo.getProject(db, projectId)!;
  const cast = repo.getCast(db, projectId);
  const plan = withPiecePictures(db, sceneId, s.plan.data);
  // A name typed before the list came in is matched to its Element in the list, ignoring case (D114).
  const listed = klingElementList();
  const elements = Object.fromEntries(Object.entries(studio.getKlingElements(db, projectId)).map(([k, e]) => {
    const hit = listed.elements.find((x) => x.id === e.id) ?? listed.elements.find((x) => x.name.trim().toLowerCase() === e.name.trim().toLowerCase());
    return [k, hit ? { id: hit.id, name: hit.name, ...(e.voiceAssetId ? { voiceAssetId: e.voiceAssetId } : {}) } : e];
  }));
  // A character dressed differently in this scene (D174) uses that look's Element in its clips.
  const looks = studio.getSceneLooks(db, sceneId);
  for (const slug of Object.keys(looks)) {
    const own = elements[elementKey.look(slug, sceneId)];
    if (own) elements[elementKey.character(slug)] = own; else delete elements[elementKey.character(slug)];
  }
  // The same looks with coats and bags off (D179), used unless what happens has them wearing them.
  const coatOff = Object.fromEntries(Object.keys(looks).flatMap((slug) => { const e = elements[elementKey.lookOff(slug, sceneId)]; return e?.id ? [[slug, e]] : []; }));
  // The venue all the way round (D178): the same wall pictures its Element is made from.
  const walls = venueWalls(s.venue);
  // Each panel's picture for Kling (D123): the storyboard's unless another version or none is picked.
  const picked = ((s.scene.staging ?? {}) as { clipPictures?: Record<string, string> }).clipPictures ?? {};
  const panelAssets = repo.listAssets(db, projectId, "panel");
  const sorted = [...s.panels].sort((a, b) => a.order - b.order);
  const pictures: PictureChoice[] = sorted.map((p) => {
    // The panel's versions share its picture's code up to "_v": POT_EP01_S02_P11_PANEL_v29.png.
    const own = panelAssets.find((a) => a.id === p.imageAssetId);
    const prefix = own ? own.assetCode.replace(/_v\d+(\.\w+)?$/, "_v") : `${project.code}_`;
    const versions = (own ? panelAssets.filter((a) => a.assetCode.startsWith(prefix) && new RegExp(`^${p.code}_PANEL_v`).test(a.assetCode.slice(a.assetCode.indexOf(`${p.code}_PANEL_v`)))) : [])
      .sort((a, b) => b.assetCode.localeCompare(a.assetCode, undefined, { numeric: true })).slice(0, 8);
    const options = versions.map((a) => ({ assetId: a.id, label: `Version ${a.assetCode.slice(prefix.length).replace(/\.\w+$/, "")}${a.id === p.imageAssetId ? " (on the storyboard)" : ""}` }));
    const want = picked[p.id];
    if (want === "none") return { panelId: p.id, order: p.order, how: "none", options };
    if (want && versions.some((a) => a.id === want) && want !== p.imageAssetId) return { panelId: p.id, order: p.order, chosen: want, how: "own", options };
    return { panelId: p.id, order: p.order, chosen: p.imageAssetId ?? undefined, how: "storyboard", options };
  });
  const panels: ClipPanel[] = sorted.flatMap((p) => {
    const shot = s.shots.find((x) => x.panelId === p.id);
    return shot ? [{ order: p.order, durationSec: p.durationSec, description: p.description, emotion: p.emotion, dialogue: (p.dialogue ?? []) as ClipPanel["dialogue"], spec: shot.spec, imageAssetId: pictures.find((x) => x.panelId === p.id)?.chosen }] : [];
  });
  const crowd = (s.scene.staging as { crowd?: string } | null)?.crowd;
  const kept = studio.getKeptTakes(db, sceneId);
  // Start and end frames (D164): Kling chooses the shots from them.
  const frames = studio.getClipFrames(db, sceneId);
  const positionsNote = studio.getPositionsNote(db, sceneId);
  const when = studio.getSceneWhen(db, sceneId);
  const clips = sceneClips({ panels, cast, plan, venue: { id: s.venue.id, name: s.venue.name }, crowd, elements, kept: kept.map((k) => ({ from: k.from, to: k.to, frameAssetId: k.frameAssetId })), frames, positionsNote, when, coatOff, walls });
  const held = [...new Set(panels.flatMap((p) => (p.spec.props ?? []).map((x) => x.name)))];
  const pieces = (plan.furniture ?? []).filter(isSetPiece).map((f) => f.name);
  const rows = [
    // Only this scene's people (D159): Gary and Samantha, in the project but not the scene, showed
    // as "2 missing Elements" to make.
    ...cast.filter((c) => !plan.actors?.length || plan.actors.some((a) => a.characterId === c.id)).flatMap((c) => (looks[c.id] ? [{ key: elementKey.look(c.id, sceneId), what: `${c.name} (this scene's clothes)`, kind: "Character" }, ...(looks[c.id].off?.front ? [{ key: elementKey.lookOff(c.id, sceneId), what: `${c.name} (this scene, coat off)`, kind: "Character" }] : [])] : [{ key: elementKey.character(c.id), what: c.name, kind: "Character" }])),
    { key: elementKey.venue(s.venue.id), what: s.venue.name, kind: "Venue" },
    ...[...new Set([...pieces, ...held])].map((n) => ({ key: elementKey.prop(n), what: n, kind: "Prop" })),
  ].map((r) => ({ ...r, element: elements[r.key] ?? studio.getKlingElements(db, projectId)[r.key], ...(r.kind === "Character" ? { voice: elements[elementKey.voice(r.key.slice(5).split("@")[0])] } : {}) }));
  const planAt = new Map<number, GeometryPlanData | null>();
  const dataAt = (v: number) => {
    if (!planAt.has(v)) planAt.set(v, (db.select().from(t.plans).where(and(eq(t.plans.sceneId, sceneId), eq(t.plans.version, v))).get()?.data as GeometryPlanData | undefined) ?? null);
    return planAt.get(v)!;
  };
  const sameLayout = (order: number, drawn: number) => {
    const p = sorted.find((x) => x.order === order);
    const spec = s.shots.find((x) => x.panelId === p?.id)?.spec;
    const then = dataAt(drawn);
    return !!(spec && then && panelLayoutKey(then, spec) === panelLayoutKey(s.plan!.data, spec));
  };
  const issues = clips.map((c) => pictureIssues(c, sorted, (o) => pictures.find((x) => x.order === o)?.how, s.plan!.version, sameLayout));
  // The pictures a frame is drawn from: the people's own, the props', and the venue's views.
  const profiles = studio.getApprovedProfiles(db, projectId);
  const venueViews = ((s.venue.views ?? []) as { name: string; imageAssetId?: string }[]).filter((v) => v.imageAssetId).map((v) => v.imageAssetId!);
  const propPics = (plan.furniture ?? []).filter((f) => f.imageAssetId).map((f) => ({ name: f.name, detail: f.detail, assetId: f.imageAssetId! }));
  const staged = ((s.scene.staging ?? {}) as { props?: { name: string; detail?: string; imageAssetId?: string }[] }).props ?? [];
  const nameOf = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const frameRequests = clips.map((c) => {
    const ps = c.panels.map((o) => panels.find((p) => p.order === o)!).filter(Boolean);
    const who = [...new Set(ps.flatMap((p) => [...p.spec.visibleIds, ...p.dialogue.map((d) => d.characterId)]))].filter((id) => !plan.actors?.length || plan.actors.some((a) => a.characterId === id));
    // Coat off unless what happens has them wearing it (D179), as in the clip.
    const wearing = WEARS_OUTER.test(ps.map((p) => p.description).join(" "));
    const refsOf = (id: string) => { if (!wearing && looks[id]?.off?.front) return [looks[id].off!.front!]; const r = looks[id]?.refs?.front ? looks[id].refs! : profiles[id]?.refs ?? {}; return [r.front ?? r.face ?? r.back].filter(Boolean) as string[]; };
    const props = [...propPics.map((x) => ({ name: x.name, detail: x.detail })), ...staged.filter((x) => !propPics.some((y) => y.name === x.name)).map((x) => ({ name: x.name, detail: x.detail }))];
    const refAssetIds = [...who.flatMap(refsOf), ...propPics.map((x) => x.assetId), ...staged.flatMap((x) => (x.imageAssetId ? [x.imageAssetId] : [])), ...venueViews].slice(0, 14);
    const make = (which: "start" | "end", p: ClipPanel) => ({
      baseCode: `${project.code}_${(s.scene.title ?? "SCENE").replace(/[^A-Za-z0-9]+/g, "").slice(0, 12).toUpperCase()}_CLIP${clipKey(c.panels)}_${which.toUpperCase()}`,
      refAssetIds,
      prompt: framePrompt({ which, when, positions: positionsNote, venue: s.venue!.name, venueDescription: s.venue!.description ?? undefined, crowd, aspect: studio.projectAspect(db, projectId), people: who.map((id) => ({ name: nameOf(id), where: (p.spec.where ?? {})[id] })), props, moment: `${p.description}${p.dialogue[0] ? ` (${nameOf(p.dialogue[0].characterId).split(/\s+/)[0]} is about to say: "${p.dialogue[0].text}")` : ""}` }),
    });
    return { start: make("start", ps[0]), end: make("end", ps[ps.length - 1]) };
  });
  const editors: SceneClipsView["editors"] = Object.fromEntries(sorted.map((p, k) => { const d = (p.dialogue ?? [])[0] as { characterId: string; text: string; delivery?: string } | undefined; return [p.order, { first: k === 0, last: k === sorted.length - 1, delivery: d?.delivery, panel: { id: p.id, code: p.code, description: p.description, emotion: p.emotion ?? "", speakerId: d?.characterId, line: d?.text, durationSec: p.durationSec, status: p.status, version: p.version, hasImage: !!p.imageAssetId } }]; }));
  // The plan as the scene starts: everyone where the first panel puts them.
  const firstShot = sorted[0] ? s.shots.findIndex((x) => x.panelId === sorted[0].id) : -1;
  const startPlan = firstShot >= 0 ? planForShot(plan, carryBlocking(s.shots)[firstShot]) : plan;
  const positions = { plan: startPlan, names: Object.fromEntries(cast.map((c) => [c.id, c.name])), note: positionsNote, approved: !!studio.sceneLocks(db, sceneId).positions };
  // Each person's clothes in this scene (D174), with the pictures to make a new look from.
  const people = cast.filter((c) => !plan.actors?.length || plan.actors.some((a) => a.characterId === c.id)).map((c) => {
    const p = profiles[c.id] as { wardrobe?: string; refs?: Record<string, string> } | undefined;
    return { slug: c.id, name: c.name, usual: p?.wardrobe ?? "", base: { front: p?.refs?.front, face: p?.refs?.face }, look: looks[c.id] };
  });
  return { when, people, positions, frameRequests, editors, issues, clips, rows, listed, pictures, aspect: studio.projectAspect(db, projectId), sceneTitle: s.scene.title ?? "Scene", kept, allPanels: sorted.map((p) => ({ order: p.order, description: p.description })) };
}
