// A change that moves someone out of a panel's camera view turns that panel's own camera (D42).
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/client";
import { seedDemo } from "../src/db/seed";
import * as repo from "../src/lib/repo";
import * as studio from "../src/lib/studioRepo";
import { planForShot, readCamera } from "../src/lib/domain/geometry";

describe("Keeping everyone in the picture when positions change (D42)", () => {
  it("turns only that panel's camera, and keeps the shared and approved ones", async () => {
    const db = await openDb(":memory:");
    const projectId = seedDemo(db);
    const sceneId = repo.listScenes(db, projectId)[0].id;
    const s = repo.getScene(db, sceneId)!;
    const shot = s.shots.find((x) => x.spec.cameraId && x.spec.visibleIds.length >= 1)!;
    const plan0 = s.plan!.data;
    const cam = plan0.cameras.find((c) => c.id === shot.spec.cameraId)!;
    // Somewhere well behind the camera: certainly out of its view.
    const who = shot.spec.visibleIds[0];
    const back = { x: cam.position.x - (cam.lookAt.x - cam.position.x) * 0.3 + 0.5, y: cam.position.y - (cam.lookAt.y - cam.position.y) * 0.3 };
    const others = s.shots.filter((x) => x.id !== shot.id).map((x) => [x.id, x.spec.cameraId]);
    const r = studio.savePanelBlocking(db, [{ shotId: shot.id, entries: { [who]: { at: back, only: true } } }]);
    expect(r.turned.length).toBe(1);
    const after = repo.getScene(db, sceneId)!;
    const sh = after.shots.find((x) => x.id === shot.id)!;
    expect(sh.spec.cameraId).not.toBe(cam.id);
    expect(after.plan!.data.cameras.find((c) => c.id === cam.id)).toEqual(cam); // the old one is untouched
    for (const [id, c] of others) expect(after.shots.find((x) => x.id === id)!.spec.cameraId).toBe(c);
    const sp = planForShot(after.plan!.data, sh.spec);
    const turned = sp.cameras.find((c) => c.id === sh.spec.cameraId)!;
    const reading = readCamera(sp, turned);
    for (const id of sh.spec.visibleIds) if (id !== turned.povId) expect(reading.actors.find((a) => a.characterId === id)?.inView).toBe(true);
    // Moving them again reuses this panel's own camera rather than adding another.
    const n = after.plan!.data.cameras.length;
    studio.savePanelBlocking(db, [{ shotId: shot.id, entries: { [who]: { at: { x: back.x - 1, y: back.y }, only: true } } }]);
    expect(repo.getScene(db, sceneId)!.plan!.data.cameras.length).toBe(n);
  });
});
