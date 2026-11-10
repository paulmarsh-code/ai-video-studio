// Saving a project to the library and deleting one (D22).
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/client";
import { seedDemo } from "../src/db/seed";
import * as repo from "../src/lib/repo";

describe("Projects: library and delete (D22)", () => {
  it("a project saved to the library leaves the live list and can come back", async () => {
    const db = await openDb(":memory:");
    const id = seedDemo(db);
    expect(repo.listProjects(db).map((p) => p.id)).toContain(id);
    repo.saveProjectToLibrary(db, id);
    expect(repo.listProjects(db).map((p) => p.id)).not.toContain(id);
    expect(repo.listProjects(db, "saved").map((p) => p.id)).toContain(id);
    repo.restoreProject(db, id);
    expect(repo.listProjects(db).map((p) => p.id)).toContain(id);
  });
  it("deleting a project removes it and everything in it", async () => {
    const db = await openDb(":memory:");
    const id = seedDemo(db);
    const scenes = repo.listScenes(db, id);
    expect(scenes.length).toBeGreaterThan(0);
    repo.deleteProject(db, id);
    expect(repo.getProject(db, id)).toBeUndefined();
    expect(repo.listScenes(db, id)).toEqual([]);
    expect(repo.getCast(db, id)).toEqual([]);
  });
});
