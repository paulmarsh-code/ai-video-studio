// Shot designer: the app proposes cameras for each storyboard shot by applying the
// cinematic rules library (docs/CINEMA_RULES.md) to the floor plan. Deterministic:
// the same plan and storyboard always give the same proposals.

import { deriveDuration } from "./duration";
import { cameraPlacementProblem, horizontalFov, occlusions, readCamera, type CameraReading } from "./geometry";
import { GENRE_PROFILES, genreBonus, type Genre } from "./genre";
import type { CameraPreset, GeometryPlanData, PlanCamera, Point, ShotSpec } from "./types";

export type MomentKind = "establishing" | "dialogue" | "peak" | "reaction" | "exit";

export interface ShotInput {
  id: string;
  code: string;
  spec: ShotSpec;
  /** Storyboard panel text, used to recognise arrivals and exits. */
  description?: string;
}

export interface CameraOption {
  camera: PlanCamera;
  kind: string; // e.g. "Over-the-shoulder on Jade"
  score: number;
  reasons: string[]; // rule-backed reasons, e.g. "R-SHOULDER: Chase's shoulder frames the shot"
}

export interface ShotDesign {
  shotId: string;
  shotCode: string;
  moment: MomentKind;
  options: CameraOption[]; // best first; empty if nothing passes the hard rules
  warning?: string;
}

export interface MultiShotGroup {
  shotIds: string[];
  shotCodes: string[];
  durationSec: number;
  reason: string;
}

export interface SceneDesign {
  side: number; // which side of the line of action all cameras use
  lineOfAction?: [string, string];
  shots: ShotDesign[];
  multiShot: MultiShotGroup[];
}

const STRONG_EMOTION = /\b(angry|anger|furious|fury|rage|shock|shocked|disbelief|devastat|heartbroken|terrified|ecstatic|outraged|humiliat)/i;
const EXIT_WORDS = /\b(walks? (away|off|out)|leaves?|leaving|exits?|storms? off)\b/i;
const ARRIVE_WORDS = /\b(arrives?|arriving|walks? in|enters?|joins?|approaches)\b/i;

// ---------- vector helpers ----------
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const norm = (v: Point): Point => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const rot = (v: Point, deg: number): Point => {
  const t = (deg * Math.PI) / 180;
  return { x: v.x * Math.cos(t) - v.y * Math.sin(t), y: v.x * Math.sin(t) + v.y * Math.cos(t) };
};
const round = (p: Point): Point => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
const centroid = (ps: Point[]): Point => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });

function sideOf(a: Point, b: Point, p: Point): number {
  const ab = sub(b, a);
  const ap = sub(p, a);
  return Math.sign(ab.x * ap.y - ab.y * ap.x);
}

// ---------- classification ----------

export function classifyMoment(shot: ShotInput, index: number): MomentKind {
  const s = shot.spec;
  const text = `${shot.description ?? ""} ${s.actions} ${s.sceneContext}`;
  if (s.speakerId) {
    const words = (s.dialogue ?? "").trim().split(/\s+/).filter(Boolean).length;
    if (STRONG_EMOTION.test(s.emotion ?? "") && words <= 4) return "peak";
    return "dialogue";
  }
  if (EXIT_WORDS.test(text)) return "exit";
  if (index === 0 || ARRIVE_WORDS.test(text)) return "establishing";
  return "reaction";
}

// ---------- candidate generation ----------

interface Candidate {
  camera: PlanCamera;
  kind: string;
  role: "ots" | "cu" | "group" | "wide";
  partnerId?: string;
}

function makeCam(id: string, name: string, preset: CameraPreset, position: Point, lookAt: Point): PlanCamera {
  return { id, name, preset, position: round(position), lookAt: round(lookAt) };
}

/** How far back a camera must stand for everyone visible to fit across the frame (D19). */
export function groupFitDistance(plan: GeometryPlanData, shot: ShotSpec, preset: CameraPreset): number {
  const pts = shot.visibleIds.map((id) => plan.actors.find((a) => a.characterId === id)?.position).filter((p): p is Point => !!p);
  const spread = pts.reduce((m, p) => Math.max(m, ...pts.map((q) => Math.hypot(p.x - q.x, p.y - q.y))), 0);
  const hfov = horizontalFov(plan, { id: "", name: "", preset, position: { x: 0, y: 0 }, lookAt: { x: 1, y: 0 } });
  return spread / 2 / Math.tan((hfov * Math.PI) / 360) + 0.6;
}

function candidates(plan: GeometryPlanData, shot: ShotSpec, moment: MomentKind, partnerId: string | undefined, name: (id: string) => string): Candidate[] {
  const pos = (id: string) => plan.actors.find((a) => a.characterId === id)?.position;
  const subjectId = shot.subjectId ?? shot.speakerId ?? shot.visibleIds[0];
  const S = subjectId ? pos(subjectId) : undefined;
  const out: Candidate[] = [];
  if (!S) return out;

  // Over-the-shoulder on the subject, over the partner's shoulder (R-OTS / R-REVERSE / R-TRIANGLE).
  const P = partnerId ? pos(partnerId) : undefined;
  if (P && (moment === "dialogue" || moment === "peak")) {
    const u = norm(sub(S, P));
    const r = { x: u.y, y: -u.x };
    for (const sgn of [1, -1]) for (const back of [0.8, 1.0, 1.2]) for (const off of [0.2, 0.3, 0.4]) for (const aim of [0, 0.25]) {
      const n = mul(r, sgn);
      const camPos = add(sub(P, mul(u, back)), mul(n, off));
      const look = sub(S, mul(n, aim));
      out.push({
        camera: makeCam("ots", `OTS on ${name(subjectId!)}`, "main-ots", camPos, look),
        kind: `Over-the-shoulder on ${name(subjectId!)} (over ${name(partnerId!)})`,
        role: "ots",
        partnerId,
      });
    }
  }

  // Close-up on the subject (R-CU-EMOTION).
  if (moment === "peak" || moment === "dialogue") {
    const base = P ? norm(sub(S, P)) : { x: 0, y: 1 };
    for (const dist of [1.4, 1.7, 2.0]) for (const off of [-40, -25, -10, 10, 25, 40]) {
      const dir = rot(base, off);
      out.push({
        camera: makeCam("cu", `Close-up on ${name(subjectId!)}`, "single-cu", sub(S, mul(dir, dist)), S),
        kind: `Close-up on ${name(subjectId!)}`,
        role: "cu",
      });
    }
  }

  // Group / reaction shot (R-REACTION). The camera stands far enough back for everyone to fit
  // side by side across the frame's width (D19): a portrait frame needs more distance.
  const visiblePts = shot.visibleIds.map(pos).filter((p): p is Point => !!p);
  const radii = (base: number[], preset: CameraPreset) => { const fit = groupFitDistance(plan, shot, preset); return [...new Set([...base, fit, fit * 1.2, fit * 1.45].map((r) => +r.toFixed(2)))]; };
  if (visiblePts.length >= 2 && (moment === "reaction" || moment === "dialogue" || moment === "exit" || moment === "peak")) {
    const c = centroid(visiblePts);
    for (const radius of radii([2.0, 2.6, 3.2], "two-shot")) for (let a = 0; a < 360; a += 15) {
      const camPos = add(c, mul({ x: Math.cos((a * Math.PI) / 180), y: Math.sin((a * Math.PI) / 180) }, radius));
      out.push({ camera: makeCam("group", "Group shot", "two-shot", camPos, c), kind: "Group shot", role: "group" });
    }
  }

  // Wide / master (R-MASTER).
  if (moment === "establishing" || moment === "exit" || moment === "reaction") {
    const pts = visiblePts.length ? visiblePts : [S];
    const c = centroid(pts);
    for (const radius of radii([3.5, 4.5, 5.5], "wide")) for (let a = 0; a < 360; a += 15) {
      const camPos = add(c, mul({ x: Math.cos((a * Math.PI) / 180), y: Math.sin((a * Math.PI) / 180) }, radius));
      out.push({ camera: makeCam("wide", "Wide", "wide", camPos, c), kind: "Wide (master)", role: "wide" });
    }
  }
  return out;
}

// ---------- scoring ----------

interface Memory {
  screenSide: Map<string, number>; // -1 left, +1 right
  background: Map<string, string>; // subject → background
  lastBySubject: Map<string, { forwardDeg: number; preset: CameraPreset }>;
}

const sideNum = (frame: string) => (frame === "frame-left" ? -1 : frame === "frame-right" ? 1 : 0);

function score(
  plan: GeometryPlanData,
  cand: Candidate,
  shot: ShotSpec,
  moment: MomentKind,
  sceneSide: number,
  line: [Point, Point] | undefined,
  mem: Memory,
  name: (id: string) => string,
  genre: Genre = "neutral",
): { ok: boolean; score: number; reasons: string[]; reading?: CameraReading } {
  const cam = cand.camera;
  if (cameraPlacementProblem(plan, cam)) return { ok: false, score: 0, reasons: [] };
  if (line && sideOf(line[0], line[1], cam.position) !== sceneSide) return { ok: false, score: 0, reasons: [] };
  const reading = readCamera(plan, cam);
  const subjectId = shot.subjectId ?? shot.speakerId ?? shot.visibleIds[0];
  const required = cand.role === "cu" ? [subjectId] : shot.visibleIds;
  for (const id of required) {
    const a = reading.actors.find((x) => x.characterId === id);
    if (!a || !a.inView) return { ok: false, score: 0, reasons: [] };
  }
  // Everyone not framed out is physically there and can stand in the way (D19).
  const standing = shot.presentIds.length ? shot.presentIds.filter((id) => !shot.excludedIds.includes(id)) : shot.visibleIds;
  const occ = occlusions(reading, cand.role === "cu" ? [subjectId] : shot.visibleIds, [...new Set([...standing, ...shot.visibleIds])]);
  // A hidden face is unusable, whoever is in the way.
  if (occ.some((o) => o.level === "face")) return { ok: false, score: 0, reasons: [] };

  let s = 0;
  const reasons: string[] = ["R-180: on the scene's side of the line of action"];
  const fov = horizontalFov(plan, cam);
  const subj = reading.actors.find((a) => a.characterId === subjectId)!;

  // Preferred camera type per moment (R-MASTER, R-OTS, R-CU-EMOTION, R-REACTION).
  const pref: Record<MomentKind, Partial<Record<Candidate["role"], number>>> = {
    establishing: { wide: 4 },
    dialogue: { ots: 4, cu: 1.5, group: 0.5 },
    peak: { cu: 4, ots: 2.5 },
    reaction: { group: 4, wide: 2 },
    exit: { wide: 3, group: 2.5 },
  };
  s += pref[moment][cand.role] ?? 0;
  let gb = genreBonus(genre, cand.role, moment);
  const words = (shot.dialogue ?? "").trim().split(/\s+/).filter(Boolean).length;
  if (moment === "dialogue" && cand.role === "group" && words > 0 && words <= 8) gb += GENRE_PROFILES[genre].shortLineTwoShotBonus ?? 0;
  s += gb;
  if (gb > 0.4 && GENRE_PROFILES[genre].reason) reasons.push(GENRE_PROFILES[genre].reason);

  // R-SHOULDER.
  if (cand.role === "ots") {
    const fg = reading.actors.find((a) => a.foreground);
    if (fg && fg.characterId === cand.partnerId) { s += 3; reasons.push(`R-SHOULDER: ${name(cand.partnerId!)}'s shoulder frames the shot`); }
    else return { ok: false, score: 0, reasons: [] };
  }

  // R-THIRDS: subject off-centre in shared shots, centred in singles.
  if (cand.role === "cu") {
    s += 1.5 * (1 - Math.min(1, Math.abs(subj.angleDeg) / (fov / 4)));
  } else if (cand.role === "ots") {
    const target = fov / 6;
    const err = Math.abs(Math.abs(subj.angleDeg) - target) / target;
    s += 2 * (1 - Math.min(1, err));
    if (err < 0.5) reasons.push(`R-THIRDS: ${name(subjectId!)} sits on a third line`);
  }

  // Subject size suited to the shot (closer for emotion).
  let ideal = (cand.role === "cu" ? 1.6 : cand.role === "ots" ? 2.2 : cand.role === "group" ? 2.6 : 4.5) * GENRE_PROFILES[genre].distanceFactor;
  // A group shot is as close as it can be while everyone still fits across the frame (D19).
  if (cand.role === "group" || cand.role === "wide") ideal = Math.max(ideal, groupFitDistance(plan, shot, cam.preset) * (cand.role === "wide" ? 1.3 : 1));
  s += 1 - Math.min(1, Math.abs(subj.depthM - ideal) / ideal);

  // R-SCREEN: characters keep their side of the screen.
  let screenOk = true;
  for (const id of shot.visibleIds) {
    const a = reading.actors.find((x) => x.characterId === id);
    if (!a || !a.inView || a.foreground) continue;
    const before = mem.screenSide.get(id);
    const now = sideNum(a.frame);
    if (before !== undefined && now !== 0 && before !== now) { s -= 3; screenOk = false; }
    else if (before !== undefined && now === before) s += 0.5;
  }
  if (screenOk && mem.screenSide.size) reasons.push("R-SCREEN: everyone stays on their side of the screen");

  // R-BACKGROUND: same background behind the subject as in their other shots.
  const prevBg = mem.background.get(subjectId!);
  if (prevBg) {
    if (prevBg === reading.backgroundView) { s += 2; reasons.push(`R-BACKGROUND: ${reading.backgroundView} behind ${name(subjectId!)}, as in earlier shots`); }
    else s -= 1.5;
  }

  // R-30: a cut to the same subject needs a clear change of angle or size.
  const last = mem.lastBySubject.get(subjectId!);
  if (last) {
    const dAng = Math.abs(((reading.forwardDeg - last.forwardDeg + 540) % 360) - 180);
    if (dAng >= 30 || last.preset !== cam.preset) { s += 0.5; }
    else { s -= 2; }
  }

  // Body overlap: on the subject, and on anyone else who should be seen (D19). In an
  // over-the-shoulder shot the partner's shoulder is meant to overlap, so it is free.
  for (const o of occ) {
    if (o.level !== "body" || (cand.role === "ots" && o.blockerId === cand.partnerId)) continue;
    // In group and wide shots everyone must be seen, so any overlap costs more.
    const group = cand.role === "group" || cand.role === "wide";
    s -= o.characterId === subjectId ? (group ? 3 : 2) : (group ? 2.5 : 1.25);
  }
  // Someone much nearer the lens than the rest, in a shot that isn't over-the-shoulder,
  // fills the frame and hides the scene (D19).
  if (cand.role === "group" || cand.role === "wide") {
    const depths = reading.actors.filter((a) => a.inView && standing.includes(a.characterId)).map((a) => a.depthM).sort((a, b) => a - b);
    if (depths.length >= 2 && depths[0] < 0.6 * depths[Math.floor(depths.length / 2)]) s -= 2.5;
  }
  const excludedInView = shot.excludedIds.filter((id) => reading.actors.find((a) => a.characterId === id)?.inView).length;
  s -= 0.4 * excludedInView;

  return { ok: true, score: s, reasons, reading };
}

function remember(mem: Memory, shot: ShotSpec, reading: CameraReading, preset: CameraPreset) {
  const subjectId = shot.subjectId ?? shot.speakerId ?? shot.visibleIds[0];
  for (const id of shot.visibleIds) {
    const a = reading.actors.find((x) => x.characterId === id);
    if (a && a.inView && !a.foreground && sideNum(a.frame) !== 0 && !mem.screenSide.has(id)) mem.screenSide.set(id, sideNum(a.frame));
  }
  if (subjectId && reading.backgroundView && !mem.background.has(subjectId)) mem.background.set(subjectId, reading.backgroundView);
  if (subjectId) mem.lastBySubject.set(subjectId, { forwardDeg: reading.forwardDeg, preset });
}

// ---------- scene design ----------

/** Who the speaker is talking to: the other end of the line of action, else the nearest visible person. */
function partnerFor(plan: GeometryPlanData, shot: ShotSpec, line?: [string, string]): string | undefined {
  const s = shot.speakerId ?? shot.subjectId;
  if (!s) return undefined;
  if (line && line.includes(s)) {
    const other = line[0] === s ? line[1] : line[0];
    if (shot.visibleIds.includes(other)) return other;
  }
  const sp = plan.actors.find((a) => a.characterId === s)?.position;
  if (!sp) return undefined;
  return shot.visibleIds
    .filter((id) => id !== s)
    .map((id) => ({ id, d: Math.hypot((plan.actors.find((a) => a.characterId === id)?.position.x ?? 99) - sp.x, (plan.actors.find((a) => a.characterId === id)?.position.y ?? 99) - sp.y) }))
    .sort((a, b) => a.d - b.d)[0]?.id;
}

/** Line of action: the plan's, else the first two-person dialogue in the scene. */
function chooseLine(plan: GeometryPlanData, shots: ShotInput[]): [string, string] | undefined {
  if (plan.lineOfAction) return plan.lineOfAction;
  for (const sh of shots) {
    if (sh.spec.speakerId) {
      const p = partnerFor(plan, sh.spec);
      if (p) return [sh.spec.speakerId, p];
    }
  }
  return undefined;
}

function designForSide(plan: GeometryPlanData, shots: ShotInput[], side: number, line: [string, string] | undefined, name: (id: string) => string, seed?: Map<string, number>, genre: Genre = "neutral") {
  const pos = (id: string) => plan.actors.find((a) => a.characterId === id)?.position;
  const linePts = line && pos(line[0]) && pos(line[1]) ? ([pos(line[0])!, pos(line[1])!] as [Point, Point]) : undefined;
  const mem: Memory = { screenSide: new Map(seed ?? []), background: new Map(), lastBySubject: new Map() };
  let total = 0;
  const designs: ShotDesign[] = [];
  shots.forEach((sh, i) => {
    const moment = classifyMoment(sh, i);
    const partner = partnerFor(plan, sh.spec, line);
    const scored = candidates(plan, sh.spec, moment, partner, name)
      .map((c) => ({ c, r: score(plan, c, sh.spec, moment, side, linePts, mem, name, genre) }))
      .filter((x) => x.r.ok)
      .sort((a, b) => b.r.score - a.r.score);
    // Keep the best few distinct options (different type, or clearly different position).
    // Offer different kinds of shot first (best of each type), then fill with variations.
    const picked: typeof scored = [];
    for (const x of scored) if (!picked.some((p) => p.c.role === x.c.role)) picked.push(x);
    for (const x of scored) {
      if (picked.length >= 3) break;
      if (!picked.includes(x) && picked.every((p) => Math.hypot(p.c.camera.position.x - x.c.camera.position.x, p.c.camera.position.y - x.c.camera.position.y) > 0.6)) picked.push(x);
    }
    picked.splice(3);
    picked.sort((a, b) => b.r.score - a.r.score);
    const options: CameraOption[] = picked.map((x) => ({ camera: x.c.camera, kind: x.c.kind, score: Math.round(x.r.score * 10) / 10, reasons: x.r.reasons }));
    if (picked[0]?.r.reading) {
      remember(mem, sh.spec, picked[0].r.reading, picked[0].c.camera.preset);
      total += picked[0].r.score;
    } else total -= 10;
    designs.push({
      shotId: sh.id,
      shotCode: sh.code,
      moment,
      options,
      warning: options.length ? undefined : "No camera position passes the hard rules with this blocking. Move people apart, or let someone leave the frame.",
    });
  });
  return { designs, total, mem };
}

export function groupMultiShot(shots: ShotInput[], maxSec = 15, maxCuts = 6): MultiShotGroup[] {
  // R-MULTISHOT / R-ONE-SPEAKER: one speaker plus silent cutaways, or silent coverage only.
  const groups: MultiShotGroup[] = [];
  let cur: ShotInput[] = [];
  const flush = () => {
    if (cur.length >= 2) {
      const speakers = new Set(cur.map((s) => s.spec.speakerId).filter(Boolean));
      groups.push({
        shotIds: cur.map((s) => s.id),
        shotCodes: cur.map((s) => s.code),
        durationSec: cur.reduce((n, s) => n + s.spec.durationSec, 0),
        reason: speakers.size ? "One speaker followed by silent reaction cutaways (R-MULTISHOT, R-REACTION)." : "Silent coverage in one location (R-MULTISHOT).",
      });
    }
    cur = [];
  };
  for (const sh of shots) {
    const next = [...cur, sh];
    const speakers = new Set(next.map((s) => s.spec.speakerId).filter(Boolean));
    const speakerFirst = next.every((s, i) => !s.spec.speakerId || i === 0);
    const dur = next.reduce((n, s) => n + Math.max(s.spec.durationSec, s.spec.dialogue ? deriveDuration(s.spec.dialogue) : 0), 0);
    if (speakers.size <= 1 && speakerFirst && dur <= maxSec && next.length <= maxCuts) cur = next;
    else { flush(); cur = [sh]; }
  }
  flush();
  return groups;
}

export function designScene(plan: GeometryPlanData, shots: ShotInput[], name: (id: string) => string, genre: Genre = "neutral"): SceneDesign {
  const line = chooseLine(plan, shots);
  // Anchor screen sides from the dialogue (R-SCREEN): run the dialogue shots first, take the
  // side each character lands on, then design the whole scene against that anchor.
  const seedFor = (side: number) => {
    const dialogue = shots.filter((sh, i) => ["dialogue", "peak"].includes(classifyMoment(sh, i)));
    return designForSide(plan, dialogue, side, line, name, undefined, genre).mem.screenSide;
  };
  const a = designForSide(plan, shots, 1, line, name, seedFor(1), genre);
  const b = designForSide(plan, shots, -1, line, name, seedFor(-1), genre);
  const best = line ? (a.total >= b.total ? { side: 1, ...a } : { side: -1, ...b }) : { side: 1, ...a };
  return { side: best.side, lineOfAction: line, shots: best.designs, multiShot: groupMultiShot(shots) };
}

/**
 * Turn chosen options into plan cameras (shared when two shots pick the same position)
 * and a camera id per shot.
 */
export function applyDesign(plan: GeometryPlanData, choices: { shotId: string; shotCode: string; option: CameraOption }[], line?: [string, string]) {
  const cameras: PlanCamera[] = [];
  const assign: Record<string, string> = {};
  for (const ch of choices) {
    const c = ch.option.camera;
    const same = cameras.find((x) => x.preset === c.preset && Math.hypot(x.position.x - c.position.x, x.position.y - c.position.y) < 0.3 && Math.hypot(x.lookAt.x - c.lookAt.x, x.lookAt.y - c.lookAt.y) < 0.5);
    if (same) { assign[ch.shotId] = same.id; continue; }
    const id = `cam-${cameras.length + 1}`;
    cameras.push({ ...c, id, name: `${ch.option.kind.split(" (")[0]} (${ch.shotCode.split("_").pop()})` });
    assign[ch.shotId] = id;
  }
  return { plan: { ...plan, cameras, lineOfAction: line ?? plan.lineOfAction, referenceCameraId: cameras[0]?.id }, assign };
}
