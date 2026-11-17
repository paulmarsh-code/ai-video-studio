// D158: a panel added later gets the scene's setting and crowd, and shares a camera that stands
// exactly where another panel's does.
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { openDb } from "../src/db/client";
import { seedDemo } from "../src/db/seed";
import * as t from "../src/db/schema";
import * as repo from "../src/lib/repo";
import * as studio from "../src/lib/studioRepo";

describe("A panel added later (D158)", () => {
  it("has the scene's crowd and setting, like the others", async () => {
    const db = await openDb(":memory:");
    const sceneId = repo.listScenes(db, seedDemo(db))[0].id;
    db.update(t.scenes).set({ staging: { spot: "at a cocktail table", crowd: "about 60 guests chatting in small groups", props: [] } }).where(eq(t.scenes.id, sceneId)).run();
    const id = studio.addPanel(db, sceneId, { code: "P98", description: "They talk.", emotion: "", durationSec: 3 });
    const spec = repo.getScene(db, sceneId)!.shots.find((x) => x.panelId === id)!.spec;
    expect(spec.crowd).toBe("about 60 guests chatting in small groups");
    expect(spec.spot).toBe("at a cocktail table");
  });
  it("its own camera standing where another panel's does becomes that camera", async () => {
    const db = await openDb(":memory:");
    const sceneId = repo.listScenes(db, seedDemo(db))[0].id;
    const s = repo.getScene(db, sceneId)!;
    const [a, b] = s.shots.filter((x) => x.spec.cameraId);
    const camA = s.plan!.data.cameras.find((c) => c.id === a.spec.cameraId)!;
    const copy = { ...camA, id: `${camA.id}~copy01`, name: `${camA.name}, for this panel` };
    db.insert(t.plans).values({ id: randomUUID(), sceneId, name: s.plan!.name, version: s.plan!.version + 1, data: { ...s.plan!.data, cameras: [...s.plan!.data.cameras, copy] } }).run();
    db.update(t.shots).set({ spec: { ...b.spec, cameraId: copy.id } }).where(eq(t.shots.id, b.id)).run();
    expect(studio.shareSameCamera(db, sceneId, b.id)).toBe(true);
    expect(repo.getScene(db, sceneId)!.shots.find((x) => x.id === b.id)!.spec.cameraId).toBe(camA.id);
  });
});
