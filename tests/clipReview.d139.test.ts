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

import { handlingSeconds, shotSeconds, type ClipPanel } from "../src/lib/domain/clips";
describe("Time for things handled in a shot (D140)", () => {
  const P = (description: string, text: string | undefined, durationSec: number) => ({ order: 1, durationSec, description, emotion: "", dialogue: text ? [{ characterId: "a", text }] : [], spec: {} as never }) as ClipPanel;
  it("taking, glancing and dropping add to the line; a hand-over gets its time; never past the panel", () => {
    expect(handlingSeconds("Chase takes the contract, glances at it, drops it into the ice bucket and delivers a retort.")).toBe(2.25);
    expect(shotSeconds(P("Chase takes the contract, glances at it, drops it into the ice bucket.", "You're wrong, it's 90 days, love.", 4))).toBe(4);
    expect(shotSeconds(P("Jade pulls the contract out of her handbag and holds it out to Chase.", undefined, 3))).toBe(3);
    expect(shotSeconds(P("They talk.", "Well?", 4))).toBe(2);
    expect(shotSeconds(P("Jade waits.", undefined, 3))).toBe(2);
  });
});

describe("A take replaced by a changed request is kept (D139)", () => {
  it("moves the made take into the earlier takes", () => {
    putJobs([job()]);
    putJobs([job({ prompt: "THE NEW LINE", status: "ready", localFile: undefined, generationId: undefined })]);
    const j = readJobs().jobs[0];
    expect(j.status).toBe("ready");
    expect(j.takes).toEqual([expect.objectContaining({ localFile: "a.mp4", generationId: "g1" })]);
  });
});
