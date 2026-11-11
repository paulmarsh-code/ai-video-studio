// Positions per panel (D35): any scene; made-up names. People and props can be placed, turned,
// walked or taken away on one panel, and that carries on to later panels until changed again.
import { describe, expect, it } from "vitest";
import { blockSource, carryBlocking, withEdits } from "../src/lib/domain/blocking";
import { facingOf, planForShot } from "../src/lib/domain/geometry";
import { movesFor } from "../src/lib/blockingImage";
import { composeKlingPrompt } from "../src/lib/domain/composer";
import type { GeometryPlanData, PanelBlock, ShotSpec } from "../src/lib/domain/types";
import { openDb } from "../src/db/client";
import { seedDemo } from "../src/db/seed";
import * as repo from "../src/lib/repo";
import * as studio from "../src/lib/studioRepo";

const plan: GeometryPlanData = {
  aspect: "9:16",
  bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
  actors: [{ characterId: "ava", position: { x: 1, y: 5 } }, { characterId: "ben", position: { x: -1, y: 5 } }],
  furniture: [{ id: "lamp", name: "floor lamp", position: { x: 2, y: 7 }, radiusM: 0.3 }, { id: "t", name: "kitchen table", position: { x: 0, y: 5 }, radiusM: 0.6 }],
  cameras: [{ id: "c", name: "Cam A", preset: "wide", position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 }],
  views: [{ name: "back wall", directionDeg: 90 }, { name: "kitchen door", directionDeg: 0 }],
  lineOfAction: ["ava", "ben"],
};
const spec = (extra: Partial<ShotSpec> = {}): ShotSpec => ({ code: "S", visibleIds: ["ava", "ben"], excludedIds: [], presentIds: ["ava", "ben"], cameraId: "c", audioMode: "off", durationSec: 4, emotion: "calm", sceneContext: "Two friends in a kitchen.", venueName: "kitchen", actions: "", ...extra } as ShotSpec);
const you = (b: Omit<PanelBlock, "by">): PanelBlock => ({ ...b, by: "you" });

describe("Carrying positions from panel to panel (D35)", () => {
  it("someone moved on a panel stays there in later panels until moved again", () => {
    const out = carryBlocking([{ spec: spec() }, { spec: spec({ blocking: { ben: you({ at: { x: -3, y: 6 } }) } }) }, { spec: spec() }, { spec: spec({ blocking: { ben: you({ at: { x: -2, y: 4 } }) } }) }, { spec: spec() }]);
    expect(out[0].blocking).toBeUndefined();
    expect(out[2].blocking?.ben).toEqual({ at: { x: -3, y: 6 }, by: "carried" });
    expect(out[3].blocking?.ben.by).toBe("you");
    expect(out[4].blocking?.ben.at).toEqual({ x: -2, y: 4 });
  });
  it("'this panel only' isn't carried; a walk carries its end spot, not the walking direction", () => {
    const out = carryBlocking([{ spec: spec({ blocking: { ava: you({ at: { x: 1, y: 5 }, facingDeg: 0, only: true }) } }) }, { spec: spec() }]);
    expect(out[1].blocking).toBeUndefined();
    const walk = carryBlocking([{ spec: spec({ blocking: { ava: you({ at: { x: 1, y: 5 }, to: { x: 4, y: 5 } }) } }) }, { spec: spec() }]);
    expect(walk[1].blocking?.ava).toEqual({ at: { x: 4, y: 5 }, by: "carried" });
  });
  it("a panel whose words move someone (an arrival mark) takes over from what was carried", () => {
    const out = carryBlocking([{ spec: spec({ blocking: { ava: you({ at: { x: 3, y: 3 } }) } }) }, { spec: spec({ at: { ava: "arriving" } }) }, { spec: spec() }]);
    expect(out[1].blocking).toBeUndefined();
    expect(out[2].blocking).toBeUndefined();
  });
  it("a prop taken away stays away until brought back", () => {
    const out = carryBlocking([{ spec: spec({ blocking: { "prop:lamp": you({ at: { x: 2, y: 7 }, gone: true }) } }) }, { spec: spec() }]);
    expect(out[1].blocking?.["prop:lamp"]).toEqual({ at: { x: 2, y: 7 }, gone: true, by: "carried" });
    expect(planForShot(plan, out[1]).furniture?.map((f) => f.name)).toEqual(["kitchen table"]);
  });
  it("unsaved edits lay over a panel, and the source of each placement is told", () => {
    const specs = carryBlocking([{ spec: withEdits(spec(), { ben: { at: { x: -3, y: 6 } } }) }, { spec: spec() }, { spec: spec({ at: { ava: "arriving" } }) }]);
    expect(blockSource(specs, 0, "ben")).toEqual({ kind: "here" });
    expect(blockSource(specs, 1, "ben")).toEqual({ kind: "carried", from: 0 });
    expect(blockSource(specs, 2, "ava")).toEqual({ kind: "mark" });
    expect(blockSource(specs, 1, "ava")).toEqual({ kind: "plan" });
    expect(withEdits(specs[0], { ben: null }).blocking?.ben).toBeUndefined();
  });
});

describe("A panel's plan (D35)", () => {
  it("puts people where the panel says, facing the set way or the way they walk", () => {
    const sp = planForShot(plan, spec({ blocking: { ava: you({ at: { x: 2, y: 3 }, facingDeg: 180 }), ben: you({ at: { x: -1, y: 5 }, to: { x: -1, y: 9 } }) } }));
    expect(sp.actors.find((a) => a.characterId === "ava")?.position).toEqual({ x: 2, y: 3 });
    const fa = facingOf(sp, "ava")!;
    expect(fa.x).toBeCloseTo(-1);
    const fb = facingOf(sp, "ben")!;
    expect(fb.y).toBeCloseTo(1);
  });
  it("moves a prop for the panel", () => {
    const sp = planForShot(plan, spec({ blocking: { "prop:lamp": you({ at: { x: -3, y: 8 } }) } }));
    expect(sp.furniture?.find((f) => f.id === "lamp")?.position).toEqual({ x: -3, y: 8 });
  });
  it("the blocking frame draws the walk as an arrow to where they end", () => {
    const sp = planForShot(plan, spec({ blocking: { ben: you({ at: { x: -1, y: 5 }, to: { x: -4, y: 5 } }) } }));
    expect(movesFor(plan, spec(), sp, "Ben heads off.")).toEqual({ ben: { x: -4, y: 5 } });
  });
  it("the video prompt says the walk leaves the picture when it ends out of sight", () => {
    const shot = spec({ visibleIds: ["ben"], subjectId: "ben", blocking: { ben: you({ at: { x: -1, y: 5 }, to: { x: -4.2, y: 2 } }) } });
    const cast = [{ id: "ava", name: "Ava" }, { id: "ben", name: "Ben" }].map((c) => ({ ...c, pronoun: "she" as const, voiceLock: "", description: "" }));
    const p = composeKlingPrompt(shot, cast as never, plan);
    expect(p.text).toMatch(/Ben walks about \d+(\.5)? m during the shot, from where they start in the first frame and out of the picture on the left/);
  });
});

describe("Saving positions per panel (D35)", () => {
  async function fresh() {
    const db = await openDb(":memory:");
    const projectId = seedDemo(db);
    const sceneId = repo.listScenes(db, projectId)[0].id;
    const s = repo.getScene(db, sceneId)!;
    const shots = s.panels.map((p) => s.shots.find((x) => x.panelId === p.id)!).filter(Boolean);
    return { db, sceneId, shots };
  }
  const blockOf = (db: Awaited<ReturnType<typeof openDb>>, id: string) => repo.getShot(db, id)!.spec.blocking;

  it("saves a panel's placement and carries it to the panels after it", async () => {
    const { db, shots } = await fresh();
    const who = shots[1].spec.visibleIds[0];
    studio.savePanelBlocking(db, [{ shotId: shots[1].id, entries: { [who]: { at: { x: 1.234, y: 4.567 }, facingDeg: 400 } } }]);
    expect(blockOf(db, shots[1].id)?.[who]).toEqual({ at: { x: 1.23, y: 4.57 }, facingDeg: 40, by: "you" });
    const later = shots.slice(2).find((sh) => !sh.spec.at?.[who]);
    if (later) expect(blockOf(db, later.id)?.[who]?.by).toBe("carried");
    expect(blockOf(db, shots[0].id)?.[who]).toBeUndefined();
    // Clearing it removes what it carried too.
    studio.savePanelBlocking(db, [{ shotId: shots[1].id, entries: { [who]: null } }]);
    for (const sh of shots) expect(blockOf(db, sh.id)?.[who]).toBeUndefined();
  });

  it("follows the panels when they're reordered", async () => {
    const { db, sceneId, shots } = await fresh();
    const who = shots[2].spec.visibleIds[0];
    studio.savePanelBlocking(db, [{ shotId: shots[2].id, entries: { [who]: { at: { x: 0, y: 3 } } } }]);
    const panelId = shots[2].panelId!;
    studio.movePanel(db, panelId, -1); // now second
    const s = repo.getScene(db, sceneId)!;
    const ordered = s.panels.map((p) => s.shots.find((x) => x.panelId === p.id)!);
    expect(ordered[1].id).toBe(shots[2].id);
    // The panel it swapped with now comes after it, so it gets the carried spot (unless its words move them).
    if (!ordered[2].spec.at?.[who]) expect(ordered[2].spec.blocking?.[who]?.by).toBe("carried");
  });

  it("refuses while the cameras are locked", async () => {
    const { db, sceneId, shots } = await fresh();
    db.update((await import("../src/db/schema")).scenes).set({ locks: { positions: 1, cameras: 1 } }).run();
    expect(() => studio.savePanelBlocking(db, [{ shotId: shots[0].id, entries: { x: { at: { x: 0, y: 0 } } } }])).toThrow(/Change cameras/);
    expect(sceneId).toBeTruthy();
  });
});
