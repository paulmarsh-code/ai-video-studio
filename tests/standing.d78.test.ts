// D78: four general fixes found by the skate park scene (T7). Any scene; made-up names.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { planForShot, readProps } from "../src/lib/domain/geometry";
import { panelPrompt } from "../src/lib/domain/imagePrompts";
import { propKind } from "../src/lib/domain/story";
import { paddedOut } from "../src/lib/backgroundImage";
import type { GeometryPlanData, ShotSpec } from "../src/lib/domain/types";

const plan: GeometryPlanData = {
  aspect: "9:16",
  bounds: { minX: -6, maxX: 6, minY: 0, maxY: 14 },
  actors: [{ characterId: "ava", position: { x: -1.2, y: 6 } }, { characterId: "bo", position: { x: 1.2, y: 6 } }],
  furniture: [
    { id: "p1", name: "phone", detail: "black smartphone, about 15 cm, held by Bo", position: { x: 0, y: 6.4 }, radiusM: 0.13, heightM: 0.15 },
    { id: "p2", name: "bicycle", detail: "red city bike, used by Ava", position: { x: -2, y: 7 }, radiusM: 0.8, heightM: 1 },
    { id: "p3", name: "bench", detail: "wooden park bench, knee-high", position: { x: 0, y: 7.5 }, radiusM: 0.9, heightM: 0.45 },
  ],
  cameras: [{ id: "two", name: "Two-shot", preset: "two-shot", position: { x: 0, y: 0.5 }, lookAt: { x: 0, y: 6 }, fovDeg: 73, size: "ms" }],
  views: [{ name: "park", directionDeg: 90 }],
  lineOfAction: ["ava", "bo"],
};
const cast = [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }].map((c) => ({ ...c, pronoun: "she" as const, voiceLock: "", description: "" }));
const request = (shotWords: string, size: "ms" | "ls" | "ws" = "ms") => panelPrompt({ description: "They talk.", cast: cast as never, profiles: {}, plan: { ...plan, cameras: [{ ...plan.cameras[0], size }] }, venueName: "park", blockingHref: "/api/blocking/x",
  shot: { code: "P1", visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], subjectId: "ava", cameraId: "two", shot: shotWords, audioMode: "off", durationSec: 4, venueName: "park" } as unknown as ShotSpec });

describe("Framing words follow image 1 for people standing too (D78)", () => {
  it("a two-shot named medium that shows two standing people whole and small says long shot", () => {
    const p = request("Medium shot, two-shot");
    expect(p.text).toMatch(/Shot: long shot, two-shot\./);
    expect(p.text).not.toMatch(/from the waist up/);
  });
  it("a wide shot that frames them whole is left as named", () => {
    expect(request("Wide shot, two-shot", "ws").text).toMatch(/Shot: Wide shot, two-shot\./);
  });
});

describe("A prop the words give to someone is in their hand (D78)", () => {
  const sp = planForShot(plan, { visibleIds: ["ava", "bo"] });
  it("held by, used by: theirs, at their place, not on the floor", () => {
    expect(sp.furniture!.find((f) => f.id === "p1")).toMatchObject({ heldBy: "bo", position: { x: 1.2, y: 6 } });
    expect(sp.furniture!.find((f) => f.id === "p2")).toMatchObject({ heldBy: "ava" });
    expect(sp.furniture!.find((f) => f.id === "p3")!.heldBy).toBeUndefined();
  });
  it("is not listed or checked as a floor prop", () => {
    expect(readProps(sp, sp.cameras[0]).map((p) => p.name)).toEqual(["bench"]);
  });
});

describe("A metre or more across is never a table-top thing (D78)", () => {
  it("by size, whatever the name", () => {
    expect(propKind("big concrete bowl about 5 m diameter, smooth grey concrete", "big concrete bowl")).toBe("table");
    expect(propKind("fruit bowl white ceramic, about 25 cm across", "fruit bowl")).toBe("small");
    expect(propKind("two cocktails tall glasses about 18 cm", "two cocktails")).toBe("small");
  });
});

describe("Above the picture is drawn out, not mirrored (D78)", () => {
  it("the padding above carries on the top line's colour, with nothing upside down in it", async () => {
    // Sky blue over a dark building: mirrored, the building came back above the sky.
    const W = 40, Hp = 60;
    const part = await sharp({ create: { width: W, height: Hp, channels: 3, background: { r: 120, g: 170, b: 230 } } })
      .composite([{ input: await sharp({ create: { width: W, height: 40, channels: 3, background: { r: 90, g: 40, b: 30 } } }).png().toBuffer(), left: 0, top: 20 }]).png().toBuffer();
    const out = await paddedOut(part, W, Hp, { top: 50, left: 0, bottom: 0, right: 0 });
    const { data, info } = await sharp(out).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.height).toBe(110);
    // Every line of the padding is sky, none brick.
    for (let y = 0; y < 50; y += 5) {
      const i = (y * info.width + 20) * 3;
      expect(data[i + 2]).toBeGreaterThan(200);
    }
  });
});
