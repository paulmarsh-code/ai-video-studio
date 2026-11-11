// Server side of the picture check (D19): build what the approved layout says the picture must
// show, send the picture, the layout sketch and the character references to the vision model,
// and judge the answer by rule.

import fs from "node:fs";
import sharp from "sharp";
import type { DB } from "@/db/client";
import { mainSubjectId } from "./domain/composer";
import { facingOf, pictureXY, planForShot, readCamera, readProps } from "./domain/geometry";
import { ringSectors, viewSlice, viewsInSlice } from "./domain/panorama";
import { checkPrompt, judgePicture, type Figure, type PictureCheck, type PictureExpectation } from "./domain/pictureCheck";
import { crowdLevelOf } from "./domain/story";
import { renderLayoutForShot } from "./layoutImage";
import { renderBlockingForShot } from "./blockingImage";
import { carriedItems, heldProps, itemNoun } from "./domain/imagePrompts";
import { getTextProvider } from "./providers/images";
import * as repo from "./repo";
import * as studio from "./studioRepo";
import { recordCheck, testMode } from "./testRecords";

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
  // Held items and the side of the picture they belong on (D34), for people facing us or with
  // their back to us: the same rule the blocking frame and the prompt use.
  const profiles = studio.getApprovedProfiles(db, scene.scene.projectId);
  const held = ids.flatMap((id) => {
    const pos = plan.actors.find((x) => x.characterId === id)?.position;
    const fwd = facingOf(plan, id, plan.lineOfAction);
    if (!pos || !fwd) return [];
    const vx = cam.position.x - pos.x, vy = cam.position.y - pos.y, l = Math.hypot(vx, vy) || 1;
    const c = (fwd.x * vx + fwd.y * vy) / l;
    if (c <= 0.5 && c >= -0.35) return []; // side-on: either side can show
    return [...carriedItems(profiles[id]), ...heldProps(plan, id, profiles[id])].filter((it) => /^(hand|shoulder|arm)$/.test(it.where)).map((it) => ({
      name: name(id), item: itemNoun(it.what), side: (c > 0.5 ? (it.side === "left" ? "right" : "left") : it.side) as "left" | "right",
    }));
  });
  // Where each of them should be in the picture (B1): the same projection as the blocking frame.
  // Head height by posture; someone lying down has no head-to-feet height to measure.
  const HEAD: Record<string, number> = { standing: 1.72, sitting: 1.3, kneeling: 1.25, crouching: 1.0 };
  const figures: Figure[] = ids.flatMap((id) => {
    const a = plan.actors.find((x) => x.characterId === id);
    const pose = shot.spec.posture?.[id]?.pose ?? a?.pose ?? "standing";
    if (!a || !(pose in HEAD)) return [];
    const head = pictureXY(plan, cam, a.position, HEAD[pose]), feet = pictureXY(plan, cam, a.position, 0), mid = pictureXY(plan, cam, a.position, 0.9);
    if (!head || !feet || !mid) return [];
    return [{ name: name(id), x: +mid.x.toFixed(3), headY: +head.y.toFixed(3), feetY: +feet.y.toFixed(3), standing: pose === "standing" }];
  });
  return {
    ids, projectId: scene.scene.projectId,
    expect: {
      held,
      figures,
      // Posture (D37): anyone not simply standing, or who has just got up.
      postures: ids.flatMap((id) => { const pe = shot.spec.posture?.[id]; return pe && (pe.pose !== "standing" || pe.from) ? [{ name: name(id), pose: pe.pose, ...(pe.on ? { on: pe.on } : {}) }] : []; }),
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

/** A copy of the picture with a numbered measuring grid (D50): lines every 5% down and every 10% across. */
export async function withGrid(picture: Buffer): Promise<Buffer> {
  const meta = await sharp(picture).metadata();
  const W = meta.width ?? 1024, H = meta.height ?? 1536;
  const fs0 = Math.round(Math.min(W, H) / 45);
  const parts: string[] = [];
  for (let k = 1; k < 20; k++) {
    const y = Math.round((H * k) / 20), major = k % 2 === 0;
    parts.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${major ? "#00ffff" : "#ffff00"}" stroke-opacity="0.75" stroke-width="${major ? 2 : 1}"/>`);
    const label = (k / 20).toFixed(2);
    for (const x of [4, W - fs0 * 2.6]) parts.push(`<text x="${x}" y="${y - 3}" font-family="sans-serif" font-size="${fs0}" font-weight="bold" fill="#ffff00" stroke="#000" stroke-width="0.6">${label}</text>`);
  }
  for (let k = 1; k < 10; k++) {
    const x = Math.round((W * k) / 10);
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#ff00ff" stroke-opacity="0.6" stroke-width="1"/>`);
    for (const y of [fs0 + 2, H - 6]) parts.push(`<text x="${x + 3}" y="${y}" font-family="sans-serif" font-size="${fs0}" font-weight="bold" fill="#ff66ff" stroke="#000" stroke-width="0.6">${(k / 10).toFixed(1)}</text>`);
  }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join("")}</svg>`);
  return sharp(picture).composite([{ input: svg, left: 0, top: 0 }]).png().toBuffer();
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
  // The approved shot itself when there is one (D34); the plain layout sketch otherwise.
  const blockingPng = await renderBlockingForShot(db, panelShot);
  const layout = blockingPng ?? await renderLayoutForShot(db, panelShot);
  if (blockingPng) e.expect.blocking = true;
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
  // A measuring grid over a copy of the picture (D50): without it the model read the heads well
  // but put far-off people's feet about a quarter of the picture too low.
  const grid = e.expect.figures?.length ? await withGrid(fs.readFileSync(pic.path)).catch(() => undefined) : undefined;
  if (grid) e.expect.grid = true;
  const images = [
    { data: fs.readFileSync(pic.path), mime: pic.mime },
    ...(grid ? [{ data: grid, mime: "image/png" }] : []),
    ...(layout ? [{ data: Buffer.from(layout), mime: "image/png" }] : []),
    ...usable.map((r) => ({ data: fs.readFileSync(r.asset!.path), mime: r.asset!.mime })),
  ];
  const reply = await text.describe(checkPrompt(e.expect, usable.map((r) => r.label)), images);
  const result = judgePicture(e.expect, reply);
  studio.setPanelCheck(db, panelId, result);
  // Test mode (B4): the check goes with its picture's record, and a line into results.csv.
  if (testMode()) {
    const code = repo.getShot(db, panelShot)?.spec.code ?? panelId;
    recordCheck({ panelCode: code.replace(/^.*_(P\d+)$/i, "$1"), assetId, picture: fs.readFileSync(pic.path), check: result, expected: { order: e.expect.order, figures: e.expect.figures } });
  }
  return result;
}
