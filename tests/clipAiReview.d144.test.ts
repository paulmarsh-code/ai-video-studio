// D144: the app reviews a made clip: hears the line, checks each shot, suggests one change.
import { describe, expect, it } from "vitest";
import { clipReviewPrompt, clipShots, parseClipReview, speechChecks } from "../src/lib/domain/clipReview";

const prompt = [
  "Intro.",
  "Shot 1 (0–6 s), cowboy shot, following straight on from 图片1: Bo calls her out (firm). Bo: calm, firm. Bo says, firm, naturally, never flat, accurate lip-sync: \"You owe me the money\"",
  "Shot 2 (6–9 s), medium long shot, as in 图片2: Bo holds out the letter. No one speaks.",
].join("\n");
const W = (s: string, from: number, step = 0.4) => s.split(" ").map((w, k) => ({ word: w, start: from + k * step, end: from + k * step + 0.3 }));

describe("The app's review of a made clip (D144)", () => {
  it("reads the shots, their times and lines from the request", () => {
    const s = clipShots(prompt);
    expect(s.map((x) => [x.n, x.from, x.to, x.speaker, x.line])).toEqual([[1, 0, 6, "Bo", "You owe me the money"], [2, 6, 9, undefined, undefined]]);
  });
  it("hears missing words, pauses, a line past the cut and speech in a silent shot", () => {
    const shots = clipShots(prompt);
    const good = speechChecks(shots, { text: "", words: W("You owe me the money", 1) });
    expect(good.every((f) => f.ok)).toBe(true);
    const words = [...W("You owe", 1), ...W("me the", 2.5), ...W("cash now right", 5.6)];
    const bad = speechChecks(shots, { text: "", words });
    expect(bad[0].notes.join(" | ")).toMatch(/words not heard: money/);
    expect(bad[0].notes.join(" | ")).toMatch(/a pause of 0\.8 s at 1\.7 s/);
    expect(bad[0].notes.join(" | ")).toMatch(/runs past the cut at 6 s/);
    expect(bad[1].notes[0]).toMatch(/someone speaks in a silent shot/);
    expect(speechChecks(shots, null)).toEqual([]);
  });
  it("asks for a verdict, problems by shot and one change; reads the reply", () => {
    const p = clipReviewPrompt({ shots: clipShots(prompt), pictures: [{ n: 1, what: "the last moment of the clip before" }], frames: [0.2, 1.2], speech: [], previousChange: "no smile" });
    expect(p).toContain("Image 1: the last moment of the clip before");
    expect(p).toContain("images 2 to 3, at these times in seconds: 0.2, 1.2");
    expect(p).toContain("This take was asked to change: no smile");
    const r = parseClipReview('ok {"verdict":"change","summary":"Close.","good":["camera right"],"problems":[{"shot":1,"what":"she smiles"}],"change":"No smile in shot 1."}');
    expect(r).toEqual({ verdict: "change", summary: "Close.", good: ["camera right"], problems: [{ shot: 1, what: "she smiles" }], change: "No smile in shot 1." });
    expect(parseClipReview("nothing")).toBeNull();
  });
});

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { putJobs, readJobs } from "../src/lib/klingJobs";

describe("The review route, against a stand-in OpenAI (D144)", () => {
  it("hears the clip, looks at the pictures and frames, and keeps the review on the job", async () => {
    const seen: string[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen.push(req.url ?? "");
        res.setHeader("Content-Type", "application/json");
        if (req.url?.endsWith("/audio/transcriptions")) res.end(JSON.stringify({ text: "You owe me the money", words: W("You owe me the money", 1) }));
        else res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ verdict: "change", summary: "Close.", good: ["camera"], problems: [{ shot: 1, what: "she smiles" }], change: "No smile in shot 1." }) } }] }));
      });
    });
    await new Promise<void>((ok) => server.listen(0, ok));
    const cwd = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rev-"));
    process.env.OPENAI_API_KEY = "test"; process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    try {
      process.chdir(dir);
      fs.mkdirSync("data/clips", { recursive: true });
      fs.writeFileSync("data/clips/c.mp4", Buffer.from("fake"));
      const pic = path.join(dir, "p.png");
      fs.writeFileSync(pic, Buffer.from("fake"));
      putJobs([{ id: "s:1-2", projectId: "p", sceneId: "s", sceneTitle: "S", clip: 1, panels: [1, 2], seconds: 9, aspect: "9:16", model: "m", resolution: "720p", sound: true, prompt, elements: [], pictures: [{ n: 1, shot: 1, panel: 1, assetId: "a", path: pic }], missing: [], credits: 90, status: "done", requestedAt: "t", localFile: "c.mp4" }]);
      const { POST } = await import("../src/app/api/clip-review/route");
      const form = new FormData();
      form.append("id", "s:1-2"); form.append("times", "[0.2]"); form.append("frame", new File([Buffer.from("x")], "f.jpg", { type: "image/jpeg" }));
      const res = await POST(new Request("http://x/api/clip-review", { method: "POST", body: form }));
      const body = await res.json() as { ok: boolean; error?: string };
      expect(body.error).toBeUndefined();
      const r = readJobs().jobs[0].aiReview!;
      expect(r.change).toBe("No smile in shot 1.");
      expect(r.take).toBe("c.mp4");
      expect(r.speech[0].ok).toBe(true);
      expect(seen.some((u) => u.endsWith("/audio/transcriptions"))).toBe(true);
    } finally {
      process.chdir(cwd); server.close(); delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_BASE_URL;
    }
  });
});
