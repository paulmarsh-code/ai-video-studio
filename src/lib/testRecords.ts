// Test mode and test records (B4). For comparing request versions and image models on equal
// terms: with STORYBOARD_TEST=1 the automatic correction is off, so the first picture is the one
// scored, and every picture drawn or checked leaves a record in data/tests: the exact request,
// image 1, the reference pictures in order, the model and settings, the picture and the check.
// STORYBOARD_REQUEST=short switches to the short request (B3); the full one is the default.

import fs from "node:fs";
import path from "node:path";
import type { PictureCheck } from "./domain/pictureCheck";

export const testMode = () => /^(1|true|yes|on)$/i.test(process.env.STORYBOARD_TEST ?? "");
export const requestVariant = (): "full" | "short" => (/^short$/i.test(process.env.STORYBOARD_REQUEST ?? "") ? "short" : "full");

const root = () => path.join(process.cwd(), "data", "tests");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "_");
const tag = (assetId: string) => assetId.replace(/-/g, "").slice(0, 8);

export interface DrawRecord {
  panelCode: string;
  kind: "draw" | "correction" | "redraw";
  variant: string;
  prompt: string;
  conflicts?: string[];
  /** In the order sent: image 1 first (when there is one), then the references. */
  inputs: { name: string; data: Buffer; mime: string; assetId?: string; assetCode?: string }[];
  model: string;
  quality: string;
  size: string;
  endpoint: string;
  output: { assetId: string; data: Buffer; note?: string };
}

/** Save everything a picture was drawn from (B4). Never stops a draw: a failed record is only logged. */
export function recordDraw(r: DrawRecord): void {
  try {
    const dir = path.join(root(), `${stamp()}_${r.panelCode}_${r.kind}_${tag(r.output.assetId)}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "request.txt"), r.prompt);
    r.inputs.forEach((x, k) => {
      const ext = /png/.test(x.mime) ? "png" : /webp/.test(x.mime) ? "webp" : "jpg";
      fs.writeFileSync(path.join(dir, `input_${String(k + 1).padStart(2, "0")}_${x.name.replace(/[^\w.-]+/g, "_").replace(/\.(png|jpe?g|webp)$/i, "")}.${ext}`), x.data);
    });
    fs.writeFileSync(path.join(dir, "result.png"), r.output.data);
    fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({
      panel: r.panelCode, kind: r.kind, requestVersion: r.variant, model: r.model, quality: r.quality, size: r.size, endpoint: r.endpoint,
      // The images API takes no seed, so repeat draws can't be made identical; each is its own sample.
      seed: "not available in the OpenAI images API",
      requestCharacters: r.prompt.length, conflictsFound: r.conflicts ?? [],
      inputs: r.inputs.map((x, k) => ({ order: k + 1, name: x.name, assetId: x.assetId, assetCode: x.assetCode, bytes: x.data.length })),
      result: { assetId: r.output.assetId, note: r.output.note },
      at: new Date().toISOString(),
    }, null, 2));
  } catch (e) {
    console.error(`[test record] ${e instanceof Error ? e.message : String(e)}`);
  }
}

const csvCell = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

/**
 * Save a check with its picture's record (B4), or in a record of its own for a picture checked
 * again, and add a line to data/tests/results.csv for comparing runs.
 */
export function recordCheck(r: { panelCode: string; assetId: string; picture?: Buffer; overlay?: Buffer; check: PictureCheck; expected?: unknown }): void {
  try {
    fs.mkdirSync(root(), { recursive: true });
    const t = tag(r.assetId);
    let dir = fs.readdirSync(root()).filter((d) => d.endsWith(`_${t}`)).sort().pop();
    let kind = dir ? dir.split("_").slice(-2, -1)[0] : "recheck";
    if (!dir) {
      dir = `${stamp()}_${r.panelCode}_recheck_${t}`;
      fs.mkdirSync(path.join(root(), dir), { recursive: true });
      if (r.picture) fs.writeFileSync(path.join(root(), dir, "result.png"), r.picture);
      kind = "recheck";
    }
    const n = fs.readdirSync(path.join(root(), dir)).filter((f) => /^check(_\d+)?\.json$/.test(f)).length;
    fs.writeFileSync(path.join(root(), dir, n ? `check_${n + 1}.json` : "check.json"), JSON.stringify({ ...r.check, expected: r.expected, at: new Date().toISOString() }, null, 2));
    // What the check model was shown (D51): the picture with the plan's boxes and eye level drawn on.
    if (r.overlay) fs.writeFileSync(path.join(root(), dir, n ? `check_${n + 1}_plan_overlay.png` : "check_plan_overlay.png"), r.overlay);
    let settings: Record<string, unknown> = {};
    try { settings = JSON.parse(fs.readFileSync(path.join(root(), dir, "settings.json"), "utf8")); } catch { /* a re-checked picture has none */ }
    const a = r.check.areas;
    const ratios = (r.check.measured ?? []).map((m) => `${m.name.split(" ")[0]} ${m.fit ?? ""}${m.heightRatio !== undefined ? ` x${m.heightRatio}` : ""}`.trim()).join("; ");
    const csv = path.join(root(), "results.csv");
    // An older file with other columns is kept aside, not mixed with this one.
    if (fs.existsSync(csv) && !fs.readFileSync(csv, "utf8").startsWith("time,panel,picture,kind,request,model,request_chars,pass,blocking,characters_look,room_and_props,redraw,size_vs_plan,eye_level,")) fs.renameSync(csv, path.join(root(), `results_before_${stamp()}.csv`));
    if (!fs.existsSync(csv)) fs.writeFileSync(csv, "time,panel,picture,kind,request,model,request_chars,pass,blocking,characters_look,room_and_props,redraw,size_vs_plan,eye_level,not_measured,problems,folder\n");
    fs.appendFileSync(csv, [
      new Date().toISOString(), r.panelCode, t, kind, settings.requestVersion ?? "", settings.model ?? "", settings.requestCharacters ?? "",
      r.check.pass ? "pass" : "fail", a ? (a.blocking.pass ? "pass" : "fail") : "", a ? (a.look.pass ? "pass" : "fail") : "", a ? (a.room.pass ? "pass" : "fail") : "",
      r.check.redraw ? "yes" : "", ratios, r.check.eyeLevel ?? "",
      a ? [...a.blocking.unmeasured, ...a.look.unmeasured, ...a.room.unmeasured].join("; ") : "", r.check.problems.join(" "), dir,
    ].map(csvCell).join(",") + "\n");
  } catch (e) {
    console.error(`[test record] ${e instanceof Error ? e.message : String(e)}`);
  }
}
