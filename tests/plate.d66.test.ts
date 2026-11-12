// D66, D67: version C. The camera's finished plate, checked against the venue's views; the
// people and props' area for the record; full-size venue views.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { maskExtras, platePrompt, PLATE_KEEP_SHORT, SAME_PLACE, structureMatch, viewFullSizePrompt } from "../src/lib/domain/plate";
import { blockingInstruction, blockingShort, panelPrompt } from "../src/lib/domain/imagePrompts";
import { plateNumbers, samePlace } from "../src/lib/plateImage";
import type { ShotSpec } from "../src/lib/domain/types";

const plan = {
  aspect: "9:16" as const,
  bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
  actors: [{ characterId: "ava", position: { x: 0.8, y: 5 }, pose: "sitting" as const }, { characterId: "bo", position: { x: -0.8, y: 5 } }],
  furniture: [{ id: "t", name: "small round table", position: { x: 0, y: 5 }, radiusM: 0.35, heightM: 0.75 }],
  cameras: [{ id: "c", name: "Two-shot", preset: "two-shot" as const, position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 }],
  views: [{ name: "skyline", directionDeg: 90 }],
  lineOfAction: ["ava", "bo"] as [string, string],
};

describe("The plate and full-size view requests (D67)", () => {
  it("asks for the same photograph, sharper, changing and adding nothing, with no people", () => {
    const t = platePrompt({ venueName: "roof bar", light: "Warm festoon bulbs." });
    expect(t).toMatch(/Image 1 is a real photograph of the roof bar, seen from one fixed camera, but soft and low in detail\. Return the same photograph, sharp and clean/);
    expect(t).toMatch(/Change nothing in it/);
    expect(t).toMatch(/Add nothing and remove nothing/);
    expect(t).toMatch(/No people anywhere/);
    expect(t).toMatch(/Light, as it is in image 1: Warm festoon bulbs\./);
    expect(t).not.toMatch(/Background guests/);
  });
  it("asks for one venue view at full size, the same picture", () => {
    const t = viewFullSizePrompt({ venueName: "roof bar", viewName: "glass balustrade and skyline" });
    expect(t).toMatch(/one view of the roof bar, looking towards the glass balustrade and skyline, but small and low in detail\. Return the same picture at full size and full detail\./);
    expect(t).toMatch(/Add nothing and remove nothing; no people\./);
  });
});

describe("Is it still the same place? (D67)", () => {
  const scene = (shift: number) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#334"/><rect x="${20 + shift}" y="60" width="60" height="160" fill="#dca"/><rect x="${120 - shift}" y="180" width="60" height="100" fill="#a54"/><rect y="230" width="200" height="70" fill="#765"/></svg>`);
  it("scores the same picture, sharpened, near 1, and a different layout low", async () => {
    const a = await sharp(scene(0)).png().toBuffer();
    const sharper = await sharp(scene(0)).sharpen({ sigma: 2 }).png().toBuffer();
    const other = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#dca"/><rect x="0" y="0" width="200" height="90" fill="#223"/><rect x="70" y="100" width="60" height="200" fill="#334"/></svg>`)).png().toBuffer();
    expect(await samePlace(a, sharper)).toBeGreaterThan(0.95);
    expect(await samePlace(a, other)).toBeLessThan(SAME_PLACE);
  });
  it("is a correlation: identical 1, inverted -1", () => {
    expect(structureMatch([1, 2, 3, 4], [1, 2, 3, 4])).toBe(1);
    expect(structureMatch([1, 2, 3, 4], [4, 3, 2, 1])).toBe(-1);
  });
});

describe("The people and props' area (D66)", () => {
  it("adds a box round each person and a shadow round each foot, only for people in the shot", () => {
    const count = (svg: string) => (svg.match(/<polygon/g) ?? []).length;
    expect(count(maskExtras(plan, plan.cameras[0], ["ava", "bo"], 1024, 1536))).toBe(5);
    expect(count(maskExtras(plan, plan.cameras[0], ["ava"], 1024, 1536))).toBe(3);
  });
  it("measures how far GPT's background strayed from the plate outside the area", async () => {
    const W = 64, H = 96;
    const flat = (r: number, g: number, b: number) => sharp({ create: { width: W, height: H, channels: 3, background: { r, g, b } } }).png().toBuffer();
    const area = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/><rect x="16" y="32" width="32" height="48" fill="#fff"/></svg>`)).greyscale().png().toBuffer();
    const same = await plateNumbers(await flat(0, 0, 255), await flat(0, 0, 255), area, W, H);
    const changed = await plateNumbers(await flat(255, 0, 0), await flat(0, 0, 255), area, W, H);
    expect(same.backgroundChange).toBe(0);
    expect(changed.backgroundChange).toBeCloseTo(2 / 3, 2);
    expect(same.drawnShare).toBeCloseTo((32 * 48) / (W * H), 2);
  });
});

describe("The request in version C (D66, D67)", () => {
  it("keeps image 1's finished background, adding only the background guests", () => {
    expect(blockingInstruction([], false, true, true)).toMatch(/is the finished background photograph: keep it exactly as it is, as sharp as it is, adding only the background guests described below/);
    expect(blockingShort(false, true, true)).toContain(PLATE_KEEP_SHORT);
    expect(blockingShort(false, true)).not.toContain(PLATE_KEEP_SHORT);
    const shot = { code: "P1", visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], cameraId: "c", shot: "medium shot", audioMode: "off", durationSec: 4, venueName: "roof", crowd: "about 10 guests" } as unknown as ShotSpec;
    const cast = [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }].map((c) => ({ ...c, pronoun: "she" as const, voiceLock: "", description: "" }));
    const c = panelPrompt({ description: "They talk.", shot, cast: cast as never, profiles: {}, plan, venueName: "roof", blockingHref: "/api/blocking/x", frame: "fill" });
    expect(c.text).toMatch(/Background: about 10 guests/);
    expect(c.short).toMatch(/Background: about 10 guests/);
  });
});
