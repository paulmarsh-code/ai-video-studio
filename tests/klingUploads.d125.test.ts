// D125: the app uploads the clips' pictures to Kling from this computer with Claude's tickets.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { POST } from "../src/app/api/kling-uploads/route";
import { putJobs, readJobs } from "../src/lib/klingJobs";

let server: http.Server, port = 0, got = "";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kup-"));
const cwd = process.cwd();
beforeAll(async () => {
  server = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { got = b; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ code: 0, data: { url: "https://cdn.example/pic1.png" } })); }); });
  await new Promise<void>((r) => server.listen(0, r));
  port = (server.address() as { port: number }).port;
  process.chdir(dir);
});
afterAll(() => { server.close(); process.chdir(cwd); });

describe("Pictures uploaded from this computer (D125)", () => {
  it("sends each picture with its ticket, keeps Kling's address, and says when a ticket ran out", async () => {
    const pic = path.join(dir, "p9.png");
    fs.writeFileSync(pic, Buffer.from([137, 80, 78, 71]));
    putJobs([{ id: "s:9-10", projectId: "p", sceneId: "s", sceneTitle: "t", clip: 1, panels: [9, 10], seconds: 6, aspect: "9:16", model: "m", resolution: "720p", sound: true, prompt: "x", elements: [], missing: [], credits: 60, status: "ready", requestedAt: "now",
      pictures: [
        { n: 1, shot: 1, panel: 9, assetId: "a9", path: pic, upload: { ticket: "T1", url: `http://127.0.0.1:${port}/files`, expireAt: Date.now() + 60000 } },
        { n: 2, shot: 2, panel: 10, assetId: "a10", path: pic, upload: { ticket: "T2", url: `http://127.0.0.1:${port}/files`, expireAt: Date.now() - 1 } },
      ] }]);
    const r = await (await POST()).json();
    expect(r).toEqual({ uploaded: 1, failed: 1, waiting: 0 });
    expect(got).toContain('name="ticket"');
    expect(got).toContain("T1");
    const [j] = readJobs().jobs;
    expect(j.pictures[0].klingUrl).toBe("https://cdn.example/pic1.png");
    expect(j.pictures[0].upload).toBeUndefined();
    expect(j.pictures[1].uploadError).toMatch(/ran out/);
  });
});
