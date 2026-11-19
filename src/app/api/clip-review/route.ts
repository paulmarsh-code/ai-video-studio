// The app's review of a made clip (D144). The clips page sends frames it took from the clip as it
// plays; here the clip's sound is transcribed, and the frames are looked at against the clip's
// own pictures and request. The review is kept on the clip's job and shown on its card.

import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { readJobs, writeJobs } from "@/lib/klingJobs";
import { getCheckProvider, transcribe } from "@/lib/providers/images";
import { clipReviewPrompt, clipShots, parseClipReview, speechChecks } from "@/lib/domain/clipReview";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const id = String(form.get("id") ?? "");
    const times = JSON.parse(String(form.get("times") ?? "[]")) as number[];
    const frames = form.getAll("frame").filter((f): f is File => f instanceof File);
    const job = readJobs().jobs.find((j) => j.id === id);
    if (!job?.localFile) throw new Error("That clip isn't saved on this computer yet.");
    const provider = getCheckProvider();
    if (!provider) throw new Error("GPT isn't connected, so the app can't review the clip. Watch it and say what to change.");
    const file = path.join(process.cwd(), "data", "clips", path.basename(job.localFile));
    const shots = clipShots(job.prompt);
    const transcript = fs.existsSync(file) ? await transcribe(fs.readFileSync(file), path.basename(file)).catch(() => null) : null;
    const speech = speechChecks(shots, transcript);
    // The clip's pictures first, as Kling had them, then the frames.
    const follows = /图片1 is the last moment of the clip before this one/.test(job.prompt);
    const pics = job.pictures.filter((p) => p.path && fs.existsSync(p.path));
    const pictures = pics.map((p, k) => ({ n: k + 1, what: p.wall ? `the venue towards ${p.wall}: the room only, for what is behind the people from that side` : follows && p.n === 1 ? "the last moment of the clip before this one: shot 1 follows straight on from it, with its camera and background" : `the storyboard picture for shot ${p.shot}` }));
    const images = [
      ...pics.map((p) => ({ data: fs.readFileSync(p.path), mime: /\.jpe?g$/i.test(p.path) ? "image/jpeg" : "image/png" })),
      ...(await Promise.all(frames.map(async (f) => ({ data: Buffer.from(await f.arrayBuffer()), mime: f.type || "image/jpeg" })))),
    ];
    const prompt = clipReviewPrompt({ shots, pictures, frames: times, speech, previousChange: job.change });
    const r = parseClipReview(await provider.describe(prompt, images));
    if (!r) throw new Error("GPT's review couldn't be read. Try again.");
    // Saved on a fresh read of the jobs file, so nothing written meanwhile is lost.
    const f = readJobs();
    const j = f.jobs.find((x) => x.id === id);
    if (j) { j.aiReview = { at: new Date().toISOString(), ...r, speech, take: job.localFile }; writeJobs(f); }
    return NextResponse.json({ ok: true, review: j?.aiReview });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
