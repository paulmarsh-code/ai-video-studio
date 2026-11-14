// Proof step 1 of the fixed-set redesign (D97): for one saved scene, on a copy of the database,
// the 360° around each camera position with each shot's slice marked, and each panel's view of
// the set with no people. `npx tsx scripts/set/proof.ts <db copy> <scene title> <out dir> [assets dir]`
// (assets dir: where the venue and prop pictures are, when the database names another computer's).
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { openDb } from "../../src/db/client";
import * as t from "../../src/db/schema";
import * as repo from "../../src/lib/repo";
import { updateLayout } from "../../src/lib/layoutUpdate";
import { planForShot } from "../../src/lib/domain/geometry";
import { sliceIn360 } from "../../src/lib/domain/setRender";
import { sceneSet, set360, setView } from "../../src/lib/setImage";

(async () => {
  const [dbFile, title, outDir, assets] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const db = await openDb(dbFile);
  if (assets) for (const a of db.select().from(t.assets).all()) {
    const f = path.join(assets, a.path.split(/[\\/]/).pop()!);
    if (fs.existsSync(f)) db.update(t.assets).set({ path: f }).where(eq(t.assets.id, a.id)).run();
  }
  const sc = db.select().from(t.scenes).all().find((x) => x.title === title);
  if (!sc) throw new Error(`No scene called ${title}`);
  await updateLayout(db, sc.id); // the scene's fixed cameras (D95), on this copy only
  const s = repo.getScene(db, sc.id)!;
  const plan = s.plan!.data;
  const built = await sceneSet(db, sc.id, plan);
  if (!built) throw new Error("No set: the venue has no view pictures here.");
  const { set } = built;
  console.log("walls:", set.walls.map((w) => `${w.side}=${w.name ?? "-"}`).join(" "), "| wall height", set.wallM.toFixed(1), "m | set pieces:", set.pieces.map((p) => `${p.name} ${p.widthM.toFixed(1)}x${p.heightM.toFixed(1)}m${p.texture ? "" : " (no picture)"}${p.facing ? " flat" : ""}`).join(", "));
  // Panels by camera position.
  const groups = new Map<string, { at: { x: number; y: number }; h: number; shots: { code: string; cam: ReturnType<typeof planForShot>["cameras"][number]; sp: ReturnType<typeof planForShot> }[] }>();
  for (const p of s.panels) {
    const sh = s.shots.find((x) => x.panelId === p.id)!;
    const sp = planForShot(plan, sh.spec);
    const cam = sp.cameras.find((c) => c.id === sh.spec.cameraId);
    if (!cam) continue;
    const key = `${cam.position.x.toFixed(1)},${cam.position.y.toFixed(1)},${(cam.heightM ?? 1.6).toFixed(1)}`;
    if (!groups.has(key)) groups.set(key, { at: cam.position, h: cam.heightM ?? 1.6, shots: [] });
    groups.get(key)!.shots.push({ code: p.code.replace(/^.*_/, ""), cam, sp });
  }
  let g = 0;
  const W = 2400, H = 700;
  for (const grp of groups.values()) {
    g++;
    const pano = await set360(set, plan, grp.at, grp.h, W, H);
    // Each shot's slice as a coloured frame on the 360°.
    const colours = ["#ff3b30", "#34c759", "#0a84ff", "#ffcc00", "#bf5af2", "#ff9f0a"];
    const boxes = grp.shots.map((x, k) => {
      const { left, right } = sliceIn360(plan, x.cam);
      const c = colours[k % colours.length];
      const span = (r: number, l: number) => (r >= l ? [[l, r]] : [[l, 1], [0, r]]);
      return span(right, left).map(([a, b]) => `<rect x="${a * W}" y="${40 + k * 6}" width="${(b - a) * W}" height="${H - 80 - k * 12}" fill="none" stroke="${c}" stroke-width="5"/><text x="${a * W + 10}" y="${80 + k * 34}" font-size="30" font-family="sans-serif" font-weight="bold" fill="${c}" stroke="black" stroke-width="1">${x.code} ${x.cam.name.replace(/ \(P\d+\)$/, "")}</text>`).join("");
    }).join("");
    const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${boxes}<text x="12" y="${H - 16}" font-size="26" font-family="sans-serif" fill="white" stroke="black" stroke-width="1">Camera position ${g} at (${grp.at.x.toFixed(1)}, ${grp.at.y.toFixed(1)}), lens ${grp.h.toFixed(1)} m up — the full 360°, left to right turning clockwise</text></svg>`);
    fs.writeFileSync(path.join(outDir, `position${g}_360.png`), await sharp(pano).composite([{ input: overlay }]).png().toBuffer());
    for (const x of grp.shots) fs.writeFileSync(path.join(outDir, `position${g}_${x.code}.png`), await setView(set, x.sp, x.cam, 512, 768, 2));
    console.log(`position ${g} (${grp.at.x.toFixed(1)}, ${grp.at.y.toFixed(1)}):`, grp.shots.map((x) => `${x.code} ${x.cam.name}`).join(" | "));
  }
})();
