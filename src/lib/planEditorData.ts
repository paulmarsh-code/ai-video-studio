// Everything the floor plan editor needs for a scene: used by the floor plan page and by the
// storyboard's "Need to change something?" planner (D39).

import type { DB } from "@/db/client";
import * as repo from "./repo";
import { sceneLocks } from "./studioRepo";
import { ringForScene } from "./backgroundImage";
import { startPose } from "./domain/panelWords";
import { asStaging } from "./domain/story";

export async function planEditorProps(db: DB, sceneId: string) {
  const s = repo.getScene(db, sceneId);
  if (!s || !s.plan) return null;
  const projectId = s.scene.projectId;
  const approved = repo.shotsWithApprovedTakes(db, sceneId);
  const locks = sceneLocks(db, sceneId);
  const r = await ringForScene(db, sceneId);
  return {
    sceneId,
    planName: s.plan.name,
    venueName: s.venue?.name,
    initial: s.plan.data,
    version: s.plan.version,
    cast: repo.getCast(db, projectId),
    shots: s.shots.map((sh) => ({ id: sh.id, code: sh.code, spec: sh.spec, approved: approved.has(sh.id) })),
    ring: r ? { url: `/api/venue-ring/${sceneId}`, startDeg: r.startDeg, width: r.width, height: r.height, pxPerDeg: r.pxPerDeg, previewHeight: 300 } : undefined,
    roomHref: s.scene.venueId ? `/projects/${projectId}/venues/${s.scene.venueId}` : undefined,
    panels: s.panels.flatMap((p) => { const sh = s.shots.find((x) => x.panelId === p.id); return sh ? [{ shotId: sh.id, code: p.code, description: p.description }] : []; }),
    locks: { positions: !!locks.positions, cameras: !!locks.cameras },
    scenePose: startPose(asStaging(s.scene.staging).spot, s.plan.data),
    genre: repo.getProjectGenre(db, projectId),
  };
}

export type PlanEditorData = NonNullable<Awaited<ReturnType<typeof planEditorProps>>>;
