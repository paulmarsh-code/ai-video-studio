// Shot designer: the app proposes cameras for each storyboard shot by applying the
// cinematic rules library (docs/CINEMA_RULES.md) to the floor plan. Deterministic:
// the same plan and storyboard always give the same proposals.

import { deriveDuration } from "./duration";
import { mainSubjectId } from "./composer";
import { cameraPlacementProblem, facingOf, horizontalFov, PRESET_FOV, occlusions, planForShot, propsBlocking, readCamera, type CameraReading } from "./geometry";
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
  // Walking off needs room to walk: an exit gets a wider shot even on an angry last line (D19b).
  if (EXIT_WORDS.test(text)) return "exit";
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
  /** Looks past someone near the lens to the group behind them (arriving or leaving). */
  follow?: boolean;
}

function makeCam(id: string, name: string, preset: CameraPreset, position: Point, lookAt: Point): PlanCamera {
  return { id, name, preset, position: round(position), lookAt: round(lookAt) };
}

function groupSpread(plan: GeometryPlanData, shot: ShotSpec): number {
  const pts = shot.visibleIds.map((id) => plan.actors.find((a) => a.characterId === id)?.position).filter((p): p is Point => !!p);
  return pts.reduce((m, p) => Math.max(m, ...pts.map((q) => Math.hypot(p.x - q.x, p.y - q.y))), 0);
}

/** The lens (long-side angle) a group shot needs to fit everyone at this distance (D19b). */
function groupLens(plan: GeometryPlanData, shot: ShotSpec, distance: number): number {
  const half = Math.atan((groupSpread(plan, shot) + 0.5) / 2 / Math.max(0.5, distance - 0.6));
  const long = plan.aspect === "9:16" ? 2 * Math.atan(Math.tan(half) / (9 / 16)) : 2 * half;
  return (long * 180) / Math.PI;
}

/** How far back a camera must stand for everyone visible to fit across the frame (D19). */
export function groupFitDistance(plan: GeometryPlanData, shot: ShotSpec, preset: CameraPreset, fovDeg?: number): number {
  const spread = groupSpread(plan, shot);
  const hfov = horizontalFov(plan, { id: "", name: "", preset, fovDeg, position: { x: 0, y: 0 }, lookAt: { x: 1, y: 0 } });
  // Plus a body's width each side, so the people at the ends aren't cut by the frame edge.
  return (spread + 0.5) / 2 / Math.tan((hfov * Math.PI) / 360) + 0.6;
}

function candidates(plan: GeometryPlanData, shot: ShotSpec, moment: MomentKind, partnerId: string | undefined, name: (id: string) => string, faceDir?: Point): Candidate[] {
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
    // In front of the subject: across from their partner, else where they are looking (D19c).
    const base = P ? norm(sub(S, P)) : faceDir ? mul(faceDir, -1) : { x: 0, y: 1 };
    for (const dist of [1.4, 1.7, 2.0]) for (const off of [-55, -40, -25, -10, 10, 25, 40, 55]) {
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
  const radii = (base: number[], preset: CameraPreset) => { const fit = groupFitDistance(plan, shot, preset); return [...new Set([...base, fit, fit * 1.2, fit * 1.45].filter((r) => r >= base[0]).map((r) => +r.toFixed(2)))]; };
  if (visiblePts.length >= 2 && (moment === "reaction" || moment === "dialogue" || moment === "exit" || moment === "peak")) {
    const c = centroid(visiblePts);
    // A group that doesn't fit the normal lens at a distance the room allows gets a wider lens
    // (up to a wide angle), so the camera can stay in the room and face the group (D19b).
    const base = PRESET_FOV["two-shot"];
    for (const radius of [...new Set([...radii([2.0, 2.6, 3.2], "two-shot"), 3.8, 4.5])]) {
      const need = groupLens(plan, shot, radius);
      if (need > PRESET_FOV.wide) continue;
      const fovDeg = need > base ? Math.ceil(need) : undefined;
      for (let a = 0; a < 360; a += 15) {
        const camPos = add(c, mul({ x: Math.cos((a * Math.PI) / 180), y: Math.sin((a * Math.PI) / 180) }, radius));
        const camera = makeCam("group", "Group shot", "two-shot", camPos, c);
        if (fovDeg) camera.fovDeg = fovDeg;
        out.push({ camera, kind: "Group shot", role: "group" });
      }
    }
  }

  // Someone apart from the group (arriving, leaving): a wide from behind and to the side of
  // them, looking past them to the group, so they are near the lens and the group is across the
  // room behind (D19b). A circle round everyone would need a camera outside the room.
  if (moment === "establishing" || moment === "exit" || moment === "reaction" || (subjectId && shot.at?.[subjectId])) {
    const others = (shot.presentIds.length ? shot.presentIds : plan.actors.map((a) => a.characterId)).filter((id) => id !== subjectId).map(pos).filter((p): p is Point => !!p);
    const G = others.length ? centroid(others) : undefined;
    if (G && Math.hypot(S.x - G.x, S.y - G.y) > 1.8) {
      const u = norm(sub(S, G));
      for (const ang of [-50, -35, -20, 20, 35, 50]) for (const back of [2.0, 2.6, 3.2]) {
        const camPos = add(S, mul(rot(u, ang), back));
        const look = add(S, mul(sub(G, S), 0.4));
        out.push({ camera: makeCam("wide", "Wide", "wide", camPos, look), kind: "Wide (master)", role: "wide", follow: true });
      }
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
  /**
   * Whose screen side is kept (D19c): the two people on the line of action. Bystanders swap sides
   * in a reverse angle, as they would in any film, so they aren't tracked.
   */
  track?: Set<string>;
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
  // The panel says who is in frame (D19): a close-up drops everyone else, so it is only for a
  // panel of one or two people, or an emotional peak.
  if (cand.role === "cu" && shot.visibleIds.length > 2 && moment !== "peak") return { ok: false, score: 0, reasons: [] };
  const required = cand.role === "cu" ? [subjectId] : shot.visibleIds;
  // Framing (D19b): everyone the panel needs is wholly inside the frame, not cut by its edge.
  const halfFov = horizontalFov(plan, cam) / 2;
  const bodyDeg = (a: { depthM: number }) => (Math.atan(0.25 / Math.max(0.3, a.depthM)) * 180) / Math.PI;
  for (const id of required) {
    const a = reading.actors.find((x) => x.characterId === id);
    if (!a || !a.inView) return { ok: false, score: 0, reasons: [] };
    if (!a.foreground && Math.abs(a.angleDeg) > halfFov - bodyDeg(a)) return { ok: false, score: 0, reasons: [] };
  }
  // Everyone not framed out is physically there and can stand in the way (D19).
  const standing = shot.presentIds.length ? shot.presentIds.filter((id) => !shot.excludedIds.includes(id)) : shot.visibleIds;
  const occ = occlusions(reading, cand.role === "cu" ? [subjectId] : shot.visibleIds, [...new Set([...standing, ...shot.visibleIds])]);
  // A hidden face is unusable, whoever or whatever is in the way (D19b: props too).
  if (occ.some((o) => o.level === "face")) return { ok: false, score: 0, reasons: [] };
  const propBlocks = propsBlocking(plan, cam, cand.role === "cu" ? [subjectId] : shot.visibleIds);
  if (propBlocks.some((b) => b.face)) return { ok: false, score: 0, reasons: [] };

  // Faces (D19c): a camera behind someone sees the back of their head. The panel's main person
  // must be seen from the front or side (unless the shot follows them in); anyone else the
  // panel needs costs a lot when their back is to the camera.
  let facingCost = 0;
  for (const id of required) {
    if (cand.role === "ots" && id === cand.partnerId) continue;
    const pos = plan.actors.find((x) => x.characterId === id)?.position;
    const fwd = facingOf(plan, id, mem.track);
    if (!pos || !fwd) continue;
    const toCam = norm(sub(cam.position, pos));
    const cos = fwd.x * toCam.x + fwd.y * toCam.y; // 1 = looking straight at the camera
    if (cos < -0.35) {
      // Only someone still walking in (arriving or approaching) may be seen from behind.
      if (id === subjectId && !(cand.follow && (shot.at?.[id] === "arriving" || shot.at?.[id] === "approaching"))) return { ok: false, score: 0, reasons: [] };
      facingCost += id === subjectId ? 0.5 : 4;
    } else if (cos < -0.05) facingCost += 0.5;
  }
  // A prop right in front of the lens fills the frame and hides the scene.
  let clutter = 0;
  {
    const f = norm(sub(cam.lookAt, cam.position));
    const nearest = Math.min(...required.map((id) => reading.actors.find((x) => x.characterId === id)?.depthM ?? 99));
    for (const fu of plan.furniture ?? []) {
      const rel = sub(fu.position, cam.position);
      const depth = rel.x * f.x + rel.y * f.y;
      const dist = Math.hypot(rel.x, rel.y);
      if (dist < fu.radiusM + 0.3) return { ok: false, score: 0, reasons: [] }; // camera inside the prop
      if (depth > 0 && depth < Math.min(1.8, nearest - 0.3) && Math.abs(rel.x * f.y - rel.y * f.x) < fu.radiusM + depth * 0.6) clutter += 3;
    }
  }

  let s = -facingCost - clutter;
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
  if (cand.role === "group" || cand.role === "wide") ideal = Math.max(ideal, groupFitDistance(plan, shot, cam.preset, cam.fovDeg) * (cand.role === "wide" ? 1.3 : 1));
  if (cand.follow) ideal = 2.6; // far enough back that the walker isn't filling the frame (D19e)
  s += 1 - Math.min(1, Math.abs(subj.depthM - ideal) / ideal);

  // R-SCREEN: characters keep their side of the screen.
  let screenOk = true;
  for (const id of shot.visibleIds) {
    if (mem.track && !mem.track.has(id)) continue;
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

  // A low prop (a table) in front of someone hides part of them: a small cost (D19b).
  s -= 0.5 * propBlocks.length;
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
  if ((cand.role === "group" || cand.role === "wide") && !cand.follow) {
    const depths = reading.actors.filter((a) => a.inView && standing.includes(a.characterId)).map((a) => a.depthM).sort((a, b) => a - b);
    if (depths.length >= 2 && depths[0] < 0.6 * depths[Math.floor(depths.length / 2)]) s -= 2.5;
  }
  // Anyone else in shot whose face is hidden behind someone (D19b): the picture then tends to
  // drop or move them. Not a refusal, since they aren't the point of the panel, but a real cost.
  const others = reading.actors.filter((a) => a.inView && !a.foreground && !required.includes(a.characterId) && standing.includes(a.characterId)).map((a) => a.characterId);
  if (others.length) {
    // The over-the-shoulder partner counts too: a bystander lost behind that shoulder is lost.
    for (const o of occlusions(reading, others, standing)) s -= o.level === "face" ? 3 : 0.5;
    // An opening shot shows where we are and who is already there (D19c): someone arriving is
    // seen with the people they are heading for.
    if (moment === "establishing") s += 0.75 * Math.min(4, reading.actors.filter((a) => others.includes(a.characterId) && a.inView && !a.foreground).length);
  }
  // Nobody standing with the group drops out of the picture (D19e): when the cast stand
  // together, a framing that leaves some of them out reads as them having vanished. Each one the
  // camera can't see (or sees only as a shoulder) costs, except in a close-up, which is chosen
  // for a moment on purpose.
  if (cand.role !== "cu") {
    for (const id of standing) {
      if (required.includes(id)) continue;
      const a = reading.actors.find((x) => x.characterId === id);
      if (!a || !a.inView || a.foreground) s -= 2.5;
    }
  }
  // Anyone else half in, half out of the frame edge looks like a mistake: a small cost each.
  for (const a of reading.actors) {
    if (required.includes(a.characterId) || a.foreground || a.depthM <= 0) continue;
    if (Math.abs(Math.abs(a.angleDeg) - halfFov) < bodyDeg(a)) s -= 1;
  }
  const excludedInView = shot.excludedIds.filter((id) => reading.actors.find((a) => a.characterId === id)?.inView).length;
  s -= 0.4 * excludedInView;

  return { ok: true, score: s, reasons, reading };
}

function remember(mem: Memory, shot: ShotSpec, reading: CameraReading, preset: CameraPreset) {
  const subjectId = shot.subjectId ?? shot.speakerId ?? shot.visibleIds[0];
  for (const id of shot.visibleIds) {
    if (mem.track && !mem.track.has(id)) continue;
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
  const mem: Memory = { screenSide: new Map(seed ?? []), background: new Map(), lastBySubject: new Map(), track: line ? new Set(line) : undefined };
  let total = 0;
  const designs: ShotDesign[] = [];
  shots.forEach((sh, i) => {
    const moment = classifyMoment(sh, i);
    const shotPlan = planForShot(plan, sh.spec); // someone on a mark (arriving) stands there (D19b)
    const partner = partnerFor(shotPlan, sh.spec, line);
    const subjectId = sh.spec.subjectId ?? sh.spec.speakerId ?? sh.spec.visibleIds[0];
    const faceDir = subjectId ? facingOf(shotPlan, subjectId, line) : undefined;
    const rank = (m: MomentKind) => candidates(shotPlan, sh.spec, m, partner, name, faceDir)
      .map((c) => ({ c, r: score(shotPlan, c, sh.spec, m, side, linePts, mem, name, genre) }))
      .filter((x) => x.r.ok)
      .sort((a, b) => b.r.score - a.r.score);
    let scored = rank(moment);
    // Never leave a panel without a camera (D19b): if nothing fits this kind of moment,
    // fall back to the shots that show the whole situation; failing that, follow the panel's
    // main person, with anyone else the camera sees at the edge of frame.
    if (!scored.length && moment !== "establishing") scored = rank("establishing");
    if (!scored.length) {
      const subject = mainSubjectId(sh.spec);
      const reduced: ShotSpec = { ...sh.spec, visibleIds: subject ? [subject] : sh.spec.visibleIds.slice(0, 1) };
      scored = candidates(shotPlan, reduced, "establishing", partner, name, faceDir)
        .map((c) => ({ c, r: score(shotPlan, c, reduced, "establishing", side, linePts, mem, name, genre) }))
        .filter((x) => x.r.ok)
        .sort((a, b) => b.r.score - a.r.score);
    }
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

export { facingOf };

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
  // The open side (D19b): people standing off the line of action are usually placed facing the
  // camera, beyond the line, like a stage cheated out to the audience. The side that sees them
  // from the front gets a small head start; the shot scores still decide.
  let open = 0;
  if (line) {
    const p0 = plan.actors.find((x) => x.characterId === line[0])?.position;
    const p1 = plan.actors.find((x) => x.characterId === line[1])?.position;
    if (p0 && p1) for (const x of plan.actors) if (!line.includes(x.characterId)) open -= sideOf(p0, p1, x.position);
  }
  
  const best = !line ? { side: 1, ...a } : a.total + 2 * open >= b.total ? { side: 1, ...a } : { side: -1, ...b };
  return { side: best.side, lineOfAction: line, shots: best.designs, multiShot: groupMultiShot(shots) };
}

/**
 * Turn chosen options into plan cameras (shared when two shots pick the same position)
 * and a camera id per shot.
 */
/**
 * The version of the app's layout rules (D19c). A plan made under older rules is flagged so the
 * user can update it in one step: 2 = arrival spots, prop sizes, lens fitting (D19b);
 * 3 = faces, approach shots from behind the walker (D19c/D19d); 4 = nobody standing with the
 * group drops out of frame, arrivals filmed from further back (D19e); 5 = start and finish
 * positions for anyone moving (D20).
 */
export const LAYOUT_RULES = 5;

export function applyDesign(plan: GeometryPlanData, choices: { shotId: string; shotCode: string; option: CameraOption }[], line?: [string, string]) {
  const cameras: PlanCamera[] = [];
  const assign: Record<string, string> = {};
  for (const ch of choices) {
    const c = ch.option.camera;
    const same = cameras.find((x) => x.preset === c.preset && x.fovDeg === c.fovDeg && Math.hypot(x.position.x - c.position.x, x.position.y - c.position.y) < 0.3 && Math.hypot(x.lookAt.x - c.lookAt.x, x.lookAt.y - c.lookAt.y) < 0.5);
    if (same) { assign[ch.shotId] = same.id; continue; }
    const id = `cam-${cameras.length + 1}`;
    cameras.push({ ...c, id, name: `${ch.option.kind.split(" (")[0]} (${ch.shotCode.split("_").pop()})` });
    assign[ch.shotId] = id;
  }
  return { plan: { ...plan, cameras, lineOfAction: line ?? plan.lineOfAction, referenceCameraId: cameras[0]?.id, rules: LAYOUT_RULES }, assign };
}
