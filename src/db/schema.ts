// AI Video Production Studio — data schema (Build Spec v1.4, decision D12: Drizzle + SQLite).
// JSON columns hold domain objects defined in src/lib/domain/types.ts.
// Designed to port to PostgreSQL (drizzle-orm/pg-core) without changing the domain layer.

import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const created = () => text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`);

export const projects = sqliteTable("projects", {
  id: id(),
  code: text("code").notNull().unique(), // e.g. POT — used in asset IDs
  name: text("name").notNull(),
  type: text("type").notNull().default("series"),
  brief: text("brief", { mode: "json" }).notNull().default({}),
  briefApproved: integer("brief_approved", { mode: "boolean" }).notNull().default(false),
  generator: text("generator").notNull().default("kling-3.0-omni"),
  demo: integer("demo", { mode: "boolean" }).notNull().default(false),
  createdAt: created(),
});

export const characters = sqliteTable("characters", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(), // stable id used in plans and shots, e.g. "jade"
  name: text("name").notNull(),
  pronoun: text("pronoun").notNull().default("they"),
  role: text("role").notNull().default(""),
  invented: integer("invented", { mode: "boolean" }).notNull().default(true),
  consentRef: text("consent_ref"),
}, (t) => [uniqueIndex("characters_project_slug").on(t.projectId, t.slug)]);

/** Immutable once approved — a change creates a new version (Stage 2). */
export const characterVersions = sqliteTable("character_versions", {
  id: id(),
  characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"), // draft | approved | superseded
  profile: text("profile", { mode: "json" }).notNull().default({}),
  voiceLock: text("voice_lock").notNull(),
  createdAt: created(),
}, (t) => [uniqueIndex("character_versions_unique").on(t.characterId, t.version)]);

export const venues = sqliteTable("venues", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** interior | exterior — sets the wording of venue image prompts. */
  setting: text("setting").notNull().default("interior"),
  status: text("status").notNull().default("draft"),
  views: text("views", { mode: "json" }).notNull().default([]), // PlanView[]
});

export const scenes = sqliteTable("scenes", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  venueId: text("venue_id").references(() => venues.id),
  episode: integer("episode").notNull(),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  /** Character slugs in this scene; empty means everyone (older scenes). */
  cast: text("cast", { mode: "json" }).notNull().default([]),
  /** The creator's own telling of the scene (D18). */
  story: text("story").notNull().default(""),
  targetSec: integer("target_sec").notNull().default(60),
  /** Where the characters are and who else is there, used in every picture and clip (D18c). */
  staging: text("staging", { mode: "json" }).notNull().default({}),
}, (t) => [uniqueIndex("scenes_unique").on(t.projectId, t.episode, t.number)]);

export const panels = sqliteTable("panels", {
  id: id(),
  sceneId: text("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  code: text("code").notNull(), // e.g. C4a
  order: integer("order").notNull(),
  description: text("description").notNull(),
  emotion: text("emotion").notNull().default(""),
  dialogue: text("dialogue", { mode: "json" }).notNull().default([]), // {characterId, text}[]
  durationSec: real("duration_sec").notNull().default(4),
  imageAssetId: text("image_asset_id"),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
});

export const plans = sqliteTable("plans", {
  id: id(),
  sceneId: text("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  data: text("data", { mode: "json" }).notNull(), // GeometryPlanData
  updatedAt: created(),
});

export const shots = sqliteTable("shots", {
  id: id(),
  sceneId: text("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  panelId: text("panel_id").references(() => panels.id),
  code: text("code").notNull(),
  spec: text("spec", { mode: "json" }).notNull(), // ShotSpec
  status: text("status").notNull().default("draft"),
});

export const promptVersions = sqliteTable("prompt_versions", {
  id: id(),
  shotId: text("shot_id").notNull().references(() => shots.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  text: text("text").notNull(),
  settings: text("settings", { mode: "json" }).notNull(),
  findings: text("findings", { mode: "json" }).notNull().default([]),
  createdAt: created(),
}, (t) => [uniqueIndex("prompt_versions_unique").on(t.shotId, t.version)]);

export const takes = sqliteTable("takes", {
  id: id(),
  shotId: text("shot_id").notNull().references(() => shots.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  promptVersion: integer("prompt_version").notNull(),
  credits: real("credits"),
  durationSec: real("duration_sec"),
  verdict: text("verdict").notNull().default("pending"),
  failureCategories: text("failure_categories", { mode: "json" }).notNull().default([]),
  comments: text("comments").notNull().default(""),
  videoAssetId: text("video_asset_id"),
  libraryItemIds: text("library_item_ids", { mode: "json" }).notNull().default([]),
  createdAt: created(),
}, (t) => [uniqueIndex("takes_unique").on(t.shotId, t.number)]);

/** Every file. assetCode is the predictable filename; providerIds are never confused with it. */
export const assets = sqliteTable("assets", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  assetCode: text("asset_code").notNull().unique(),
  kind: text("kind").notNull(), // character-ref | venue-ref | start-frame | panel | take | audio | animatic
  path: text("path").notNull(),
  mime: text("mime").notNull(),
  providerIds: text("provider_ids", { mode: "json" }).notNull().default({}),
  sourceNote: text("source_note").notNull().default(""),
  createdAt: created(),
});

export const animatics = sqliteTable("animatics", {
  id: id(),
  sceneId: text("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  timeline: text("timeline", { mode: "json" }).notNull(), // AnimaticTimeline
  status: text("status").notNull().default("current"),
  createdAt: created(),
}, (t) => [uniqueIndex("animatics_unique").on(t.sceneId, t.version)]);

/** Stage 10 library. L1 = private to owner. */
export const libraryItems = sqliteTable("library_items", {
  id: id(),
  ownerId: text("owner_id").notNull().default("local"),
  kind: text("kind").notNull(), // venue | shot-setup | character | prompt-template | scene-kit
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  sourceId: text("source_id"),
  sourceName: text("source_name"),
  visibility: text("visibility").notNull().default("private"),
  data: text("data", { mode: "json" }).notNull(),
  createdAt: created(),
});
