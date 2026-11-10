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
import type { GeometryPlanData, PlanView, Pronoun, ShotSpec } from "./domain/types";
import { asGenre, type Genre } from "./domain/genre";
import { asStaging, checkStoryboard, defaultPlan, panelSeconds, shotSpecFor, type DraftPanel, type SceneStaging } from "./domain/story";
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
  return { dialogueChanged, animaticMarked, shotUpdated };
}

/** A new picture always needs approving again. */
export function setPanelImage(db: DB, panelId: string, assetId: string) {
  db.update(t.panels).set({ imageAssetId: assetId, status: "draft", check: {} }).where(eq(t.panels.id, panelId)).run();
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
    db.insert(t.plans).values({ id: randomUUID(), sceneId, name: "First floor plan (from the story)", version: 1, data: defaultPlan(castIds, s.panels, (venue?.views ?? []) as PlanView[], staging, projectAspect(db, scene.projectId)) }).run();
  }
  const locks = (scene.locks ?? {}) as SceneLocks;
  db.update(t.scenes).set({ story: s.story, targetSec: s.targetSec, staging, locks: { positions: locks.positions } }).where(eq(t.scenes.id, sceneId)).run();
  persist(db);
  return { panels: s.panels.length, totalSec: check.totalSec };
}

/**
 * Change the scene setting (D18c). Every shot carries the setting, so the picture and Kling
 * prompts of the whole scene change together. Pictures already made keep the old setting
 * until they are redrawn.
 */
export function saveSceneStaging(db: DB, sceneId: string, staging: Partial<SceneStaging>) {
  const st = asStaging(staging);
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
    db.insert(t.plans).values({ id: randomUUID(), sceneId, name: AUTO_PLANS[0], version: plan!.version + 1, data: defaultPlan(castIds, panels, (venue?.views ?? []) as PlanView[], st, projectAspect(db, scene.projectId)) }).run();
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

export function approvePositions(db: DB, sceneId: string) {
  const plan = latestPlan(db, sceneId);
  if (!plan || !plan.data.actors.length) throw new Error("There is no floor plan to approve yet.");
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
  const moved = cur.actors.length !== next.actors.length || cur.actors.some((a) => { const b = next.actors.find((x) => x.characterId === a.characterId); return !b || !same(a.position, b.position); })
    || (cur.furniture ?? []).length !== (next.furniture ?? []).length || (cur.furniture ?? []).some((f) => { const g = (next.furniture ?? []).find((x) => x.id === f.id); return !g || !same(f.position, g.position) || f.radiusM !== g.radiusM || f.heightM !== g.heightM; });
  if (moved) throw new Error("The positions are approved and locked. Unlock them on the storyboard to move people or props.");
}

export function shotIdForPanel(db: DB, panelId: string): string | undefined {
  return db.select().from(t.shots).where(eq(t.shots.panelId, panelId)).get()?.id;
}

export function setPanelCheck(db: DB, panelId: string, check: { pass: boolean; problems: string[] }) {
  db.update(t.panels).set({ check: { ...check, at: new Date().toISOString() } }).where(eq(t.panels.id, panelId)).run();
  persist(db);
}
