// Which approved picture goes with a panel for continuity (D18c, D63, D69, D72). The one from the
// panel's own camera if there is one, since it shows exactly what this panel should have behind
// the characters; otherwise the one with the most people, as before. With two approved, panel 1
// was sent panel 2 (the other camera, chosen as the lower number) and lost the handrail and its
// table's base, while panel 3, from its own camera, sat approved beside it.

import { planForShot, readCamera, walkAcross } from "./geometry";
import type { GeometryPlanData, ShotSpec } from "./types";

export interface ContinuityPicture { assetId: string; label: string; view?: string; cameraId?: string; /** Seconds from this panel's start to the picture's panel's start (D73): + it comes later. */ secondsApart?: number }

export function continuityFor(
  panels: { id: string; status: string; imageAssetId?: string | null; durationSec?: number | null }[],
  shots: { panelId: string | null; spec: ShotSpec }[],
  plan: GeometryPlanData | undefined,
  panelId: string,
): ContinuityPicture | undefined {
  const shotOf = (id: string) => shots.find((x) => x.panelId === id)?.spec;
  const mine = shotOf(panelId)?.cameraId;
  const approved = panels
    .map((p, i) => ({ p, n: i + 1, spec: shotOf(p.id) }))
    .filter((x) => x.p.id !== panelId && x.p.status === "approved" && x.p.imageAssetId)
    .sort((a, b) => Number(!!mine && b.spec?.cameraId === mine) - Number(!!mine && a.spec?.cameraId === mine)
      || (b.spec?.visibleIds.length ?? 0) - (a.spec?.visibleIds.length ?? 0) || a.n - b.n);
  const pick = approved[0];
  if (!pick) return undefined;
  // When each panel starts, from the lengths of those before it (D73).
  const start = (id: string) => { let t = 0; for (const p of panels) { if (p.id === id) return t; t += p.durationSec ?? 0; } return t; };
  const secondsApart = panels.some((p) => p.durationSec) ? start(pick.p.id) - start(panelId) : undefined;
  const sp = pick.spec && plan ? planForShot(plan, pick.spec) : undefined;
  const cam = sp?.cameras.find((c) => c.id === pick.spec?.cameraId);
  return { assetId: pick.p.imageAssetId!, label: `approved scene picture (panel ${pick.n})`, view: sp && cam ? readCamera(sp, cam).backgroundView : undefined, cameraId: pick.spec?.cameraId, ...(secondsApart !== undefined ? { secondsApart } : {}) };
}

// Words for someone moving through the background, not standing or sitting (D77).
const MOVING = /\b(walk(s|ing|er|ers)?|pass(es|ing)\s+(by|through|past)|passers?-by|moving|moves|serv(er|ing|es)|waiter|waitress|carr(y|ies|ying)|trays?|cross(es|ing)|wander(s|ing)?|stroll(s|ing)?|hurr(y|ies|ying)|jog(s|ging|ger)?|running|runner|cycl(ist|ing)|rid(es|ing)|skat(er|ing)|weav(es|ing))\b/i;
// One person, not a group: "a server", "an usher", "one cyclist"; not "a few", "a group of".
const ONE = /^(a|an|one)\s+(?!(few|couple|group|handful|number|lot|crowd|pair|line|stream|steady|dozen)\b)/i;

/**
 * The one person in the background words who moves through the place (D77), in the words'
 * own phrase: "a server in black moving between groups". English words, as the scene's setting
 * is; nothing found (or only a group) means nothing changes.
 */
export function walkerIn(crowd?: string): string | undefined {
  for (const part of (crowd ?? "").split(/[;,.]|\s+and\s+|\s+while\s+/i)) {
    const t = part.trim();
    if (ONE.test(t) && MOVING.test(t)) return t;
  }
  return undefined;
}

/**
 * The background's one walker, when they'd have walked out of this picture since the approved
 * picture from the same camera (D77). Told in words to put a server at an edge, GPT put her back
 * in the gap between the characters, 7 seconds on, three times running: she was in the words, and
 * the same image 1 invites the same place. She has gone, so she is left out of this panel's words.
 */
export function walkerGone(plan: GeometryPlanData | undefined, spec: ShotSpec | undefined, continuity: ContinuityPicture | undefined): string | undefined {
  const who = walkerIn(spec?.crowd);
  if (!who || !plan || !spec?.cameraId || continuity?.cameraId !== spec.cameraId || continuity.secondsApart === undefined) return undefined;
  const sp = planForShot(plan, spec);
  const cam = sp.cameras.find((c) => c.id === spec.cameraId);
  return cam && walkAcross(sp, cam, continuity.secondsApart) >= 1 ? who : undefined;
}

/** The background words without one part (D77), with the comma or "and" that joined it. */
export function crowdWithout(crowd: string, part: string): string {
  return crowd.replace(part, "\u0000")
    .replace(/(?:\s*[,;])?(?:\s+(?:and|while))?\s*\u0000/i, "")
    .replace(/^\s*[,;]?\s*(?:(?:and|while)\s+)?/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
