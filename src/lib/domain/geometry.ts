// Scene geometry (Stage 5): derive what each camera sees from the top-down plan.
// Deterministic — no AI. Coordinates are scene-local metres.

import { verticalText } from "./vertical";
import { cameraZ, floorZ, levelAt } from "./levels";
import { SHOT_SIZES } from "./shotLanguage";
import type { PanelBlock,
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
 * The camera's horizontal field of view (D19). Preset angles are for the frame's long side:
 * in a portrait frame the width is the short side, so it sees a narrower slice of the room.
 */
export function horizontalFov(plan: Pick<GeometryPlanData, "aspect">, cam: PlanCamera): number {
  const long = cam.fovDeg ?? PRESET_FOV[cam.preset];
  if (plan.aspect !== "9:16") return long;
  return (2 * Math.atan(Math.tan((long * Math.PI) / 360) * (9 / 16)) * 180) / Math.PI;
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

/**
 * The floor plan as it stands for one shot (D19b): anyone the shot puts on a mark (arriving,
 * say) stands there instead of their usual place. Everything that reads a camera for a shot
 * uses this, so the sketch, the prompts, the check and the camera choice all agree.
 */
export function planForShot(plan: GeometryPlanData, shot?: { at?: Record<string, string>; blocking?: Record<string, PanelBlock> }): GeometryPlanData {
  const at = shot?.at;
  const bl = shot?.blocking;
  if ((!at || !Object.keys(at).length) && (!bl || !Object.keys(bl).length)) return plan;
  // Someone who has left (D36) isn't in the panel at all.
  const actors = plan.actors.filter((a) => !bl?.[a.characterId]?.gone).map((a) => {
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
  return {
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
  };
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

