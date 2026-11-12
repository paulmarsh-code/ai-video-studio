// D64: references in image 1's left-to-right order, and image 1 padded out without a blurred band.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { panelPrompt } from "../src/lib/domain/imagePrompts";
import { paddedOut } from "../src/lib/backgroundImage";
import type { ShotSpec } from "../src/lib/domain/types";

const plan = {
  aspect: "9:16" as const,
  bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
  actors: [{ characterId: "ava", position: { x: 0.8, y: 5 } }, { characterId: "bo", position: { x: -0.8, y: 5 } }, { characterId: "cy", position: { x: 0, y: 5.6 } }],
  cameras: [
    { id: "front", name: "Wide", preset: "wide" as const, position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 },
    { id: "back", name: "Reverse", preset: "wide" as const, position: { x: 0, y: 9 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 },
  ],
  views: [{ name: "bar", directionDeg: 90 }, { name: "door", directionDeg: 270 }],
  lineOfAction: ["ava", "bo"] as [string, string],
};
const cast = [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }, { id: "cy", name: "Cy" }].map((c) => ({ ...c, pronoun: "she" as const, voiceLock: "", description: "" }));
const profiles = Object.fromEntries(["ava", "bo", "cy"].map((id) => [id, { appearance: "", wardrobe: "", refs: { front: `${id}-front` } }]));
const request = (cameraId: string) => panelPrompt({ description: "They talk.", shot: { code: "P1", visibleIds: ["ava", "bo", "cy"], excludedIds: [], presentIds: ["ava", "bo", "cy"], cameraId, shot: "wide shot", audioMode: "off", durationSec: 4, venueName: "bar" } as unknown as ShotSpec, cast: cast as never, profiles: profiles as never, plan, venueName: "bar", blockingHref: "/api/blocking/x" });

describe("Character references in image 1's left-to-right order (D64)", () => {
  for (const cam of ["front", "back"]) {
    it(`attaches them in the order the request names them left to right (${cam} camera)`, () => {
      const p = request(cam);
      const named = p.text.match(/from left to right: ([^.]+)\./)![1].split(/, | and /).map((x) => x.trim());
      const attached = p.attach.filter((a) => a.label.endsWith(" reference")).map((a) => a.label.replace(/ reference$/, ""));
      expect(attached).toEqual(named);
      expect(p.short).toMatch(/the people in image 1's left-to-right order\)/);
    });
  }
  it("turning the camera round turns the order round", () => {
    const ids = (cam: string) => request(cam).attach.filter((a) => a.label.endsWith(" reference")).map((a) => a.label);
    expect(ids("back")).toEqual([...ids("front")].reverse());
  });
});

describe("Image 1 padded out without a blurred band (D64)", () => {
  it("fills to size, carrying the picture on above (mirrored) and below (its last band, drawn out)", async () => {
    const w = 60, h = 40;
    const raw = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; raw[i] = y < 5 ? 250 : 20; raw[i + 1] = x * 4; raw[i + 2] = 90; }
    const part = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    const out = await paddedOut(part, w, h, { top: 30, bottom: 15, left: 0, right: 0 });
    const { data, info } = await sharp(out).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([w, h + 45]);
    const red = (x: number, y: number) => data[(y * info.width + x) * info.channels];
    // The bright top rows of the picture are mirrored just above it, not smeared away.
    expect(red(30, 27)).toBeGreaterThan(150);
    // Further up the mirror carries on into the darker part, as the room would.
    expect(red(30, 5)).toBeLessThan(100);
    // Below, the floor's last band continues.
    expect(red(30, h + 40)).toBeLessThan(60);
  });
});
