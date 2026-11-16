// D135: one place to change a panel, in words. The words move the people and the camera for that
// panel only, with the cameras still locked; every other panel keeps its camera.
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/client";
import { seedDemo } from "../src/db/seed";
import * as repo from "../src/lib/repo";
import * as studio from "../src/lib/studioRepo";
import { changePanel } from "../src/lib/panelChange";
import { planForShot, readCamera } from "../src/lib/domain/geometry";

async function scene() {
  const db = await openDb(":memory:");
  const projectId = seedDemo(db);
  const sceneId = repo.listScenes(db, projectId)[0].id;
  return { db, sceneId };
}

describe("Changing a panel in words (D135)", () => {
  it("a named two-shot moves only this panel's camera onto the two named, cameras locked", async () => {
    const { db, sceneId } = await scene();
    try { studio.approvePositions(db, sceneId); studio.approveCameras(db, sceneId); } catch { /* the demo may lock differently */ }
    const s = repo.getScene(db, sceneId)!;
    const shot = s.shots.find((x) => x.spec.visibleIds.length === 3)!;
    const others = s.shots.filter((x) => x.id !== shot.id).map((x) => [x.id, x.spec.cameraId]);
    const [a, b] = shot.spec.visibleIds.filter((id) => id !== "jade");
    const nm = (id: string) => repo.getCast(db, s.scene.projectId).find((c) => c.id === id)!.name;
    const r = changePanel(db, shot.panelId!, `Two-shot of ${nm(a)} and ${nm(b)}`);
    expect(r.layout).toBe(true);
    expect(r.done.join(" ")).toContain(`Two-shot on ${nm(a)} and ${nm(b)}`);
    const after = repo.getScene(db, sceneId)!;
    const sh = after.shots.find((x) => x.id === shot.id)!;
    const cam = after.plan!.data.cameras.find((c) => c.id === sh.spec.cameraId)!;
    expect(cam.name).toBe(`Two-shot on ${nm(a)} and ${nm(b)}, for this panel`);
    const seen = readCamera(planForShot(after.plan!.data, sh.spec), cam).actors.filter((x) => x.inView).map((x) => x.characterId);
    expect(seen).toEqual(expect.arrayContaining([a, b]));
    for (const [id, c] of others) expect(after.shots.find((x) => x.id === id)!.spec.cameraId).toBe(c);
  });
  it("words that move nothing are kept for the picture", async () => {
    const { db, sceneId } = await scene();
    const shot = repo.getScene(db, sceneId)!.shots[1];
    const r = changePanel(db, shot.panelId!, "make her look less happy");
    expect(r.layout).toBe(false);
    expect(r.unclear).toEqual(["make her look less happy"]);
  });
});
