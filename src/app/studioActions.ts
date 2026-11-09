"use server";

// Server actions for the Character, Venue and Storyboard studios.
// Each returns { ok, error? } so the page can show the reason in plain words.

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import type { RefView } from "@/lib/domain/imagePrompts";
import type { Pronoun } from "@/lib/domain/types";
import * as studio from "@/lib/studioRepo";

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

// Characters
export async function addCharacterAction(projectId: string, name: string, pronoun: Pronoun) {
  return run((db) => studio.addCharacter(db, projectId, { name, pronoun }).slug);
}
export async function saveCharacterAction(characterId: string, basics: { name: string; pronoun: Pronoun; role: string }, draft: { appearance: string; wardrobe: string; mannerisms: string; voiceLock: string }) {
  return run((db) => {
    studio.updateCharacterBasics(db, characterId, basics);
    const { voiceLock, ...profile } = draft;
    return studio.saveCharacterDraft(db, characterId, { profile, voiceLock });
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
export async function setPanelImageAction(panelId: string, assetId: string) {
  return run((db) => studio.setPanelImage(db, panelId, assetId));
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
