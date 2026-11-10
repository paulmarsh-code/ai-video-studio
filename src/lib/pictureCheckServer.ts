// Server side of the picture check (D19): build what the approved layout says the picture must
// show, send the picture, the layout sketch and the character references to the vision model,
// and judge the answer by rule.

import fs from "node:fs";
import type { DB } from "@/db/client";
import { mainSubjectId } from "./domain/composer";
import { planForShot, readCamera, readProps } from "./domain/geometry";
import { ringSectors, viewSlice, viewsInSlice } from "./domain/panorama";
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
  const fullPlan = scene?.plan?.data;
  const plan = fullPlan ? planForShot(fullPlan, shot.spec) : undefined;
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
    // Only partly in the frame (D31): may or may not show, so allowed but not required.
    .filter((a) => !a.partial)
    .sort((a, b) => a.angleDeg - b.angleDeg)
    .map((a) => a.characterId);
  return {
    ids, projectId: scene.scene.projectId,
    expect: {
      order: ids.map(name), props: readProps(plan, cam).filter((p) => p.inView).map((p) => p.name), crowd: crowdLevelOf(shot.spec.crowd ?? ""),
      shoulder: reading.actors.filter((a) => a.inView && a.foreground && (cam.preset === "main-ots" || cam.preset === "reverse-ots") && a.characterId !== subject).map((a) => name(a.characterId)),
      edge: reading.actors.filter((a) => a.inView && a.partial && !shot.spec.excludedIds.includes(a.characterId)).map((a) => name(a.characterId)),
      // Where each prop must be (D21): side of frame, and depth against the people in view.
      propPlaces: (() => {
        const depths = reading.actors.filter((a) => a.inView && !a.foreground).map((a) => a.depthM);
        const far = depths.length ? Math.max(...depths) : undefined, near = depths.length ? Math.min(...depths) : undefined;
        return readProps(plan, cam).filter((p) => p.inView).map((p) => ({
          name: p.name,
          side: p.frame === "frame-left" ? "left" as const : p.frame === "frame-right" ? "right" as const : "centre" as const,
          depth: far !== undefined && p.depthM > far + 1 ? "behind everyone" as const : near !== undefined && p.depthM < near - 0.5 ? "in front of everyone" as const : "among the people" as const,
        }));
      })(),
      propPictures: (plan.furniture ?? []).filter((f) => f.imageAssetId).map((f) => f.name),
      // The room's order behind them (D21), from the 360° ring.
      backgroundSides: (() => {
        if (plan.views.length < 2) return undefined;
        const seen = viewsInSlice(ringSectors(plan.views), viewSlice(plan, cam)).filter((x) => x.share >= 0.08);
        return seen.length >= 2 ? { left: seen[0].name, right: seen[seen.length - 1].name } : undefined;
      })(),
      venueAreas: plan.views.map((v) => v.name),
    },
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
  const cast = repo.getCast(db, e.projectId);
  const nameOf = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  // Front and back of each character (D21), so clothes are checked from either side; then each
  // prop's picture.
  const refs: { label: string; asset: ReturnType<typeof repo.getAsset> }[] = [];
  for (const id of e.ids) {
    const r = profiles[id]?.refs;
    if (r?.front) refs.push({ label: `${nameOf(id)} (front)`, asset: repo.getAsset(db, r.front) });
    if (r?.back) refs.push({ label: `${nameOf(id)} (back)`, asset: repo.getAsset(db, r.back) });
  }
  const scene = repo.getScene(db, repo.getShot(db, panelShot)!.sceneId);
  for (const f of scene?.plan?.data.furniture ?? []) {
    if (f.imageAssetId && e.expect.props.includes(f.name)) refs.push({ label: `the ${f.name} (prop)`, asset: repo.getAsset(db, f.imageAssetId) });
  }
  const usable = refs.filter((r) => r.asset && fs.existsSync(r.asset.path));
  const images = [
    { data: fs.readFileSync(pic.path), mime: pic.mime },
    ...(layout ? [{ data: Buffer.from(layout), mime: "image/png" }] : []),
    ...usable.map((r) => ({ data: fs.readFileSync(r.asset!.path), mime: r.asset!.mime })),
  ];
  const reply = await text.describe(checkPrompt(e.expect, usable.map((r) => r.label)), images);
  const result = judgePicture(e.expect, reply);
  studio.setPanelCheck(db, panelId, result);
  return result;
}
