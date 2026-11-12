// D63: the approved picture gives looks, never the shot. Any scene; made-up names.
import { describe, expect, it } from "vitest";
import { panelPrompt } from "../src/lib/domain/imagePrompts";
import type { ShotSpec } from "../src/lib/domain/types";

const plan = {
  aspect: "9:16" as const,
  bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
  actors: [{ characterId: "ava", position: { x: 0.8, y: 5 } }, { characterId: "bo", position: { x: -0.8, y: 5 } }],
  furniture: [{ id: "t", name: "small round table", detail: "dark wood", position: { x: 0, y: 5 }, radiusM: 0.35, heightM: 0.75 }],
  cameras: [
    { id: "front", name: "Two-shot", preset: "two-shot" as const, position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 },
    { id: "ots", name: "Over Bo's shoulder", preset: "main-ots" as const, position: { x: -2, y: 5 }, lookAt: { x: 0.8, y: 5 }, fovDeg: 45 },
  ],
  views: [{ name: "skyline", directionDeg: 90 }, { name: "bar", directionDeg: 180 }, { name: "decking", directionDeg: 0 }, { name: "entrance", directionDeg: 270 }],
  lineOfAction: ["ava", "bo"] as [string, string],
};
const cast = [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }].map((c) => ({ ...c, pronoun: "she" as const, voiceLock: "", description: "" }));
const spec = (cameraId: string) => ({ code: "P2", visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], subjectId: "ava", cameraId, shot: "medium shot", audioMode: "off", durationSec: 4, venueName: "roof", crowd: "a few guests" }) as unknown as ShotSpec;
const draw = (cameraId: string, view: string) => panelPrompt({ description: "They talk.", shot: spec(cameraId), cast: cast as never, profiles: {}, plan, venueName: "roof", blockingHref: "/api/blocking/x", continuity: { assetId: "z", label: "approved scene picture (panel 3)", view } });

describe("The approved picture gives looks, never the shot (D63)", () => {
  it("keeps clothes, the furniture's colour and material, the table things and the light; image 1 decides the rest", () => {
    const p = draw("front", "skyline");
    expect(p.short).toMatch(/shows how the clothes, the furniture's colour and material, what stands on the tables and the light look: keep those the same, each character with the same drink and things in front of them\. Image 1 decides where everyone and everything is, how big and how high, and what is behind them/);
    expect(p.text).toMatch(/Where everyone and everything is, how big and how high, and what is behind them come from image 1, not from it\./);
    for (const t of [p.text, p.short!]) {
      expect(t).not.toMatch(/the same furniture at the same height and size/);
      expect(t).not.toMatch(/how the room/);
    }
  });
  it("says when this camera faces another side of the place than the approved picture", () => {
    const turned = draw("ots", "skyline");
    expect(turned.short).toMatch(/This camera faces the decking, not the skyline behind them in the approved scene picture \(panel 3\): take nothing behind the characters from it\./);
    expect(turned.text).toMatch(/This camera faces the decking, not the skyline/);
    expect(draw("front", "skyline").short).not.toMatch(/This camera faces/);
  });
});
