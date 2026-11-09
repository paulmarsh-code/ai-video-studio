// Data access for the Character, Venue and Storyboard studios (Build Spec v1.4, Stages 2–4).
// Rules kept here so pages and tests share them:
// - Approved character versions are never edited; a change makes a new draft version.
// - Approving a version supersedes the previously approved one.
// - Storyboard dialogue is the source of truth: a change flows to the shot (locked dialogue,
//   speaker, duration) and marks the panel's animatic recording for re-check.

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { persist, type DB } from "@/db/client";
import * as t from "@/db/schema";
import type { CharacterProfile, RefView } from "./domain/imagePrompts";
import { approvalProblems } from "./domain/approval";
import { deriveDuration } from "./domain/duration";
import { hasQuotes } from "./domain/text";
import type { Pronoun, ShotSpec } from "./domain/types";
import { getAnimatic, getCast, saveAnimatic, type AnimaticTimeline } from "./repo";

// ---------- Characters ----------

export interface CharacterVersionRow {
  id: string;
  version: number;
  status: "draft" | "approved" | "superseded";
  profile: CharacterProfile;
  voiceLock: string;
}

export interface CharacterRecord {
  id: string;
  slug: string;
  name: string;
  pronoun: Pronoun;
  role: string;
  invented: boolean;
  versions: CharacterVersionRow[]; // newest first
  approved?: CharacterVersionRow;
  draft?: CharacterVersionRow;
  /** What the editor shows: the draft if one exists, else the approved version. */
  working?: CharacterVersionRow;
}

export function listCharacters(db: DB, projectId: string): CharacterRecord[] {
  const chars = db.select().from(t.characters).where(eq(t.characters.projectId, projectId)).orderBy(sql`rowid`).all();
  return chars.map((c) => {
    const versions = db.select().from(t.characterVersions).where(eq(t.characterVersions.characterId, c.id))
      .orderBy(desc(t.characterVersions.version)).all()
      .map((v) => ({ id: v.id, version: v.version, status: v.status as CharacterVersionRow["status"], profile: (v.profile ?? {}) as CharacterProfile, voiceLock: v.voiceLock }));
    const approved = versions.find((v) => v.status === "approved");
    const draft = versions.find((v) => v.status === "draft");
    return { id: c.id, slug: c.slug, name: c.name, pronoun: c.pronoun as Pronoun, role: c.role, invented: c.invented, versions, approved, draft, working: draft ?? approved };
  });
}

/** Latest approved profile per character slug — what storyboard prompts use. */
export function getApprovedProfiles(db: DB, projectId: string): Record<string, CharacterProfile> {
  const out: Record<string, CharacterProfile> = {};
  for (const c of listCharacters(db, projectId)) if (c.approved) out[c.slug] = c.approved.profile;
  return out;
}

function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "character";
}

export function addCharacter(db: DB, projectId: string, input: { name: string; pronoun: Pronoun; role?: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("A character needs a name.");
  const taken = new Set(db.select().from(t.characters).where(eq(t.characters.projectId, projectId)).all().map((c) => c.slug));
  const base = slugify(name);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  const id = randomUUID();
  db.insert(t.characters).values({ id, projectId, slug, name, pronoun: input.pronoun, role: input.role ?? "" }).run();
  db.insert(t.characterVersions).values({ id: randomUUID(), characterId: id, version: 1, status: "draft", voiceLock: "", profile: {} }).run();
  persist(db);
  return { id, slug };
}

export function updateCharacterBasics(db: DB, characterId: string, input: { name: string; pronoun: Pronoun; role: string }) {
  if (!input.name.trim()) throw new Error("A character needs a name.");
  db.update(t.characters).set({ name: input.name.trim(), pronoun: input.pronoun, role: input.role }).where(eq(t.characters.id, characterId)).run();
  persist(db);
}

/** The draft version, creating one from the approved version if there isn't one. */
function ensureDraft(db: DB, characterId: string) {
  const versions = db.select().from(t.characterVersions).where(eq(t.characterVersions.characterId, characterId)).orderBy(desc(t.characterVersions.version)).all();
  const draft = versions.find((v) => v.status === "draft");
  if (draft) return draft;
  const base = versions.find((v) => v.status === "approved") ?? versions[0];
  const row = { id: randomUUID(), characterId, version: (versions[0]?.version ?? 0) + 1, status: "draft", profile: base?.profile ?? {}, voiceLock: base?.voiceLock ?? "" };
  db.insert(t.characterVersions).values(row).run();
  return row;
}

export function saveCharacterDraft(db: DB, characterId: string, input: { profile: Omit<CharacterProfile, "refs">; voiceLock: string }) {
  const draft = ensureDraft(db, characterId);
  const refs = (draft.profile as CharacterProfile).refs;
  db.update(t.characterVersions).set({ profile: { ...input.profile, refs }, voiceLock: input.voiceLock.trim() }).where(eq(t.characterVersions.id, draft.id)).run();
  persist(db);
  return draft.version;
}

export function setCharacterRef(db: DB, characterId: string, view: RefView, assetId: string) {
  const draft = ensureDraft(db, characterId);
  const p = draft.profile as CharacterProfile;
  db.update(t.characterVersions).set({ profile: { ...p, refs: { ...(p.refs ?? {}), [view]: assetId } } }).where(eq(t.characterVersions.id, draft.id)).run();
  persist(db);
}

export function approveCharacterDraft(db: DB, characterId: string) {
  const draft = db.select().from(t.characterVersions)
    .where(and(eq(t.characterVersions.characterId, characterId), eq(t.characterVersions.status, "draft"))).get();
  if (!draft) throw new Error("There is no draft to approve.");
  const problems = approvalProblems({ voiceLock: draft.voiceLock, profile: draft.profile as CharacterProfile });
  if (problems.length) throw new Error(problems.join(" "));
  db.update(t.characterVersions).set({ status: "superseded" })
    .where(and(eq(t.characterVersions.characterId, characterId), eq(t.characterVersions.status, "approved"))).run();
  db.update(t.characterVersions).set({ status: "approved" }).where(eq(t.characterVersions.id, draft.id)).run();
  persist(db);
  return draft.version;
}

export function discardCharacterDraft(db: DB, characterId: string) {
  const versions = db.select().from(t.characterVersions).where(eq(t.characterVersions.characterId, characterId)).all();
  const draft = versions.find((v) => v.status === "draft");
  if (!draft) return;
  if (versions.length === 1) throw new Error("This is the character's only version. Edit it instead.");
  db.delete(t.characterVersions).where(eq(t.characterVersions.id, draft.id)).run();
  persist(db);
}

// ---------- Venues ----------

export interface VenueView {
  name: string;
  directionDeg: number;
  imageAssetId?: string;
}

export function listVenues(db: DB, projectId: string) {
  return db.select().from(t.venues).where(eq(t.venues.projectId, projectId)).all()
    .map((v) => ({ ...v, views: (v.views ?? []) as VenueView[] }));
}

export function getVenue(db: DB, venueId: string) {
  const v = db.select().from(t.venues).where(eq(t.venues.id, venueId)).get();
  return v ? { ...v, views: (v.views ?? []) as VenueView[] } : undefined;
}

export function addVenue(db: DB, projectId: string, name: string) {
  if (!name.trim()) throw new Error("A venue needs a name.");
  const id = randomUUID();
  db.insert(t.venues).values({
    id, projectId, name: name.trim(), status: "draft",
    views: [
      { name: "far wall", directionDeg: 90 },
      { name: "left wall", directionDeg: 180 },
      { name: "near wall", directionDeg: 270 },
      { name: "right wall", directionDeg: 0 },
    ],
  }).run();
  persist(db);
  return id;
}

/** Saving any change returns the venue to draft, so it is re-approved before use. */
export function saveVenue(db: DB, venueId: string, input: { name: string; description: string; views: VenueView[] }) {
  const v = getVenue(db, venueId);
  if (!v) throw new Error("Venue not found");
  const names = input.views.map((x) => x.name.trim()).filter(Boolean);
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) throw new Error("Each view needs a different name.");
  const views = input.views.filter((x) => x.name.trim()).map((x) => ({
    name: x.name.trim(), directionDeg: ((Math.round(x.directionDeg) % 360) + 360) % 360,
    imageAssetId: x.imageAssetId ?? v.views.find((o) => o.name === x.name.trim())?.imageAssetId,
  }));
  db.update(t.venues).set({ name: input.name.trim() || v.name, description: input.description.trim(), views, status: "draft" }).where(eq(t.venues.id, venueId)).run();
  persist(db);
}

export function setVenueViewImage(db: DB, venueId: string, viewName: string, assetId: string) {
  const v = getVenue(db, venueId);
  if (!v) throw new Error("Venue not found");
  if (!v.views.some((x) => x.name === viewName)) throw new Error(`No view called ${viewName}`);
  db.update(t.venues).set({ views: v.views.map((x) => (x.name === viewName ? { ...x, imageAssetId: assetId } : x)), status: "draft" }).where(eq(t.venues.id, venueId)).run();
  persist(db);
}

export function approveVenue(db: DB, venueId: string) {
  const v = getVenue(db, venueId);
  if (!v) throw new Error("Venue not found");
  if (!v.description.trim()) throw new Error("Describe the venue before approving it.");
  if (v.views.length < 2) throw new Error("Add at least two named views, so backgrounds can be checked.");
  db.update(t.venues).set({ status: "approved" }).where(eq(t.venues.id, venueId)).run();
  persist(db);
}

// ---------- Storyboard ----------

export interface PanelInput {
  code: string;
  description: string;
  emotion: string;
  speakerId?: string;
  line?: string;
  durationSec?: number;
}

function panelsOf(db: DB, sceneId: string) {
  return db.select().from(t.panels).where(eq(t.panels.sceneId, sceneId)).orderBy(asc(t.panels.order)).all();
}

function shotForPanel(db: DB, panelId: string) {
  const s = db.select().from(t.shots).where(eq(t.shots.panelId, panelId)).get();
  return s ? { ...s, spec: s.spec as ShotSpec } : undefined;
}

function checkPanel(db: DB, sceneId: string, input: PanelInput, selfId?: string, projectId?: string) {
  const code = input.code.trim();
  if (!/^[A-Za-z0-9]{1,8}$/.test(code)) throw new Error("Panel code: letters and numbers only, up to 8 characters (e.g. C4a).");
  if (panelsOf(db, sceneId).some((p) => p.code.toLowerCase() === code.toLowerCase() && p.id !== selfId)) throw new Error(`Another panel is already called ${code}.`);
  if (!input.description.trim()) throw new Error("Describe what happens in the panel.");
  const line = input.line?.trim() ?? "";
  if (line && !input.speakerId) throw new Error("Choose who says the line.");
  if (hasQuotes(line)) throw new Error("Type the line without quote marks; the app adds them in the prompt.");
  if (input.speakerId && projectId && !getCast(db, projectId).some((c) => c.id === input.speakerId)) throw new Error("Unknown speaker.");
  return { code, line };
}

/** Add a panel at the end, with a draft shot ready for Design shots. */
export function addPanel(db: DB, sceneId: string, input: PanelInput) {
  const scene = db.select().from(t.scenes).where(eq(t.scenes.id, sceneId)).get();
  if (!scene) throw new Error("Scene not found");
  const { code, line } = checkPanel(db, sceneId, input, undefined, scene.projectId);
  const venue = scene.venueId ? db.select().from(t.venues).where(eq(t.venues.id, scene.venueId)).get() : undefined;
  const cast = getCast(db, scene.projectId);
  const order = (panelsOf(db, sceneId).at(-1)?.order ?? 0) + 1;
  const durationSec = line ? deriveDuration(line) : Math.max(3, Math.min(15, input.durationSec ?? 4));
  const panelId = randomUUID();
  db.insert(t.panels).values({
    id: panelId, sceneId, code, order, description: input.description.trim(), emotion: input.emotion.trim(),
    dialogue: line ? [{ characterId: input.speakerId!, text: line }] : [], durationSec, status: "draft",
  }).run();
  const all = cast.map((c) => c.id);
  const spec: ShotSpec = {
    code: shotCode(scene, code), venueName: venue?.name ?? "", sceneContext: input.description.trim(),
    presentIds: all, visibleIds: line ? [input.speakerId!] : all, excludedIds: line ? all.filter((id) => id !== input.speakerId) : [],
    speakerId: line ? input.speakerId : undefined, dialogue: line || undefined, subjectId: line ? undefined : all[0],
    actions: "", emotion: input.emotion.trim() || undefined, durationSec, audioMode: line ? "native-on" : "off", intensity: "natural",
  };
  db.insert(t.shots).values({ id: randomUUID(), sceneId, panelId, code: spec.code, spec }).run();
  persist(db);
  return panelId;
}

function shotCode(scene: { episode: number; number: number }, panelCode: string) {
  return `EP${String(scene.episode).padStart(2, "0")}_S${String(scene.number).padStart(2, "0")}_${panelCode}`;
}

export interface PanelChange {
  dialogueChanged: boolean;
  animaticMarked: boolean;
  shotUpdated: boolean;
}

/**
 * Save a panel. A text change returns the panel to draft and bumps its version.
 * A dialogue change also updates the shot (locked line, speaker, duration) and marks the
 * animatic recording for that panel as needing a re-check.
 */
export function updatePanel(db: DB, panelId: string, input: PanelInput): PanelChange {
  const panel = db.select().from(t.panels).where(eq(t.panels.id, panelId)).get();
  if (!panel) throw new Error("Panel not found");
  const scene = db.select().from(t.scenes).where(eq(t.scenes.id, panel.sceneId)).get()!;
  const { code, line } = checkPanel(db, panel.sceneId, input, panelId, scene.projectId);
  const oldD = (panel.dialogue as { characterId: string; text: string }[])[0];
  const newD = line ? { characterId: input.speakerId!, text: line } : undefined;
  const dialogueChanged = (oldD?.text ?? "") !== (newD?.text ?? "") || (oldD?.characterId ?? "") !== (newD?.characterId ?? "");
  const changed = dialogueChanged || code !== panel.code || input.description.trim() !== panel.description || input.emotion.trim() !== panel.emotion;
  const durationSec = dialogueChanged && newD ? deriveDuration(newD.text) : (input.durationSec ?? panel.durationSec);
  db.update(t.panels).set({
    code, description: input.description.trim(), emotion: input.emotion.trim(), dialogue: newD ? [newD] : [], durationSec,
    status: changed ? "draft" : panel.status, version: changed ? panel.version + 1 : panel.version,
  }).where(eq(t.panels.id, panelId)).run();

  let shotUpdated = false;
  const shot = shotForPanel(db, panelId);
  if (shot) {
    const spec: ShotSpec = { ...shot.spec, code: shotCode(scene, code), emotion: input.emotion.trim() || shot.spec.emotion };
    if (dialogueChanged) {
      spec.dialogue = newD?.text;
      spec.speakerId = newD?.characterId;
      spec.durationSec = durationSec;
      spec.audioMode = newD ? "native-on" : "off";
      if (newD && !spec.visibleIds.includes(newD.characterId)) {
        spec.visibleIds = [...spec.visibleIds, newD.characterId];
        spec.excludedIds = spec.excludedIds.filter((id) => id !== newD.characterId);
      }
    }
    db.update(t.shots).set({ spec, code: spec.code, status: dialogueChanged ? "draft" : shot.status }).where(eq(t.shots.id, shot.id)).run();
    shotUpdated = true;
  }

  let animaticMarked = false;
  if (dialogueChanged) {
    const anim = getAnimatic(db, panel.sceneId);
    if (anim) {
      const tl: AnimaticTimeline = { ...anim.timeline, recheck: { ...(anim.timeline.recheck ?? {}), [panelId]: "Dialogue changed in the storyboard. Re-check timing and re-record the guide line." } };
      const { [panelId]: _dropDuration, ...durations } = tl.durations; // fall back to the new derived duration
      void _dropDuration;
      saveAnimatic(db, panel.sceneId, { ...tl, durations });
      animaticMarked = true;
    }
  }
  persist(db);
  return { dialogueChanged, animaticMarked, shotUpdated };
}

export function setPanelImage(db: DB, panelId: string, assetId: string) {
  db.update(t.panels).set({ imageAssetId: assetId }).where(eq(t.panels.id, panelId)).run();
  persist(db);
}

export function approvePanel(db: DB, panelId: string) {
  const p = db.select().from(t.panels).where(eq(t.panels.id, panelId)).get();
  if (!p) throw new Error("Panel not found");
  if (!p.imageAssetId) throw new Error("Upload the panel image before approving.");
  db.update(t.panels).set({ status: "approved" }).where(eq(t.panels.id, panelId)).run();
  persist(db);
}

export function movePanel(db: DB, panelId: string, dir: -1 | 1) {
  const p = db.select().from(t.panels).where(eq(t.panels.id, panelId)).get();
  if (!p) throw new Error("Panel not found");
  const list = panelsOf(db, p.sceneId);
  const i = list.findIndex((x) => x.id === panelId);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  // Renumber 1..n with the two swapped, so orders stay unique and gap-free.
  const ids = list.map((x) => x.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  ids.forEach((id, k) => db.update(t.panels).set({ order: k + 1 }).where(eq(t.panels.id, id)).run());
  persist(db);
}

/** Delete a panel and its shot, unless the shot already has takes (those are kept for the record). */
export function deletePanel(db: DB, panelId: string) {
  const shot = shotForPanel(db, panelId);
  if (shot && db.select().from(t.takes).where(eq(t.takes.shotId, shot.id)).all().length) {
    throw new Error("This panel's shot has takes logged, so it can't be deleted.");
  }
  if (shot) db.delete(t.shots).where(eq(t.shots.id, shot.id)).run();
  db.delete(t.panels).where(eq(t.panels.id, panelId)).run();
  persist(db);
}
