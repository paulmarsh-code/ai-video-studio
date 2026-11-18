"use server";

// Server actions for the Character, Venue and Storyboard studios.
// Each returns { ok, error? } so the page can show the reason in plain words.

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import type { RefView } from "@/lib/domain/imagePrompts";
import type { Pronoun } from "@/lib/domain/types";
import * as studio from "@/lib/studioRepo";
import * as coreRepo from "@/lib/repo";
import { buildSceneClips } from "@/lib/sceneClips";
import { jobId, putJobs } from "@/lib/klingJobs";
import { elementSources, requestElements } from "@/lib/klingElementRequests";
import { chooseCameras, updateLayout } from "@/lib/layoutUpdate";
import { fullSizeViews } from "@/lib/venueFullSize";
import { getImageProvider } from "@/lib/providers/images";
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
/** Redraw a venue's small view pictures at full size (D67), about 7p each. */
export async function fullSizeViewsAction(venueId: string) {
  return runAsync(async (db) => {
    const provider = getImageProvider();
    if (!provider) throw new Error("No image provider is connected.");
    return fullSizeViews(db, venueId, provider);
  });
}
export async function setVenueViewImageAction(venueId: string, viewName: string, assetId: string) {
  return run((db) => studio.setVenueViewImage(db, venueId, viewName, assetId));
}
export async function approveVenueAction(venueId: string) {
  return run((db) => studio.approveVenue(db, venueId));
}

// Storyboard
export async function addPanelAction(sceneId: string, input: studio.PanelInput) {
  // Its camera is placed straight away when the scene has a floor plan (D156).
  return runAsync(async (db) => { const id = studio.addPanel(db, sceneId, input); const camera = (await import("@/lib/panelChange")).placeNewPanelCamera(db, id); return { id, camera }; });
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
    return updateLayout(db, sceneId);
  });
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

/**
 * Positions for panels (D35, D39): place people, turn them, set walks and postures. What's set
 * carries on to later panels until they're placed again (unless "this panel only"). The
 * cameras are kept: a change to one panel's positions never re-chooses the others' cameras.
 */
export async function savePanelBlockingAction(changes: { shotId: string; entries: Record<string, { at: { x: number; y: number }; to?: { x: number; y: number }; facingDeg?: number; only?: boolean; gone?: boolean; pose?: "standing" | "sitting" | "lying" | "kneeling" | "crouching" } | null>; camera?: { position: { x: number; y: number }; lookAt: { x: number; y: number }; preset?: import("@/lib/domain/types").CameraPreset; fovDeg?: number; heightM?: number; tiltDeg?: number; rollDeg?: number; size?: import("@/lib/domain/shotLanguage").ShotSize } }[]) {
  return run((db) => studio.savePanelBlocking(db, changes));
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

/** Set a venue's room size (D29), or null to use the size guessed from its words. */
export async function setVenueRoomAction(venueId: string, room: { widthM: number; depthM: number } | null) {
  return run((db) => studio.setVenueRoom(db, venueId, room));
}

/** Use one of the set's own pictures (D98), or with null go back to the venue's view. */
export async function chooseSetPictureAction(venueId: string, what: { kind: "wall"; view: string } | { kind: "floor" } | { kind: "piece"; from: string }, assetId: string | null): Promise<Result> {
  return run((db) => { studio.setVenueSetPicture(db, venueId, what, assetId); return undefined; });
}

/** Draw this scene's panels on its fixed set (D103), or go back to drawing them as before. */
export async function setSceneOnSetAction(sceneId: string, on: boolean): Promise<Result> {
  return run((db) => { studio.setSceneOnSet(db, sceneId, on); return undefined; });
}

/** Link a Kling Element to a character, the venue or a prop (D113). */
export async function setKlingElementAction(projectId: string, key: string, id: string, name: string): Promise<Result> {
  return run((db) => { studio.setKlingElement(db, projectId, key, id.trim() ? { id, name } : null); return undefined; });
}

/** Which picture of a panel Kling gets (D123): an asset id, "none", or "" for the storyboard's own. */
export async function setClipPictureAction(sceneId: string, panelId: string, value: string): Promise<Result> {
  return run((db) => { studio.setClipPicture(db, sceneId, panelId, value || null); return undefined; });
}

/**
 * Hand clips to Claude to make in Kling (D123): each one's request, Elements and pictures, written
 * to data/kling_jobs.json. `clips` are 1-based clip numbers; none means all of the scene's.
 */
export async function createClipJobsAction(sceneId: string, clips?: number[]): Promise<Result<{ count: number; credits: number }>> {
  return run((db) => {
    const v = buildSceneClips(db, sceneId);
    if (!v) throw new Error("This scene needs a venue and a floor plan first.");
    const s = coreRepo.getScene(db, sceneId)!;
    const now = new Date().toISOString();
    const chosen = v.clips.map((c, k) => ({ c, n: k + 1 })).filter((x) => !clips?.length || clips.includes(x.n));
    for (const { c, n } of chosen) {
      if (!c.elements.length) throw new Error(`Clip ${n} has no Kling Elements linked yet: pick them in the list above first.`);
      // Nothing is spent on a clip until its start frame is approved (D164).
      if (!c.start) throw new Error(`Clip ${n}: make or pick its start frame first: the picture the clip opens on.`);
      if (!c.start.approved) throw new Error(`Clip ${n}: approve its start frame first.`);
      // A voice is the character's (D146): nobody speaks in a clip without their own voice sample,
      // or Kling makes a new voice up for them.
      const cast = coreRepo.getCast(db, s.scene.projectId);
      const speakers = [...new Set(v.allPanels.length ? coreRepo.getScene(db, sceneId)!.panels.filter((p) => c.panels.includes(p.order)).flatMap((p) => (p.dialogue as { characterId: string }[]).map((d) => d.characterId)) : [])];
      const without = speakers.filter((id) => !c.audios.some((a) => a.characterId === id)).map((id) => cast.find((x) => x.id === id)?.name ?? id);
      if (without.length) throw new Error(`Clip ${n}: add ${without.join(" and ")}'s voice sample first (Kling Elements, "add a voice sample"), so ${without.length === 1 ? "their" : "each"} voice stays the same in every clip.`);
    }
    const jobs = chosen.map(({ c, n }) => ({
      id: jobId(sceneId, c.panels), projectId: s.scene.projectId, sceneId, sceneTitle: v.sceneTitle, clip: n, panels: c.panels, seconds: c.seconds,
      aspect: v.aspect, model: "kling-video-v4_0", resolution: "720p", sound: true, prompt: c.prompt,
      elements: c.elements.map((e) => ({ id: e.id, name: e.name })),
      pictures: c.pictures.map((x, i) => ({ n: i + 1, shot: x.shot, panel: x.panel, assetId: x.assetId, path: coreRepo.getAsset(db, x.assetId)?.path ?? "" })),
      // Each speaker's voice sample (D146): audio N is 音频N in the request.
      audios: c.audios.map((a) => ({ ...a, path: coreRepo.getAsset(db, a.assetId)?.path ?? "" })),
      missing: c.missing, credits: c.credits, status: "ready" as const, requestedAt: now,
    }));
    putJobs(jobs);
    return { count: jobs.length, credits: jobs.reduce((t, j) => t + j.credits, 0) };
  });
}

/**
 * Where everyone is, said in words (D165): kept for every start frame and clip, and the floor
 * plan's people moved to match where the words can be read. Approved positions are unlocked by it,
 * to be approved again.
 */
export async function setPositionsAction(sceneId: string, words: string): Promise<Result<{ moved: string[]; unclear: string[] }>> {
  return runAsync(async (db) => {
    studio.setPositionsNote(db, sceneId, words);
    const s = coreRepo.getScene(db, sceneId);
    const first = s?.panels.slice().sort((a, b) => a.order - b.order)[0];
    if (!first || !words.trim() || !s?.plan) return { moved: [], unclear: [] };
    if (studio.sceneLocks(db, sceneId).positions) studio.unlockScene(db, sceneId, "positions");
    const { movePeopleFromWords } = await import("@/lib/panelChange");
    return movePeopleFromWords(db, first.id, words);
  });
}

/** A clip's start or end frame: set, cleared or approved (D164). */
export async function setClipFrameAction(sceneId: string, key: string, change: { start?: string | null; end?: string | null; approve?: boolean }): Promise<Result<void>> {
  return run((db) => { studio.setClipFrame(db, sceneId, key, change); });
}

/**
 * Ask Claude to make Kling Elements from the app's own approved pictures (D127): the keys given,
 * or every one of the scene's that has no Element linked yet.
 */
export async function requestElementsAction(sceneId: string, keys?: string[]): Promise<Result<{ count: number }>> {
  return run((db) => {
    const s = coreRepo.getScene(db, sceneId);
    if (!s) throw new Error("Scene not found");
    const linked = studio.getKlingElements(db, s.scene.projectId);
    // None named: the ones still missing.
    const want = keys?.length ? keys : elementSources(db, sceneId).map((x) => x.key).filter((k) => !linked[k]);
    if (!want.length) throw new Error("Every Element is linked already, or nothing has an approved picture yet.");
    const made = requestElements(db, sceneId, want);
    return { count: made.length };
  });
}

/** Change one panel in words (D135): people and camera for this panel only, no unlocking. */
export async function changePanelAction(panelId: string, words: string) {
  return runAsync(async (db) => (await import("@/lib/panelChange")).changePanel(db, panelId, words));
}

/** The app writes how each line is delivered (D138): the ones without, or all again. */
export async function writeDeliveriesAction(sceneId: string, all = false) {
  return runAsync(async (db) => {
    const { getTextProvider } = await import("@/lib/providers/images");
    const provider = getTextProvider();
    if (!provider) throw new Error("GPT isn't connected, so the app can't write the deliveries. Write each one on its panel.");
    return (await import("@/lib/deliveries")).writeDeliveries(db, sceneId, provider, { all });
  });
}

/** Your own words for how a panel's line is delivered (D138). */
export async function setDeliveryAction(panelId: string, text: string) {
  return runAsync(async (db) => (await import("@/lib/deliveries")).setDelivery(db, panelId, text));
}

/** Review a made clip like a storyboard frame (D139): approve it, change it in words, or make it again. */
export async function reviewClipAction(jobId: string, decision: "approved" | "change" | "again", words?: string) {
  return runAsync(async () => {
    const { reviewJob, readJobs } = await import("@/lib/klingJobs");
    // The clip's request as it is now (D147), for a new take.
    const job = readJobs().jobs.find((x) => x.id === jobId);
    const v = job && decision !== "approved" ? buildSceneClips(await (await import("@/db/client")).getDb(), job.sceneId) : null;
    const c = v?.clips.find((x) => x.panels.join() === job!.panels.join());
    const db = await (await import("@/db/client")).getDb();
    const fresh = c ? { prompt: c.prompt, seconds: c.seconds, credits: c.credits, elements: c.elements.map((e) => ({ id: e.id, name: e.name })),
      pictures: c.pictures.map((x, i) => ({ n: i + 1, shot: x.shot, panel: x.panel, assetId: x.assetId, path: coreRepo.getAsset(db, x.assetId)?.path ?? "" })),
      audios: c.audios.map((a) => ({ ...a, path: coreRepo.getAsset(db, a.assetId)?.path ?? "" })) } : undefined;
    if (c && job) {
      // A new take needs an approved start frame too (D164).
      if (!c.start?.approved) throw new Error("Approve this clip's start frame first.");
      const scene = coreRepo.getScene(db, job.sceneId)!;
      const cast = coreRepo.getCast(db, scene.scene.projectId);
      const speakers = [...new Set(scene.panels.filter((p) => c.panels.includes(p.order)).flatMap((p) => (p.dialogue as { characterId: string }[]).map((d) => d.characterId)))];
      const without = speakers.filter((id) => !c.audios.some((a) => a.characterId === id)).map((id) => cast.find((x) => x.id === id)?.name ?? id);
      if (without.length) throw new Error(`Add ${without.join(" and ")}'s voice sample first (Kling Elements, "add a voice sample"), so ${without.length === 1 ? "their" : "each"} voice stays the same in every clip.`);
    }
    const j = reviewJob(jobId, decision, words, fresh);
    return { status: j.status, credits: j.credits };
  });
}
