// Data access for the Character, Venue and Storyboard studios (Build Spec v1.4, Stages 2–4).
// Rules kept here so pages and tests share them:
// - Approved character versions are never edited; a change makes a new draft version.
// - Approving a version supersedes the previously approved one.
// - Storyboard dialogue is the source of truth: a change flows to the shot (locked dialogue,
//   speaker, duration) and marks the panel's animatic recording for re-check.

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { persist, type DB } from "@/db/client";
import * as t from "@/db/schema";
import type { CharacterProfile, RefView } from "./domain/imagePrompts";
import { approvalProblems } from "./domain/approval";
import { deriveDuration } from "./domain/duration";
import { hasQuotes } from "./domain/text";
import type { GeometryPlanData, PanelBlock, PlanCamera, PlanView, Point, Pronoun, ShotSpec } from "./domain/types";
import { asGenre, type Genre } from "./domain/genre";
import { addMovementMarks, asStaging, planProps, propHeight, propsFromFurniture, propKind, propWidth, checkStoryboard, defaultPlan, panelSeconds, shotSpecFor, type DraftPanel, type SceneStaging } from "./domain/story";
import { LAYOUT_RULES } from "./domain/director";
import { applyRoom, boundsFor, groupCentre, roomFor, roomOf, type RoomSize } from "./domain/room";
import { carryBlocking, type BlockEntry } from "./domain/blocking";
import { blockingFromWords, posturesFromWords, startPose } from "./domain/panelWords";
import { aimToInclude, planForShot, readCamera } from "./domain/geometry";
import { levelsFromWords, withAreas } from "./domain/levels";
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
  consentRef: string;
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
    return { id: c.id, slug: c.slug, name: c.name, pronoun: c.pronoun as Pronoun, role: c.role, invented: c.invented, consentRef: c.consentRef ?? "", versions, approved, draft, working: draft ?? approved };
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

export function updateCharacterBasics(db: DB, characterId: string, input: { name: string; pronoun: Pronoun; role: string; invented?: boolean; consentRef?: string }) {
  if (!input.name.trim()) throw new Error("A character needs a name.");
  const consent = { ...(input.invented !== undefined ? { invented: input.invented } : {}), ...(input.consentRef !== undefined ? { consentRef: input.consentRef.trim() || null } : {}) };
  db.update(t.characters).set({ name: input.name.trim(), pronoun: input.pronoun, role: input.role, ...consent }).where(eq(t.characters.id, characterId)).run();
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

/** Save the draft's text. Pass refs to replace the reference images in the same write. */
export function saveCharacterDraft(db: DB, characterId: string, input: { profile: Omit<CharacterProfile, "refs">; voiceLock: string; refs?: CharacterProfile["refs"] }) {
  const draft = ensureDraft(db, characterId);
  const refs = input.refs ? { ...((draft.profile as CharacterProfile).refs ?? {}), ...input.refs } : (draft.profile as CharacterProfile).refs;
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
  const ch = db.select().from(t.characters).where(eq(t.characters.id, characterId)).get();
  const problems = approvalProblems({ voiceLock: draft.voiceLock, profile: draft.profile as CharacterProfile, invented: ch?.invented, consentRef: ch?.consentRef ?? "" });
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
      { name: "far side", directionDeg: 90 },
      { name: "left side", directionDeg: 180 },
      { name: "near side", directionDeg: 270 },
      { name: "right side", directionDeg: 0 },
    ],
  }).run();
  persist(db);
  return id;
}

/** Saving any change returns the venue to draft, so it is re-approved before use. */
export function saveVenue(db: DB, venueId: string, input: { name: string; description: string; setting?: "interior" | "exterior"; views: VenueView[] }) {
  const v = getVenue(db, venueId);
  if (!v) throw new Error("Venue not found");
  const names = input.views.map((x) => x.name.trim()).filter(Boolean);
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) throw new Error("Each view needs a different name.");
  const views = input.views.filter((x) => x.name.trim()).map((x) => ({
    name: x.name.trim(), directionDeg: ((Math.round(x.directionDeg) % 360) + 360) % 360,
    imageAssetId: x.imageAssetId ?? v.views.find((o) => o.name === x.name.trim())?.imageAssetId,
  }));
  db.update(t.venues).set({ name: input.name.trim() || v.name, description: input.description.trim(), setting: input.setting ?? (v.setting === "exterior" ? "exterior" : "interior"), views, status: "draft" }).where(eq(t.venues.id, venueId)).run();
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
  // New words, new positions (D36), while the positions aren't approved yet.
  if (changed && !sceneLocks(db, panel.sceneId).positions) applyMovementMarks(db, panel.sceneId);
  return { dialogueChanged, animaticMarked, shotUpdated };
}

/** A new picture always needs approving again. */
export function setPanelImage(db: DB, panelId: string, assetId: string, drawnFrom?: string) {
  // Remember which floor plan version the picture was drawn from (D19a), to spot stale ones, and
  // a fingerprint of what it was drawn from (D24), so a redraw is offered only after a change.
  const panel = db.select().from(t.panels).where(eq(t.panels.id, panelId)).get();
  const plan = panel ? latestPlan(db, panel.sceneId) : undefined;
  db.update(t.panels).set({ imageAssetId: assetId, status: "draft", check: { drawnOnPlan: plan?.version, ...(drawnFrom ? { drawnFrom } : {}) } }).where(eq(t.panels.id, panelId)).run();
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
  recarry(db, p.sceneId); // what carries on follows the new order (D35)
  persist(db);
}

/** Delete a panel and its shot, unless the shot already has takes (those are kept for the record). */
export function deletePanel(db: DB, panelId: string) {
  const shot = shotForPanel(db, panelId);
  if (shot && db.select().from(t.takes).where(eq(t.takes.shotId, shot.id)).all().length) {
    throw new Error("This panel's shot has takes logged, so it can't be deleted.");
  }
  if (shot) db.delete(t.shots).where(eq(t.shots.id, shot.id)).run();
  const gone = db.select().from(t.panels).where(eq(t.panels.id, panelId)).get();
  db.delete(t.panels).where(eq(t.panels.id, panelId)).run();
  if (gone) recarry(db, gone.sceneId); // D35
  persist(db);
}

// ---------- Projects and scenes (D18) ----------

export interface NewProject {
  name: string;
  /** What it is: advert, short film, series episode, social content… */
  format: string;
  /** Who it's for and where it will be shown. */
  audience: string;
  /** The whole story in a few lines. */
  outline: string;
  /** How many parts (scenes or episodes), and roughly how long each is in seconds. */
  parts: number;
  partSec: number;
  aspect: "9:16" | "16:9";
  style: string;
  genre: Genre;
}

/** The brief as the story step uses it; older projects stored episodes/episodeSec. */
export function briefOf(p: { brief: unknown }) {
  const b = (p.brief ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && v > 0 ? v : undefined);
  return {
    format: typeof b.format === "string" ? b.format : "",
    audience: typeof b.audience === "string" ? b.audience : "",
    outline: typeof b.outline === "string" ? b.outline : typeof b.concept === "string" ? b.concept : "",
    parts: num(b.parts) ?? num(b.episodes),
    partSec: num(b.partSec) ?? num(b.episodeSec),
    aspect: b.aspect === "16:9" ? "16:9" as const : "9:16" as const,
    style: typeof b.style === "string" && b.style ? b.style : "photorealistic",
    genre: asGenre(b.genre),
  };
}

function projectCode(db: DB, name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  let base = (words.length >= 2 ? words.map((w) => w[0]).join("") : words[0] ?? "VID").slice(0, 4);
  if (base.length < 3) base = (words.join("") + "XXX").slice(0, 3);
  const taken = new Set(db.select({ code: t.projects.code }).from(t.projects).all().map((r) => r.code));
  let code = base, n = 2;
  while (taken.has(code)) code = `${base}${n++}`;
  return code;
}

export function createProject(db: DB, p: NewProject): string {
  if (!p.name.trim()) throw new Error("Give the project a name.");
  const id = randomUUID();
  db.insert(t.projects).values({
    id, code: projectCode(db, p.name), name: p.name.trim(), type: "video",
    brief: { format: p.format.trim(), parts: Math.max(1, Math.round(p.parts) || 1), partSec: Math.max(5, Math.round(p.partSec) || 30), audience: p.audience.trim(), outline: p.outline.trim(), aspect: p.aspect, style: p.style.trim() || "photorealistic", genre: asGenre(p.genre) },
  }).run();
  persist(db);
  return id;
}

export function updateProjectBrief(db: DB, projectId: string, patch: Partial<Omit<NewProject, "name">> & { name?: string }) {
  const p = db.select().from(t.projects).where(eq(t.projects.id, projectId)).get();
  if (!p) throw new Error("Project not found");
  const { name, ...rest } = patch;
  db.update(t.projects).set({ name: name?.trim() || p.name, brief: { ...(p.brief as object), ...rest } }).where(eq(t.projects.id, projectId)).run();
  persist(db);
}

export interface NewScene { title: string; venueId: string; castIds: string[]; }

export function addScene(db: DB, projectId: string, s: NewScene): string {
  if (!s.title.trim()) throw new Error("Give the scene a name.");
  if (!s.venueId) throw new Error("Choose where the scene takes place.");
  if (!s.castIds.length) throw new Error("Choose who is in the scene.");
  const number = (db.select().from(t.scenes).where(and(eq(t.scenes.projectId, projectId), eq(t.scenes.episode, 1))).all().reduce((m, x) => Math.max(m, x.number), 0)) + 1;
  const id = randomUUID();
  const project = db.select().from(t.projects).where(eq(t.projects.id, projectId)).get();
  const targetSec = project ? briefOf(project).partSec ?? 60 : 60;
  db.insert(t.scenes).values({ id, projectId, venueId: s.venueId, episode: 1, number, title: s.title.trim(), cast: s.castIds, targetSec }).run();
  persist(db);
  return id;
}

/** Character slugs in a scene: its chosen cast, or everyone for older scenes. */
export function sceneCastIds(db: DB, scene: { projectId: string; cast: unknown }): string[] {
  const chosen = (scene.cast as string[] | null) ?? [];
  return chosen.length ? chosen : getCast(db, scene.projectId).map((c) => c.id);
}

/** Keep the story while it's being written, so the creator can come back to it. */
export function saveSceneStory(db: DB, sceneId: string, story: string, targetSec: number) {
  db.update(t.scenes).set({ story, targetSec }).where(eq(t.scenes.id, sceneId)).run();
  persist(db);
}

/**
 * Save the storyboard from the story in one step: every panel with its draft shot, the
 * story itself and, for a new scene, a first floor plan so the app can choose cameras.
 * Replaces earlier panels only while none of them is approved.
 */
export function saveStoryboard(db: DB, sceneId: string, s: { story: string; targetSec: number; panels: DraftPanel[]; staging?: Partial<SceneStaging> }) {
  const staging = asStaging(s.staging);
  const scene = db.select().from(t.scenes).where(eq(t.scenes.id, sceneId)).get();
  if (!scene) throw new Error("Scene not found");
  if (!s.panels.length) throw new Error("There are no panels to save.");
  const castIds = sceneCastIds(db, scene);
  const check = checkStoryboard(s.panels, s.targetSec);
  if (check.issues.length) throw new Error(`Panel ${check.issues[0].panel}: ${check.issues[0].text}`);
  for (const [i, p] of s.panels.entries()) {
    if (p.speakerId && !castIds.includes(p.speakerId)) throw new Error(`Panel ${i + 1}: the speaker isn't in this scene.`);
  }
  const old = panelsOf(db, sceneId);
  if (old.some((p) => p.status === "approved")) throw new Error("Some panels are already approved, so the storyboard can't be replaced from the story.");
  const oldShots = db.select().from(t.shots).where(eq(t.shots.sceneId, sceneId)).all().map((x) => x.id);
  if (oldShots.length) {
    db.delete(t.promptVersions).where(inArray(t.promptVersions.shotId, oldShots)).run();
    db.delete(t.takes).where(inArray(t.takes.shotId, oldShots)).run();
    db.delete(t.shots).where(inArray(t.shots.id, oldShots)).run();
  }
  db.delete(t.panels).where(eq(t.panels.sceneId, sceneId)).run();

  const venue = scene.venueId ? db.select().from(t.venues).where(eq(t.venues.id, scene.venueId)).get() : undefined;
  s.panels.forEach((p, i) => {
    const code = `P${i + 1}`;
    const panelId = randomUUID();
    db.insert(t.panels).values({
      id: panelId, sceneId, code, order: i + 1, description: p.action.trim(), emotion: p.emotion.trim(),
      dialogue: p.line ? [{ characterId: p.speakerId!, text: p.line.trim() }] : [], durationSec: panelSeconds(p.line, p.seconds), status: "draft",
    }).run();
    const spec = shotSpecFor({ ...p, seconds: panelSeconds(p.line, p.seconds) }, { code: shotCode(scene, code), venueName: venue?.name ?? "", castIds, staging });
    db.insert(t.shots).values({ id: randomUUID(), sceneId, panelId, code: spec.code, spec }).run();
  });
  if (!db.select().from(t.plans).where(eq(t.plans.sceneId, sceneId)).get()) {
    db.insert(t.plans).values({ id: randomUUID(), sceneId, name: "First floor plan (from the story)", version: 1, data: defaultPlan(castIds, s.panels, (venue?.views ?? []) as PlanView[], staging, projectAspect(db, scene.projectId), venueRoom(venue)) }).run();
  }
  const locks = (scene.locks ?? {}) as SceneLocks;
  db.update(t.scenes).set({ story: s.story, targetSec: s.targetSec, staging, locks: { positions: locks.positions } }).where(eq(t.scenes.id, sceneId)).run();
  persist(db);
  syncAreas(db, sceneId);
  // New panels get their places from their words (D36, D80) even with positions approved: those
  // are per panel, and the approved floor plan itself doesn't change.
  if (!locks.positions) applyMovementMarks(db, sceneId);
  else if (applyPanelWords(db, sceneId)) persist(db);
  return { panels: s.panels.length, totalSec: check.totalSec };
}

/**
 * Change the scene setting (D18c). Every shot carries the setting, so the picture and Kling
 * prompts of the whole scene change together. Pictures already made keep the old setting
 * until they are redrawn.
 */
export function saveSceneStaging(db: DB, sceneId: string, staging: Partial<SceneStaging>) {
  const st = asStaging(staging);
  // With positions approved, the floor plan fixes which props there are, what each one is and
  // where it stands (D19a, D19c). How they look can still be corrected (D19b): descriptions and
  // pictures are written into the plan in place, so the lock still holds.
  const locked = !!sceneLocks(db, sceneId).positions;
  const current = latestPlan(db, sceneId);
  if (locked && current) {
    // Matched by the plan item it came from, else by name, never by list position, so one prop's
    // look can't land on another (D19c). A prop can be renamed (D32): it keeps its place.
    const furniture = (current.data.furniture ?? []).map((f) => {
      const edit = st.props.find((p) => p.ref === f.id) ?? st.props.find((p) => !p.ref && p.name.trim().toLowerCase() === f.name.trim().toLowerCase());
      if (!edit) return f;
      const { imageAssetId: _old, ...rest } = f;
      // A real rename takes the new name; a change of capitals alone keeps the plan's.
      const name = edit.name.trim() && edit.name.trim().toLowerCase() !== f.name.trim().toLowerCase() ? edit.name.trim() : f.name;
      return { ...rest, name, detail: edit.detail.trim(), heightM: propHeight(`${name} ${edit.detail}`), ...(edit.imageAssetId ? { imageAssetId: edit.imageAssetId } : {}) };
    });
    // Taken off the list (D32): a prop that came from the plan and is no longer in the setting
    // leaves the plan. Only when the list carries plan references, so an older list can't
    // remove anything by accident.
    const refs = new Set(st.props.map((p) => p.ref).filter(Boolean));
    const kept = refs.size ? furniture.filter((f) => refs.has(f.id)) : furniture;
    db.update(t.plans).set({ data: { ...current.data, furniture: kept } }).where(eq(t.plans.id, current.id)).run();
    st.props = propsFromFurniture(kept);
  } else if (current && !AUTO_PLANS.includes(current.name) && st.props.length) {
    // A floor plan the user edited (not locked): the setting's props are merged in by name, so
    // nothing typed here is lost when the positions are approved (D19c). New props get a first
    // place; props taken off the list leave the plan.
    const C = current.data.actors.length
      ? { x: current.data.actors.reduce((s, a) => s + a.position.x, 0) / current.data.actors.length, y: current.data.actors.reduce((s, a) => s + a.position.y, 0) / current.data.actors.length }
      : groupCentre(roomOf(current.data));
    const placed = planProps(st, current.data.actors.length > 1, C);
    const key = (s: string) => s.trim().toLowerCase();
    const furniture = st.props.map((p, i) => {
      const old = (current.data.furniture ?? []).find((f) => (p.ref && f.id === p.ref) || key(f.name) === key(p.name));
      const text = `${p.name} ${p.detail}`;
      if (!old) return placed[i];
      const { imageAssetId: _old, ...rest } = old;
      return { ...rest, name: p.name.trim() || old.name, detail: p.detail, heightM: propHeight(text), ...(p.imageAssetId ? { imageAssetId: p.imageAssetId } : {}) };
    }).filter(Boolean);
    const ids = new Set<string>();
    for (const f of furniture) { while (ids.has(f.id)) f.id = `${f.id}-b`; ids.add(f.id); }
    db.update(t.plans).set({ data: { ...current.data, furniture } }).where(eq(t.plans.id, current.id)).run();
  }
  const scene = db.select().from(t.scenes).where(eq(t.scenes.id, sceneId)).get();
  if (!scene) throw new Error("Scene not found");
  db.update(t.scenes).set({ staging: st }).where(eq(t.scenes.id, sceneId)).run();

  // A floor plan the app made itself is rebuilt around the spot (D18d): the group stands
  // around the table, and the cameras are chosen again. A plan the user has edited is kept.
  const plan = db.select().from(t.plans).where(eq(t.plans.sceneId, sceneId)).orderBy(desc(t.plans.version)).get();
  const replan = !!st.spot && !!plan && AUTO_PLANS.includes(plan.name) && !sceneLocks(db, sceneId).positions;
  if (replan) {
    const castIds = sceneCastIds(db, scene);
    const panels: DraftPanel[] = panelsOf(db, sceneId).map((p) => {
      const d = (p.dialogue as { characterId: string; text: string }[])[0];
      const shot = shotForPanel(db, p.id);
      return { action: p.description, inFrame: shot?.spec.visibleIds ?? [], speakerId: d?.characterId, line: d?.text ?? "", emotion: p.emotion, seconds: p.durationSec };
    });
    const venue = scene.venueId ? db.select().from(t.venues).where(eq(t.venues.id, scene.venueId)).get() : undefined;
    db.insert(t.plans).values({ id: randomUUID(), sceneId, name: AUTO_PLANS[0], version: plan!.version + 1, data: defaultPlan(castIds, panels, (venue?.views ?? []) as PlanView[], st, projectAspect(db, scene.projectId), venueRoom(venue)) }).run();
  }
  for (const sh of db.select().from(t.shots).where(eq(t.shots.sceneId, sceneId)).all()) {
    const old = sh.spec as ShotSpec;
    const spec: ShotSpec = {
      ...old, spot: st.spot || undefined, crowd: st.crowd || undefined, props: st.props.length ? st.props : undefined,
      // In a group scene the others are nearby, not banned from the frame.
      excludedIds: st.spot ? [] : old.excludedIds,
      cameraId: replan ? undefined : old.cameraId,
    };
    db.update(t.shots).set({ spec }).where(eq(t.shots.id, sh.id)).run();
  }
  persist(db);
  syncAreas(db, sceneId);
  if (replan) applyMovementMarks(db, sceneId);
  return { staging: st, replanned: replan };
}

/** Floor plans the app made itself, which it may rebuild; anything else was edited by the user. */
const AUTO_PLANS = ["First floor plan (from the story)", "Cameras chosen by the app"];

/** The project's video shape, for lens angles on the floor plan (D19). */
export function projectAspect(db: DB, projectId: string): "9:16" | "16:9" {
  const p = db.select().from(t.projects).where(eq(t.projects.id, projectId)).get();
  return p ? briefOf(p).aspect : "9:16";
}

// ---------- Approve and lock (D19) ----------

export interface SceneLocks {
  /** Plan version whose positions (people and props) were approved. */
  positions?: number;
  /** Plan version whose cameras were approved. */
  cameras?: number;
}

export function sceneLocks(db: DB, sceneId: string): SceneLocks {
  const s = db.select().from(t.scenes).where(eq(t.scenes.id, sceneId)).get();
  const l = (s?.locks ?? {}) as SceneLocks;
  return { positions: typeof l.positions === "number" ? l.positions : undefined, cameras: typeof l.cameras === "number" ? l.cameras : undefined };
}

function setLocks(db: DB, sceneId: string, locks: SceneLocks) {
  db.update(t.scenes).set({ locks }).where(eq(t.scenes.id, sceneId)).run();
  persist(db);
}

function latestPlan(db: DB, sceneId: string) {
  const p = db.select().from(t.plans).where(eq(t.plans.sceneId, sceneId)).orderBy(desc(t.plans.version)).get();
  return p ? { ...p, data: p.data as GeometryPlanData } : undefined;
}

/**
 * The setting's areas into the floor plan (D80): a skate bowl, a pool or a ski run named in the
 * scene setting and not yet on the plan is added beside the group, as a new plan version. Even
 * with positions approved: nothing approved moves, and without it the action has nowhere to be.
 */
export function syncAreas(db: DB, sceneId: string): boolean {
  const plan = latestPlan(db, sceneId);
  const scene = db.select().from(t.scenes).where(eq(t.scenes.id, sceneId)).get();
  if (!plan || !scene) return false;
  const st = asStaging(scene.staging);
  if (!st.areas?.length) return false;
  const next = withAreas(plan.data, st.areas, st.spot);
  if (next === plan.data) return false;
  db.insert(t.plans).values({ id: randomUUID(), sceneId, name: plan.name, version: plan.version + 1, data: next }).run();
  persist(db);
  return true;
}

export function approvePositions(db: DB, sceneId: string) {
  applyMovementMarks(db, sceneId); // older scenes: arrival marks before the lock (D19b)
  // Heights and widths follow the props' descriptions (D19b), in place. A big flat thing (a
  // backdrop, a screen) standing within a few steps of where the group gathers is moved back
  // across the room, as a new plan would place it; nothing else moves.
  const before = latestPlan(db, sceneId);
  if (before?.data.furniture?.length) {
    const spot = before.data.furniture.find((f) => f.id === "spot") ?? before.data.furniture.find((f) => propKind(`${f.name} ${f.detail ?? ""}`, f.name) === "table");
    const bounds = before.data.bounds;
    const furniture = before.data.furniture.map((f) => {
      const text = `${f.name} ${f.detail ?? ""}`;
      const kind = propKind(text, f.name);
      let position = f.position;
      if (kind === "flat" && spot && f !== spot) {
        const dx = f.position.x - spot.position.x, dy = f.position.y - spot.position.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01 && d < 3.5) {
          const k = 4.2 / d;
          position = { x: +(spot.position.x + dx * k).toFixed(2), y: +(spot.position.y + dy * k).toFixed(2) };
          if (bounds) position = { x: Math.min(bounds.maxX - 0.3, Math.max(bounds.minX + 0.3, position.x)), y: Math.min(bounds.maxY - 0.3, Math.max(bounds.minY + 0.3, position.y)) };
        }
      }
      return { ...f, position, heightM: propHeight(text, f.name), radiusM: kind === "table" && !/\d\s?c?m\s*(?:wide|across|long)|(?:width|wide)[^\d]{0,12}\d/i.test(text) ? f.radiusM : +(propWidth(text, kind) / 2).toFixed(2) };
    });
    db.update(t.plans).set({ data: { ...before.data, furniture, rules: LAYOUT_RULES } }).where(eq(t.plans.id, before.id)).run();
  } else if (before) {
    db.update(t.plans).set({ data: { ...before.data, rules: LAYOUT_RULES } }).where(eq(t.plans.id, before.id)).run();
  }
  const plan = latestPlan(db, sceneId);
  if (!plan || !plan.data.actors.length) throw new Error("There is no floor plan to approve yet.");
  syncPropsFromPlan(db, sceneId);
  setLocks(db, sceneId, { positions: plan.version });
  return plan.version;
}

export function approveCameras(db: DB, sceneId: string) {
  const locks = sceneLocks(db, sceneId);
  if (!locks.positions) throw new Error("Approve the positions first.");
  const plan = latestPlan(db, sceneId)!;
  const shots = db.select().from(t.shots).where(eq(t.shots.sceneId, sceneId)).all().map((s) => s.spec as ShotSpec);
  const missing = shots.filter((s) => !s.cameraId || !plan.data.cameras.some((c) => c.id === s.cameraId));
  if (missing.length) throw new Error(`${missing.length} panel${missing.length === 1 ? " has" : "s have"} no camera yet. Let the app choose the cameras first.`);
  setLocks(db, sceneId, { ...locks, cameras: plan.version });
  syncPropsFromPlan(db, sceneId);
  // Pictures drawn from an earlier layout no longer match: back to draft, marked to redraw.
  // A picture the user approved stays approved (D19e): their judgement that it works beats the
  // app's bookkeeping. It's only noted, so they can redraw it if they change their mind.
  for (const p of panelsOf(db, sceneId)) {
    const drawn = (p.check as { drawnOnPlan?: number } | null)?.drawnOnPlan;
    if (p.imageAssetId && (drawn === undefined || drawn < plan.version)) {
      if (p.status === "approved") {
        db.update(t.panels).set({ check: { ...(p.check as object ?? {}), drawnOnPlan: drawn, keptApproved: true, problems: ["Approved by you on an earlier layout and kept. Redraw it only if it no longer fits."] } }).where(eq(t.panels.id, p.id)).run();
      } else {
        db.update(t.panels).set({ status: "draft", check: { drawnOnPlan: drawn, pass: false, stale: true, problems: ["Drawn from an earlier layout. Redraw it to match the approved positions and cameras."] } }).where(eq(t.panels.id, p.id)).run();
      }
    }
  }
  persist(db);
  return plan.version;
}

/** Unlock on purpose. Unlocking positions also unlocks cameras, since cameras depend on them. */
export function unlockScene(db: DB, sceneId: string, what: "positions" | "cameras") {
  const locks = sceneLocks(db, sceneId);
  setLocks(db, sceneId, what === "positions" ? {} : { positions: locks.positions });
}

const same = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < 0.005 && Math.abs(a.y - b.y) < 0.005;

/**
 * Refuse a floor plan change that moves anything locked (D19): with cameras locked nothing
 * may change; with positions locked, people and props may not move, be added or be removed.
 */
export function checkPlanChange(db: DB, sceneId: string, next: GeometryPlanData) {
  const locks = sceneLocks(db, sceneId);
  if (!locks.positions && !locks.cameras) return;
  const cur = latestPlan(db, sceneId)?.data;
  if (!cur) return;
  if (locks.cameras) {
    const camsChanged = JSON.stringify(cur.cameras) !== JSON.stringify(next.cameras);
    if (camsChanged) throw new Error("The cameras are approved and locked. Unlock them on the storyboard to change them.");
  }
  const moved = cur.actors.length !== next.actors.length || cur.actors.some((a) => { const b = next.actors.find((x) => x.characterId === a.characterId); return !b || !same(a.position, b.position) || JSON.stringify(a.marks ?? []) !== JSON.stringify(b.marks ?? []); })
    || (cur.furniture ?? []).length !== (next.furniture ?? []).length || (cur.furniture ?? []).some((f) => { const g = (next.furniture ?? []).find((x) => x.id === f.id); return !g || !same(f.position, g.position) || f.radiusM !== g.radiusM; });
  if (moved) throw new Error("The positions are approved and locked. Unlock them on the storyboard to move people or props.");
}

export function shotIdForPanel(db: DB, panelId: string): string | undefined {
  return db.select().from(t.shots).where(eq(t.shots.panelId, panelId)).get()?.id;
}

export function setPanelCheck(db: DB, panelId: string, check: import("./domain/pictureCheck").PictureCheck) {
  const old = (db.select().from(t.panels).where(eq(t.panels.id, panelId)).get()?.check ?? {}) as Record<string, unknown>;
  db.update(t.panels).set({ check: { drawnOnPlan: old.drawnOnPlan, ...(old.drawnFrom ? { drawnFrom: old.drawnFrom } : {}), ...check, at: new Date().toISOString() } }).where(eq(t.panels.id, panelId)).run();
  persist(db);
}

/** Take back an approval made by mistake (D19a). */
export function unapprovePanel(db: DB, panelId: string) {
  db.update(t.panels).set({ status: "draft" }).where(eq(t.panels.id, panelId)).run();
  persist(db);
}

/**
 * Key props come from the approved floor plan once positions are approved (D19a): one list,
 * used by the sketch, the picture check, picture prompts and Kling prompts alike.
 */
function syncPropsFromPlan(db: DB, sceneId: string) {
  const plan = latestPlan(db, sceneId);
  const scene = db.select().from(t.scenes).where(eq(t.scenes.id, sceneId)).get();
  if (!plan || !scene) return;
  const props = propsFromFurniture(plan.data.furniture);
  db.update(t.scenes).set({ staging: { ...asStaging(scene.staging), props } }).where(eq(t.scenes.id, sceneId)).run();
  for (const sh of db.select().from(t.shots).where(eq(t.shots.sceneId, sceneId)).all()) {
    db.update(t.shots).set({ spec: { ...(sh.spec as ShotSpec), props: props.length ? props : undefined } }).where(eq(t.shots.id, sh.id)).run();
  }
}

/**
 * Add arrival marks to the scene's floor plan when it has none yet (D19b), and put each
 * arriving panel's shot on its mark. Runs when the storyboard is saved, when the app rebuilds
 * the plan, and before positions are approved, so older scenes get them too.
 */
export function applyMovementMarks(db: DB, sceneId: string) {
  // Re-read from the panels every time (D20): editing the story ("joins them" instead of
  // "approaches") must change where people are. Marks already placed are kept and reused.
  const plan = latestPlan(db, sceneId);
  if (!plan) return false;
  const panels = panelsOf(db, sceneId);
  const shots = panels.map((p) => shotForPanel(db, p.id));
  const { plan: marked, at, from } = addMovementMarks(plan.data, panels.map((p, i) => {
    const sp = shots[i]?.spec;
    return { action: p.description, subjectId: sp ? sp.speakerId ?? sp.subjectId ?? sp.visibleIds[0] : undefined };
  }));
  const marksChanged = JSON.stringify(marked.actors.map((a) => a.marks ?? [])) !== JSON.stringify(plan.data.actors.map((a) => a.marks ?? []));
  if (marksChanged) db.insert(t.plans).values({ id: randomUUID(), sceneId, name: plan.name, version: plan.version + 1, data: marked }).run();
  let changed = marksChanged;
  shots.forEach((sh, i) => {
    if (!sh) return;
    const same = JSON.stringify(sh.spec.at ?? null) === JSON.stringify(at[i] ?? null) && JSON.stringify(sh.spec.from ?? null) === JSON.stringify(from[i] ?? null);
    if (same) return;
    changed = true;
    db.update(t.shots).set({ spec: { ...sh.spec, at: at[i], from: from[i], cameraId: undefined } }).where(eq(t.shots.id, sh.id)).run();
  });
  // Per-panel positions from the words (D36), then what carries on; a mark ends what was carried (D35).
  const words = applyPanelWords(db, sceneId);
  if (changed && !words) recarry(db, sceneId);
  if (changed || words) persist(db);
  return changed || words;
}

// ---------- Room size and levels (D29) ----------

/** The venue's room for a new floor plan: its size (set or guessed) and its words. */
export function venueRoom(venue: { name: string; description: string; setting: string; room: unknown } | undefined) {
  const r = roomFor(venue);
  return { room: { widthM: r.widthM, depthM: r.depthM }, text: `${venue?.name ?? ""} ${venue?.description ?? ""}` };
}

/**
 * Bring a scene's floor plan to its venue's room size (D29), keeping everyone and everything in
 * the same place relative to the group, and add raised or lowered areas from the scene's words
 * if the plan has none. Returns true when the plan changed (saved as a new version).
 */
export function syncRoom(db: DB, sceneId: string): boolean {
  const scene = db.select().from(t.scenes).where(eq(t.scenes.id, sceneId)).get();
  if (!scene) return false;
  const plan = db.select().from(t.plans).where(eq(t.plans.sceneId, sceneId)).orderBy(desc(t.plans.version)).get();
  if (!plan) return false;
  const venue = scene.venueId ? db.select().from(t.venues).where(eq(t.venues.id, scene.venueId)).get() : undefined;
  const { room, text } = venueRoom(venue);
  const data = plan.data as GeometryPlanData;
  const now = roomOf(data);
  let next = data;
  if (Math.abs(now.widthM - room.widthM) > 0.05 || Math.abs(now.depthM - room.depthM) > 0.05) {
    next = applyRoom(data, room);
    // Positions set per panel (D35) move with everything else.
    const a = groupCentre(now), c = groupCentre(room);
    const nb = next.bounds ?? boundsFor(room);
    const mv = (q: Point): Point => ({ x: +Math.min(nb.maxX - 0.3, Math.max(nb.minX + 0.3, q.x + c.x - a.x)).toFixed(2), y: +Math.min(nb.maxY - 0.3, Math.max(nb.minY + 0.3, q.y + c.y - a.y)).toFixed(2) });
    for (const sh of db.select().from(t.shots).where(eq(t.shots.sceneId, sceneId)).all()) {
      const sp = sh.spec as ShotSpec;
      if (!sp.blocking) continue;
      const blocking = Object.fromEntries(Object.entries(sp.blocking).map(([id, b]) => [id, { ...b, at: mv(b.at), ...(b.to ? { to: mv(b.to) } : {}) }]));
      db.update(t.shots).set({ spec: { ...sp, blocking } }).where(eq(t.shots.id, sh.id)).run();
    }
  }
  if (!next.levels) {
    const st = asStaging(scene.staging);
    const levels = levelsFromWords(st.spot, text, next.bounds ?? boundsFor(room), groupCentre(room));
    if (levels.length) next = { ...next, levels };
  }
  if (next === data) return false;
  db.insert(t.plans).values({ id: randomUUID(), sceneId, name: plan.name, version: plan.version + 1, data: next }).run();
  persist(db);
  return true;
}

/** Set a venue's room size (or null to go back to the guess), and bring its scenes' floor plans to it. */
export function setVenueRoom(db: DB, venueId: string, room: RoomSize | null): number {
  if (room && (!(room.widthM >= 1.5 && room.widthM <= 200) || !(room.depthM >= 1.5 && room.depthM <= 200))) throw new Error("Give a width and depth between 1.5 and 200 metres.");
  db.update(t.venues).set({ room: room ? { widthM: +room.widthM.toFixed(1), depthM: +room.depthM.toFixed(1) } : null }).where(eq(t.venues.id, venueId)).run();
  let n = 0;
  for (const sc of db.select().from(t.scenes).where(eq(t.scenes.venueId, venueId)).all()) if (syncRoom(db, sc.id)) n++;
  persist(db);
  return n;
}

// ---------- Held items read from reference pictures (D34) ----------

export type HeldItem = { side: "left" | "right"; what: string; where: string };
/** Bumped when the way held items are read changes, so older readings are redone (D34). */
export const HELD_READ_VERSION = 2;

/**
 * What a character holds or wears on one side, read once from their approved front reference
 * picture and kept with that version (derived data: it is redone if the picture changes).
 */
export function characterHeldItems(db: DB, projectId: string, slug: string): HeldItem[] | undefined {
  const c = listCharacters(db, projectId).find((x) => x.slug === slug);
  const prof = c?.approved?.profile as (CharacterProfile & { held?: { ref: string; items: HeldItem[] } }) | undefined;
  if (!prof?.held || prof.held.ref !== prof.refs?.front) return undefined;
  return prof.held.items;
}

/** Characters whose held items haven't been read from their current front picture yet. */
export function charactersNeedingHeldRead(db: DB, projectId: string): { slug: string; versionId: string; frontAssetId: string; name: string }[] {
  const out: { slug: string; versionId: string; frontAssetId: string; name: string }[] = [];
  for (const c of listCharacters(db, projectId)) {
    const prof = c.approved?.profile as (CharacterProfile & { held?: { ref: string; v?: number } }) | undefined;
    const front = prof?.refs?.front;
    if (!c.approved || !front || (prof?.held?.ref === front && prof.held.v === HELD_READ_VERSION)) continue;
    out.push({ slug: c.slug, versionId: c.approved.id, frontAssetId: front, name: c.name });
  }
  return out;
}

export function saveCharacterHeldItems(db: DB, versionId: string, frontAssetId: string, items: HeldItem[]) {
  const v = db.select().from(t.characterVersions).where(eq(t.characterVersions.id, versionId)).get();
  if (!v) return;
  db.update(t.characterVersions).set({ profile: { ...(v.profile as object), held: { ref: frontAssetId, v: HELD_READ_VERSION, items } } }).where(eq(t.characterVersions.id, versionId)).run();
  persist(db);
}

// ---------- Positions per panel (D35) ----------

/**
 * Save positions set on panels (D35): each entry places someone on that panel (or null puts
 * them back to what the earlier panels and the scene plan give). Carried positions are then
 * worked out again for the whole scene. The cameras stay as they are, approved or not (D39):
 * fixing one picture never moves another panel's camera.
 */
export function savePanelBlocking(db: DB, changes: { shotId: string; entries: Record<string, BlockEntry | null>; camera?: { position: Point; lookAt: Point } & Partial<Pick<PlanCamera, "preset" | "fovDeg" | "heightM" | "tiltDeg" | "rollDeg" | "size">> }[]): { sceneId: string; turned: { code: string; who: string[] }[] } {
  if (!changes.length) throw new Error("Nothing to save.");
  const round = (p: Point) => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) });
  let sceneId = "";
  for (const ch of changes) {
    const shot = db.select().from(t.shots).where(eq(t.shots.id, ch.shotId)).get();
    if (!shot) throw new Error("That panel wasn't found.");
    if (sceneId && shot.sceneId !== sceneId) throw new Error("Those panels are in different scenes.");
    sceneId = shot.sceneId;
    const spec = shot.spec as ShotSpec;
    const blocking: Record<string, PanelBlock> = { ...(spec.blocking ?? {}) };
    for (const [id, e] of Object.entries(ch.entries)) {
      if (!e) { delete blocking[id]; continue; }
      const to = e.to && Math.hypot(e.to.x - e.at.x, e.to.y - e.at.y) > 0.2 ? round(e.to) : undefined;
      if (id.startsWith("pose:")) { if (e.pose) blocking[id] = { at: { x: 0, y: 0 }, pose: e.pose, ...(e.only ? { only: true } : {}), by: "you" }; else delete blocking[id]; continue; }
      blocking[id] = { at: round(e.at), ...(to ? { to } : {}), ...(e.facingDeg !== undefined && !to ? { facingDeg: ((Math.round(e.facingDeg) % 360) + 360) % 360 } : {}), ...(e.only ? { only: true } : {}), ...(e.gone && id.startsWith("prop:") ? { gone: true } : {}), by: "you" };
    }
    db.update(t.shots).set({ spec: { ...spec, blocking } }).where(eq(t.shots.id, shot.id)).run();
  }
  // What the app reads in the words is worked out again around what you set (D36).
  if (!applyPanelWords(db, sceneId)) recarry(db, sceneId);
  // A camera moved for a panel (D43): that panel's own camera; the others stay as they are.
  for (const ch of changes) {
    if (!ch.camera) continue;
    // Only the camera's own settings: where it stands, where it looks, its lens, height and tilt.
    const { preset, fovDeg, heightM, tiltDeg, rollDeg, size } = ch.camera;
    const extra = Object.fromEntries(Object.entries({ preset, fovDeg, heightM, tiltDeg, rollDeg, size }).filter(([, v]) => v !== undefined));
    panelCamera(db, sceneId, ch.shotId, (c) => ({ ...c, ...extra, position: round(ch.camera!.position), lookAt: round(ch.camera!.lookAt) }));
  }
  // Anyone who must be in the picture but has been moved out of its camera's view (D42).
  const turned = aimPanelCameras(db, sceneId, changes.map((c) => c.shotId));
  persist(db);
  return { sceneId, turned };
}

/**
 * Keep everyone who must be in a panel's picture in its camera's view (D42). When a change
 * moves someone out of it, that panel gets its own camera, turned (and widened only if
 * needed) to take them in; other panels' cameras, approved or not, are never touched.
 */
export function aimPanelCameras(db: DB, sceneId: string, shotIds: string[]): { code: string; who: string[] }[] {
  const out: { code: string; who: string[] }[] = [];
  const cast = getCast(db, db.select().from(t.scenes).where(eq(t.scenes.id, sceneId)).get()?.projectId ?? "");
  for (const shotId of shotIds) {
    const plan = latestPlan(db, sceneId);
    const sh = db.select().from(t.shots).where(eq(t.shots.id, shotId)).get();
    if (!plan || !sh) continue;
    const spec = sh.spec as ShotSpec;
    const sp = planForShot(plan.data, spec);
    const cam = sp.cameras.find((c) => c.id === spec.cameraId);
    if (!cam) continue;
    const ids = spec.visibleIds.filter((id) => id !== cam.povId && sp.actors.some((a) => a.characterId === id));
    const aimed = aimToInclude(sp, cam, ids);
    if (aimed === cam) continue;
    const before = readCamera(sp, cam).actors;
    const who = ids.filter((id) => !before.find((a) => a.characterId === id)?.inView).map((id) => cast.find((c) => c.id === id)?.name.split(/\s+/)[0] ?? id);
    panelCamera(db, sceneId, shotId, () => aimed);
    out.push({ code: spec.code.split("_").pop() ?? spec.code, who });
  }
  return out;
}

/**
 * Change one panel's camera without touching any other panel's (D42, D43): a camera made for
 * this panel before is changed in place; a camera it shares (or one that's approved) is left
 * as it is and this panel gets its own copy, "<name>, for this panel".
 */
function panelCamera(db: DB, sceneId: string, shotId: string, change: (cam: PlanCamera) => PlanCamera) {
  const plan = latestPlan(db, sceneId);
  const sh = db.select().from(t.shots).where(eq(t.shots.id, shotId)).get();
  if (!plan || !sh) return;
  const spec = sh.spec as ShotSpec;
  const cam = plan.data.cameras.find((c) => c.id === spec.cameraId);
  if (!cam) return;
  const next = change(cam);
  if (JSON.stringify(next) === JSON.stringify(cam)) return;
  const shared = db.select().from(t.shots).where(eq(t.shots.sceneId, sceneId)).all().some((x) => x.id !== shotId && (x.spec as ShotSpec).cameraId === cam.id);
  const own = !shared && cam.id.includes("~");
  const id = own ? cam.id : `${cam.id.split("~")[0]}~${shotId.slice(0, 6)}`;
  const camera = { ...next, id, name: own ? cam.name : `${cam.name.replace(/, (turned|for this panel)$/, "")}, for this panel` };
  const cameras = own ? plan.data.cameras.map((c) => (c.id === id ? camera : c)) : [...plan.data.cameras.filter((c) => c.id !== id), camera];
  db.insert(t.plans).values({ id: randomUUID(), sceneId, name: plan.name, version: plan.version + 1, data: { ...plan.data, cameras } }).run();
  db.update(t.shots).set({ spec: { ...spec, cameraId: id } }).where(eq(t.shots.id, shotId)).run();
}

/**
 * Positions from the panels' words (D36): walking off, going somewhere, sitting or lying on
 * something, turning to someone, picking up or putting down a prop. Set as the app's
 * placements on each panel (by "app"), worked out again every time, around anything the user
 * has set; then what carries on. Returns whether anything changed.
 */
export function applyPanelWords(db: DB, sceneId: string): boolean {
  const plan = latestPlan(db, sceneId);
  const scene = db.select().from(t.scenes).where(eq(t.scenes.id, sceneId)).get();
  if (!plan || !scene) return false;
  const people = getCast(db, scene.projectId).map((c) => ({ id: c.id, name: c.name }));
  const shots = panelsOf(db, sceneId).map((p) => ({ p, sh: shotForPanel(db, p.id) })).filter((x): x is { p: typeof x.p; sh: NonNullable<typeof x.sh> } => !!x.sh);
  const mine = (sp: ShotSpec) => Object.fromEntries(Object.entries(sp.blocking ?? {}).filter(([, b]) => b.by === "you"));
  const app = blockingFromWords(plan.data, shots.map(({ p, sh }) => ({
    action: p.description, subjectId: sh.spec.subjectId ?? sh.spec.speakerId ?? sh.spec.visibleIds[0], visibleIds: sh.spec.visibleIds, at: sh.spec.at, own: mine(sh.spec), places: sh.spec.where,
  })), people);
  let changed = false;
  shots.forEach(({ sh }, k) => {
    const own = mine(sh.spec);
    const set = Object.fromEntries(Object.entries(sh.spec.blocking ?? {}).filter(([, b]) => b.by !== "carried"));
    const next: Record<string, PanelBlock> = { ...own };
    for (const [key, e] of Object.entries(app[k])) if (!own[key]) next[key] = e;
    if (JSON.stringify(set) === JSON.stringify(next)) return;
    changed = true;
    const spec: ShotSpec = { ...sh.spec, blocking: next };
    if (!Object.keys(next).length) delete spec.blocking;
    db.update(t.shots).set({ spec }).where(eq(t.shots.id, sh.id)).run();
  });
  const carried = recarry(db, sceneId);
  // Postures (D37): from the words, carried on until they change, standing for anyone walking.
  const now = panelsOf(db, sceneId).map((p) => ({ p, sh: shotForPanel(db, p.id) })).filter((x): x is { p: typeof x.p; sh: NonNullable<typeof x.sh> } => !!x.sh);
  const poses = posturesFromWords(plan.data, now.map(({ p, sh }) => ({
    action: p.description, subjectId: sh.spec.subjectId ?? sh.spec.speakerId ?? sh.spec.visibleIds[0], visibleIds: sh.spec.visibleIds, at: sh.spec.at, blocking: sh.spec.blocking,
  })), people, startPose(asStaging(scene.staging).spot, plan.data));
  let posed = false;
  now.forEach(({ sh }, k) => {
    const next = Object.keys(poses[k]).length ? poses[k] : undefined;
    if (JSON.stringify(sh.spec.posture ?? null) === JSON.stringify(next ?? null)) return;
    posed = true;
    const spec: ShotSpec = { ...sh.spec, posture: next };
    if (!next) delete spec.posture;
    db.update(t.shots).set({ spec }).where(eq(t.shots.id, sh.id)).run();
  });
  return changed || carried || posed;
}

/** Recompute what carries on from panel to panel across a scene, in panel order (D35). */
export function recarry(db: DB, sceneId: string): boolean {
  const shots = panelsOf(db, sceneId).map((p) => shotForPanel(db, p.id)).filter((x): x is NonNullable<typeof x> => !!x);
  const next = carryBlocking(shots);
  let changed = false;
  shots.forEach((sh, k) => {
    if (JSON.stringify(sh.spec.blocking ?? null) === JSON.stringify(next[k].blocking ?? null)) return;
    changed = true;
    db.update(t.shots).set({ spec: next[k] }).where(eq(t.shots.id, sh.id)).run();
  });
  return changed;
}
