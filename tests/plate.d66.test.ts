// D66: version C. The camera's finished plate, where GPT may draw, and the plate pasted back.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { maskExtras, platePrompt, PLATE_KEEP_SHORT } from "../src/lib/domain/plate";
import { blockingInstruction, blockingShort, panelPrompt } from "../src/lib/domain/imagePrompts";
import { onPlate, openAIMask } from "../src/lib/plateImage";
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

describe("The plate request (D66)", () => {
  it("keeps the camera's view exactly, sharp all over, the middle floor empty, with the crowd at the back and sides", () => {
    const t = platePrompt({ venueName: "roof bar", crowd: "about 10 guests with drinks.", light: "Warm festoon bulbs." });
    expect(t).toMatch(/Keep image 1's framing, camera height, eye level, perspective and layout exactly/);
    expect(t).toMatch(/same clarity all over: everything from near to far in focus/);
    expect(t).toMatch(/The open floor in the middle and front of the picture is empty/);
    expect(t).toMatch(/Background guests: about 10 guests with drinks\. They stand or sit further back and at the sides/);
    expect(t).toMatch(/Light: Warm festoon bulbs\./);
    expect(platePrompt({ venueName: "roof bar" })).toMatch(/No people anywhere\./);
  });
});

describe("Where GPT may draw (D66)", () => {
  it("adds a box round each person and a shadow round each foot, only for people in the shot", () => {
    const both = maskExtras(plan, plan.cameras[0], ["ava", "bo"], 1024, 1536);
    const one = maskExtras(plan, plan.cameras[0], ["ava"], 1024, 1536);
    const count = (svg: string) => (svg.match(/<polygon/g) ?? []).length;
    expect(count(both)).toBe(5); // two people (box and shadow each) and the table's shadow
    expect(count(one)).toBe(3);
  });
});

describe("The request in version C (D66)", () => {
  it("says to draw only the main characters, props and shadows, and adds no background guests", () => {
    expect(blockingInstruction([], false, true, true)).toMatch(/is the finished background photograph, with its background guests: keep it exactly as it is, as sharp as it is, and add no one to it/);
    expect(blockingShort(false, true, true)).toContain(PLATE_KEEP_SHORT);
    expect(blockingShort(false, true)).not.toContain(PLATE_KEEP_SHORT);
    const shot = { code: "P1", visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], cameraId: "c", shot: "medium shot", audioMode: "off", durationSec: 4, venueName: "roof", crowd: "about 10 guests" } as unknown as ShotSpec;
    const cast = [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }].map((c) => ({ ...c, pronoun: "she" as const, voiceLock: "", description: "" }));
    const c = panelPrompt({ description: "They talk.", shot, cast: cast as never, profiles: {}, plan, venueName: "roof", blockingHref: "/api/blocking/x", frame: "fill" });
    const a = panelPrompt({ description: "They talk.", shot, cast: cast as never, profiles: {}, plan, venueName: "roof", blockingHref: "/api/blocking/x" });
    expect(c.text).not.toMatch(/Background: about 10 guests/);
    expect(c.short).not.toMatch(/Background: about 10 guests/);
    expect(a.text).toMatch(/Background: about 10 guests/);
  });
});

describe("The plate pasted back (D66)", () => {
  const W = 64, H = 96;
  const flat = (r: number, g: number, b: number) => sharp({ create: { width: W, height: H, channels: 3, background: { r, g, b } } }).png().toBuffer();
  it("keeps GPT's picture inside the area, the plate outside, and measures how far GPT's background strayed", async () => {
    const plate = await flat(0, 0, 255), gpt = await flat(255, 0, 0);
    const area = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/><rect x="16" y="32" width="32" height="48" fill="#fff"/></svg>`)).greyscale().png().toBuffer();
    const { png, numbers } = await onPlate(gpt, plate, area, W, H);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => [...data.subarray((y * W + x) * info.channels, (y * W + x) * info.channels + 3)];
    expect(px(32, 56)).toEqual([255, 0, 0]); // inside: GPT's
    expect(px(4, 4)).toEqual([0, 0, 255]); // outside: the plate
    expect(numbers.drawnShare).toBeCloseTo((32 * 48) / (W * H), 2);
    expect(numbers.backgroundChange).toBeCloseTo(2 / 3, 2); // GPT's own background here was all different
  });
  it("makes OpenAI's mask clear where GPT may draw", async () => {
    const area = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/><rect x="0" y="0" width="32" height="${H}" fill="#fff"/></svg>`)).greyscale().png().toBuffer();
    const mask = await openAIMask(area, W, H);
    const { data, info } = await sharp(mask).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(data[(10 * W + 5) * 4 + 3]).toBe(0); // left half: may draw
    expect(data[(10 * W + 50) * 4 + 3]).toBe(255); // right half: keep
  });
});
