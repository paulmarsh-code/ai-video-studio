// Scene geometry (Stage 5): derive what each camera sees from the top-down plan.
// Deterministic — no AI. Coordinates are scene-local metres.

import type {
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
  frame: FramePosition | "out-left" | "out-right" | "behind";
  foreground: boolean;
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

  const actors: SeenActor[] = plan.actors.map((a) => {
    const rel = sub(a.position, cam.position);
    const depth = rel.x * f.x + rel.y * f.y;
    const lateral = rel.x * r.x + rel.y * r.y;
    const angle = deg(Math.atan2(lateral, depth));
    let frame: SeenActor["frame"];
    let inView = false;
    if (depth <= 0) frame = "behind";
    else if (angle < -half) frame = "out-left";
    else if (angle > half) frame = "out-right";
    else {
      inView = true;
      frame =
        Math.abs(angle) <= CENTRE_BAND_DEG ? "centre" : angle < 0 ? "frame-left" : "frame-right";
    }
    return {
      characterId: a.characterId,
      angleDeg: angle,
      depthM: depth,
      inView,
      frame,
      foreground: false,
    };
  });

  // Soft foreground = the over-the-shoulder person: nearest in view, and clearly nearer than the rest.
  const inView = actors.filter((a) => a.inView).sort((a, b) => a.depthM - b.depthM);
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
export function planForShot(plan: GeometryPlanData, shot?: { at?: Record<string, string> }): GeometryPlanData {
  const at = shot?.at;
  if (!at || !Object.keys(at).length) return plan;
  return {
    ...plan,
    actors: plan.actors.map((a) => {
      const m = at[a.characterId] && a.marks?.find((x) => x.id === at[a.characterId]);
      return m ? { ...a, position: m.position } : a;
    }),
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

