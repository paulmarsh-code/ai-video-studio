// Reviewing a made clip (D144), as Claude did by hand for Paul's clip 1: hear it (are the words
// right, any pauses, is a line cut off by the next shot), look at it shot by shot against its
// pictures and request, then say what's right, what's wrong, and one change to make, ready to use.

import type { Transcript } from "../providers/images";

export interface ClipShot { n: number; from: number; to: number; text: string; speaker?: string; line?: string }

/** The shots in a clip's request: "Shot 2 (6–9 s), medium long shot, …". */
export function clipShots(prompt: string): ClipShot[] {
  const out: ClipShot[] = [];
  for (const m of prompt.matchAll(/^Shot (\d+) \((\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?) s\),?\s*(.*)$/gm)) {
    const text = m[4].trim();
    const said = /(?:^|[.;:]\s*)(?:Line \d+, )?([A-Z][\w'’-]*(?: [A-Z][\w'’-]*)?) says[^"]*"([^"]+)"/.exec(text);
    out.push({ n: Number(m[1]), from: Number(m[2]), to: Number(m[3]), text, ...(said ? { speaker: said[1], line: said[2] } : {}) });
  }
  return out;
}

const norm = (w: string) => w.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']/g, "");
const tokens = (s: string) => s.split(/\s+/).map(norm).filter(Boolean);

/** Words of the line not heard, and words heard that aren't in it (longest common run). */
function wordDiff(want: string[], got: string[]): { missing: string[]; extra: string[] } {
  const L = Array.from({ length: want.length + 1 }, () => new Array<number>(got.length + 1).fill(0));
  for (let i = want.length - 1; i >= 0; i--) for (let j = got.length - 1; j >= 0; j--) L[i][j] = want[i] === got[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const missing: string[] = [], extra: string[] = [];
  let i = 0, j = 0;
  while (i < want.length && j < got.length) {
    if (want[i] === got[j]) { i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) missing.push(want[i++]); else extra.push(got[j++]);
  }
  return { missing: [...missing, ...want.slice(i)], extra: [...extra, ...got.slice(j)] };
}

export interface SpeechFinding { shot: number; heard: string; ok: boolean; notes: string[] }

/**
 * What the clip says against what it should (D144): each line's words, pauses of more than half a
 * second inside it, a line still going when its shot ends, and speech in a silent shot.
 */
export function speechChecks(shots: ClipShot[], t: Transcript | null): SpeechFinding[] {
  if (!t) return [];
  return shots.map((s) => {
    const words = t.words.filter((w) => w.start >= s.from - 0.3 && w.start < s.to);
    const heard = words.map((w) => w.word).join(" ").trim();
    const notes: string[] = [];
    if (s.line) {
      const d = wordDiff(tokens(s.line), tokens(heard));
      if (!words.length) notes.push("the line isn't heard in this shot");
      else {
        if (d.missing.length) notes.push(`words not heard: ${d.missing.join(" ")}`);
        if (d.extra.length) notes.push(`words heard that aren't in the line: ${d.extra.join(" ")}`);
        const gaps = words.slice(1).map((w, k) => ({ at: words[k].end, gap: w.start - words[k].end })).filter((g) => g.gap > 0.5);
        for (const g of gaps) notes.push(`a pause of ${g.gap.toFixed(1)} s at ${g.at.toFixed(1)} s`);
        const last = words[words.length - 1];
        const next = t.words.find((w) => w.start >= last.end - 0.01 && w !== last);
        if (last.end > s.to + 0.15 || (next && next.start >= s.to && next.start - last.end < 0.5)) notes.push(`the line runs past the cut at ${s.to} s`);
      }
    } else if (words.length >= 2) notes.push(`someone speaks in a silent shot: "${heard}"`);
    return { shot: s.n, heard, ok: !notes.length, notes };
  });
}

/** The request to the vision model: the clip's pictures, then frames from the clip with their times. */
export function clipReviewPrompt(o: { shots: ClipShot[]; pictures: { n: number; what: string }[]; frames: number[]; speech: SpeechFinding[]; previousChange?: string }): string {
  const shotList = o.shots.map((s) => `Shot ${s.n} (${s.from}–${s.to} s): ${s.text}`).join("\n");
  const pics = o.pictures.map((p) => `Image ${p.n}: ${p.what}`).join("\n");
  const first = o.pictures.length + 1;
  const speech = o.speech.length ? o.speech.map((f) => `Shot ${f.shot}: heard "${f.heard}"${f.notes.length ? ` (${f.notes.join("; ")})` : ""}`).join("\n") : "Not heard: no transcript.";
  return [
    "You are a film director's assistant reviewing one AI-generated video clip before the director approves it.",
    "",
    "What the clip was asked to show, shot by shot:",
    shotList,
    "",
    "The reference pictures attached first:",
    pics,
    `Then frames from the clip, images ${first} to ${first + o.frames.length - 1}, at these times in seconds: ${o.frames.map((x) => x.toFixed(1)).join(", ")}.`,
    "",
    "What the clip says, from its sound:",
    speech,
    o.previousChange ? `\nThis take was asked to change: ${o.previousChange}. Say whether it did.` : "",
    "",
    "Check, shot by shot, only what you can see or what the sound check says:",
    "- the right people, one of each, in their places, and nobody extra at their table;",
    "- the camera and framing against its picture; a shot meant to follow on from the clip before keeps that picture's camera and background;",
    "- faces and feelings: a smile where none is wanted, too angry or too soft for what's asked;",
    "- the action asked for: who holds, hands over, drops or takes what, and when;",
    "- props that must stay, such as something on a table, and anything that appears or vanishes;",
    "- the words, pauses and cut-offs from the sound check.",
    "",
    "Reply with JSON only:",
    '{"verdict": "approve" or "change", "summary": "<one or two sentences>", "good": ["<what is right>", ...], "problems": [{"shot": <number>, "what": "<the problem>"}], "change": "<one instruction for the next take that fixes the problems, written as an order to the video model, keeping what is right; empty if approve>"}',
    "Be specific and brief. Don't invent problems you can't see.",
  ].filter((x, i, a) => x !== "" || a[i - 1] !== "").join("\n");
}

export interface ClipReviewResult {
  verdict: "approve" | "change";
  summary: string;
  good: string[];
  problems: { shot?: number; what: string }[];
  change: string;
}

export function parseClipReview(text: string): ClipReviewResult | null {
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Partial<ClipReviewResult>;
    const str = (x: unknown) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "");
    return {
      verdict: j.verdict === "approve" ? "approve" : "change",
      summary: str(j.summary),
      good: Array.isArray(j.good) ? j.good.map(str).filter(Boolean) : [],
      problems: Array.isArray(j.problems) ? j.problems.map((p) => ({ ...(typeof p?.shot === "number" ? { shot: p.shot } : {}), what: str(p?.what) })).filter((p) => p.what) : [],
      change: str(j.change),
    };
  } catch {
    return null;
  }
}
