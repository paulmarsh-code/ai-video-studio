// A scene's clips as the clips page shows them and as they are sent to Kling (D113, D123): one
// place, so what Paul sees is exactly what is sent.

import type { DB } from "@/db/client";
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
  rows: { key: string; what: string; kind: string; element?: { id: string; name: string } }[];
  listed: { elements: KlingListed[]; updatedAt?: string };
  pictures: PictureChoice[];
  aspect: "9:16" | "16:9";
  sceneTitle: string;
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
  const clips = sceneClips({ panels, cast, plan, venue: { id: s.venue.id, name: s.venue.name }, crowd, elements });
  const held = [...new Set(panels.flatMap((p) => (p.spec.props ?? []).map((x) => x.name)))];
  const pieces = (plan.furniture ?? []).filter(isSetPiece).map((f) => f.name);
  const rows = [
    ...cast.map((c) => ({ key: elementKey.character(c.id), what: c.name, kind: "Character" })),
    { key: elementKey.venue(s.venue.id), what: s.venue.name, kind: "Venue" },
    ...[...new Set([...pieces, ...held])].map((n) => ({ key: elementKey.prop(n), what: n, kind: "Prop" })),
  ].map((r) => ({ ...r, element: elements[r.key] }));
  return { clips, rows, listed, pictures, aspect: studio.projectAspect(db, projectId), sceneTitle: s.scene.title ?? "Scene" };
}
