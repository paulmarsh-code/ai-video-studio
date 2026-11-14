// Kling Elements made from the app's own approved pictures (D127). Each character, the venue and
// each key prop becomes one Element: the same pictures the storyboard was drawn from, so the clips
// and the storyboard can't disagree. The app writes what to make to data/kling_element_requests.json;
// Claude uploads the pictures, makes each Element in Kling and writes its id back; the clips page
// links it.

import fs from "node:fs";
import path from "node:path";
import type { DB } from "@/db/client";
import * as repo from "./repo";
import * as studio from "./studioRepo";
import { asStaging } from "./domain/story";
import { elementKey } from "./domain/clips";
import { isSetPiece } from "./domain/setRender";
import { setPicturesOf } from "./domain/setPictures";
import { withPiecePictures } from "./setImage";

export interface ElementRequest {
  key: string;
  projectId: string;
  kind: "Character" | "Venue" | "Prop";
  what: string;
  /** At most 20 characters: Kling's name box. */
  name: string;
  description: string;
  /** From Kling's catalogue: Characters, Scenes, Items. */
  tags: string[];
  /** Picture 1 is the cover; then 1–3 more. `path` is the file on this computer. */
  pictures: { role: string; assetId: string; path: string; klingUrl?: string }[];
  status: "ready" | "sent" | "done" | "failed";
  requestedAt: string;
  id?: string;
  /** When the clips page linked the made Element, once: a later pick in the dropdown stands. */
  linkedAt?: string;
  error?: string;
}

const file = () => path.join(process.cwd(), "data", "kling_element_requests.json");

export function readElementRequests(): { updatedAt?: string; requests: ElementRequest[] } {
  try {
    if (!fs.existsSync(file())) return { requests: [] };
    const j = JSON.parse(fs.readFileSync(file(), "utf8")) as { updatedAt?: string; requests?: ElementRequest[] };
    return { ...j, requests: Array.isArray(j.requests) ? j.requests : [] };
  } catch {
    return { requests: [] };
  }
}

function writeElementRequests(requests: ElementRequest[]) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify({ updatedAt: new Date().toISOString(), requests }, null, 1));
}

const short = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
export { nameOf, ofProject } from "./klingNames";
import { nameOf } from "./klingNames";

/**
 * What each of a scene's Elements would be made from, by its key. A thing with no approved
 * picture yet is left out; the clips page says so.
 */
export function elementSources(db: DB, sceneId: string): Omit<ElementRequest, "status" | "requestedAt">[] {
  const s = repo.getScene(db, sceneId);
  if (!s) return [];
  const projectId = s.scene.projectId;
  const code = repo.getProject(db, projectId)?.code ?? "";
  const asset = (id?: string) => (id ? repo.getAsset(db, id) : undefined);
  const pic = (role: string, id?: string) => { const a = asset(id); return a && fs.existsSync(a.path) ? [{ role, assetId: a.id, path: a.path }] : []; };
  const out: Omit<ElementRequest, "status" | "requestedAt">[] = [];

  // Characters in this scene: the approved front as the cover, then the face, back and side (D127).
  const inScene = new Set(s.shots.flatMap((sh) => [...(sh.spec.presentIds ?? []), ...sh.spec.visibleIds]));
  for (const c of studio.listCharacters(db, projectId)) {
    const v = c.approved;
    if (!v || !inScene.has(c.slug)) continue;
    const p = v.profile as { appearance?: string; wardrobe?: string; refs?: Record<string, string> };
    const refs = p.refs ?? {};
    const pictures = [...pic("front", refs.front ?? refs.face), ...pic("face", refs.front ? refs.face : undefined), ...pic("back", refs.back), ...pic("side", refs.side)].slice(0, 4);
    if (pictures.length < 2) continue;
    out.push({ key: elementKey.character(c.slug), projectId, kind: "Character", what: c.name, name: nameOf(c.name, code), description: short(clean(`${p.appearance ?? ""} ${p.wardrobe ?? ""}`), 400), tags: ["Characters"], pictures });
  }

  // The venue: the set's own wall pictures (what the storyboard is drawn on), else its views.
  if (s.venue) {
    const views = (s.venue.views ?? []) as { name: string; imageAssetId?: string }[];
    const walls = setPicturesOf(s.venue.setPictures).walls ?? {};
    const pictures = views.flatMap((v) => pic(v.name, walls[v.name] ?? v.imageAssetId)).slice(0, 4);
    if (pictures.length >= 2) out.push({ key: elementKey.venue(s.venue.id), projectId, kind: "Venue", what: s.venue.name, name: nameOf(s.venue.name, code), description: short(clean(s.venue.description ?? ""), 400), tags: ["Scenes"], pictures });
  }

  // Props: the set's cut-out as the cover, then the prop's own picture (D108, D111).
  const pieces = setPicturesOf(s.venue?.setPictures).pieces ?? {};
  const staged = asStaging(s.scene.staging).props;
  // Each piece with its picture as the set uses it, borrowed from another scene at the venue if need be.
  const furniture = (s.plan ? withPiecePictures(db, sceneId, s.plan.data).furniture ?? [] : []).filter(isSetPiece);
  const held = [...new Set(s.shots.flatMap((sh) => (sh.spec.props ?? []).map((x) => x.name)))];
  const names = [...new Set([...furniture.map((f) => f.name), ...held])];
  for (const n of names) {
    const f = furniture.find((x) => x.name === n);
    const own = f?.imageAssetId ?? staged.find((x) => x.name.toLowerCase() === n.toLowerCase())?.imageAssetId;
    const cut = own ? pieces[own] : undefined;
    let pictures = [...pic("cut-out", cut), ...pic("picture", own)];
    // Kling wants a cover and at least one more: one picture serves as both.
    if (pictures.length === 1) pictures = [pictures[0], { ...pictures[0], role: "picture" }];
    if (!pictures.length) continue;
    const detail = f?.detail ?? staged.find((x) => x.name.toLowerCase() === n.toLowerCase())?.detail ?? "";
    out.push({ key: elementKey.prop(n), projectId, kind: "Prop", what: n, name: nameOf(n.charAt(0).toUpperCase() + n.slice(1), code), description: short(clean(detail), 400), tags: ["Items"], pictures });
  }
  return out;
}

/** Ask Claude to make these Elements (all of the scene's, or the keys given). */
export function requestElements(db: DB, sceneId: string, keys?: string[]): ElementRequest[] {
  const now = new Date().toISOString();
  const want = elementSources(db, sceneId).filter((x) => !keys?.length || keys.includes(x.key));
  const cur = readElementRequests().requests.filter((r) => !want.some((w) => w.key === r.key && w.projectId === r.projectId));
  const next = want.map((w) => ({ ...w, status: "ready" as const, requestedAt: now }));
  writeElementRequests([...cur, ...next]);
  return next;
}

/**
 * Link each Element Claude has made to its character, venue or prop, once (D127): the clips page
 * calls this as it opens, so a made Element shows in its dropdown with no more clicks.
 */
export function linkMadeElements(db: DB, projectId: string): number {
  const all = readElementRequests().requests;
  let n = 0;
  for (const r of all) {
    if (r.projectId !== projectId || r.status !== "done" || !r.id || r.linkedAt) continue;
    studio.setKlingElement(db, projectId, r.key, { id: r.id, name: r.name });
    r.linkedAt = new Date().toISOString();
    n++;
  }
  if (n) writeElementRequests(all);
  return n;
}
