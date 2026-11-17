// A scene's clips as the clips page shows them and as they are sent to Kling (D113, D123): one
// place, so what Paul sees is exactly what is sent.

import type { DB } from "@/db/client";
import { and, eq } from "drizzle-orm";
import * as t from "@/db/schema";
import { planForShot } from "./domain/geometry";
import type { GeometryPlanData, ShotSpec } from "./domain/types";
import * as repo from "./repo";
import * as studio from "./studioRepo";
import { elementKey, sceneClips, type Clip, type ClipPanel } from "./domain/clips";
import { isSetPiece } from "./domain/setRender";
import { withPiecePictures } from "./setImage";
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
    return [k, hit ? { id: hit.id, name: hit.name } : e];
  }));
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
  const clips = sceneClips({ panels, cast, plan, venue: { id: s.venue.id, name: s.venue.name }, crowd, elements, kept: kept.map((k) => ({ from: k.from, to: k.to, frameAssetId: k.frameAssetId })) });
  const held = [...new Set(panels.flatMap((p) => (p.spec.props ?? []).map((x) => x.name)))];
  const pieces = (plan.furniture ?? []).filter(isSetPiece).map((f) => f.name);
  const rows = [
    ...cast.map((c) => ({ key: elementKey.character(c.id), what: c.name, kind: "Character" })),
    { key: elementKey.venue(s.venue.id), what: s.venue.name, kind: "Venue" },
    ...[...new Set([...pieces, ...held])].map((n) => ({ key: elementKey.prop(n), what: n, kind: "Prop" })),
  ].map((r) => ({ ...r, element: elements[r.key], ...(r.kind === "Character" ? { voice: elements[elementKey.voice(r.key.slice(5))] } : {}) }));
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
  return { issues, clips, rows, listed, pictures, aspect: studio.projectAspect(db, projectId), sceneTitle: s.scene.title ?? "Scene", kept, allPanels: sorted.map((p) => ({ order: p.order, description: p.description })) };
}
