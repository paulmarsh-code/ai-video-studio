// D98: the set's own pictures. A wall, the floor and each set piece are made once with GPT, checked
// and used; the set then uses them in place of the venue views and prop pictures.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/client";
import * as t from "../src/db/schema";
import { seedDemo } from "../src/db/seed";
import * as repo from "../src/lib/repo";
import * as studio from "../src/lib/studioRepo";
import { despill, floorPrompt, keyColourFor, piecePrompt, setPicturesOf, sizeFor, trimClear, wallPrompt } from "../src/lib/domain/setPictures";
import { makeSetPicture } from "../src/lib/setPictures";
import { sceneSet } from "../src/lib/setImage";
import { isSetPiece } from "../src/lib/domain/setRender";
import type { ImageProvider } from "../src/lib/providers/images";

const solid = (w: number, h: number, rgb: [number, number, number]) => sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();

describe("The set's own pictures (D98): requests", () => {
  it("a wall straight on, nothing in front, nothing added", () => {
    const p = wallPrompt({ venueName: "Ember Room", viewName: "bar wall", outdoors: false });
    expect(p).toContain("straight on with no perspective");
    expect(p).toContain("Leave out all people and everything standing in front of it");
    expect(p).toContain("where it meets the ceiling");
    expect(wallPrompt({ venueName: "Riverside skate park", viewName: "arches", outdoors: true })).toContain("skyline");
    expect(p).not.toMatch(/["“”]{2}/);
  });
  it("the floor from above, even enough to repeat; a piece on a colour it doesn't have", () => {
    expect(floorPrompt({ venueName: "Ember Room", outdoors: false })).toContain("seen from straight above");
    expect(keyColourFor([200, 180, 160]).name).toBe("bright green");
    expect(keyColourFor([40, 160, 60]).name).toBe("magenta");
    const p = piecePrompt({ name: "cocktail table", detail: "white cloth, 1.1 m high", key: keyColourFor([240, 240, 240]) });
    expect(p).toContain("alone and whole");
    expect(p).toContain("#00FF00");
    expect([sizeFor(3, 2), sizeFor(0.8, 1.1), sizeFor(1, 1)]).toEqual(["landscape", "portrait", "square"]);
  });
  it("trims a cut-out to the piece, and takes the green off its rim only", () => {
    const w = 6, h = 4, d = new Uint8Array(w * h * 4);
    for (let y = 1; y <= 2; y++) for (let x = 2; x <= 4; x++) d.set([200, 230, 100, 255], (y * w + x) * 4);
    const cut = trimClear({ data: d, width: w, height: h });
    expect([cut.width, cut.height]).toEqual([3, 2]);
    const clean = despill({ data: d, width: w, height: h }, [0, 255, 0], 1);
    expect(clean.data[(1 * w + 2) * 4 + 1]).toBe(200); // the rim's green held to its red
    expect(despill(cut, [0, 255, 0], 1).data[1]).toBe(230); // away from the rim it's left alone
    expect(setPicturesOf(null)).toEqual({ walls: {}, pieces: {} });
  });
});

describe("Which props are set pieces (D98)", () => {
  const f = (name: string, detail = "", heightM?: number) => ({ id: "x", name, detail, position: { x: 0, y: 0 }, radiusM: 0.4, ...(heightM ? { heightM } : {}) });
  it("a table with no height set takes it from its words; personal and table-top things aren't", () => {
    expect(isSetPiece(f("cocktail table"))).toBe(true);
    expect(isSetPiece(f("ledge", "a low concrete ledge, knee-high", 0.5))).toBe(true);
    expect(isSetPiece(f("skateboard", "standard deck, used by Kai", 0.75))).toBe(false);
    expect(isSetPiece(f("Elin's skis", "about 160 cm long, red", 0.75))).toBe(false);
    expect(isSetPiece(f("two cocktails", "tall glasses about 18 cm", 1.1))).toBe(false);
  });
});

describe("The set's own pictures (D98): made, used and built into the set", () => {
  it("a made wall and cut-out are used by the set; the venue stays approved", async () => {
    const db = await openDb(":memory:");
    const projectId = seedDemo(db);
    const sceneId = repo.listScenes(db, projectId)[0].id;
    const s = repo.getScene(db, sceneId)!;
    const venue = s.venue!;
    // Pictures for the venue's views and the table.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d98-"));
    const add = async (name: string, rgb: [number, number, number]) => {
      const f = path.join(dir, name);
      fs.writeFileSync(f, await solid(96, 64, rgb));
      return repo.insertAsset(db, { projectId, assetCode: name, kind: "image", path: f, mime: "image/png" });
    };
    const views = [];
    for (const v of venue.views) views.push({ ...v, imageAssetId: await add(`${v.name.replace(/\W/g, "")}.png`, [120, 90, 60]) });
    db.update(t.venues).set({ views, status: "approved" }).where(eq(t.venues.id, venue.id)).run();
    const prop = await add("table.png", [230, 230, 230]);
    const plan = s.plan!;
    const furniture = (plan.data.furniture ?? []).map((f) => ({ ...f, heightM: 1.1, imageAssetId: prop }));
    db.update(t.plans).set({ data: { ...plan.data, furniture } }).where(eq(t.plans.id, plan.id)).run();

    // A stand-in GPT: a blue wall; the table as a red block on the requested green.
    const asked: string[] = [];
    const provider: ImageProvider = {
      id: "stand-in", label: "stand-in",
      async generate(prompt) {
        asked.push(prompt);
        if (prompt.includes("#00FF00")) {
          const bg = await sharp({ create: { width: 100, height: 120, channels: 3, background: { r: 0, g: 255, b: 0 } } })
            .composite([{ input: await solid(40, 80, [200, 20, 20]), left: 30, top: 20 }]).png().toBuffer();
          return { data: bg, mime: "image/png", providerNote: "stand-in" };
        }
        return { data: await solid(150, 100, [20, 40, 220]), mime: "image/png", providerNote: "stand-in" };
      },
    };
    const view = venue.views[0].name;
    const wall = await makeSetPicture(db, sceneId, { kind: "wall", view }, provider);
    const piece = await makeSetPicture(db, sceneId, { kind: "piece", furnitureId: furniture[0].id }, provider);
    expect(piece.note).toBeUndefined();
    // Made but not used yet: the set is unchanged until it's chosen.
    expect(setPicturesOf(studio.getVenue(db, venue.id)!.setPictures)).toEqual({ walls: {}, pieces: {} });
    studio.setVenueSetPicture(db, venue.id, { kind: "wall", view }, wall.assetId);
    studio.setVenueSetPicture(db, venue.id, { kind: "piece", from: prop }, piece.assetId);
    expect(studio.getVenue(db, venue.id)!.status).toBe("approved");

    const built = (await sceneSet(db, sceneId))!;
    const w = built.set.walls.find((x) => x.name === view)!;
    expect([w.texture!.data[0], w.texture!.data[1], w.texture!.data[2]]).toEqual([20, 40, 220]); // the wall picture, whole
    const tex = built.set.pieces[0].texture!;
    expect([tex.width, tex.height]).toEqual([40, 80]); // trimmed to the table
    expect([tex.data[0], tex.data[1], tex.data[2], tex.data[3]]).toEqual([200, 20, 20, 255]);

    // Going back to the venue's view.
    studio.setVenueSetPicture(db, venue.id, { kind: "wall", view }, null);
    expect(setPicturesOf(studio.getVenue(db, venue.id)!.setPictures).walls).toEqual({});
  });
});
