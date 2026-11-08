// Persistence and library tests (in-memory SQLite, real migrations).
// Covers spec acceptance tests 18 (library copy and change), 19 (library stats), 20 (private by default).

import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/client";
import { seedDemo } from "../src/db/seed";
import { composeKlingPrompt } from "../src/lib/domain/composer";
import { validateShot } from "../src/lib/domain/validator";
import * as repo from "../src/lib/repo";

function fresh() {
  const db = openDb(":memory:");
  const projectId = seedDemo(db);
  return { db, projectId };
}

describe("Demo project seed", () => {
  it("creates Paid On Time with four characters and Scene 1", () => {
    const { db, projectId } = fresh();
    expect(repo.getProject(db, projectId)?.code).toBe("POT");
    expect(repo.getCast(db, projectId).map((c) => c.name)).toEqual(["Jade", "Chase", "Marcus", "Nina"]);
    const [scene] = repo.listScenes(db, projectId);
    const s = repo.getScene(db, scene.id)!;
    expect(s.panels.map((p) => p.code)).toEqual(["C1", "C2a", "C2b", "C4a", "C4b", "C4c"]);
    expect(s.shots).toHaveLength(6);
    expect(s.plan?.data.cameras.map((c) => c.id)).toEqual(["main", "reverse", "jade-cu"]);
  });

  it("every seeded shot composes, and none has a blocking error", () => {
    const { db, projectId } = fresh();
    const cast = repo.getCast(db, projectId);
    const s = repo.getScene(db, repo.listScenes(db, projectId)[0].id)!;
    for (const shot of s.shots) {
      const errs = validateShot(shot.spec, cast, s.plan?.data).filter((f) => f.severity === "error");
      expect(errs, shot.code).toEqual([]);
      expect(composeKlingPrompt(shot.spec, cast, s.plan?.data).text.length).toBeGreaterThan(50);
    }
  });
});

describe("Versioning", () => {
  it("saving a plan keeps the previous version", () => {
    const { db, projectId } = fresh();
    const sceneId = repo.listScenes(db, projectId)[0].id;
    const before = repo.getLatestPlan(db, sceneId)!;
    const moved = structuredClone(before.data);
    moved.actors[0].position.x -= 0.2;
    expect(repo.savePlan(db, sceneId, moved)).toBe(2);
    expect(repo.getLatestPlan(db, sceneId)!.data.actors[0].position.x).toBeCloseTo(before.data.actors[0].position.x - 0.2);
  });

  it("identical prompt text does not create a new prompt version", () => {
    const { db, projectId } = fresh();
    const shot = repo.getScene(db, repo.listScenes(db, projectId)[0].id)!.shots[0];
    expect(repo.savePromptVersion(db, shot.id, "A", {}, [])).toBe(1);
    expect(repo.savePromptVersion(db, shot.id, "A", {}, [])).toBe(1);
    expect(repo.savePromptVersion(db, shot.id, "B", {}, [])).toBe(2);
  });
});

describe("Library (Stage 10)", () => {
  it("AT-18: copy and change leaves the original untouched and credits the source", () => {
    const { db, projectId } = fresh();
    const plan = repo.getLatestPlan(db, repo.listScenes(db, projectId)[0].id)!.data;
    const origId = repo.addLibraryItem(db, { kind: "venue", name: "Launch-party venue", data: { plan } });
    const changed = structuredClone(plan);
    changed.views = changed.views.map((v) => (v.name === "bar" ? { ...v, directionDeg: 0 } : v));
    const copyId = repo.copyLibraryItem(db, origId, { name: "Launch-party venue, bar on right", data: { plan: changed } });
    const orig = repo.getLibraryItem(db, origId)!;
    const copy = repo.getLibraryItem(db, copyId)!;
    expect((orig.data as { plan: typeof plan }).plan.views.find((v) => v.name === "bar")!.directionDeg).toBe(180);
    expect(copy.sourceId).toBe(origId);
    expect(copy.sourceName).toBe("Launch-party venue");
    expect(copy.version).toBe(2);
    expect(repo.listLibrary(db).map((i) => i.id)).toEqual(expect.arrayContaining([origId, copyId]));
  });

  it("AT-19: stats come from the take log", () => {
    const { db, projectId } = fresh();
    const itemId = repo.addLibraryItem(db, { kind: "shot-setup", name: "Two at a table", data: {} });
    const shots = repo.getScene(db, repo.listScenes(db, projectId)[0].id)!.shots;
    repo.insertTake(db, { shotId: shots[0].id, number: 1, promptVersion: 1, verdict: "approved", libraryItemIds: [itemId] });
    repo.insertTake(db, { shotId: shots[1].id, number: 1, promptVersion: 1, verdict: "retake", libraryItemIds: [itemId] });
    repo.insertTake(db, { shotId: shots[1].id, number: 2, promptVersion: 2, verdict: "approved", libraryItemIds: [itemId] });
    const s = repo.libraryStats(db, itemId);
    expect(s.uses).toBe(3);
    expect(s.firstTakeApproval).toBeCloseTo(0.5);
    expect(s.takesPerApprovedClip).toBeCloseTo(1.5);
  });

  it("AT-20: new items are private to their owner", () => {
    const { db } = fresh();
    const id = repo.addLibraryItem(db, { kind: "character", name: "New character", data: {}, ownerId: "paul" });
    expect(repo.getLibraryItem(db, id)!.visibility).toBe("private");
    expect(repo.listLibrary(db, "someone-else").map((i) => i.id)).not.toContain(id);
  });
});
