// The exercise (D81): run the five generality test scenes through the app as a user would,
// without drawing any pictures, and write what GPT would be given for each panel: image 1
// (as the grey-box room, version B, since there are no venue pictures), a top-down view of the
// floor plan with the camera, and the picture request. Used to find general faults before Paul
// spends on pictures, and to check any change against all five.
//
//   STORYBOARD_FRAME=box npx tsx scripts/exercise.ts <out dir> [T7 T8 ...]

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { openDb } from "../src/db/client";
import * as repo from "../src/lib/repo";
import * as studio from "../src/lib/studioRepo";
import { parseStoryReply, storyPrompt, checkStoryboard } from "../src/lib/domain/story";
import { designScene, applyDesign } from "../src/lib/domain/director";
import { horizontalFov, planForShot, readCamera } from "../src/lib/domain/geometry";
import { panelPrompt } from "../src/lib/domain/imagePrompts";
import { continuityFor } from "../src/lib/domain/continuity";
import { renderBlockingForShot } from "../src/lib/blockingImage";
import { suggestShots } from "../src/lib/domain/shotSuggest";
import type { GeometryPlanData, PlanCamera } from "../src/lib/domain/types";
import { SCENES } from "./exercise/scenes";

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** The floor plan from above: areas, props, people (with what they're doing) and this panel's camera. */
function topDown(plan: GeometryPlanData, cam: PlanCamera | undefined, size = 360): string {
  const b = plan.bounds ?? { minX: -5, maxX: 5, minY: 0, maxY: 10 };
  // Frame on the people, areas and camera rather than the whole (possibly huge) bounds.
  const pts = [...plan.actors.map((a) => a.position), ...(cam ? [cam.position] : []), ...(plan.levels ?? []).flatMap((l) => [{ x: l.x, y: l.y }, { x: l.x + l.w, y: l.y + l.d }]), ...(plan.furniture ?? []).map((f) => f.position)];
  const minX = Math.max(b.minX, Math.min(...pts.map((p) => p.x)) - 2), maxX = Math.min(b.maxX, Math.max(...pts.map((p) => p.x)) + 2);
  const minY = Math.max(b.minY, Math.min(...pts.map((p) => p.y)) - 2), maxY = Math.min(b.maxY, Math.max(...pts.map((p) => p.y)) + 2);
  const k = size / Math.max(maxX - minX, maxY - minY, 1);
  const X = (x: number) => (x - minX) * k, Y = (y: number) => size - (y - minY) * k;
  let s = `<rect width="${size}" height="${size}" fill="#fafaf9" stroke="#a8a29e"/>`;
  for (const l of plan.levels ?? []) {
    const fill = l.kind === "water" ? "#7dd3fc" : l.heightM < 0 ? "#94a3b8" : l.dropM ? "#e2e8f0" : l.heightM > 0 ? "#d6d3d1" : "#bbf7d0";
    s += l.round ? `<ellipse cx="${X(l.x + l.w / 2)}" cy="${Y(l.y + l.d / 2)}" rx="${(l.w / 2) * k}" ry="${(l.d / 2) * k}" fill="${fill}" stroke="#475569"/>` : `<rect x="${X(l.x)}" y="${Y(l.y + l.d)}" width="${l.w * k}" height="${l.d * k}" fill="${fill}" stroke="#475569"/>`;
    s += `<text x="${X(l.x + l.w / 2)}" y="${Y(l.y + l.d / 2)}" font-size="11" text-anchor="middle" font-family="sans-serif">${esc(l.name)}</text>`;
  }
  for (const f of plan.furniture ?? []) if (!f.heldBy) s += `<circle cx="${X(f.position.x)}" cy="${Y(f.position.y)}" r="${Math.max(2, f.radiusM * k)}" fill="#fff" stroke="#57534e"/><text x="${X(f.position.x)}" y="${Y(f.position.y) - 6}" font-size="10" text-anchor="middle" font-family="sans-serif">${esc(f.name)}</text>`;
  if (cam) {
    const half = (horizontalFov(plan, cam) * Math.PI) / 360;
    const a = Math.atan2(cam.lookAt.y - cam.position.y, cam.lookAt.x - cam.position.x);
    const L = 30 / k;
    const p1 = { x: cam.position.x + Math.cos(a + half) * L, y: cam.position.y + Math.sin(a + half) * L }, p2 = { x: cam.position.x + Math.cos(a - half) * L, y: cam.position.y + Math.sin(a - half) * L };
    s += `<polygon points="${X(cam.position.x)},${Y(cam.position.y)} ${X(p1.x)},${Y(p1.y)} ${X(p2.x)},${Y(p2.y)}" fill="#fde68a" fill-opacity="0.45" stroke="#d97706"/><circle cx="${X(cam.position.x)}" cy="${Y(cam.position.y)}" r="5" fill="#d97706"/>`;
  }
  plan.actors.forEach((a, i) => {
    const col = ["#2563eb", "#dc2626", "#16a34a", "#9333ea"][i % 4];
    s += `<circle cx="${X(a.position.x)}" cy="${Y(a.position.y)}" r="6" fill="${col}"/><text x="${X(a.position.x) + 8}" y="${Y(a.position.y) + 4}" font-size="12" font-weight="700" fill="${col}" font-family="sans-serif">${esc(a.characterId)}${a.doing ? ` (${a.doing.action})` : a.pose && a.pose !== "standing" ? ` (${a.pose})` : ""}</text>`;
    if (a.to) s += `<line x1="${X(a.position.x)}" y1="${Y(a.position.y)}" x2="${X(a.to.x)}" y2="${Y(a.to.y)}" stroke="${col}" stroke-dasharray="4 3"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${s}</svg>`;
}

function wrap(text: string, n: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) { if ((line + " " + w).trim().length > n) { out.push(line.trim()); line = w; } else line += " " + w; }
  if (line.trim()) out.push(line.trim());
  return out;
}

(async () => {
  const [outDir, ...only] = process.argv.slice(2);
  if (!outDir) throw new Error("Give an output folder.");
  for (const sc of SCENES.filter((x) => !only.length || only.includes(x.code))) {
    const dir = path.join(outDir, sc.code);
    fs.mkdirSync(dir, { recursive: true });
    const db = await openDb(":memory:");
    const pid = studio.createProject(db, { name: `${sc.code} ${sc.title}`, format: "Other", audience: "test", outline: sc.story, parts: 1, partSec: 15, aspect: "9:16", style: "photorealistic", genre: "neutral" });
    for (const c of sc.characters) {
      const { id: cid } = studio.addCharacter(db, pid, { name: c.name, pronoun: c.pronoun, role: c.role });
      studio.saveCharacterDraft(db, cid, { profile: { appearance: c.appearance, wardrobe: c.wardrobe }, voiceLock: c.voice });
      studio.approveCharacterDraft(db, cid);
    }
    const venueId = studio.addVenue(db, pid, sc.venue.name);
    studio.saveVenue(db, venueId, sc.venue);
    studio.approveVenue(db, venueId);
    const cast = repo.getCast(db, pid);
    const sceneId = studio.addScene(db, pid, { title: sc.title, venueId, castIds: cast.map((c) => c.id) });
    fs.writeFileSync(path.join(dir, "story_request.txt"), storyPrompt({ story: sc.story, characters: cast.map((c) => ({ id: c.id, name: c.name, role: sc.characters.find((x) => x.name === c.name)?.role })), venue: sc.venue.name, targetSec: 15, sceneTitle: sc.title }));
    const reply = parseStoryReply(sc.reply, cast.map((c) => ({ id: c.id, name: c.name })) as never);
    const check = checkStoryboard(reply.panels, 15);
    studio.saveStoryboard(db, sceneId, { story: sc.story, targetSec: 15, panels: reply.panels, staging: reply.staging });
    studio.approvePositions(db, sceneId);
    // The cameras, as "Let the app choose the cameras" does.
    let s = repo.getScene(db, sceneId)!;
    const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
    const raw = s.shots.map((sh) => ({ id: sh.id, code: sh.code, spec: sh.spec, description: s.panels.find((p) => p.id === sh.panelId)?.description }));
    const sug = suggestShots(raw, name);
    const inputs = raw.map((x, k) => { const spec = { ...x.spec, shot: sug[k].shot || undefined, shotBy: "app" as const }; repo.saveShotSpec(db, x.id, spec); return { ...x, spec }; });
    const base = { ...s.plan!.data, aspect: "9:16" as const };
    const design = designScene(base, inputs, name, "neutral");
    const choices = design.shots.filter((d) => d.options.length).map((d) => ({ shotId: d.shotId, shotCode: d.shotCode, option: d.options[0] }));
    const { plan, assign } = applyDesign(base, choices, design.lineOfAction);
    repo.savePlan(db, sceneId, plan, "Cameras chosen by the app");
    for (const ch of choices) { const shot = repo.getShot(db, ch.shotId)!; repo.saveShotSpec(db, ch.shotId, { ...shot.spec, cameraId: assign[ch.shotId] }); }
    s = repo.getScene(db, sceneId)!;
    const profiles = studio.getApprovedProfiles(db, pid) as never;
    const summary: string[] = [`${sc.code} ${sc.title}`, `Areas: ${JSON.stringify(s.plan!.data.levels ?? [])}`, `Props: ${(s.plan!.data.furniture ?? []).map((f) => `${f.name} r${f.radiusM} h${f.heightM ?? "?"}${f.heldBy ? ` held by ${f.heldBy}` : ""}`).join("; ")}`, `Guide rails: ${check.issues.map((x) => `P${x.panel} ${x.text}`).join("; ") || "pass"}`];
    const tiles: { input: Buffer; left: number; top: number }[] = [];
    const W = 300, H = 450, T = 300, CAP = 150;
    for (const [k, p] of s.panels.entries()) {
      const sh = s.shots.find((x) => x.panelId === p.id)!;
      const sp = planForShot(s.plan!.data, sh.spec);
      const cam = sp.cameras.find((c) => c.id === sh.spec.cameraId);
      const d = design.shots.find((x) => x.shotId === sh.id);
      const reading = cam ? readCamera(sp, cam) : undefined;
      summary.push("", `P${k + 1} (${p.durationSec}s): ${p.description}`,
        `  people: ${sp.actors.map((a) => `${a.characterId}@(${a.position.x.toFixed(1)},${a.position.y.toFixed(1)})${a.pose && a.pose !== "standing" ? ` ${a.pose}` : ""}${a.doing ? ` ${a.doing.action}${a.doing.with ? `(${a.doing.with})` : ""}` : ""}`).join(" | ")}`,
        `  camera: ${cam ? `${cam.name} at (${cam.position.x.toFixed(1)},${cam.position.y.toFixed(1)}) fov ${cam.fovDeg ?? "-"} h ${cam.heightM ?? "-"} tilt ${cam.tiltDeg ?? 0}, sees ${reading?.actors.filter((a) => a.inView).map((a) => a.characterId).join(",")}, behind: ${reading?.backgroundView}` : "NONE"}`,
        `  why: ${d?.options[0]?.reasons.join("; ") ?? d?.warning ?? ""}`);
      const png = cam ? await renderBlockingForShot(db, sh.id) : null;
      if (png) fs.writeFileSync(path.join(dir, `P${k + 1}_image1.png`), png);
      const prompt = panelPrompt({ description: p.description, emotion: p.emotion, shot: sh.spec, cast, profiles, plan: s.plan?.data, venueName: s.venue?.name ?? "venue", venueDescription: s.venue?.description, aspect: "9:16", genre: "neutral", style: "photorealistic", blockingHref: cam ? `/api/blocking/${sh.id}` : undefined, frame: "box", continuity: continuityFor(s.panels, s.shots, s.plan?.data, p.id) } as never);
      fs.writeFileSync(path.join(dir, `P${k + 1}_request_short.txt`), prompt.short ?? prompt.text);
      fs.writeFileSync(path.join(dir, `P${k + 1}_request_full.txt`), prompt.text);
      const x0 = k * (W + 12);
      if (png) tiles.push({ input: await sharp(png).resize(W, H).png().toBuffer(), left: x0, top: 0 });
      tiles.push({ input: await sharp(Buffer.from(topDown(sp, cam, T))).png().toBuffer(), left: x0, top: H + 6 });
      const cap = [`P${k + 1} ${p.durationSec}s · ${cam?.name ?? "no camera"}`, ...wrap(p.description, 52).slice(0, 7)];
      tiles.push({ input: await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CAP}"><rect width="100%" height="100%" fill="#fff"/>${cap.map((l, j) => `<text x="4" y="${16 + j * 17}" font-size="${j ? 12 : 13}" font-weight="${j ? 400 : 700}" font-family="sans-serif">${esc(l)}</text>`).join("")}</svg>`)).png().toBuffer(), left: x0, top: H + T + 12 });
    }
    fs.writeFileSync(path.join(dir, "summary.txt"), summary.join("\n"));
    const n = s.panels.length;
    await sharp({ create: { width: n * (W + 12), height: H + T + CAP + 12, channels: 3, background: "#e7e5e4" } }).composite(tiles).png().toFile(path.join(dir, "sheet.png"));
    console.log(`${sc.code}: ${n} panels -> ${dir}`);
  }
})();
