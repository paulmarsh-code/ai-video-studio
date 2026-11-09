// Impact of a floor-plan change on every shot (rules R-SCREEN, R-BACKGROUND, R-OCCLUSION,
// R-180, R-SHOULDER). Compares the plan before and after a change and reports only what got
// worse or changed, in plain English, per shot.

import { mainSubjectId } from "./composer";
import { readCamera } from "./geometry";
import type { CastMember, Finding, GeometryPlanData, ShotSpec } from "./types";
import { validateShot } from "./validator";

export interface ShotRef {
  id: string;
  code: string;
  spec: ShotSpec;
  /** True if this shot already has an approved take — changes mean re-shooting it. */
  approved?: boolean;
}

export interface ShotImpact {
  shotId: string;
  shotCode: string;
  changes: Finding[];
}

const GEOMETRY_CODES = new Set([
  "VISIBLE_OUT_OF_VIEW",
  "CROSSES_LINE_OF_ACTION",
  "SUBJECT_HIDDEN",
  "FACE_HIDDEN",
  "UNKNOWN_CAMERA",
]);

const label = (f: string) => f.replace("frame-", "").replace("out-", "out of frame ");

export function planImpact(
  before: GeometryPlanData,
  after: GeometryPlanData,
  shots: ShotRef[],
  cast: CastMember[],
): ShotImpact[] {
  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const result: ShotImpact[] = [];

  for (const shot of shots) {
    const camB = before.cameras.find((c) => c.id === shot.spec.cameraId);
    const camA = after.cameras.find((c) => c.id === shot.spec.cameraId);
    if (!camB || !camA) continue;
    const rb = readCamera(before, camB);
    const ra = readCamera(after, camA);
    const changes: Finding[] = [];

    // New geometry problems (validator findings that were not there before).
    const fb = new Set(validateShot(shot.spec, cast, before).filter((f) => GEOMETRY_CODES.has(f.code)).map((f) => f.code + f.message));
    for (const f of validateShot(shot.spec, cast, after)) {
      if (GEOMETRY_CODES.has(f.code) && !fb.has(f.code + f.message)) changes.push(f);
    }

    // Screen position of each visible character (R-SCREEN).
    for (const id of shot.spec.visibleIds) {
      const b = rb.actors.find((a) => a.characterId === id);
      const a = ra.actors.find((x) => x.characterId === id);
      if (!b || !a || !b.inView || !a.inView) continue; // out-of-view is reported above
      const side = (f: string) => (f === "centre" ? 0 : f === "frame-left" ? -1 : 1);
      if (side(b.frame) !== side(a.frame)) {
        changes.push({
          code: "SCREEN_POSITION_CHANGED", severity: "warning",
          message: `${name(id)} moves from ${label(b.frame)} to ${label(a.frame)}. This breaks continuity with shots already planned.`,
        });
      }
      if (b.foreground !== a.foreground) {
        changes.push({
          code: a.foreground ? "BECAME_SHOULDER" : "LOST_SHOULDER", severity: a.foreground ? "info" : "warning",
          message: a.foreground
            ? `${name(id)} is now the over-the-shoulder foreground.`
            : `${name(id)} is no longer the over-the-shoulder foreground, so the shot loses its over-the-shoulder framing.`,
        });
      }
    }

    // Background behind the subject (R-BACKGROUND).
    if (rb.backgroundView !== ra.backgroundView) {
      const subj = mainSubjectId(shot.spec);
      changes.push({
        code: "BACKGROUND_CHANGED", severity: "warning",
        message: `The background behind ${subj ? name(subj) : "the subject"} changes from ${rb.backgroundView ?? "nothing"} to ${ra.backgroundView ?? "nothing"}.`,
      });
    }

    if (changes.length && shot.approved) {
      changes.unshift({
        code: "APPROVED_TAKE_AFFECTED", severity: "error",
        message: `${shot.spec.code} already has an approved take. Keeping this change means re-shooting it.`,
        fix: "Undo the change, or keep it and re-shoot the shot.",
      });
    }
    if (changes.length) result.push({ shotId: shot.id, shotCode: shot.code, changes });
  }
  return result;
}
