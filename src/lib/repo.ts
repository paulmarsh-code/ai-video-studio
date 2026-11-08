// Data access: converts database rows into domain types used by the rules engine and UI.

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import type { CastMember, Finding, GeometryPlanData, PlanView, Pronoun, ShotSpec } from "./domain/types";

export interface PanelRow {
  id: string;
  code: string;
  order: number;
  description: string;
  emotion: string;
  dialogue: { characterId: string; text: string }[];
  durationSec: number;
  imageAssetId: string | null;
  status: string;
}

export function listProjects(db: DB) {
  return db.select().from(t.projects).orderBy(asc(t.projects.createdAt)).all();
}

export function getProject(db: DB, id: string) {
  return db.select().from(t.projects).where(eq(t.projects.id, id)).get();
}

/** Cast with each character's latest approved voice lock. Character id = slug. */
export function getCast(db: DB, projectId: string): CastMember[] {
  const chars = db.select().from(t.characters).where(eq(t.characters.projectId, projectId)).orderBy(sql`rowid`).all();
  if (!chars.length) return [];
  const versions = db
    .select()
    .from(t.characterVersions)
    .where(and(inArray(t.characterVersions.characterId, chars.map((c) => c.id)), eq(t.characterVersions.status, "approved")))
    .orderBy(desc(t.characterVersions.version))
    .all();
  return chars.map((c) => ({
    id: c.slug,
    name: c.name,
    pronoun: c.pronoun as Pronoun,
    voiceLock: versions.find((v) => v.characterId === c.id)?.voiceLock ?? "",
  }));
}

export function listScenes(db: DB, projectId: string) {
  return db.select().from(t.scenes).where(eq(t.scenes.projectId, projectId)).orderBy(asc(t.scenes.episode), asc(t.scenes.number)).all();
}

export function getScene(db: DB, sceneId: string) {
  const scene = db.select().from(t.scenes).where(eq(t.scenes.id, sceneId)).get();
  if (!scene) return undefined;
  const venue = scene.venueId ? db.select().from(t.venues).where(eq(t.venues.id, scene.venueId)).get() : undefined;
  const panels = db.select().from(t.panels).where(eq(t.panels.sceneId, sceneId)).orderBy(asc(t.panels.order)).all() as PanelRow[];
  const shots = db.select().from(t.shots).where(eq(t.shots.sceneId, sceneId)).all()
    .map((s) => ({ ...s, spec: s.spec as ShotSpec }))
    .sort((a, b) => (panels.find((p) => p.id === a.panelId)?.order ?? 99) - (panels.find((p) => p.id === b.panelId)?.order ?? 99));
  const plan = getLatestPlan(db, sceneId);
  return { scene, venue: venue ? { ...venue, views: venue.views as PlanView[] } : undefined, panels, shots, plan };
}

export function getLatestPlan(db: DB, sceneId: string) {
  const row = db.select().from(t.plans).where(eq(t.plans.sceneId, sceneId)).orderBy(desc(t.plans.version)).get();
  return row ? { ...row, data: row.data as GeometryPlanData } : undefined;
}

/** Saving a plan creates a new version; earlier versions are kept. */
export function savePlan(db: DB, sceneId: string, data: GeometryPlanData, name?: string) {
  const latest = getLatestPlan(db, sceneId);
  const version = (latest?.version ?? 0) + 1;
  db.insert(t.plans).values({ id: randomUUID(), sceneId, name: name ?? latest?.name ?? "Blocking plan", version, data }).run();
  return version;
}

export function getShot(db: DB, shotId: string) {
  const s = db.select().from(t.shots).where(eq(t.shots.id, shotId)).get();
  return s ? { ...s, spec: s.spec as ShotSpec } : undefined;
}

export function saveShotSpec(db: DB, shotId: string, spec: ShotSpec) {
  db.update(t.shots).set({ spec, code: spec.code }).where(eq(t.shots.id, shotId)).run();
}

export function listPromptVersions(db: DB, shotId: string) {
  return db.select().from(t.promptVersions).where(eq(t.promptVersions.shotId, shotId)).orderBy(desc(t.promptVersions.version)).all();
}

export function savePromptVersion(db: DB, shotId: string, text: string, settings: unknown, findings: Finding[]) {
  const latest = listPromptVersions(db, shotId)[0];
  if (latest && latest.text === text) return latest.version; // unchanged — no new version
  const version = (latest?.version ?? 0) + 1;
  db.insert(t.promptVersions).values({ id: randomUUID(), shotId, version, text, settings, findings }).run();
  return version;
}

// ---- Assets ----

export function insertAsset(db: DB, a: { projectId: string; assetCode: string; kind: string; path: string; mime: string; sourceNote?: string }) {
  const id = randomUUID();
  db.insert(t.assets).values({ id, ...a, sourceNote: a.sourceNote ?? "" }).run();
  return id;
}

export function getAsset(db: DB, id: string) {
  return db.select().from(t.assets).where(eq(t.assets.id, id)).get();
}

export function listAssets(db: DB, projectId: string, kind?: string) {
  const rows = db.select().from(t.assets).where(eq(t.assets.projectId, projectId)).all();
  return kind ? rows.filter((r) => r.kind === kind) : rows;
}

// ---- Animatic (Release 1) ----

export interface AnimaticTimeline {
  /** Uploaded audio per dialogue line, keyed by panel id. */
  lineAudio: Record<string, { assetId: string; durationSec?: number }>;
  /** Per-panel duration overrides (seconds). */
  durations: Record<string, number>;
}

export function getAnimatic(db: DB, sceneId: string) {
  const row = db.select().from(t.animatics).where(eq(t.animatics.sceneId, sceneId)).orderBy(desc(t.animatics.version)).get();
  return row ? { ...row, timeline: row.timeline as AnimaticTimeline } : undefined;
}

export function saveAnimatic(db: DB, sceneId: string, timeline: AnimaticTimeline) {
  const latest = getAnimatic(db, sceneId);
  const version = (latest?.version ?? 0) + 1;
  if (latest) db.update(t.animatics).set({ status: "superseded" }).where(eq(t.animatics.id, latest.id)).run();
  db.insert(t.animatics).values({ id: randomUUID(), sceneId, version, timeline }).run();
  return version;
}

// ---- Library (Stage 10, L1 private) ----

export type LibraryKind = "venue" | "shot-setup" | "character" | "prompt-template" | "scene-kit";

export function listLibrary(db: DB, ownerId = "local") {
  return db.select().from(t.libraryItems).where(eq(t.libraryItems.ownerId, ownerId)).orderBy(desc(t.libraryItems.createdAt)).all();
}

export function getLibraryItem(db: DB, id: string) {
  return db.select().from(t.libraryItems).where(eq(t.libraryItems.id, id)).get();
}

export function addLibraryItem(db: DB, item: { kind: LibraryKind; name: string; data: unknown; ownerId?: string }) {
  const id = randomUUID();
  db.insert(t.libraryItems).values({ id, ownerId: item.ownerId ?? "local", kind: item.kind, name: item.name, data: item.data }).run();
  return id;
}

/** Copy-and-change: the original is never modified; the copy credits its source. */
export function copyLibraryItem(db: DB, sourceId: string, changes: { name?: string; data?: unknown }, ownerId = "local") {
  const src = getLibraryItem(db, sourceId);
  if (!src) throw new Error("Library item not found");
  const id = randomUUID();
  db.insert(t.libraryItems).values({
    id, ownerId, kind: src.kind, name: changes.name ?? `${src.name} (copy)`, version: src.version + 1,
    sourceId: src.id, sourceName: src.name, visibility: "private", data: changes.data ?? src.data,
  }).run();
  return id;
}

/** Library stats from the take log only (spec Stage 10). */
export function libraryStats(db: DB, itemId: string) {
  const all = db.select().from(t.takes).all().filter((tk) => (tk.libraryItemIds as string[]).includes(itemId));
  const reviewed = all.filter((tk) => tk.verdict !== "pending");
  const byShot = new Map<string, typeof all>();
  for (const tk of reviewed) byShot.set(tk.shotId, [...(byShot.get(tk.shotId) ?? []), tk]);
  const firstTakes = [...byShot.values()].map((ts) => ts.sort((a, b) => a.number - b.number)[0]);
  const approvedShots = [...byShot.values()].filter((ts) => ts.some((x) => x.verdict === "approved"));
  return {
    uses: reviewed.length,
    firstTakeApproval: firstTakes.length ? firstTakes.filter((x) => x.verdict === "approved").length / firstTakes.length : null,
    takesPerApprovedClip: approvedShots.length ? approvedShots.reduce((n, ts) => n + ts.length, 0) / approvedShots.length : null,
  };
}

export function insertTake(db: DB, take: { shotId: string; number: number; promptVersion: number; verdict: string; libraryItemIds?: string[]; credits?: number }) {
  db.insert(t.takes).values({ id: randomUUID(), ...take, libraryItemIds: take.libraryItemIds ?? [] }).run();
}
