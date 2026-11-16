// D139: a made clip is reviewed like a storyboard frame: approved, changed in words, or made again.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { putJobs, readJobs, reviewJob, writeJobs, type KlingJob } from "../src/lib/klingJobs";

const cwd = process.cwd();
beforeEach(() => process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "jobs-"))));
afterEach(() => process.chdir(cwd));

const job = (o: Partial<KlingJob> = {}): KlingJob => ({ id: "s:7-8", projectId: "p", sceneId: "s", sceneTitle: "S", clip: 1, panels: [7, 8], seconds: 6, aspect: "9:16", model: "m", resolution: "720p", sound: true, prompt: "THE REQUEST", elements: [], pictures: [], missing: [], credits: 60, status: "done", requestedAt: "t0", localFile: "a.mp4", generationId: "g1", ...o });

describe("Reviewing a made clip (D139)", () => {
  it("a change in words keeps the take, adds the change to the request and waits to be made", () => {
    putJobs([job()]);
    const j = reviewJob("s:7-8", "change", "  she shouldn't smile at the end ");
    expect(j.status).toBe("ready");
    expect(j.prompt).toBe("THE REQUEST\nThis is a new take of this clip. Change from the last take: she shouldn't smile at the end.");
    expect(j.takes).toEqual([expect.objectContaining({ localFile: "a.mp4", generationId: "g1" })]);
    expect(j.localFile).toBeUndefined();
    // A second change replaces the first, on the same request.
    // Claude makes it and writes the result back.
    writeJobs({ jobs: [{ ...readJobs().jobs[0], status: "done", localFile: "b.mp4" }] });
    const k = reviewJob("s:7-8", "change", "slower");
    expect(k.prompt).toBe("THE REQUEST\nThis is a new take of this clip. Change from the last take: slower.");
    expect(k.takes?.map((t) => t.localFile)).toEqual(["a.mp4", "b.mp4"]);
    // Asking for the same clip again from the page doesn't undo the change.
    putJobs([job({ status: "ready", localFile: undefined })]);
    expect(readJobs().jobs[0].prompt).toContain("Change from the last take: slower.");
  });
  it("make it again: the same request, a new take; approve: noted; no change without words", () => {
    putJobs([job()]);
    expect(() => reviewJob("s:7-8", "change", " ")).toThrow(/Say what should change/);
    expect(reviewJob("s:7-8", "approved").review?.status).toBe("approved");
    const j = reviewJob("s:7-8", "again");
    expect(j.status).toBe("ready");
    expect(j.prompt).toBe("THE REQUEST");
    expect(() => reviewJob("s:7-8", "again")).toThrow(/already waiting/);
  });
});
