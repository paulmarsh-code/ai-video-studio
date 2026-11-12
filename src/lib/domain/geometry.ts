// Scene geometry (Stage 5): derive what each camera sees from the top-down plan.
// Deterministic — no AI. Coordinates are scene-local metres.

import { verticalText } from "./vertical";
import { cameraZ, floorZ, levelAt } from "./levels";
import { SHOT_SIZES, type ShotSize } from "./shotLanguage";
import { propHeight, propKind, propWidth } from "./story";
import type { PoseEntry, PanelBlock,
  CameraPreset,
  CastMember,
  Finding,
  GeometryPlanData,
  PlanCamera,
  Point,
} from "./types";

export const PRESET_FOV: Record<CameraPreset, number> = {
  wide: 70,
  "main-ots": 45,
  "reverse-ots": 45,
  "single-cu": 25,
  "two-shot": 45,
  insert: 20,
};

export const PRESET_TEXT: Record<CameraPreset, string> = {
  wide: "Wide shot showing the whole group and the room.",
  "main-ots": "Over-the-shoulder shot, eye level, static camera.",
  "reverse-ots": "Reverse over-the-shoulder shot, eye level, static camera.",
  "single-cu": "Single close-up, eye level, static camera, shallow depth of field.",
  "two-shot": "Two-shot at eye level, static camera.",
  insert: "Insert close-up of the detail, static camera.",
};

/** The preset's words with the camera's real height and tilt (D25): "eye level" becomes "high angle…". */
export function presetText(cam: PlanCamera): string {
  const v = verticalText(cam);
  // A named size (D27) replaces the preset's own framing words, e.g. a close-up from a wide camera.
  const base = cam.size ? `${SHOT_SIZES[cam.size].label}${cam.preset === "main-ots" || cam.preset === "reverse-ots" ? " over the shoulder" : ""}, eye level, static camera.` : PRESET_TEXT[cam.preset];
  if (v === "eye level") return base;
  return /eye level/.test(base) ? base.replace("eye level", v) : base.replace(/\.$/, `, ${v}.`);
}

/** Within this angle of centre, a person reads as "centre" of frame. */
export const CENTRE_BAND_DEG = 2;
/** Visible people closer than this are treated as soft foreground (over-the-shoulder). */
export const FOREGROUND_DEPTH_M = 2.0;
/** The shoulder person must be at least this much nearer than the next person in view. */
export const FOREGROUND_GAP_M = 0.3;

const deg = (rad: number) => (rad * 180) / Math.PI;

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function norm(v: Point): Point {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

export type FramePosition = "frame-left" | "centre" | "frame-right";

export interface SeenActor {
  characterId: string;
  angleDeg: number; // negative = left of centre
  depthM: number;
  inView: boolean;
  frame: FramePosition | "out-left" | "out-right" | "behind" | "out-above" | "out-below";
  foreground: boolean;
  /** Their middle is just outside the frame but part of their body is in it (D31): at the edge. */
  partial?: boolean;
}

export interface CameraReading {
  cameraId: string;
  forwardDeg: number;
  actors: SeenActor[];
  backgroundView?: string;
  /** The venue views either side of the background (D19f), so the room keeps its order. */
  sideViews?: { left?: string; right?: string };
}

/**
 * Walking pace (D73), metres a second.
 */
export const WALK_MS = 1.3;

/**
 * How many widths of this camera's picture someone walking among the background people crosses
 * in `seconds` (D76), at walking pace. Background people are taken to be about 3 m behind the
 * farthest character in view (5 m from the lens with none in view), where the picture is wider
 * than at the characters, so this errs towards less movement, not more.
 */
export function walkAcross(plan: GeometryPlanData, cam: PlanCamera, seconds: number): number {
  const depths = readCamera(plan, cam).actors.filter((a) => a.inView && !a.foreground).map((a) => a.depthM);
  const depth = (depths.length ? Math.max(...depths) : 2) + 3;
  const width = 2 * depth * Math.tan((horizontalFov(plan, cam) * Math.PI) / 360);
  return (WALK_MS * Math.abs(seconds)) / width;
}

/**
 * The camera's horizontal field of view (D19). Preset angles are for the frame's long side:
 * in a portrait frame the width is the short side, so it sees a narrower slice of the room.
 */
export function horizontalFov(plan: Pick<GeometryPlanData, "aspect">, cam: PlanCamera): number {
  const long = cam.fovDeg ?? PRESET_FOV[cam.preset];
  if (plan.aspect !== "9:16") return long;
  return (2 * Math.atan(Math.tan((long * Math.PI) / 360) * (9 / 16)) * 180) / Math.PI;
}

/**
 * Turn a camera so everyone who must be in the picture is (D42): it keeps where it stands,
 * its height and its tilt, turns only as far as needed, and widens the lens only if they still
 * don't fit. Returns the same camera when they're all in the picture already.
 */
export function aimToInclude(plan: GeometryPlanData, cam: PlanCamera, ids: string[]): PlanCamera {
  if (!ids.some((id) => plan.actors.some((a) => a.characterId === id))) return cam;
  // Only when someone is actually out of the picture or cut by its edge: near the edge is fine.
  const seen = readCamera(plan, cam).actors;
  const fine = (id: string) => { const a = seen.find((x) => x.characterId === id); return !!a && a.inView && !a.partial; };
  if (ids.every((id) => fine(id) || !plan.actors.some((a) => a.characterId === id))) return cam;
  const f = sub(cam.lookAt, cam.position);
  const dist = Math.hypot(f.x, f.y) || 1;
  const fwdDeg = (Math.atan2(f.y, f.x) * 180) / Math.PI;
  const wrap = (d: number) => ((d + 540) % 360) - 180;
  const half = horizontalFov(plan, cam) / 2;
  const room = half * 0.92;
  // Each person's bearing from the lens, with room for their shoulders either side.
  const spread = (who: string[]) => {
    const spans = who.map((id) => plan.actors.find((a) => a.characterId === id)?.position).filter((p): p is Point => !!p).map((p) => {
      const v = sub(p, cam.position), d = Math.hypot(v.x, v.y) || 0.1;
      const off = wrap((Math.atan2(v.y, v.x) * 180) / Math.PI - fwdDeg), m = (Math.atan(0.35 / d) * 180) / Math.PI;
      return { lo: off - m, hi: off + m };
    });
    return { lo: Math.min(...spans.map((s) => s.lo)), hi: Math.max(...spans.map((s) => s.hi)) };
  };
  const at = (shift: number) => {
    const turned = ((fwdDeg + shift) * Math.PI) / 180;
    return { x: +(cam.position.x + Math.cos(turned) * dist).toFixed(2), y: +(cam.position.y + Math.sin(turned) * dist).toFixed(2) };
  };
  const widen = (need: number) => {
    const h = Math.min(110, (need / 0.92) * 2);
    const long = plan.aspect === "9:16" ? (2 * Math.atan(Math.tan((h * Math.PI) / 360) / (9 / 16)) * 180) / Math.PI : h;
    return +Math.min(120, long).toFixed(1);
  };
  // First try to keep everyone still in the shot as well: the least turn that fits them all,
  // or a somewhat wider lens (up to 60° across) if that's what it takes.
  const keep = [...new Set([...ids, ...seen.filter((a) => a.inView && !a.partial).map((a) => a.characterId)])];
  const all = spread(keep);
  const needAll = (all.hi - all.lo) / 2;
  if (needAll <= room) return { ...cam, lookAt: at(all.hi > room ? all.hi - room : all.lo < -room ? all.lo + room : 0) };
  if (needAll <= 30 * 0.92) return { ...cam, lookAt: at((all.lo + all.hi) / 2), fovDeg: widen(needAll) };
  // Otherwise just those who must be in it: as little turn as will do, wider only if needed.
  const { lo, hi } = spread(ids);
  const need = (hi - lo) / 2;
  if (need <= room) return { ...cam, lookAt: at(hi > room ? hi - room : lo < -room ? lo + room : 0) };
  return { ...cam, lookAt: at((lo + hi) / 2), fovDeg: widen(need) };
}

/**
 * Turn a camera, keeping where it stands and its lens, so everyone named is wholly in the
 * picture (D47): for the people in a panel's own shot, who mustn't drop out because the camera
 * was moved. The same camera when they're all in already; undefined when no turn can do it.
 */
export function turnToKeep(plan: GeometryPlanData, cam: PlanCamera, ids: string[]): PlanCamera | undefined {
  const here = ids.filter((id) => plan.actors.some((a) => a.characterId === id));
  const whole = (c: PlanCamera) => {
    const seen = readCamera(plan, c).actors;
    return here.every((id) => { const a = seen.find((x) => x.characterId === id); return !!a && a.inView && !a.partial; });
  };
  if (whole(cam)) return cam;
  const f = sub(cam.lookAt, cam.position);
  const dist = Math.hypot(f.x, f.y) || 1;
  const fwdDeg = (Math.atan2(f.y, f.x) * 180) / Math.PI;
  const wrap = (d: number) => ((d + 540) % 360) - 180;
  const room = (horizontalFov(plan, cam) / 2) * 0.92;
  const spans = here.map((id) => plan.actors.find((a) => a.characterId === id)!.position).map((p) => {
    const v = sub(p, cam.position), d = Math.hypot(v.x, v.y) || 0.1;
    const off = wrap((Math.atan2(v.y, v.x) * 180) / Math.PI - fwdDeg), m = (Math.atan(0.35 / d) * 180) / Math.PI;
    return { lo: off - m, hi: off + m };
  });
  const lo = Math.min(...spans.map((s) => s.lo)), hi = Math.max(...spans.map((s) => s.hi));
  if ((hi - lo) / 2 > room) return undefined;
  const shift = hi > room ? hi - room : lo < -room ? lo + room : 0;
  const turned = ((fwdDeg + shift) * Math.PI) / 180;
  const out = { ...cam, lookAt: { x: +(cam.position.x + Math.cos(turned) * dist).toFixed(2), y: +(cam.position.y + Math.sin(turned) * dist).toFixed(2) } };
  return whole(out) ? out : undefined;
}

/**
 * Of some cameras (the app's choices for a panel), the one nearest a spot that has everyone
 * named wholly in the picture (D47): keeping a moved camera's angle as far as it can.
 */
export function nearestKeeping<T extends { camera: PlanCamera }>(plan: GeometryPlanData, options: T[], ids: string[], near: Point): T | undefined {
  const whole = (c: PlanCamera) => ids.every((id) => {
    if (!plan.actors.some((a) => a.characterId === id)) return true;
    const a = readCamera(plan, c).actors.find((x) => x.characterId === id);
    return !!a && a.inView && !a.partial;
  });
  const far = (c: PlanCamera) => Math.hypot(c.position.x - near.x, c.position.y - near.y);
  return options.filter((o) => whole(o.camera)).sort((a, b) => far(a.camera) - far(b.camera))[0];
}

/**
 * How much of the picture's height something fills (D48): something `heightM` tall standing on
 * the floor `depthM` in front of the lens, in the storyboard picture (2:3 upright for a 9:16
 * video, 3:2 for 16:9), and whether its foot is below the bottom edge. GPT kept the people a
 * few metres away the same size as the near ones, so the far side of the room looked close.
 */
export function pictureShare(plan: GeometryPlanData, cam: PlanCamera, at: Point, heightM: number, depthM: number): { share: number; cut: boolean } {
  const portrait = plan.aspect === "9:16";
  const tanH = Math.tan((horizontalFov(plan, cam) * Math.PI) / 360);
  const wOverH = portrait ? 2 / 3 : 3 / 2;
  const focalOverH = wOverH / (2 * tanH); // focal length as a share of the picture's height
  const d = Math.max(0.3, depthM);
  const share = (heightM / d) * focalOverH;
  const tilt = ((cam.tiltDeg ?? 0) * Math.PI) / 180;
  const below = Math.atan2(cameraZ(plan, cam) - floorZ(plan, at), d) + tilt; // the foot, below level
  const footY = 0.5 + Math.tan(below) * focalOverH;
  return { share, cut: footY > 1 };
}

/**
 * Where a point at height `zM` above its floor lands in the storyboard picture (B1), as
 * fractions of its width (0 = left) and height (0 = top); undefined behind the camera. The
 * same projection as the blocking frame, so the check can measure a picture against the plan.
 */
export function pictureXY(plan: GeometryPlanData, cam: PlanCamera, at: Point, zM: number): { x: number; y: number; depth: number } | undefined {
  const f = sub(cam.lookAt, cam.position);
  const fl = Math.hypot(f.x, f.y) || 1;
  const fw = { x: f.x / fl, y: f.y / fl }, rt = { x: fw.y, y: -fw.x };
  const v = sub(at, cam.position);
  const depth = v.x * fw.x + v.y * fw.y, lateral = v.x * rt.x + v.y * rt.y;
  if (depth <= 0.1) return undefined;
  const portrait = plan.aspect === "9:16";
  const tanH = Math.tan((horizontalFov(plan, cam) * Math.PI) / 360);
  const focalOverW = 1 / (2 * tanH), focalOverH = (portrait ? 2 / 3 : 3 / 2) / (2 * tanH);
  const tilt = ((cam.tiltDeg ?? 0) * Math.PI) / 180;
  const up = Math.atan2(floorZ(plan, at) + zM - cameraZ(plan, cam), depth) - tilt;
  return { x: 0.5 + (lateral / depth) * focalOverW, y: 0.5 - Math.tan(up) * focalOverH, depth };
}

/**
 * The shot size the storyboard picture really gives someone standing `depthM` away (D48), from
 * how much of their body is between its top and bottom edges; undefined when their head is out
 * of it. A camera moved after the app named the shot (or a 9:16 full shot drawn as a 2:3
 * picture, which is a little shorter) can cut the feet off a "full shot": GPT then moved the
 * camera back to show them, and squeezed the room up behind.
 */
export function framedSize(plan: GeometryPlanData, cam: PlanCamera, at: Point, depthM: number, opts: { seated?: boolean } = {}): { size: ShotSize; bottomM: number } | undefined {
  const portrait = plan.aspect === "9:16";
  const tanH = Math.tan((horizontalFov(plan, cam) * Math.PI) / 360);
  const focalOverH = (portrait ? 2 / 3 : 3 / 2) / (2 * tanH);
  const edge = Math.atan(0.5 / focalOverH);
  const tilt = ((cam.tiltDeg ?? 0) * Math.PI) / 180;
  const d = Math.max(0.3, depthM);
  const eye = cameraZ(plan, cam) - floorZ(plan, at);
  const bottom = eye + d * Math.tan(tilt - edge), top = eye + d * Math.tan(tilt + edge);
  const r = (size: ShotSize) => ({ size, bottomM: +bottom.toFixed(2) });
  // Seated (D68): head about 1.3 m up, knees about 0.5, waist about table height.
  if (opts.seated) {
    if (top < 1.3) return undefined;
    if (bottom <= 0) return r(1.3 / (top - bottom) < 0.3 ? "ls" : "fs");
    return r(bottom <= 0.4 ? "mls" : bottom <= 0.6 ? "cowboy" : bottom <= 0.85 ? "ms" : bottom <= 1.0 ? "mcu" : "cu");
  }
  if (top < 1.72) return undefined;
  if (bottom <= 0) return r(1.72 / (top - bottom) < 0.3 ? "ls" : "fs");
  return r(bottom <= 0.55 ? "mls" : bottom <= 0.85 ? "cowboy" : bottom <= 1.15 ? "ms" : bottom <= 1.35 ? "mcu" : "cu");
}

export function readCamera(plan: GeometryPlanData, cam: PlanCamera): CameraReading {
  const fov = horizontalFov(plan, cam);
  const half = fov / 2;
  const f = norm(sub(cam.lookAt, cam.position));
  const r = { x: f.y, y: -f.x }; // right-hand vector when looking along f
  const forwardDeg = (deg(Math.atan2(f.y, f.x)) + 360) % 360;

  // Up and down (D29): the frame's vertical half-angle, and the lens's height above the room's
  // floor, so someone on a balcony far above a level camera is out of the top of the frame.
  const longFov = cam.fovDeg ?? PRESET_FOV[cam.preset];
  const vHalf = plan.aspect === "9:16" ? longFov / 2 : deg(Math.atan(Math.tan(((longFov / 2) * Math.PI) / 180) * (9 / 16)));
  const camZ = cameraZ(plan, cam);
  const tilt = cam.tiltDeg ?? 0;
  const actors: SeenActor[] = plan.actors.map((a) => {
    const rel = sub(a.position, cam.position);
    const depth = rel.x * f.x + rel.y * f.y;
    const lateral = rel.x * r.x + rel.y * r.y;
    const angle = deg(Math.atan2(lateral, depth));
    let frame: SeenActor["frame"];
    let inView = false;
    // A body is about half a metre wide (D31): someone whose middle is just past the frame edge
    // still has a shoulder and arm in the picture.
    const bodyHalf = depth > 0 ? deg(Math.atan(0.25 / depth)) : 0;
    let partial = false;
    if (depth <= 0) frame = "behind";
    else if (angle < -half - bodyHalf) frame = "out-left";
    else if (angle > half + bodyHalf) frame = "out-right";
    else if (Math.abs(angle) > half) { partial = true; frame = angle < 0 ? "frame-left" : "frame-right"; }
    else if (deg(Math.atan2(floorZ(plan, a.position) - camZ, depth)) - tilt > vHalf) frame = "out-above"; // feet above the top edge
    else if (deg(Math.atan2(floorZ(plan, a.position) + 1.7 - camZ, depth)) - tilt < -vHalf) frame = "out-below"; // head below the bottom edge
    else {
      inView = true;
      frame =
        Math.abs(angle) <= CENTRE_BAND_DEG ? "centre" : angle < 0 ? "frame-left" : "frame-right";
    }
    if (partial && frame !== "out-above" && frame !== "out-below") inView = true;
    return {
      characterId: a.characterId,
      angleDeg: angle,
      depthM: depth,
      inView,
      frame,
      foreground: false,
      ...(partial && inView ? { partial: true } : {}),
    };
  });

  // Soft foreground = the over-the-shoulder person: nearest in view, and clearly nearer than the rest.
  // Only people fully in the frame count here: someone cut by the edge is never the shoulder (D31).
  const inView = actors.filter((a) => a.inView && !a.partial).sort((a, b) => a.depthM - b.depthM);
  const nearest = inView[0];
  for (const a of actors) a.foreground = false;
  // Only when someone else is in view further back: a lone person is the subject, facing camera.
  if (nearest && inView.length >= 2 && nearest.depthM < FOREGROUND_DEPTH_M && inView[1].depthM - nearest.depthM >= FOREGROUND_GAP_M) {
    nearest.foreground = true;
  }

  let backgroundView: string | undefined;
  let best = Infinity;
  for (const v of plan.views) {
    const d = Math.abs(((v.directionDeg - forwardDeg + 540) % 360) - 180);
    if (d < best) {
      best = d;
      backgroundView = v.name;
    }
  }
  // The views to the left and right of the background: the nearest on each side within 135°.
  // A positive angle from the camera's direction is to its left.
  const sideViews: { left?: string; right?: string } = {};
  let bl = Infinity, br = Infinity;
  for (const v of plan.views) {
    if (v.name === backgroundView) continue;
    const rel = ((v.directionDeg - forwardDeg + 540) % 360) - 180;
    if (rel > 15 && rel <= 135 && rel < bl) { bl = rel; sideViews.left = v.name; }
    if (rel < -15 && rel >= -135 && -rel < br) { br = -rel; sideViews.right = v.name; }
  }
  return { cameraId: cam.id, forwardDeg, actors, backgroundView, sideViews };
}

/** Which side of the line of action a point is on: +1, -1 or 0. */
export function sideOfLine(plan: GeometryPlanData, p: Point): number {
  if (!plan.lineOfAction) return 0;
  const [aId, bId] = plan.lineOfAction;
  const a = plan.actors.find((x) => x.characterId === aId)?.position;
  const b = plan.actors.find((x) => x.characterId === bId)?.position;
  if (!a || !b) return 0;
  const ab = sub(b, a);
  const ap = sub(p, a);
  const cross = ab.x * ap.y - ab.y * ap.x;
  return Math.sign(cross);
}

/** 180° rule check for every camera against the reference camera. */
export function checkLineOfAction(plan: GeometryPlanData, cast: CastMember[]): Finding[] {
  const findings: Finding[] = [];
  if (!plan.lineOfAction) return findings;
  const ref =
    plan.cameras.find((c) => c.id === plan.referenceCameraId) ?? plan.cameras[0];
  if (!ref) return findings;
  const refSide = sideOfLine(plan, ref.position);
  const names = plan.lineOfAction.map((id) => cast.find((c) => c.id === id)?.name ?? id);
  for (const cam of plan.cameras) {
    if (cam.id === ref.id) continue;
    const side = sideOfLine(plan, cam.position);
    if (side !== 0 && side !== refSide) {
      findings.push({
        code: "CROSSES_LINE_OF_ACTION",
        severity: cam.overrideReason ? "info" : "warning",
        field: `camera:${cam.id}`,
        message: cam.overrideReason
          ? `${cam.name} crosses the ${names[0]}–${names[1]} line (override: ${cam.overrideReason}).`
          : `${cam.name} is on the other side of the ${names[0]}–${names[1]} line from ${ref.name}. Screen direction will flip: people will swap sides between cuts.`,
        fix: cam.overrideReason
          ? undefined
          : `Move ${cam.name} to the same side of the line as ${ref.name}, or record a reason for crossing.`,
      });
    }
  }
  return findings;
}

/** Plain-English positions line for the prompt, e.g. "Chase frame-left, Jade frame-right, screen wall behind Jade". */
export function describeFrame(
  reading: CameraReading,
  cast: CastMember[],
  onlyIds?: string[],
  subjectId?: string,
): string {
  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const seen = reading.actors
    .filter((a) => a.inView && (!onlyIds || onlyIds.includes(a.characterId)))
    .sort((a, b) => a.angleDeg - b.angleDeg);
  const parts = seen.map((a) => `${name(a.characterId)} ${a.frame}`);
  const subject =
    subjectId && seen.some((a) => a.characterId === subjectId)
      ? subjectId
      : [...seen].sort((a, b) => b.depthM - a.depthM)[0]?.characterId;
  if (reading.backgroundView && subject) {
    parts.push(`${reading.backgroundView} behind ${name(subject)}`);
  }
  return parts.join(", ");
}

// ---------- Occlusion (R-OCCLUSION) ----------

export const HEAD_RADIUS_M = 0.11;
export const SHOULDER_HALF_M = 0.23;

const angularRadius = (sizeM: number, depthM: number) => deg(Math.atan2(sizeM, Math.max(depthM, 0.05)));

export interface Occlusion {
  characterId: string;
  blockerId: string;
  /** "face" = face hidden (unusable); "body" = body partly covered (often fine). */
  level: "face" | "body";
}

/**
 * Who is hidden behind whom in a camera, considering only `onlyIds` as present on camera
 * (excluded characters are framed out, so they block nothing).
 */
export function occlusions(reading: CameraReading, onlyIds?: string[], blockerIds?: string[]): Occlusion[] {
  const people = reading.actors.filter((a) => a.depthM > 0 && (!onlyIds || onlyIds.includes(a.characterId)));
  // Anyone standing there can block (D19): by default the people on camera; pass everyone
  // not framed out so a nearby person in front of the subject counts.
  const blockers = blockerIds ? reading.actors.filter((a) => a.depthM > 0 && blockerIds.includes(a.characterId)) : people;
  const out: Occlusion[] = [];
  for (const target of people) {
    if (!target.inView) continue;
    for (const blocker of blockers) {
      if (blocker === target || blocker.depthM >= target.depthM - 0.2) continue;
      const sep = Math.abs(blocker.angleDeg - target.angleDeg);
      const faceLimit = angularRadius(HEAD_RADIUS_M, blocker.depthM) + 0.6 * angularRadius(HEAD_RADIUS_M, target.depthM);
      const bodyLimit = angularRadius(SHOULDER_HALF_M, blocker.depthM) + angularRadius(HEAD_RADIUS_M, target.depthM);
      if (sep < faceLimit) {
        out.push({ characterId: target.characterId, blockerId: blocker.characterId, level: "face" });
        break;
      }
      if (sep < bodyLimit) out.push({ characterId: target.characterId, blockerId: blocker.characterId, level: "body" });
    }
  }
  return out;
}

/** Camera inside a person or a piece of furniture, or outside the room. */
export function cameraPlacementProblem(plan: GeometryPlanData, cam: PlanCamera): string | undefined {
  const b = plan.bounds;
  if (b && (cam.position.x < b.minX || cam.position.x > b.maxX || cam.position.y < b.minY || cam.position.y > b.maxY)) {
    return "outside the room";
  }
  for (const a of plan.actors) {
    if (Math.hypot(a.position.x - cam.position.x, a.position.y - cam.position.y) < 0.3) return `inside ${a.characterId}`;
  }
  // Nowhere to stand over a cliff or roof drop (D29).
  const l = levelAt(plan, cam.position);
  if (l && (l.edge === "drop" || l.heightM <= -3)) return `over ${l.name}`;
  for (const f of plan.furniture ?? []) {
    if (Math.hypot(f.position.x - cam.position.x, f.position.y - cam.position.y) < f.radiusM + 0.15) return `inside the ${f.name}`;
  }
  return undefined;
}

/** Which key props (furniture) a camera sees, left to right (D19). */
export function readProps(plan: GeometryPlanData, cam: PlanCamera): { id: string; name: string; inView: boolean; frame: FramePosition | "out"; depthM: number }[] {
  const half = horizontalFov(plan, cam) / 2;
  const f = norm(sub(cam.lookAt, cam.position));
  const r = { x: f.y, y: -f.x };
  // A prop is seen through points across its real extent (D21b): a long thing (a backdrop, a
  // counter) is a line facing the group, anything else a ring round its centre. Treating a 3 m
  // backdrop as a 1.5 m circle put it "in front of everyone" in a camera that only grazes it.
  const people = plan.actors.map((a) => a.position);
  const G = people.length ? { x: people.reduce((t, q) => t + q.x, 0) / people.length, y: people.reduce((t, q) => t + q.y, 0) / people.length } : undefined;
  return (plan.furniture ?? [])
    .map((fu) => {
      const pts: Point[] = [fu.position];
      if (fu.radiusM > 0.6 && G) {
        const toward = norm(sub(G, fu.position));
        const along = { x: -toward.y, y: toward.x };
        for (const t of [-1, -0.5, 0.5, 1]) pts.push({ x: fu.position.x + along.x * fu.radiusM * t, y: fu.position.y + along.y * fu.radiusM * t });
      } else {
        for (let k = 0; k < 8; k++) pts.push({ x: fu.position.x + Math.cos((k * Math.PI) / 4) * fu.radiusM, y: fu.position.y + Math.sin((k * Math.PI) / 4) * fu.radiusM });
      }
      const seenPts = pts.map((q) => {
        const rel = sub(q, cam.position);
        const depth = rel.x * f.x + rel.y * f.y;
        return { depth, angle: deg(Math.atan2(rel.x * r.x + rel.y * r.y, depth)) };
      }).filter((q) => q.depth > 0.3 && Math.abs(q.angle) <= half);
      const rel = sub(fu.position, cam.position);
      const cDepth = rel.x * f.x + rel.y * f.y;
      const cAngle = deg(Math.atan2(rel.x * r.x + rel.y * r.y, cDepth));
      const inView = seenPts.length > 0;
      const angle = inView ? seenPts.reduce((t, q) => t + q.angle, 0) / seenPts.length : cAngle;
      const depth = inView ? (seenPts[0] === undefined ? cDepth : seenPts.reduce((t, q) => t + q.depth, 0) / seenPts.length) : cDepth;
      const frame: FramePosition | "out" = !inView ? "out" : Math.abs(angle) <= CENTRE_BAND_DEG ? "centre" : angle < 0 ? "frame-left" : "frame-right";
      return { angle, seen: { id: fu.id, name: fu.name, inView, frame, depthM: +depth.toFixed(2) } };
    })
    .sort((a, b) => a.angle - b.angle)
    .map((x) => x.seen);
}

/** Seated eye height (D62): where a camera sits when everyone in the picture is seated. */
export const SEATED_EYE_M = 1.2;

/**
 * Everyone in the picture seated (D62): a camera with no height of its own is at seated eye
 * level, as a camera operator would put it. At standing height it looked down on them, and GPT
 * drew it at seated eye level anyway, so the whole picture was off from image 1.
 */
function atSeatedEyeLevel(plan: GeometryPlanData, visibleIds?: string[]): GeometryPlanData {
  const seen = plan.actors.filter((a) => !visibleIds || visibleIds.includes(a.characterId));
  if (!seen.length || !seen.every((a) => a.pose === "sitting")) return plan;
  return { ...plan, cameras: plan.cameras.map((c) => (c.heightM === undefined ? { ...c, heightM: SEATED_EYE_M } : c)) };
}

/** A table people sit at (D62): its height when the words gave it a standing one. */
export const SITTING_TABLE_M = 0.75;

/**
 * Props settled for a shot (D62). Drinks, glasses and other table-top things stand on the nearest
 * table, at their own small size: placed as tables, two cocktails stood as a 1.1 m block two
 * metres away and were left out of the picture. A table everyone at it sits at, with no stools,
 * is sitting height: drawn chest-high, it hid the faces and GPT redrew it differently each panel.
 */
function settleProps(plan: GeometryPlanData): GeometryPlanData {
  const furniture = plan.furniture;
  if (!furniture?.length) return plan;
  const kindOf = (f: { name: string; detail?: string }) => propKind(`${f.name} ${f.detail ?? ""}`, f.name);
  const tables = furniture.filter((f) => !f.heldBy && kindOf(f) === "table");
  let changed = false;
  const out = furniture.map((f) => {
    if (f.heldBy) return f;
    const kind = kindOf(f);
    if (kind === "small") {
      const text = `${f.name} ${f.detail ?? ""}`;
      const heightM = propHeight(text, f.name);
      const under = tables.find((t) => Math.hypot(t.position.x - f.position.x, t.position.y - f.position.y) <= t.radiusM);
      const t = under ?? [...tables].sort((a, b) => Math.hypot(a.position.x - f.position.x, a.position.y - f.position.y) - Math.hypot(b.position.x - f.position.x, b.position.y - f.position.y))[0];
      if (!t) return f;
      changed = true;
      const radiusM = +Math.min(propWidth(text, "small") / 2, t.radiusM * 0.6).toFixed(2);
      if (under) return { ...f, heightM, radiusM, onId: t.id };
      // Onto the table, on the side it was on, well inside the edge.
      const dx = f.position.x - t.position.x, dy = f.position.y - t.position.y, d = Math.hypot(dx, dy) || 1;
      const r = t.radiusM * 0.4;
      return { ...f, heightM, onId: t.id, radiusM, position: { x: +(t.position.x + (dx / d) * r).toFixed(2), y: +(t.position.y + (dy / d) * r).toFixed(2) } };
    }
    if (kind === "table" && /\b(table|desk)\b/i.test(f.name) && (f.heightM ?? 0) > 0.9) {
      const at = plan.actors.filter((a) => Math.hypot(a.position.x - f.position.x, a.position.y - f.position.y) <= f.radiusM + 1.3);
      if (!at.length || !at.every((a) => a.pose === "sitting" && !/\b(stool|high chair|bar chair)\b/i.test(a.poseOn ?? ""))) return f;
      changed = true;
      const detail = f.detail?.replace(/\bchest[- ]high(?:\s+at\s+\d{2,3}\s?cm)?|\bbar[- ]height\b|\b\d{2,3}\s?cm\s+(?:tall|high)\b|\bat\s+\d{2,3}\s?cm\b/gi, "table height, about 75 cm");
      return { ...f, heightM: SITTING_TABLE_M, ...(detail !== undefined ? { detail } : {}) };
    }
    return f;
  });
  return changed ? { ...plan, furniture: out } : plan;
}

/**
 * The floor plan as it stands for one shot (D19b): anyone the shot puts on a mark (arriving,
 * say) stands there instead of their usual place. Everything that reads a camera for a shot
 * uses this, so the sketch, the prompts, the check and the camera choice all agree.
 */
export function planForShot(plan: GeometryPlanData, shot?: { at?: Record<string, string>; blocking?: Record<string, PanelBlock>; posture?: Record<string, PoseEntry>; visibleIds?: string[] }): GeometryPlanData {
  const at = shot?.at;
  const bl = shot?.blocking;
  const po = shot?.posture;
  if ((!at || !Object.keys(at).length) && (!bl || !Object.keys(bl).length) && (!po || !Object.keys(po).length)) return atSeatedEyeLevel(settleProps(plan), shot?.visibleIds);
  // Someone who has left (D36) isn't in the panel at all.
  const actors = plan.actors.filter((a) => !bl?.[a.characterId]?.gone).map((a0) => {
    // Their posture in this panel (D37).
    const p = po?.[a0.characterId];
    const a = p && p.pose !== "standing" ? { ...a0, pose: p.pose, ...(p.on ? { poseOn: p.on } : {}) } : a0;
    // Positions set for this panel (D35) come first; then marks from the panel's words.
    const b = bl?.[a.characterId];
    if (b) return { ...a, position: b.at, ...(b.to ? { to: b.to } : {}), ...(b.facingDeg !== undefined ? { facingDeg: b.facingDeg } : {}) };
    const m = at?.[a.characterId] && a.marks?.find((x) => x.id === at[a.characterId]);
    return m ? { ...a, position: m.position } : a;
  });
  // A prop in someone's hands is where they are (D36), a little in front of them.
  const holder = (id: string): Point | undefined => {
    const a = actors.find((x) => x.characterId === id);
    if (!a) return undefined;
    const f = a.facingDeg !== undefined ? { x: Math.cos((a.facingDeg * Math.PI) / 180), y: Math.sin((a.facingDeg * Math.PI) / 180) } : a.to ? norm(sub(a.to, a.position)) : { x: 0, y: 0 };
    return { x: +(a.position.x + f.x * 0.25).toFixed(2), y: +(a.position.y + f.y * 0.25).toFixed(2) };
  };
  return atSeatedEyeLevel(settleProps({
    ...plan,
    actors,
    // Props moved, taken away or picked up on a panel (D35, D36).
    ...(plan.furniture && bl && Object.keys(bl).some((k) => k.startsWith("prop:"))
      ? {
          furniture: plan.furniture.filter((f) => { const e = bl[`prop:${f.id}`]; return !e?.gone && !(e?.with && !holder(e.with)); }).map((f) => {
            const e = bl[`prop:${f.id}`];
            if (!e) return f;
            if (e.with) return { ...f, position: holder(e.with)!, heldBy: e.with };
            return { ...f, position: e.at };
          }),
        }
      : {}),
  }), shot?.visibleIds);
}

/**
 * Props standing between the camera and the people it must show (D19b). Anything taller than
 * eye level hides the face; lower things (a table) only hide part of the body.
 */
export function propsBlocking(plan: GeometryPlanData, cam: PlanCamera, targetIds: string[]): { prop: string; characterId: string; face: boolean }[] {
  const f = norm(sub(cam.lookAt, cam.position));
  const r = { x: f.y, y: -f.x };
  const view = (p: Point) => { const rel = sub(p, cam.position); return { depth: rel.x * f.x + rel.y * f.y, lateral: rel.x * r.x + rel.y * r.y }; };
  const out: { prop: string; characterId: string; face: boolean }[] = [];
  for (const fu of plan.furniture ?? []) {
    const pv = view(fu.position);
    if (pv.depth <= 0.2) continue;
    for (const id of targetIds) {
      const a = plan.actors.find((x) => x.characterId === id);
      if (!a) continue;
      const av = view(a.position);
      if (av.depth <= pv.depth + 0.1) continue; // the prop is not in front of them
      // Lateral distance between the prop and the person, measured at the prop's depth.
      const atProp = (av.lateral / av.depth) * pv.depth;
      if (Math.abs(atProp - pv.lateral) < fu.radiusM + 0.15) out.push({ prop: fu.name, characterId: id, face: (fu.heightM ?? 1.1) >= 1.45 });
    }
  }
  return out;
}

/**
 * Which way someone faces (D19c). The two people on the line of action face each other; others
 * gathered round a spot face it; someone apart from the group (arriving) faces the group.
 * Undefined for someone alone.
 */
export function facingOf(plan: GeometryPlanData, id: string, line?: Iterable<string>): Point | undefined {
  const a = plan.actors.find((x) => x.characterId === id);
  // Set for this panel (D35): the way they were turned, or the way they walk.
  if (a?.facingDeg !== undefined) return { x: Math.cos((a.facingDeg * Math.PI) / 180), y: Math.sin((a.facingDeg * Math.PI) / 180) };
  if (a?.to && Math.hypot(a.to.x - a.position.x, a.to.y - a.position.y) > 0.1) return norm(sub(a.to, a.position));
  const others = plan.actors.filter((x) => x.characterId !== id).map((x) => x.position);
  if (!a || !others.length) return undefined;
  const group = { x: others.reduce((s, p) => s + p.x, 0) / others.length, y: others.reduce((s, p) => s + p.y, 0) / others.length };
  const pair = line ? [...line] : [];
  const partner = pair.includes(id) ? plan.actors.find((x) => x.characterId !== id && pair.includes(x.characterId))?.position : undefined;
  if (partner && Math.hypot(partner.x - a.position.x, partner.y - a.position.y) < 3) return norm(sub(partner, a.position));
  const spot = plan.furniture?.find((f) => f.id === "spot")?.position;
  const target = spot && Math.hypot(a.position.x - spot.x, a.position.y - spot.y) < 1.8 ? spot : group;
  const v = sub(target, a.position);
  return Math.hypot(v.x, v.y) < 0.05 ? undefined : norm(v);
}


/**
 * A panel's camera by name (D59), and the camera it was copied from when it's the panel's own
 * copy ("<name>, for this panel"): the floor plan shows both, so the panel says which it uses.
 */
export function panelCameraLabel(plan: { cameras: { id: string; name: string }[] } | undefined, cameraId: string | undefined): { name: string; copyOf?: string } | undefined {
  const cam = cameraId ? plan?.cameras.find((c) => c.id === cameraId) : undefined;
  if (!cam) return undefined;
  if (!cam.id.includes("~")) return { name: cam.name };
  const base = plan!.cameras.find((c) => c.id === cam.id.split("~")[0]);
  return { name: cam.name, copyOf: base?.name ?? cam.name.replace(/, (turned|for this panel)$/, "") };
}
