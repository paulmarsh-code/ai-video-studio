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
  pictures: KlingJobPicture[];
  missing: string[];
  credits: number;
  status: KlingJobStatus;
  requestedAt: string;
  generationId?: string;
  videoUrl?: string;
  /** The finished clip saved on this computer, in data/clips/ (D126): Kling's link lasts 24 hours. */
  localFile?: string;
  error?: string;
  updatedAt?: string;
  /** Earlier takes of this clip, newest last (D139): kept to compare and to go back to. */
  takes?: { localFile?: string; videoUrl?: string; generationId?: string; madeAt?: string; change?: string }[];
  /** What the user decided about the latest take (D139). */
  review?: { status: "approved" | "change" | "again"; words?: string; at: string };
  /** The change asked for in this take, in the user's words; already in the prompt. */
  change?: string;
  /** The request before any change was added, so a second change replaces the first. */
  basePrompt?: string;
  /** The app's own review of the latest take (D144): heard and looked at, with a change to make. */
  aiReview?: { at: string; verdict: "approve" | "change"; summary: string; good: string[]; problems: { shot?: number; what: string }[]; change: string; speech: { shot: number; heard: string; ok: boolean; notes: string[] }[]; take?: string };
}

export interface KlingJobPicture {
  n: number; shot: number; panel: number; assetId: string;
  /** The file on this computer. */
  path: string;
  /** Where Kling keeps it once uploaded. */
  klingUrl?: string;
  /**
   * A one-time upload ticket Claude got from Kling (D125). Claude's workspace can't reach kling.ai,
   * this computer can: the app uploads the file with it while the clips page is open.
   */
  upload?: { ticket: string; url: string; expireAt: number };
  uploadError?: string;
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

/** Write the file as it now is (the app's own uploads, D125). */
export function writeJobs(f: KlingJobsFile) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify({ ...f, updatedAt: new Date().toISOString() }, null, 1));
}

/**
 * Add or replace these clips' jobs. A clip already made with the same request keeps its result
 * (asking again doesn't pay twice); a changed one is ready to send again.
 */
export function putJobs(next: KlingJob[]): KlingJobsFile {
  const cur = readJobs();
  const jobs = cur.jobs.filter((j) => !next.some((n) => n.id === j.id));
  for (const n of next) {
    const old = cur.jobs.find((j) => j.id === n.id);
    // A clip asked for again keeps its earlier takes (D139); a changed take keeps its change.
    const same = old && (sameRequest(old, n) || (old.basePrompt !== undefined && old.basePrompt === n.prompt && old.seconds === n.seconds));
    // A made take replaced by a changed request (the line rewritten on the storyboard) is kept as
    // an earlier take, not dropped (D139).
    const made = old && !same && (old.localFile || old.videoUrl) ? [{ localFile: old.localFile, videoUrl: old.videoUrl, generationId: old.generationId, madeAt: old.updatedAt, change: old.change }] : [];
    const takes = [...(old?.takes ?? []), ...made];
    const history = old ? { ...(takes.length ? { takes } : {}), ...(old.review && same ? { review: old.review } : {}) } : {};
    jobs.push(old && same && old.status !== "failed" ? { ...n, ...history, prompt: old.prompt, change: old.change, basePrompt: old.basePrompt, status: old.status, generationId: old.generationId, videoUrl: old.videoUrl, localFile: old.localFile, requestedAt: old.requestedAt, pictures: n.pictures.map((p) => ({ ...p, klingUrl: old.pictures.find((q) => q.assetId === p.assetId)?.klingUrl })) } : { ...n, ...history });
  }
  const out = { updatedAt: new Date().toISOString(), jobs: jobs.sort((a, b) => a.sceneId.localeCompare(b.sceneId) || a.clip - b.clip) };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(out, null, 1));
  return out;
}

export const jobId = (sceneId: string, panels: number[]) => `${sceneId}:${panels.join("-")}`;

/**
 * Review a made clip, as a storyboard frame is reviewed (D139). Approved: noted (the page keeps
 * it as a kept take). A change in words or another take: the take so far goes into `takes`, and
 * the clip is ready to make again, with the change added to its request.
 */
export function reviewJob(id: string, decision: "approved" | "change" | "again", words?: string): KlingJob {
  const f = readJobs();
  const j = f.jobs.find((x) => x.id === id);
  if (!j) throw new Error("That clip wasn't found. Create it first.");
  const at = new Date().toISOString();
  const said = words?.replace(/\s+/g, " ").trim();
  if (decision === "change" && !said) throw new Error("Say what should change.");
  if (decision === "approved") {
    j.review = { status: "approved", at };
  } else {
    if (j.status === "ready" || j.status === "sent") throw new Error("This clip is already waiting to be made.");
    if (j.localFile || j.videoUrl) j.takes = [...(j.takes ?? []), { localFile: j.localFile, videoUrl: j.videoUrl, generationId: j.generationId, madeAt: j.updatedAt, change: j.change }];
    const base = j.basePrompt ?? j.prompt;
    j.basePrompt = base;
    j.change = decision === "change" ? said : undefined;
    j.prompt = decision === "change" ? `${base}\nThis is a new take of this clip. Change from the last take: ${said}.` : base;
    j.review = { status: decision, ...(said ? { words: said } : {}), at };
    j.status = "ready";
    j.requestedAt = at;
    delete j.generationId; delete j.videoUrl; delete j.localFile; delete j.error; delete j.aiReview;
  }
  writeJobs(f);
  return j;
}
