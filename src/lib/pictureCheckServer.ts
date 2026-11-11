// Server side of the picture check (D19): build what the approved layout says the picture must
// show, send the picture, the layout sketch and the character references to the vision model,
// and judge the answer by rule.

import fs from "node:fs";
import sharp from "sharp";
import type { DB } from "@/db/client";
import { mainSubjectId } from "./domain/composer";
import { facingOf, pictureXY, planForShot, readCamera, readProps } from "./domain/geometry";
import { cameraZ, floorZ } from "./domain/levels";
import { ringSectors, viewSlice, viewsInSlice } from "./domain/panorama";
import { checkPrompt, gazePrompt, judgePicture, lookLine, marksPrompt, matchPeople, planPrompt, type Figure, type GazeEvidence, type PictureCheck, type PictureExpectation } from "./domain/pictureCheck";
import { detectorKind, headCrop, numberPeople, type Person } from "./domain/peopleDetect";
import { detectPeople } from "./peopleDetector";
import { crowdLevelOf } from "./domain/story";
import { renderLayoutForShot } from "./layoutImage";
import { renderBlockingForShot } from "./blockingImage";
import { carriedItems, heldProps, itemNoun } from "./domain/imagePrompts";
import { getCheckProvider } from "./providers/images";
import * as repo from "./repo";
import * as studio from "./studioRepo";
import { recordCheck, testMode } from "./testRecords";

/** Who the approved camera shows, left to right, and which key props. */
export function expectationFor(db: DB, shotId: string): { expect: PictureExpectation; ids: string[]; projectId: string; eyeY?: number } | null {
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
  // The planned eye level (D51): where the camera's own height falls in the picture.
  const eye = pictureXY(plan, cam, cam.lookAt, cameraZ(plan, cam) - floorZ(plan, cam.lookAt));
  return {
    ids, projectId: scene.scene.projectId, eyeY: eye ? +eye.y.toFixed(3) : undefined,
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
      // Props the detector can find (D55), with where their foot meets the floor in the picture.
      propSpots: (() => {
        const depths = reading.actors.filter((a) => a.inView && !a.foreground).map((a) => a.depthM);
        const far = depths.length ? Math.max(...depths) : undefined, near = depths.length ? Math.min(...depths) : undefined;
        return readProps(plan, cam).filter((p) => p.inView).flatMap((p) => {
          const kind = detectorKind(p.name);
          const f = (plan.furniture ?? []).find((x) => x.name === p.name);
          const foot = f ? pictureXY(plan, cam, f.position, 0) : undefined;
          if (!kind || !f || !foot || foot.y > 1.02 || foot.y < 0) return [];
          return [{ name: p.name, kind, x: +foot.x.toFixed(3), baseY: +foot.y.toFixed(3), among: far !== undefined && near !== undefined && p.depthM <= far + 1 && p.depthM >= near - 0.5 }];
        });
      })(),
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

/**
 * A copy of the picture with the plan drawn over it (D51): a dashed, named box for each main
 * person at their planned place and height (as wide as a person that tall), and the planned eye
 * level. The vision model compares each person with their box, which it does far better than
 * reading positions off the picture (D50 put far-off feet a quarter of the picture too low).
 */
export async function withPlan(picture: Buffer, figures: Figure[], eyeY?: number, found: { name: string; box: Person }[] = []): Promise<Buffer> {
  const meta = await sharp(picture).metadata();
  const W = meta.width ?? 1024, H = meta.height ?? 1536;
  const fs0 = Math.round(Math.min(W, H) / 42);
  const colours = ["#ff3b30", "#34c759", "#af52de", "#0a84ff", "#ff9f0a", "#ffd60a"];
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const parts: string[] = [];
  // Names of people standing close would print over each other: each label moves up a line
  // until it is clear of the ones already placed.
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const clear = (x0: number, x1: number, base: number) => !placed.some((r) => x0 < r.x1 && x1 > r.x0 && base - fs0 < r.y1 && base > r.y0);
  const labelAt = (centre: number, base: number, text: string) => {
    const half = (text.length * fs0 * 0.62) / 2 + 4;
    const x0 = Math.max(0, Math.min(W - 2 * half, centre - half));
    let y = Math.max(fs0, base);
    for (let n = 0; n < figures.length + 2 && !clear(x0, x0 + 2 * half, y); n++) y = y - fs0 - 4 < fs0 ? y + 3 * (fs0 + 4) : y - fs0 - 4;
    placed.push({ x0, x1: x0 + 2 * half, y0: y - fs0, y1: y + 4 });
    return { x: x0 + half, y };
  };
  if (eyeY !== undefined && eyeY > 0 && eyeY < 1) {
    const y = Math.round(eyeY * H);
    parts.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#ffffff" stroke-width="3" stroke-dasharray="18 10"/>`);
    const t = "planned eye level", half = (t.length * fs0 * 0.62) / 2 + 4;
    placed.push({ x0: 0, x1: 8 + 2 * half, y0: y - 8 - fs0, y1: y - 4 });
    parts.push(`<text x="8" y="${y - 8}" font-family="sans-serif" font-size="${fs0}" font-weight="bold" fill="#ffffff" stroke="#000" stroke-width="1">${t}</text>`);
  }
  figures.forEach((f, k) => {
    const top = f.headY * H, bottom = f.feetY * H, h = bottom - top;
    if (h <= 4) return;
    const w = h * 0.28, x = f.x * W - w / 2, c = colours[k % colours.length];
    parts.push(`<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="12 7"/>`);
    const name = f.name.split(" ")[0], at = labelAt(x + w / 2, top - 6, name);
    parts.push(`<text x="${at.x.toFixed(1)}" y="${at.y.toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="${fs0}" font-weight="bold" fill="${c}" stroke="#000" stroke-width="1">${esc(name)}</text>`);
    // Where the detector found them (D53): a solid outline in the same colour.
    const b = found.find((x) => x.name === f.name)?.box;
    if (b) parts.push(`<rect x="${(b.x0 * W).toFixed(1)}" y="${(b.y0 * H).toFixed(1)}" width="${((b.x1 - b.x0) * W).toFixed(1)}" height="${((Math.min(b.y1, 1) - b.y0) * H).toFixed(1)}" fill="none" stroke="${c}" stroke-width="4"/>`);
  });
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join("")}</svg>`);
  return sharp(picture).composite([{ input: svg, left: 0, top: 0 }]).png().toBuffer();
}

/**
 * The picture with every person the detector found outlined and numbered left to right (D53), for
 * the vision model to say which number is which character. Nothing of the plan is drawn on it.
 */
export async function withMarks(picture: Buffer, people: Person[]): Promise<Buffer> {
  const meta = await sharp(picture).metadata();
  const W = meta.width ?? 1024, H = meta.height ?? 1536;
  const fs0 = Math.round(Math.min(W, H) / 40);
  const colours = ["#ff3b30", "#34c759", "#0a84ff", "#ff9f0a", "#af52de", "#ffd60a", "#00c7be", "#ff2d55"];
  // Each number sits on the person's chest (D54), not at a corner: where outlines overlap, a
  // corner label sat beside the wrong face and the model took the person behind for the one in front.
  const outlines = people.map((p, i) => {
    const c = colours[i % colours.length], x = p.x0 * W, y = p.y0 * H, w = (p.x1 - p.x0) * W, h = (Math.min(p.y1, 1) - p.y0) * H;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="${c}" stroke-width="2"/>`;
  });
  const labels = people.map((p, i) => {
    const c = colours[i % colours.length], label = String(p.n ?? i + 1);
    const cx = ((p.x0 + p.x1) / 2) * W, cy = (p.y0 + 0.22 * (Math.min(p.y1, 1) - p.y0)) * H, r = fs0 * (label.length > 1 ? 0.85 : 0.7);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${c}" stroke="#000" stroke-width="2"/>`
      + `<text x="${cx.toFixed(1)}" y="${(cy + fs0 * 0.36).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="${fs0}" font-weight="bold" fill="#000">${label}</text>`;
  });
  const parts = [...outlines, ...labels];
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join("")}</svg>`);
  return sharp(picture).composite([{ input: svg, left: 0, top: 0 }]).png().toBuffer();
}

/** The faces the eye-contact question was asked about, side by side and named, for the test record (D54). */
async function faceStrip(images: Buffer[], names: string[]): Promise<Buffer> {
  const S = 384, label = 36;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S * images.length}" height="${label}">${names.map((n, i) => `<text x="${i * S + 8}" y="26" font-family="sans-serif" font-size="22" font-weight="bold" fill="#000">${i + 1}. ${esc(n)}</text>`).join("")}</svg>`);
  return sharp({ create: { width: S * images.length, height: S + label, channels: 3, background: "#ffffff" } })
    .composite([{ input: text, left: 0, top: 0 }, ...images.map((input, i) => ({ input, left: i * S, top: label }))]).png().toBuffer();
}

export async function checkPanelPicture(db: DB, panelId: string, assetId: string): Promise<PictureCheck | null> {
  const text = getCheckProvider();
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
  const picture = fs.readFileSync(pic.path);
  const images = [
    { data: picture, mime: pic.mime },
    ...(layout ? [{ data: Buffer.from(layout), mime: "image/png" }] : []),
    ...usable.map((r) => ({ data: fs.readFileSync(r.asset!.path), mime: r.asset!.mime })),
  ];
  // The plan check, asked separately and at the same time, with a line on how to recognise each
  // person. The detector measures where everyone is and the model says which outline is whom
  // (D53); if the detector can't run, the model is asked to compare with the plan drawn on the
  // picture (D52) and the check says the sizes are its estimate.
  const who = e.ids.map((id) => ({ name: nameOf(id), look: lookLine(profiles[id]?.wardrobe ?? "", profiles[id]?.anchors ?? []) }));
  const figures = e.expect.figures ?? [];
  const found = figures.length ? await detectPeople(picture).catch((err) => { console.warn(`Person detector unavailable: ${String(err).slice(0, 200)}`); return undefined; }) : undefined;
  const marked = found ? numberPeople(found.people) : [];
  const overlay = figures.length && !found ? await withPlan(picture, figures, e.eyeY).catch(() => undefined) : undefined;
  const marks = found ? await withMarks(picture, marked).catch(() => undefined) : undefined;
  if (marks) e.expect.gazeByFace = true;
  const [reply, planReply] = await Promise.all([
    text.describe(checkPrompt(e.expect, usable.map((r) => r.label)), images),
    marks ? text.describe(marksPrompt(e.expect, who, marked.length), [{ data: marks, mime: "image/png" }]).catch(() => "")
      : overlay ? text.describe(planPrompt(e.expect, who), [{ data: picture, mime: pic.mime }, { data: overlay, mime: "image/png" }]).catch(() => "")
      : Promise.resolve(undefined),
  ]);
  const plan = found && planReply !== undefined ? { people: marked, things: found.things, reply: planReply, aspect: found.height / found.width } : planReply;
  // Eye contact on a close crop of each matched face (D54).
  let gaze: GazeEvidence | undefined, faces: Buffer | undefined;
  if (found && typeof plan === "object" && e.expect.gazeByFace) {
    const crops = matchPeople(e.expect, plan).map((m) => ({ name: m.name, at: headCrop(m.box, found.width, found.height) }));
    const asked = crops.filter((c) => c.at);
    const images = await Promise.all(asked.map((c) => sharp(picture).extract({ left: c.at!.left, top: c.at!.top, width: c.at!.size, height: c.at!.size }).resize(384, 384).png().toBuffer())).catch(() => []);
    if (images.length && images.length === asked.length) {
      const said = await text.describe(gazePrompt(asked.map((c) => ({ name: c.name, look: who.find((w) => w.name === c.name)?.look ?? "" }))), images.map((data) => ({ data, mime: "image/png" }))).catch(() => undefined);
      if (said !== undefined) gaze = { reply: said, asked: asked.map((c) => c.name), tooSmall: crops.filter((c) => !c.at).map((c) => c.name) };
      if (testMode()) faces = await faceStrip(images, asked.map((c) => c.name)).catch(() => undefined);
    } else if (!asked.length && crops.length) gaze = { reply: "", asked: [], tooSmall: crops.map((c) => c.name) };
  }
  const result = judgePicture(e.expect, reply, plan, gaze);
  studio.setPanelCheck(db, panelId, result);
  // Test mode (B4): the check goes with its picture's record, and a line into results.csv.
  if (testMode()) {
    const code = repo.getShot(db, panelShot)?.spec.code ?? panelId;
        // The record shows the plan (dashed) and where each person was found (solid) together.
    const record = found ? await withPlan(picture, figures, e.eyeY, (result.measured ?? []).flatMap((m) => { const box = marked.find((p) => p.n === m.box); return box ? [{ name: m.name, box }] : []; })).catch(() => undefined) : overlay;
    recordCheck({ panelCode: code.replace(/^.*_(P\d+)$/i, "$1"), assetId, picture, overlay: record, marks, faces, check: result, expected: { order: e.expect.order, figures: e.expect.figures, eyeY: e.eyeY }, replies: { check: reply, plan: planReply, gaze: gaze?.reply } });
  }
  return result;
}
