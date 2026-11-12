// The blocking frame (D34): the shot itself, built from the approved layout before GPT draws
// anything. The background this camera sees in the venue's 360° view, with a labelled stand-in
// for each character at their exact place, size and facing, the key props where they stand,
// an arrow for anyone walking, and anything held marked on the correct side of the picture.
// GPT is asked to finish this picture (replace the stand-ins with the characters), not to
// imagine a new one, so position, direction and background are drawn in, not described.

import fs from "node:fs";
import sharp from "sharp";
import { propKind } from "./domain/story";
import { greyBoxSvg } from "./domain/greyBox";
import { frameVariant } from "./testRecords";
import type { DB } from "@/db/client";
import { planForShot, readCamera } from "./domain/geometry";
import { layoutSketchSvg } from "./domain/layoutSketch";
import { mainSubjectId } from "./domain/composer";
import { carriedItems, heldProps } from "./domain/imagePrompts";
import { WALK_OFF } from "./domain/gestures";
import { backgroundForFrame } from "./backgroundImage";
import * as repo from "./repo";
import * as studio from "./studioRepo";
import type { CharacterProfile } from "./domain/imagePrompts";

/** Who is walking where in this shot: arrivals head for their place; someone leaving heads for the way out. */
export function movesFor(full: { actors: { characterId: string; position: { x: number; y: number } }[]; views: { name: string; directionDeg: number }[] }, shot: { at?: Record<string, string>; subjectId?: string; speakerId?: string; visibleIds: string[]; actions?: string; sceneContext?: string }, shotPlan: { actors: { characterId: string; position: { x: number; y: number }; to?: { x: number; y: number } }[] }, text: string) {
  const moves: Record<string, { x: number; y: number }> = {};
  // A walk set for this panel on the storyboard (D35): from their spot to where they end.
  for (const a of shotPlan.actors) if (a.to) moves[a.characterId] = a.to;
  for (const [id, mark] of Object.entries(shot.at ?? {})) {
    if (moves[id] || !["arriving", "crossing", "approaching"].includes(mark)) continue;
    const place = full.actors.find((a) => a.characterId === id)?.position;
    if (place) moves[id] = place;
  }
  const who = shot.speakerId ?? shot.subjectId ?? shot.visibleIds[0];
  const exit = full.views.find((v) => /\b(entrance|exit|door|doors|doorway|way out|lobby|foyer)\b/i.test(v.name));
  if (who && !moves[who] && WALK_OFF.test(text) && exit) {
    const p = shotPlan.actors.find((a) => a.characterId === who)?.position;
    const d = (exit.directionDeg * Math.PI) / 180;
    if (p) moves[who] = { x: p.x + Math.cos(d) * 3, y: p.y + Math.sin(d) * 3 };
  }
  return moves;
}

/** Flat props' own pictures (D57) as data: addresses for the blocking frame: signs, backdrops, screens, posters. */
async function flatPropPictures(db: DB, plan: { furniture?: { id: string; name: string; detail?: string; imageAssetId?: string }[] }): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const f of plan.furniture ?? []) {
    if (!f.imageAssetId || propKind(`${f.name} ${f.detail ?? ""}`, f.name) !== "flat") continue;
    const a = repo.getAsset(db, f.imageAssetId);
    if (!a || !fs.existsSync(a.path)) continue;
    const png = await sharp(fs.readFileSync(a.path)).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).png().toBuffer().catch(() => undefined);
    if (png) out[f.id] = `data:image/png;base64,${png.toString("base64")}`;
  }
  return out;
}

export async function renderBlockingForShot(db: DB, shotId: string, extraHeld?: Record<string, { side: "left" | "right"; what: string; where: string }[]>): Promise<Buffer | null> {
  const shot = repo.getShot(db, shotId);
  if (!shot?.spec.cameraId) return null;
  const scene = repo.getScene(db, shot.sceneId);
  const full = scene?.plan?.data;
  const plan = full ? planForShot(full, shot.spec) : undefined;
  const cam = plan?.cameras.find((c) => c.id === shot.spec.cameraId);
  if (!scene || !full || !plan || !cam) return null;
  const project = repo.getProject(db, scene.scene.projectId);
  const aspect = String((project?.brief as { aspect?: string } | undefined)?.aspect ?? plan.aspect ?? "9:16");
  const portrait = !aspect.startsWith("16");
  const W = portrait ? 1024 : 1536, H = portrait ? 1536 : 1024;
  // Test B (D60): the room as a grey box from the plan, with the venue's look sent separately.
  const bg = frameVariant() === "box" ? await sharp(Buffer.from(greyBoxSvg(full, cam, W, H, { outdoors: scene.venue?.setting === "exterior" }))).png().toBuffer() : await backgroundForFrame(db, shotId, W, H);
  if (!bg) return null; // no 360° view: the plain layout sketch is used instead
  const cast = repo.getCast(db, scene.scene.projectId);
  const profiles = studio.getApprovedProfiles(db, scene.scene.projectId) as Record<string, CharacterProfile>;
  const panel = scene.panels.find((p) => p.id === shot.panelId);
  const text = `${panel?.description ?? ""} ${shot.spec.actions ?? ""}`;
  const held: Record<string, { side: "left" | "right"; what: string; where: string }[]> = {};
  for (const a of plan.actors) {
    const items = [...carriedItems(profiles[a.characterId]), ...heldProps(plan, a.characterId, profiles[a.characterId]), ...(extraHeld?.[a.characterId] ?? [])];
    const seen = new Set<string>();
    held[a.characterId] = items.filter((x) => { const k = `${x.what.split(/\s+/).slice(-1)[0]}`; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  const svg = layoutSketchSvg({
    plan, camera: cam, size: portrait ? "portrait" : "landscape", overlay: true,
    people: plan.actors.filter((a) => shot.spec.presentIds.includes(a.characterId) && !shot.spec.excludedIds.includes(a.characterId))
      .map((a) => ({ id: a.characterId, name: cast.find((c) => c.id === a.characterId)?.name ?? a.characterId })),
    subjectId: mainSubjectId(shot.spec), backgroundView: readCamera(plan, cam).backgroundView,
    moves: movesFor(full, shot.spec, plan, text), held, propPictures: await flatPropPictures(db, plan),
  });
  const over = await sharp(Buffer.from(svg)).resize({ width: W, height: H, fit: "fill" }).png().toBuffer();
  return sharp(bg).composite([{ input: over, left: 0, top: 0 }]).png().toBuffer();
}
