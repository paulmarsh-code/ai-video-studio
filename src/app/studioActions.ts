"use server";

// Server actions for the Character, Venue and Storyboard studios.
// Each returns { ok, error? } so the page can show the reason in plain words.

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import type { RefView } from "@/lib/domain/imagePrompts";
import type { Pronoun } from "@/lib/domain/types";
import * as studio from "@/lib/studioRepo";
import type { DraftPanel, SceneStaging } from "@/lib/domain/story";

export type Result<T = undefined> = { ok: true; value?: T } | { ok: false; error: string };

async function run<T>(fn: (db: Awaited<ReturnType<typeof getDb>>) => T): Promise<Result<T>> {
  try {
    const value = fn(await getDb());
    revalidatePath("/", "layout");
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function runAsync<T>(fn: (db: Awaited<ReturnType<typeof getDb>>) => Promise<T>): Promise<Result<T>> {
  try {
    const value = await fn(await getDb());
    revalidatePath("/", "layout");
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Characters
export async function addCharacterAction(projectId: string, name: string, pronoun: Pronoun) {
  return run((db) => studio.addCharacter(db, projectId, { name, pronoun }).slug);
}
/** Wizard step 1: create the character (or update it when resuming) with name, pronoun, role and consent. */
export async function upsertCharacterBasicsAction(projectId: string, characterId: string | null, basics: { name: string; pronoun: Pronoun; role: string; invented: boolean; consentRef: string }) {
  return run((db) => {
    const ref = characterId ? { id: characterId, slug: "" } : studio.addCharacter(db, projectId, { name: basics.name, pronoun: basics.pronoun });
    studio.updateCharacterBasics(db, ref.id, basics);
    const c = studio.listCharacters(db, projectId).find((x) => x.id === ref.id)!;
    return { id: c.id, slug: c.slug };
  });
}
/** Save basics and the draft in one step. With refs, the description and images change together (no half-saved state). */
export async function saveCharacterAction(characterId: string, basics: { name: string; pronoun: Pronoun; role: string; invented: boolean; consentRef: string }, draft: { appearance: string; wardrobe: string; mannerisms: string; anchors: string[]; voiceLock: string }, refs?: { front?: string; back?: string; face?: string }) {
  return run((db) => {
    studio.updateCharacterBasics(db, characterId, basics);
    const { voiceLock, ...profile } = draft;
    return studio.saveCharacterDraft(db, characterId, { profile, voiceLock, refs });
  });
}
export async function approveCharacterAction(characterId: string) {
  return run((db) => studio.approveCharacterDraft(db, characterId));
}
export async function discardCharacterDraftAction(characterId: string) {
  return run((db) => studio.discardCharacterDraft(db, characterId));
}
export async function setCharacterRefAction(characterId: string, view: RefView, assetId: string) {
  return run((db) => studio.setCharacterRef(db, characterId, view, assetId));
}

// Venues
export async function addVenueAction(projectId: string, name: string) {
  return run((db) => studio.addVenue(db, projectId, name));
}
export async function saveVenueAction(venueId: string, input: { name: string; description: string; setting: "interior" | "exterior"; views: studio.VenueView[] }) {
  return run((db) => studio.saveVenue(db, venueId, input));
}
export async function setVenueViewImageAction(venueId: string, viewName: string, assetId: string) {
  return run((db) => studio.setVenueViewImage(db, venueId, viewName, assetId));
}
export async function approveVenueAction(venueId: string) {
  return run((db) => studio.approveVenue(db, venueId));
}

// Storyboard
export async function addPanelAction(sceneId: string, input: studio.PanelInput) {
  return run((db) => studio.addPanel(db, sceneId, input));
}
export async function updatePanelAction(panelId: string, input: studio.PanelInput) {
  return run((db) => studio.updatePanel(db, panelId, input));
}
export async function setPanelImageAction(panelId: string, assetId: string, drawnFrom?: string) {
  return run((db) => studio.setPanelImage(db, panelId, assetId, drawnFrom));
}
export async function approvePanelAction(panelId: string) {
  return run((db) => studio.approvePanel(db, panelId));
}
export async function movePanelAction(panelId: string, dir: -1 | 1) {
  return run((db) => studio.movePanel(db, panelId, dir));
}
export async function deletePanelAction(panelId: string) {
  return run((db) => studio.deletePanel(db, panelId));
}

// Projects, scenes and the story (D18)
export async function createProjectAction(p: studio.NewProject) {
  return run((db) => studio.createProject(db, p));
}
export async function updateProjectBriefAction(projectId: string, p: Partial<studio.NewProject>) {
  return run((db) => studio.updateProjectBrief(db, projectId, p));
}
export async function addSceneAction(projectId: string, s: studio.NewScene) {
  return run((db) => studio.addScene(db, projectId, s));
}
export async function saveSceneStoryAction(sceneId: string, story: string, targetSec: number) {
  return run((db) => studio.saveSceneStory(db, sceneId, story, targetSec));
}
export async function saveSceneStagingAction(sceneId: string, staging: Partial<SceneStaging>) {
  return run((db) => studio.saveSceneStaging(db, sceneId, staging));
}
export async function saveStoryboardAction(sceneId: string, s: { story: string; targetSec: number; panels: DraftPanel[]; staging?: SceneStaging }) {
  return run((db) => studio.saveStoryboard(db, sceneId, s));
}

/**
 * One click: the app chooses a camera for every panel (its top-rated option from the film
 * grammar rules) and saves them on a new floor plan version (D18a). Design shots still
 * lets the user pick other options.
 */
export async function chooseCamerasAction(sceneId: string) {
  return runAsync((db) => chooseCameras(db, sceneId));
}

/**
 * Bring a layout made under older rules up to date in one step (D19c): positions are approved
 * again where they are (adding arrival spots and refreshing prop sizes), then the app chooses
 * the cameras. Cameras are left unlocked for the user to check and approve.
 */
export async function updateLayoutAction(sceneId: string) {
  return runAsync(async (db) => {
    studio.unlockScene(db, sceneId, "positions");
    studio.approvePositions(db, sceneId);
    return chooseCameras(db, sceneId);
  });
}

async function chooseCameras(db: Awaited<ReturnType<typeof getDb>>, sceneId: string) {
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
 * Change a panel's shot (D28): the user's words are kept from now on, and the cameras are
 * chosen again so the camera view matches. Empty words go back to the app's suggestion.
 */
export async function setShotChoiceAction(shotId: string, words: string) {
  return runAsync(async (db) => {
    const repo = await import("@/lib/repo");
    const shot = repo.getShot(db, shotId);
    if (!shot) throw new Error("That panel's shot wasn't found.");
    const sceneId = shot.sceneId;
    const locks = studio.sceneLocks(db, sceneId);
    if (locks.cameras) throw new Error("The cameras are approved and locked. Choose “Change cameras” first, then change the shot.");
    const w = words.trim().replace(/\s+/g, " ").slice(0, 200);
    repo.saveShotSpec(db, shotId, { ...shot.spec, shot: w || undefined, shotBy: w ? "you" : undefined });
    if (!locks.positions) return { chosen: 0, missing: [] as (string | undefined)[] };
    return chooseCameras(db, sceneId);
  });
}

export async function approvePanelsAction(panelIds: string[]) {
  return run((db) => { for (const id of panelIds) studio.approvePanel(db, id); return panelIds.length; });
}

export async function approvePositionsAction(sceneId: string) {
  return run((db) => studio.approvePositions(db, sceneId));
}
export async function approveCamerasAction(sceneId: string) {
  return run((db) => studio.approveCameras(db, sceneId));
}
export async function unlockSceneAction(sceneId: string, what: "positions" | "cameras") {
  return run((db) => studio.unlockScene(db, sceneId, what));
}

export async function unapprovePanelAction(panelId: string) {
  return run((db) => studio.unapprovePanel(db, panelId));
}

// Projects: library and delete (D22)

export async function saveProjectToLibraryAction(projectId: string) {
  const { saveProjectToLibrary } = await import("@/lib/repo");
  return run((db) => saveProjectToLibrary(db, projectId));
}

export async function restoreProjectAction(projectId: string) {
  const { restoreProject } = await import("@/lib/repo");
  return run((db) => restoreProject(db, projectId));
}

export async function deleteProjectAction(projectId: string, confirmName: string) {
  const repo = await import("@/lib/repo");
  return runAsync(async (db) => {
    const p = repo.getProject(db, projectId);
    if (!p) throw new Error("Project not found.");
    if (confirmName.trim().toLowerCase() !== p.name.trim().toLowerCase()) throw new Error(`Type the project's name, "${p.name}", to delete it.`);
    const files = repo.deleteProject(db, projectId);
    // Remove its pictures too, but only files inside the studio's own data folder.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(process.cwd(), "data");
    for (const f of files) {
      const full = path.resolve(f);
      if (full.startsWith(root + path.sep) && fs.existsSync(full)) fs.rmSync(full);
    }
    return { deleted: p.name };
  });
}
