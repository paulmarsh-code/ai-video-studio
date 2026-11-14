// Saved-scene snapshot (D96). Records, for every panel of every scene in a database, where each
// person stands, their posture and what they're doing, and the camera, as the app works them out
// now. Run before and after a change: `npx tsx scripts/snapshot.ts <db> <out.json>` writes one;
// `npx tsx scripts/snapshot.ts <db> <new.json> <old.json>` also lists every panel that differs, so a
// fix meant for one scene can't quietly move people or cameras in another.
import fs from "node:fs";
import { openDb } from "../src/db/client";
import * as t from "../src/db/schema";
import * as repo from "../src/lib/repo";
import { planForShot } from "../src/lib/domain/geometry";

type Snap = Record<string, Record<string, { people: Record<string, string>; camera: string }>>;
const r1 = (n: number) => n.toFixed(1);

(async () => {
  const [dbFile, outFile, oldFile] = process.argv.slice(2);
  if (!dbFile || !outFile) throw new Error("Usage: snapshot.ts <db> <out.json> [old.json]");
  const db = await openDb(dbFile);
  const snap: Snap = {};
  for (const sc of db.select().from(t.scenes).all()) {
    const s = repo.getScene(db, sc.id);
    if (!s?.plan) continue;
    const key = `${s.scene.title}`;
    snap[key] = {};
    for (const p of s.panels) {
      const sh = s.shots.find((x) => x.panelId === p.id);
      if (!sh) continue;
      const sp = planForShot(s.plan.data, sh.spec);
      const cam = sp.cameras.find((c) => c.id === sh.spec.cameraId);
      snap[key][p.code] = {
        people: Object.fromEntries(sp.actors.map((a) => [a.characterId, `${r1(a.position.x)},${r1(a.position.y)} ${a.pose ?? "standing"}${a.doing ? " " + a.doing.action : ""}${a.to ? ` to ${r1(a.to.x)},${r1(a.to.y)}` : ""}`])),
        camera: cam ? `${cam.name} @${r1(cam.position.x)},${r1(cam.position.y)} > ${r1(cam.lookAt.x)},${r1(cam.lookAt.y)} fov ${cam.fovDeg ?? "-"} h ${cam.heightM ?? "-"} tilt ${cam.tiltDeg ?? 0}` : "none",
      };
    }
  }
  fs.writeFileSync(outFile, JSON.stringify(snap, null, 1));
  if (!oldFile) { console.log(`Snapshot of ${Object.keys(snap).length} scenes written.`); return; }
  const old: Snap = JSON.parse(fs.readFileSync(oldFile, "utf8"));
  let diffs = 0;
  for (const [scene, panels] of Object.entries(snap)) for (const [code, now] of Object.entries(panels)) {
    const was = old[scene]?.[code];
    if (!was) continue;
    if (was.camera !== now.camera) { diffs++; console.log(`${scene} ${code} camera: ${was.camera}  ->  ${now.camera}`); }
    for (const [who, pos] of Object.entries(now.people)) if (was.people[who] !== pos) { diffs++; console.log(`${scene} ${code} ${who}: ${was.people[who]}  ->  ${pos}`); }
  }
  console.log(diffs ? `${diffs} difference(s).` : "No differences: every saved scene comes out the same.");
})();
