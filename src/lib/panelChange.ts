// One place to change a panel, in words (D135). "Two-shot of Jade and Chase", "closer on Chase",
// "move Nina to the left of Marcus": the words move the people and the camera for this panel
// only, with no unlocking and no floor plan; every other panel, camera and picture stays as it is.
// The storyboard then redraws the picture from the new layout.

import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import * as repo from "./repo";
import * as studio from "./studioRepo";
import { changeFromWords } from "./domain/changeWords";
import { carryBlocking } from "./domain/blocking";
import { designScene } from "./domain/director";
import { planForShot } from "./domain/geometry";
import { namedShot } from "./domain/shotLanguage";

export interface PanelChangeResult {
  /** Whether people or the camera moved, so the picture is drawn again from the layout. */
  layout: boolean;
  /** What the app did, one line each. */
  done: string[];
  /** Parts of the words that moved nothing (they still go to the picture as an instruction). */
  unclear: string[];
}

/** Words that are about the camera: a named shot, a size, or nearer and further. */
const CAMERA_WORDS = /\b(?:closer|nearer|further|farther|wider|tighter|zoom(?:ed)?\s+(?:in|out)|pull\s+back|push\s+in|camera|angle|from\s+(?:behind|the\s+side|above|below|the\s+front))\b/i;

export function changePanel(db: DB, panelId: string, words: string): PanelChangeResult {
  const text = words.trim();
  if (!text) throw new Error("Say what should change.");
  const sceneOf = () => {
    const panel = db.select().from(t.panels).where(eq(t.panels.id, panelId)).get();
    if (!panel) throw new Error("That panel wasn't found.");
    const s = repo.getScene(db, panel.sceneId);
    if (!s?.plan) throw new Error("This scene has no floor plan yet.");
    const shot = s.shots.find((x) => x.panelId === panelId);
    if (!shot) throw new Error("This panel has no shot yet. Save the storyboard first.");
    return { s, panel, shot };
  };
  let { s, panel, shot } = sceneOf();
  const cast = repo.getCast(db, s.scene.projectId);
  const people = cast.map((c) => ({ id: c.id, name: c.name }));
  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const done: string[] = [];

  // 1. People: who stands where, faces which way, sits or walks off (D39's reader).
  const carried = carryBlocking(s.shots);
  const k = s.shots.findIndex((x) => x.id === shot.id);
  const sp0 = planForShot(s.plan!.data, carried[k]);
  const cam0 = sp0.cameras.find((c) => c.id === shot.spec.cameraId);
  const read = changeFromWords(text, sp0, cam0, people);
  const moved = Object.keys(read.entries).length > 0;
  if (moved) {
    studio.savePanelBlocking(db, [{ shotId: shot.id, entries: read.entries }]);
    done.push(...read.understood);
    ({ s, panel, shot } = sceneOf());
  }

  // 2. The camera: placed again by the app when the words name a shot or a camera change, or
  // people moved. The words lead, so a shot they name is the one built (D27, D134).
  const n = namedShot(text);
  const aboutCamera = !!(n.framing || n.size || CAMERA_WORDS.test(text));
  let placed = false;
  // A panel with no camera yet gets one from any change (D156).
  if (aboutCamera || moved || !shot.spec.cameraId) {
    const base = { ...s.plan!.data, aspect: s.plan!.data.aspect ?? studio.projectAspect(db, s.scene.projectId) };
    const inputs = s.shots.map((x) => ({ id: x.id, code: x.code, spec: x.spec, description: x.id === shot.id ? `${text}. ${panel.description ?? ""}` : s.panels.find((p) => p.id === x.panelId)?.description }));
    const design = designScene(base, inputs, name, repo.getProjectGenre(db, s.scene.projectId));
    const o = design.shots.find((d) => d.shotId === shot.id)?.options[0];
    const cur = s.plan!.data.cameras.find((c) => c.id === shot.spec.cameraId);
    const same = o && cur && Math.hypot(o.camera.position.x - cur.position.x, o.camera.position.y - cur.position.y) < 0.15
      && Math.hypot(o.camera.lookAt.x - cur.lookAt.x, o.camera.lookAt.y - cur.lookAt.y) < 0.15 && (o.camera.fovDeg ?? 0) === (cur.fovDeg ?? 0);
    if (o && !same) {
      const { position, lookAt, preset, fovDeg, heightM, tiltDeg, rollDeg, size } = o.camera;
      studio.savePanelBlocking(db, [{ shotId: shot.id, entries: {}, camera: { position, lookAt, preset, fovDeg, heightM, tiltDeg, rollDeg, size, name: o.kind } }]);
      done.push(`Camera: ${o.kind}`);
      placed = true;
    } else if (o && same && aboutCamera) {
      done.push(`The camera is already that: ${o.kind}`);
    } else if (aboutCamera && !o) {
      read.unclear.push("the app couldn't find a camera for that from where everyone stands");
    }
  }

  // What the words said but moved nothing: kept for the picture itself. The words that named the
  // shot were used for the camera, so they aren't passed on as well.
  const shotClauses = placed ? text.split(/[.;:\n]+/).filter((c) => { const m = namedShot(c); return !!(m.framing || m.size || CAMERA_WORDS.test(c)); }) : [];
  const rest = read.unclear.filter((u) => !shotClauses.some((c) => c.includes(u.trim())));
  const already = done.some((d) => d.startsWith("The camera is already"));
  const unclear = moved || placed || already ? rest : rest.length ? rest : [text];
  return { layout: moved || placed, done, unclear };
}

/**
 * A panel added after the floor plan gets its camera straight away (D156). Panel 13 ("Back on
 * Chase and the group…") came up with "no camera yet" and no way to draw it, and the user was
 * told to go and run Design shots on the floor plan. The app places it here, the way a change in
 * words does, from what happens in the panel. Every other panel and camera stays as it is.
 * Returns the camera's kind, or null when the scene has no floor plan or nothing fits.
 */
export function placeNewPanelCamera(db: DB, panelId: string): string | null {
  const panel = db.select().from(t.panels).where(eq(t.panels.id, panelId)).get();
  if (!panel) return null;
  const s = repo.getScene(db, panel.sceneId);
  if (!s?.plan) return null;
  const shot = s.shots.find((x) => x.panelId === panelId);
  if (!shot || shot.spec.cameraId) return null;
  const cast = repo.getCast(db, s.scene.projectId);
  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const base = { ...s.plan.data, aspect: s.plan.data.aspect ?? studio.projectAspect(db, s.scene.projectId) };
  const inputs = s.shots.map((x) => ({ id: x.id, code: x.code, spec: x.spec, description: s.panels.find((p) => p.id === x.panelId)?.description }));
  const design = designScene(base, inputs, name, repo.getProjectGenre(db, s.scene.projectId));
  const o = design.shots.find((d) => d.shotId === shot.id)?.options[0];
  if (!o) return null;
  const { position, lookAt, preset, fovDeg, heightM, tiltDeg, rollDeg, size } = o.camera;
  studio.savePanelBlocking(db, [{ shotId: shot.id, entries: {}, camera: { position, lookAt, preset, fovDeg, heightM, tiltDeg, rollDeg, size, name: o.kind } }]);
  return o.kind;
}
