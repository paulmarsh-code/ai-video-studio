// Server side of the picture check (D19): build what the approved layout says the picture must
// show, send the picture, the layout sketch and the character references to the vision model,
// and judge the answer by rule.

import fs from "node:fs";
import type { DB } from "@/db/client";
import { mainSubjectId } from "./domain/composer";
import { readCamera, readProps } from "./domain/geometry";
import { checkPrompt, judgePicture, type PictureCheck, type PictureExpectation } from "./domain/pictureCheck";
import { crowdLevelOf } from "./domain/story";
import { renderLayoutForShot } from "./layoutImage";
import { getTextProvider } from "./providers/images";
import * as repo from "./repo";
import * as studio from "./studioRepo";

/** Who the approved camera shows, left to right, and which key props. */
export function expectationFor(db: DB, shotId: string): { expect: PictureExpectation; ids: string[]; projectId: string } | null {
  const shot = repo.getShot(db, shotId);
  if (!shot?.spec.cameraId) return null;
  const scene = repo.getScene(db, shot.sceneId);
  const plan = scene?.plan?.data;
  const cam = plan?.cameras.find((c) => c.id === shot.spec.cameraId);
  if (!scene || !plan || !cam) return null;
  const cast = repo.getCast(db, scene.scene.projectId);
  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const reading = readCamera(plan, cam);
  const subject = mainSubjectId(shot.spec);
  const closeUp = (cam.preset === "single-cu" || cam.preset === "insert") && !!subject;
  const shown = closeUp ? [subject!] : shot.spec.visibleIds;
  const ids = reading.actors
    .filter((a) => a.inView && (shown.includes(a.characterId) || (!closeUp && shot.spec.presentIds.includes(a.characterId) && !shot.spec.excludedIds.includes(a.characterId))))
    // The over-the-shoulder foreground figure is seen from behind: hard to name, so not checked.
    .filter((a) => !(a.foreground && (cam.preset === "main-ots" || cam.preset === "reverse-ots") && a.characterId !== subject))
    .sort((a, b) => a.angleDeg - b.angleDeg)
    .map((a) => a.characterId);
  return {
    ids, projectId: scene.scene.projectId,
    expect: { order: ids.map(name), props: readProps(plan, cam).filter((p) => p.inView).map((p) => p.name), crowd: crowdLevelOf(shot.spec.crowd ?? "") },
  };
}

export async function checkPanelPicture(db: DB, panelId: string, assetId: string): Promise<PictureCheck | null> {
  const text = getTextProvider();
  if (!text) return null;
  const panelShot = studio.shotIdForPanel(db, panelId);
  if (!panelShot) return null;
  const e = expectationFor(db, panelShot);
  if (!e) return null;
  const pic = repo.getAsset(db, assetId);
  if (!pic || !fs.existsSync(pic.path)) return null;
  const layout = await renderLayoutForShot(db, panelShot);
  const profiles = studio.getApprovedProfiles(db, e.projectId);
  const refs = e.ids.map((id) => ({ id, asset: profiles[id]?.refs?.front ? repo.getAsset(db, profiles[id].refs!.front!) : undefined }))
    .filter((r) => r.asset && fs.existsSync(r.asset.path));
  const cast = repo.getCast(db, e.projectId);
  const images = [
    { data: fs.readFileSync(pic.path), mime: pic.mime },
    ...(layout ? [{ data: Buffer.from(layout), mime: "image/png" }] : []),
    ...refs.map((r) => ({ data: fs.readFileSync(r.asset!.path), mime: r.asset!.mime })),
  ];
  const reply = await text.describe(checkPrompt(e.expect, refs.map((r) => cast.find((c) => c.id === r.id)?.name ?? r.id)), images);
  const result = judgePicture(e.expect, reply);
  studio.setPanelCheck(db, panelId, result);
  return result;
}
