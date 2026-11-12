// Which approved picture goes with a panel for continuity (D18c, D63, D69, D72). The one from the
// panel's own camera if there is one, since it shows exactly what this panel should have behind
// the characters; otherwise the one with the most people, as before. With two approved, panel 1
// was sent panel 2 (the other camera, chosen as the lower number) and lost the handrail and its
// table's base, while panel 3, from its own camera, sat approved beside it.

import { planForShot, readCamera } from "./geometry";
import type { GeometryPlanData, ShotSpec } from "./types";

export interface ContinuityPicture { assetId: string; label: string; view?: string; cameraId?: string }

export function continuityFor(
  panels: { id: string; status: string; imageAssetId?: string | null }[],
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
  const sp = pick.spec && plan ? planForShot(plan, pick.spec) : undefined;
  const cam = sp?.cameras.find((c) => c.id === pick.spec?.cameraId);
  return { assetId: pick.p.imageAssetId!, label: `approved scene picture (panel ${pick.n})`, view: sp && cam ? readCamera(sp, cam).backgroundView : undefined, cameraId: pick.spec?.cameraId };
}
