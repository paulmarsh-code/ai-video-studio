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
}

export function readCamera(plan: GeometryPlanData, cam: PlanCamera): CameraReading {
  const fov = cam.fovDeg ?? PRESET_FOV[cam.preset];
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
  if (nearest && nearest.depthM < FOREGROUND_DEPTH_M && (inView.length === 1 || inView[1].depthM - nearest.depthM >= FOREGROUND_GAP_M)) {
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
  return { cameraId: cam.id, forwardDeg, actors, backgroundView };
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
