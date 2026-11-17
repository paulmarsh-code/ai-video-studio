// D156: a panel added after the floor plan gets its camera straight away, so it can be drawn.
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/client";
import { seedDemo } from "../src/db/seed";
import * as repo from "../src/lib/repo";
import * as studio from "../src/lib/studioRepo";
import { placeNewPanelCamera } from "../src/lib/panelChange";

describe("A new panel's camera (D156)", () => {
  it("places it from what happens, and leaves every other panel's camera alone", async () => {
    const db = await openDb(":memory:");
    const sceneId = repo.listScenes(db, seedDemo(db))[0].id;
    const before = repo.getScene(db, sceneId)!;
    expect(before.plan).toBeTruthy();
    const others = before.shots.map((x) => [x.id, x.spec.cameraId]);
    const id = studio.addPanel(db, sceneId, { code: "P99", description: "Back on the group at the table: they shrug and glance at each other.", emotion: "smug", durationSec: 3 });
    expect(repo.getScene(db, sceneId)!.shots.find((x) => x.panelId === id)!.spec.cameraId).toBeFalsy();
    const kind = placeNewPanelCamera(db, id);
    expect(kind).toBeTruthy();
    const after = repo.getScene(db, sceneId)!;
    const cam = after.shots.find((x) => x.panelId === id)!.spec.cameraId;
    expect(after.plan!.data.cameras.some((c) => c.id === cam)).toBe(true);
    for (const [sid, c] of others) expect(after.shots.find((x) => x.id === sid)!.spec.cameraId).toBe(c);
    expect(placeNewPanelCamera(db, id)).toBeNull();
  });
});
