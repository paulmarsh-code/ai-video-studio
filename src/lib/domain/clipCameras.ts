// Camera angles inside a clip (D121, Paul: "3 camera shots in 8-10 sec is too many, 2 or 1 should
// be maximum … what shots work well together"). Clip 3 cut from a wide towards the screen, to the
// reverse from behind Jade, to a wide from a third spot: followed faithfully by Kling, and it looked
// odd. Shots that work together in one short clip:
//   1. one angle: a wide, then closer along the same line (a punch-in);
//   2. shot and reverse: over one shoulder, then the other, the same side of the line;
//   3. a wide, then a cut-in on the speaker from much the same side.
// So a clip holds at most two angles, and a later shot that would need a third goes back to one
// the clip already has: a wider shot to the clip's wide, a closer one to the angle nearest its own.

import { pictureXY, planForShot } from "./geometry";
import type { GeometryPlanData, PlanCamera, ShotSpec } from "./types";

/** A clip runs at most this long and holds at most this many shots (D113). */
export const CLIP_MAX_SEC = 15;
export const CLIP_MAX_SHOTS = 4;
/** At most this many camera angles in one clip. */
export const CLIP_MAX_ANGLES = 2;
/**
 * Two cameras are one angle (a punch-in, not a cut across) when they look within this many degrees
 * of each other and one stands near the other's line of view. Clip 3's last wide looked only 30°
 * off the first, but stood 1.6 m to the side: the background changed and it read as a new camera.
 */
export const SAME_ANGLE_DEG = 20;
export const SAME_LINE_M = 0.75;

/** Which way a camera looks, in degrees. */
export function bearing(cam: Pick<PlanCamera, "position" | "lookAt">): number {
  return (Math.atan2(cam.lookAt.y - cam.position.y, cam.lookAt.x - cam.position.x) * 180) / Math.PI;
}

type Cam = Pick<PlanCamera, "position" | "lookAt">;

export function sameAngle(a: Cam, b: Cam): boolean {
  if (Math.abs(((bearing(a) - bearing(b) + 540) % 360) - 180) > SAME_ANGLE_DEG) return false;
  // How far each stands from the other's line of view.
  const off = (x: Cam, y: Cam) => {
    const f = { x: x.lookAt.x - x.position.x, y: x.lookAt.y - x.position.y }, fl = Math.hypot(f.x, f.y) || 1;
    return Math.abs(((y.position.x - x.position.x) * f.y - (y.position.y - x.position.y) * f.x) / fl);
  };
  return Math.min(off(a, b), off(b, a)) <= SAME_LINE_M;
}

/**
 * Consecutive items in clips of up to 15 s and 4 shots, and at most two camera angles: an item
 * that would bring a third starts the next clip. `angle` gives an item's camera bearing, if known.
 */
export function groupByTime<T>(items: T[], sec: (x: T) => number, angle?: (x: T) => Cam | undefined, maxSec = CLIP_MAX_SEC, maxShots = CLIP_MAX_SHOTS, speakers?: (x: T) => string[]): T[][] {
  const out: T[][] = [];
  let cur: T[] = [], total = 0, angles: Cam[] = [], voices = new Set<string>();
  for (const x of items) {
    const d = Math.max(1, sec(x));
    const a = angle?.(x);
    const third = a !== undefined && !angles.some((b) => sameAngle(a, b)) && angles.length >= CLIP_MAX_ANGLES;
    // One speaker per clip (D180): with two, Kling 4.0 gave Jade Samantha's voice, from voice files
    // and from voices in the Elements alike. A silent panel joins whoever is speaking.
    const says = speakers?.(x) ?? [];
    const second = says.some((v) => !voices.has(v)) && new Set([...voices, ...says]).size > 1;
    if (cur.length && (total + d > maxSec || cur.length >= maxShots || third || second)) { out.push(cur); cur = []; total = 0; angles = []; voices = new Set(); }
    cur.push(x); total += d;
    for (const v of says) voices.add(v);
    if (a !== undefined && !angles.some((b) => sameAngle(a, b))) angles.push(a);
  }
  if (cur.length) out.push(cur);
  return out;
}

const WIDE_SIZES = new Set(["mls", "fs", "ls", "ws"]);
const wideSize = (c: PlanCamera) => (c.size ? WIDE_SIZES.has(c.size) : false);
/** A wide shot of the place or the group: the one kind of shot that can go back to the clip's wide. */
const isWide = (c: PlanCamera) => !c.povId && (c.preset === "wide" || wideSize(c));
/** An earlier camera a wide shot can go back to: a wide, or a group shot. */
const wideLike = (c: PlanCamera) => !c.povId && (c.preset === "wide" || c.preset === "two-shot" || wideSize(c));

export interface AngleShot { id: string; spec: ShotSpec; camera?: PlanCamera }

/**
 * The cameras for one scene's shots with no clip holding a third angle. Returns, by shot id, the
 * camera to use instead (an earlier camera of the same clip, at this shot's own size) where one
 * sees everyone this shot needs; a shot nothing fits keeps its own and is named in `problems`.
 */
export function limitClipAngles(plan: GeometryPlanData, shots: AngleShot[]): { replace: Map<string, PlanCamera>; problems: { id: string; why: string }[] } {
  const replace = new Map<string, PlanCamera>();
  const problems: { id: string; why: string }[] = [];
  // Clips by time alone: the angles inside them are what this fixes.
  for (const clip of groupByTime(shots, (s) => s.spec.durationSec)) {
    const used: PlanCamera[] = [];
    for (const s of clip) {
      const cam = s.camera;
      if (!cam) continue;
      const a = bearing(cam);
      const angles = used.reduce<PlanCamera[]>((xs, b) => (xs.some((x) => sameAngle(x, b)) ? xs : [...xs, b]), []);
      if (angles.some((b) => sameAngle(cam, b)) || angles.length < CLIP_MAX_ANGLES) { used.push(cam); continue; }
      // A third angle. A wide shot goes back to the clip's wide (or group shot), at its own size.
      // A closer shot (a line over a shoulder, a close-up) keeps its own angle: a wide would lose
      // the face, the other shoulder shows the wrong one; the clips start a new clip there instead.
      if (!isWide(cam)) continue;
      const order = used.filter(wideLike).sort((x, y) => Math.abs(((bearing(x) - a + 540) % 360) - 180) - Math.abs(((bearing(y) - a + 540) % 360) - 180));
      const fits = order.map((c) => ({ ...c, size: cam.size })).find((c) => sees(plan, s.spec, c));
      if (fits) { replace.set(s.id, fits); used.push(fits); }
      else problems.push({ id: s.id, why: "This wide shot would be a third camera angle in its clip, and the clip's earlier wide doesn't show everyone it needs: it will start a new clip." });
    }
  }
  return { replace, problems };
}

/** Whether a camera shows everyone a shot must show, inside the frame and in front of the lens. */
function sees(plan: GeometryPlanData, spec: ShotSpec, cam: PlanCamera): boolean {
  const sp = planForShot(plan, spec);
  const must = cam.preset === "main-ots" ? [spec.speakerId ?? spec.subjectId ?? spec.visibleIds[0]].filter(Boolean) as string[] : spec.visibleIds;
  return must.every((id) => {
    const a = sp.actors.find((x) => x.characterId === id);
    const q = a && pictureXY(sp, cam, a.position, 1.5);
    return !!q && q.x >= 0.06 && q.x <= 0.94 && q.depth > 0.3;
  });
}
