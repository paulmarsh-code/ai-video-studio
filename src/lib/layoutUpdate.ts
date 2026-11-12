// Choosing the cameras and bringing a layout up to date (D19c, D83), for the actions and for the
// storyboard page, which updates an out-of-date layout by itself when nothing is approved yet.

import type { DB } from "@/db/client";
import * as studio from "./studioRepo";

export async function chooseCameras(db: DB, sceneId: string) {
  {
    const repo = await import("@/lib/repo");
    const { designScene, applyDesign } = await import("@/lib/domain/director");
    const s = repo.getScene(db, sceneId);
    if (!s?.plan) throw new Error("This scene has no floor plan yet. Save the storyboard first.");
    const locks = studio.sceneLocks(db, sceneId);
    if (!locks.positions) throw new Error("Approve the positions first: the cameras are chosen from them.");
    if (locks.cameras) throw new Error("The cameras are approved and locked. Unlock them to choose again.");
    const cast = repo.getCast(db, s.scene.projectId);
    const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
    const raw = s.shots.map((sh) => ({ id: sh.id, code: sh.code, spec: sh.spec, description: s.panels.find((p) => p.id === sh.panelId)?.description }));
    // Suggested shots (D28): every panel the user hasn't chosen a shot for gets the app's
    // suggestion, saved on the shot so the board shows it and the camera follows it.
    const { suggestShots } = await import("@/lib/domain/shotSuggest");
    const sug = suggestShots(raw, name);
    const inputs = raw.map((x, k) => {
      if (x.spec.shotBy === "you") return x;
      const spec = { ...x.spec, shot: sug[k].shot || undefined, shotBy: "app" as const };
      repo.saveShotSpec(db, x.id, spec);
      return { ...x, spec };
    });
    // Lens angles depend on the video's shape (D19).
    const base = { ...s.plan.data, aspect: s.plan.data.aspect ?? studio.projectAspect(db, s.scene.projectId) };
    const design = designScene(base, inputs, name, repo.getProjectGenre(db, s.scene.projectId));
    const choices = design.shots.filter((d) => d.options.length).map((d) => ({ shotId: d.shotId, shotCode: d.shotCode, option: d.options[0] }));
    if (!choices.length) throw new Error("The app couldn't find a camera for any panel. Check who is in frame on each panel.");
    const { plan, assign } = applyDesign(base, choices, design.lineOfAction);
    // A floor plan the user edited keeps that name, so a later setting change never rebuilds it.
    repo.savePlan(db, sceneId, plan, s.plan.name === "Floor plan edited by you" ? s.plan.name : "Cameras chosen by the app");
    for (const ch of choices) {
      const shot = repo.getShot(db, ch.shotId);
      if (shot) repo.saveShotSpec(db, ch.shotId, { ...shot.spec, cameraId: assign[ch.shotId] });
    }
    return { chosen: choices.length, missing: design.shots.filter((d) => !d.options.length).map((d) => d.shotCode.split("_").pop()) };
  }
}


/**
 * Bring a layout made under older rules up to date (D19c, D82, D83): areas from the setting,
 * positions approved again where they are, each panel's places read again from its words, and
 * the cameras chosen again. Cameras are left unlocked to check and approve.
 */
export async function updateLayout(db: DB, sceneId: string) {
  studio.unlockScene(db, sceneId, "cameras");
  studio.unlockScene(db, sceneId, "positions");
  studio.syncRoom(db, sceneId);
  studio.syncAreas(db, sceneId);
  studio.approvePositions(db, sceneId);
  return chooseCameras(db, sceneId);
}
