// Clips handed to Claude to make in Kling (D123). The app has no Kling key: "Create clips" writes
// each clip's request, Elements and storyboard pictures to data/kling_jobs.json; Claude reads it
// through Kling's own connection, uploads the pictures, makes the clip and writes back how it went.

import fs from "node:fs";
import path from "node:path";

export type KlingJobStatus = "ready" | "sent" | "done" | "failed";

export interface KlingJob {
  /** The scene and its panels, so a clip keeps its id while it stays the same panels. */
  id: string;
  projectId: string;
  sceneId: string;
  sceneTitle: string;
  clip: number;
  panels: number[];
  seconds: number;
  aspect: "9:16" | "16:9";
  model: string;
  resolution: string;
  sound: boolean;
  /** The request with Elements as <<<id>>> and pictures as 图片N. */
  prompt: string;
  elements: { id: string; name: string }[];
  /** In order: picture N is 图片N. `path` is the file on this computer. */
  pictures: { n: number; shot: number; panel: number; assetId: string; path: string; klingUrl?: string }[];
  missing: string[];
  credits: number;
  status: KlingJobStatus;
  requestedAt: string;
  generationId?: string;
  videoUrl?: string;
  error?: string;
  updatedAt?: string;
}

export interface KlingJobsFile { updatedAt?: string; jobs: KlingJob[] }

const file = () => path.join(process.cwd(), "data", "kling_jobs.json");

export function readJobs(): KlingJobsFile {
  try {
    if (!fs.existsSync(file())) return { jobs: [] };
    const j = JSON.parse(fs.readFileSync(file(), "utf8")) as KlingJobsFile;
    return { ...j, jobs: Array.isArray(j.jobs) ? j.jobs : [] };
  } catch {
    return { jobs: [] };
  }
}

/** What makes a clip the same clip to send again: its request and its pictures. */
const sameRequest = (a: KlingJob, b: KlingJob) => a.prompt === b.prompt && a.seconds === b.seconds && a.pictures.map((x) => x.assetId).join() === b.pictures.map((x) => x.assetId).join();

/**
 * Add or replace these clips' jobs. A clip already made with the same request keeps its result
 * (asking again doesn't pay twice); a changed one is ready to send again.
 */
export function putJobs(next: KlingJob[]): KlingJobsFile {
  const cur = readJobs();
  const jobs = cur.jobs.filter((j) => !next.some((n) => n.id === j.id));
  for (const n of next) {
    const old = cur.jobs.find((j) => j.id === n.id);
    jobs.push(old && sameRequest(old, n) && old.status !== "failed" ? { ...n, status: old.status, generationId: old.generationId, videoUrl: old.videoUrl, requestedAt: old.requestedAt, pictures: n.pictures.map((p) => ({ ...p, klingUrl: old.pictures.find((q) => q.assetId === p.assetId)?.klingUrl })) } : n);
  }
  const out = { updatedAt: new Date().toISOString(), jobs: jobs.sort((a, b) => a.sceneId.localeCompare(b.sceneId) || a.clip - b.clip) };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(out, null, 1));
  return out;
}

export const jobId = (sceneId: string, panels: number[]) => `${sceneId}:${panels.join("-")}`;
