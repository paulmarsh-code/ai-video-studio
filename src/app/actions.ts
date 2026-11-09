"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { composeKlingPrompt } from "@/lib/domain/composer";
import type { GeometryPlanData, ShotSpec } from "@/lib/domain/types";
import { validatePrompt, validateShot } from "@/lib/domain/validator";
import * as repo from "@/lib/repo";

export async function saveShotAction(shotId: string, spec: ShotSpec) {
  const db = await getDb();
  const shot = repo.getShot(db, shotId);
  if (!shot) throw new Error("Shot not found");
  // Dialogue is locked: the Shot Director cannot change the approved line.
  const locked: ShotSpec = { ...spec, dialogue: shot.spec.dialogue, speakerId: shot.spec.speakerId };
  repo.saveShotSpec(db, shotId, locked);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function savePromptAction(shotId: string, projectId: string) {
  const db = await getDb();
  const shot = repo.getShot(db, shotId);
  if (!shot) throw new Error("Shot not found");
  const cast = repo.getCast(db, projectId);
  const plan = repo.getLatestPlan(db, shot.sceneId)?.data;
  const composed = composeKlingPrompt(shot.spec, cast, plan, undefined, repo.getProjectGenre(db, projectId));
  const findings = [...validateShot(shot.spec, cast, plan), ...validatePrompt(composed.text, shot.spec, cast)];
  const version = repo.savePromptVersion(db, shotId, composed.text, composed.settings, findings);
  revalidatePath("/", "layout");
  return { version };
}

export async function savePlanAction(sceneId: string, data: GeometryPlanData) {
  const db = await getDb();
  const version = repo.savePlan(db, sceneId, data);
  revalidatePath("/", "layout");
  return { version };
}

export async function saveAnimaticAction(sceneId: string, timeline: repo.AnimaticTimeline) {
  const version = repo.saveAnimatic(await getDb(), sceneId, timeline);
  revalidatePath("/", "layout");
  return { version };
}

export async function addPlanToLibraryAction(sceneId: string, name: string) {
  const db = await getDb();
  const s = repo.getScene(db, sceneId);
  if (!s?.plan) throw new Error("No plan");
  repo.addLibraryItem(db, { kind: "venue", name, data: { venueName: s.venue?.name, plan: s.plan.data } });
  revalidatePath("/library");
}

export async function addShotToLibraryAction(shotId: string, name: string) {
  const db = await getDb();
  const shot = repo.getShot(db, shotId);
  if (!shot) throw new Error("Shot not found");
  // A shot set-up template keeps camera, framing and performance — not the specific line.
  const { dialogue: _d, speakerId: _s, otherDialogue: _o, ...setup } = shot.spec;
  void _d; void _s; void _o;
  repo.addLibraryItem(db, { kind: "shot-setup", name, data: setup });
  revalidatePath("/library");
}

export async function addCharacterToLibraryAction(projectId: string, characterId: string) {
  const db = await getDb();
  const c = repo.getCast(db, projectId).find((x) => x.id === characterId);
  if (!c) throw new Error("Character not found");
  repo.addLibraryItem(db, { kind: "character", name: c.name, data: c });
  revalidatePath("/library");
}

export async function copyLibraryItemAction(id: string, name: string, dataJson: string) {
  let data: unknown;
  try {
    data = JSON.parse(dataJson);
  } catch {
    return { ok: false, error: "The item data is not valid JSON." };
  }
  repo.copyLibraryItem(await getDb(), id, { name, data });
  revalidatePath("/library");
  return { ok: true };
}

export async function applyShotDesignAction(
  sceneId: string,
  choices: { shotId: string; shotCode: string; option: import("@/lib/domain/director").CameraOption }[],
  lineOfAction?: [string, string],
) {
  const { applyDesign } = await import("@/lib/domain/director");
  const db = await getDb();
  const current = repo.getLatestPlan(db, sceneId);
  if (!current) throw new Error("No floor plan for this scene");
  const { plan, assign } = applyDesign(current.data, choices, lineOfAction);
  const version = repo.savePlan(db, sceneId, plan, "Designed by the app (rules library)");
  for (const ch of choices) {
    const shot = repo.getShot(db, ch.shotId);
    if (shot) repo.saveShotSpec(db, ch.shotId, { ...shot.spec, cameraId: assign[ch.shotId] });
  }
  revalidatePath("/", "layout");
  return { version };
}

export async function setGenreAction(projectId: string, genre: string) {
  const { asGenre } = await import("@/lib/domain/genre");
  repo.setProjectGenre(await getDb(), projectId, asGenre(genre));
  revalidatePath("/", "layout");
}
