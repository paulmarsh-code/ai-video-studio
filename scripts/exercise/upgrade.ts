// Bring a saved scene up to the current layout rules, as "update the layout" does, on a copy
// of a database, and write image 1 for each panel (D82).
//   npx tsx scripts/exercise/upgrade.ts <db copy> "<scene title>" <out dir>
import fs from "node:fs";
import { openDb } from "../../src/db/client";
import * as repo from "../../src/lib/repo";
import * as studio from "../../src/lib/studioRepo";
import { designScene, applyDesign } from "../../src/lib/domain/director";
import { planForShot, readCamera } from "../../src/lib/domain/geometry";
import { renderBlockingForShot } from "../../src/lib/blockingImage";
(async () => {
  const [dbFile, title, outDir] = process.argv.slice(2);
  const db = await openDb(dbFile);
  const scenes = (await import("../../src/db/schema")).scenes;
  const sc = db.select().from(scenes).all().find((x) => x.title === title);
  if (!sc) throw new Error("No scene of that name.");
  studio.unlockScene(db, sc.id, "positions"); studio.syncRoom(db, sc.id); studio.syncAreas(db, sc.id); studio.approvePositions(db, sc.id);
  let s = repo.getScene(db, sc.id)!;
  const cast = repo.getCast(db, sc.projectId); const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const inputs = s.shots.map((sh) => ({ id: sh.id, code: sh.code, spec: sh.spec, description: s.panels.find((p) => p.id === sh.panelId)?.description }));
  const base = { ...s.plan!.data, aspect: s.plan!.data.aspect ?? ("9:16" as const) };
  const design = designScene(base, inputs, name, "neutral");
  const choices = design.shots.filter((d) => d.options.length).map((d) => ({ shotId: d.shotId, shotCode: d.shotCode, option: d.options[0] }));
  const { plan, assign } = applyDesign(base, choices, design.lineOfAction);
  repo.savePlan(db, sc.id, plan, "Cameras chosen by the app");
  for (const ch of choices) { const shot = repo.getShot(db, ch.shotId)!; repo.saveShotSpec(db, ch.shotId, { ...shot.spec, cameraId: assign[ch.shotId] }); }
  s = repo.getScene(db, sc.id)!;
  for (const [k, p] of s.panels.entries()) {
    const sh = s.shots.find((x) => x.panelId === p.id)!; const sp = planForShot(s.plan!.data, sh.spec); const cam = sp.cameras.find((c) => c.id === sh.spec.cameraId)!;
    console.log(`P${k + 1}`, sp.actors.map((a) => `${a.characterId}@(${a.position.x.toFixed(1)},${a.position.y.toFixed(1)})${a.doing ? " " + a.doing.action : ""}`).join(" | "), "|", Object.entries(sh.spec.blocking ?? {}).map(([i, b]) => `${i}:${(b as { why?: string }).why ?? b.by}`).join(", "), "| cam", cam.name, "h", cam.heightM, "tilt", cam.tiltDeg, "bg", readCamera(sp, cam).backgroundView);
    const png = await renderBlockingForShot(db, sh.id); if (png) fs.writeFileSync(`${outDir}/up_p${k + 1}.png`, png);
  }
})();
