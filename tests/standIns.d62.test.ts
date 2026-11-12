// D62: from T6 (a second venue, a rooftop bar, three seated panels). Any scene; made-up names.
// Sides swapped between identical pale stand-ins, a standing-height camera on seated people, a
// sheet divider drawn as a white bar, cloned background guests, table things lost between panels.
import { describe, expect, it } from "vitest";
import { planForShot, SEATED_EYE_M } from "../src/lib/domain/geometry";
import { outfitColours } from "../src/lib/domain/outfitColour";
import { layoutSketchSvg } from "../src/lib/domain/layoutSketch";
import { blockingInstruction, blockingShort, panelPrompt } from "../src/lib/domain/imagePrompts";
import { dividerBands } from "../src/lib/domain/sheet";
import type { ShotSpec } from "../src/lib/domain/types";

const plan = {
  aspect: "9:16" as const,
  bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
  actors: [{ characterId: "ava", position: { x: 0.8, y: 5 } }, { characterId: "bo", position: { x: -0.8, y: 5 } }],
  furniture: [{ id: "t", name: "small round table", position: { x: 0, y: 5 }, radiusM: 0.35, heightM: 0.75 }],
  cameras: [
    { id: "c", name: "Wide", preset: "wide" as const, position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 },
    { id: "hi", name: "High", preset: "wide" as const, position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 60, heightM: 2.4, tiltDeg: -20 },
  ],
  views: [{ name: "skyline", directionDeg: 90 }],
  lineOfAction: ["ava", "bo"] as [string, string],
};
const seated = { ava: { pose: "sitting" as const, on: "chair", by: "you" as const }, bo: { pose: "sitting" as const, on: "chair", by: "you" as const } };

describe("Seated people: the camera at seated eye level (D62)", () => {
  it("puts a camera with no height of its own at seated eye level when everyone in the picture sits", () => {
    const sp = planForShot(plan, { posture: seated, visibleIds: ["ava", "bo"] });
    expect(sp.cameras.find((c) => c.id === "c")!.heightM).toBe(SEATED_EYE_M);
    // A camera given its own height keeps it.
    expect(sp.cameras.find((c) => c.id === "hi")!.heightM).toBe(2.4);
  });
  it("keeps standing eye level when anyone in the picture stands, and counts only who is seen", () => {
    expect(planForShot(plan, { posture: { ava: seated.ava }, visibleIds: ["ava", "bo"] }).cameras[0].heightM).toBeUndefined();
    expect(planForShot(plan, { posture: { ava: seated.ava }, visibleIds: ["ava"] }).cameras[0].heightM).toBe(SEATED_EYE_M);
  });
  it("works when the floor plan itself has them seated, with nothing set on the panel", () => {
    const sitting = { ...plan, actors: plan.actors.map((a) => ({ ...a, pose: "sitting" as const })) };
    expect(planForShot(sitting, { visibleIds: ["ava", "bo"] }).cameras[0].heightM).toBe(SEATED_EYE_M);
    expect(planForShot(plan, { visibleIds: ["ava", "bo"] })).toBe(plan);
  });
});

describe("Stand-ins in the colours of their clothes (D62)", () => {
  it("reads the outer garment first, then what's under it", () => {
    expect(outfitColours("A sleeveless mini shift dress with a vivid tangerine-orange central panel and ivory side panels. Cropped cream bouclé jacket ending at the waist.")).toEqual(["#f1e7cf", "#f97316"]);
    expect(outfitColours("Deep midnight-navy two-piece suit with a fitted jacket. Crisp white dress shirt, open at the collar, with the top two buttons undone.")).toEqual(["#1e3a8a", "#f8f8f6"]);
    expect(outfitColours("Deep forest-green satin bomber jacket. Underneath, a fitted black crew-neck T-shirt.")).toEqual(["#166534", "#1f1f1f"]);
  });
  it("one colour when only one garment is named, and ignores what they don't wear", () => {
    expect(outfitColours("Soft lilac-lavender halter-neck jumpsuit with wide-leg trousers. No logos, jackets, handbags or wardrobe changes.")).toEqual(["#c4b5fd"]);
    expect(outfitColours("A light blue linen shirt.")).toEqual(["#93c5fd"]);
    expect(outfitColours("Mustard scarf and brown boots.")).toEqual(["#c9a227"]);
    expect(outfitColours("Smart casual.")).toEqual([]);
    expect(outfitColours(undefined)).toEqual([]);
  });
  it("draws each body in its colours, and stays pale without any", () => {
    const people = [{ id: "ava", name: "Ava", colours: ["#f1e7cf", "#f97316"] }, { id: "bo", name: "Bo" }];
    const svg = layoutSketchSvg({ plan: planForShot(plan, { posture: seated }), camera: plan.cameras[0], people, size: "portrait", overlay: true });
    expect(svg).toContain('fill="#f1e7cf" fill-opacity="0.93"');
    expect(svg).toContain('fill="#f97316" fill-opacity="0.95"');
    expect(svg).toContain('fill="#e5e7eb" fill-opacity="0.93"');
  });
  it("says so in the request only when the stand-ins are coloured", () => {
    expect(blockingInstruction([], false, true)).toMatch(/a labelled stand-in for each character, its body shaded in the colours of their clothes so you can tell who is who/);
    expect(blockingInstruction([], true, true)).toMatch(/props in place\), with a labelled stand-in for each character, its body shaded/);
    expect(blockingInstruction([], false)).toMatch(/with a pale labelled stand-in for each character\./);
    expect(blockingShort(false, true)).toMatch(/Each stand-in \(shaded in the colours of that person's clothes\) becomes the person named on it/);
    expect(blockingShort(false)).toMatch(/Each pale stand-in becomes the person named on it/);
  });
});

describe("A full request with seated people, a crowd and a continuity picture (D62)", () => {
  const spec = { code: "P2", visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], subjectId: "ava", cameraId: "c", shot: "medium shot", audioMode: "off", durationSec: 4, sceneContext: "Drinks.", venueName: "roof", actions: "They talk.", crowd: "about 20 guests at the bar.", posture: seated } as unknown as ShotSpec;
  const cast = [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }].map((c) => ({ ...c, pronoun: "she" as const, voiceLock: "", description: "" }));
  const profiles = { ava: { appearance: "Bob.", wardrobe: "Orange dress under a cream jacket.", refs: { front: "af" } }, bo: { appearance: "Braids.", wardrobe: "Lilac jumpsuit.", refs: { front: "bf" } } };
  const p = panelPrompt({ description: "They talk.", shot: spec, cast: cast as never, profiles: profiles as never, plan, venueName: "roof", blockingHref: "/api/blocking/x", continuity: { assetId: "z", label: "approved scene picture (panel 3)" } });
  it("asks for background guests who are all different people", () => {
    expect(p.text).toMatch(/Every background guest is a different person \(varied faces, ages, builds, hair and clothes\): no two alike, no one repeated/);
    expect(p.short).toMatch(/no two alike: varied faces, ages, builds, hair and clothes/);
  });
  it("keeps the things on the tables from the approved picture", () => {
    expect(p.text).toMatch(/the same things on the tables \(glasses, drinks, bags\)/);
    expect(p.short).toMatch(/the furniture's colour and material, what stands on the tables and the light look: keep those the same/);
  });
  it("tells GPT the stand-ins are in their clothes' colours", () => {
    expect(p.text).toMatch(/its body shaded in the colours of their clothes/);
    expect(p.short).toMatch(/Each stand-in \(shaded in the colours of that person's clothes\)/);
  });
});

describe("Sheet dividers trimmed off view pictures (D62)", () => {
  const picture = (w: number, h: number, white: (x: number, y: number) => boolean) => {
    const data = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = white(x, y) ? 250 : 40 + ((x * 7 + y * 13) % 90);
    return { w, h, data };
  };
  it("finds a white band along the top, two pixels more for its soft edge", () => {
    expect(dividerBands(picture(200, 300, (_x, y) => y < 6))).toEqual({ top: 8, bottom: 0, left: 0, right: 0 });
  });
  it("finds one that starts a pixel or two in, and on any side", () => {
    expect(dividerBands(picture(200, 300, (_x, y) => y >= 2 && y < 7)).top).toBe(9);
    expect(dividerBands(picture(200, 300, (x) => x >= 195)).right).toBe(7);
  });
  it("leaves a picture alone with no band, or a white line well inside it, and never trims more than 8%", () => {
    expect(dividerBands(picture(200, 300, () => false))).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    expect(dividerBands(picture(200, 300, (_x, y) => y === 12)).top).toBe(0);
    expect(dividerBands(picture(200, 300, (_x, y) => y < 100)).top).toBe(24);
  });
});

describe("Drinks stand on the table; a table people sit at is sitting height (D62)", () => {
  const room = {
    ...plan,
    furniture: [
      { id: "spot", name: "small round table", detail: "round, about 70 cm across, chest-high at 110 cm, dark wood", position: { x: 0, y: 5 }, radiusM: 0.35, heightM: 1.1 },
      { id: "prop-2", name: "two cocktails", detail: "tall glasses about 18 cm, one blue, one amber, on coasters", position: { x: 1.2, y: 7.1 }, radiusM: 0.35, heightM: 1.1 },
    ],
  };
  it("knows a table-top thing by its name, not by a glass in a table's words", async () => {
    const { propKind, propHeight } = await import("../src/lib/domain/story");
    expect(propKind("two cocktails tall glasses", "two cocktails")).toBe("small");
    expect(propKind("laptop", "laptop")).toBe("small");
    expect(propKind("cocktail table with three champagne flutes on top", "cocktail table")).toBe("table");
    expect(propKind("bottle display a lit glass plinth, 1 m tall", "bottle display")).toBe("column");
    expect(propHeight("two cocktails tall glasses about 18 cm", "two cocktails")).toBe(0.18);
    expect(propHeight("laptop 35 cm wide", "laptop")).toBe(0.2);
    expect(propHeight("round, chest-high at 110 cm, with a highball glass (about 15 cm tall)")).toBe(1.1);
  });
  it("puts a drink left on the floor onto the nearest table, at its own height", () => {
    const sp = planForShot(room, { visibleIds: ["ava", "bo"] });
    const drinks = sp.furniture!.find((f) => f.id === "prop-2")!;
    expect(drinks.onId).toBe("spot");
    expect(drinks.heightM).toBe(0.18);
    expect(Math.hypot(drinks.position.x, drinks.position.y - 5)).toBeLessThan(0.35);
  });
  it("brings a chest-high table down to sitting height, words too, only when everyone at it sits on chairs", () => {
    const sitting = planForShot(room, { posture: seated, visibleIds: ["ava", "bo"] }).furniture!.find((f) => f.id === "spot")!;
    expect(sitting.heightM).toBe(0.75);
    expect(sitting.detail).toBe("round, about 70 cm across, table height, about 75 cm, dark wood");
    expect(planForShot(room, { posture: { ava: seated.ava }, visibleIds: ["ava", "bo"] }).furniture!.find((f) => f.id === "spot")!.heightM).toBe(1.1);
    const stools = { ava: { ...seated.ava, on: "bar stool" }, bo: seated.bo };
    expect(planForShot(room, { posture: stools, visibleIds: ["ava", "bo"] }).furniture!.find((f) => f.id === "spot")!.heightM).toBe(1.1);
  });
  it("draws the drink on the table top and says which table it stands on", () => {
    const sp = planForShot(room, { posture: seated, visibleIds: ["ava", "bo"] });
    const svg = layoutSketchSvg({ plan: sp, camera: sp.cameras[0], people: [], size: "portrait", overlay: true });
    expect(svg).toContain('fill="#fde68a"');
    expect(svg).toContain(">two cocktails<");
    const spec = { code: "P1", visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], cameraId: "c", shot: "medium shot", audioMode: "off", durationSec: 4, venueName: "roof", posture: seated } as unknown as ShotSpec;
    const cast = [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }].map((c) => ({ ...c, pronoun: "she" as const, voiceLock: "", description: "" }));
    const t = panelPrompt({ description: "They talk.", shot: spec, cast: cast as never, profiles: {}, plan: room, venueName: "roof", blockingHref: "/api/blocking/x" });
    expect(t.text).toMatch(/two cocktails \(tall glasses about 18 cm, one blue, one amber, on coasters\), standing on the small round table/);
    expect(t.text).toMatch(/small round table \(round, about 70 cm across, table height, about 75 cm, dark wood\)/);
    expect(t.text).not.toMatch(/chest-high/);
  });
  it("places drinks on the gathering table when a new scene is staged", async () => {
    const { defaultPlan } = await import("../src/lib/domain/story");
    const st = { spot: "sitting around the small round table", props: [{ name: "small round table", detail: "round, about 75 cm high" }, { name: "two cocktails", detail: "tall glasses about 18 cm" }], crowd: "", crowdLevel: "none" as const };
    const p = defaultPlan(["ava", "bo"], [], [], st as never);
    const [t, d] = p.furniture!;
    expect(Math.hypot(d.position.x - t.position.x, d.position.y - t.position.y)).toBeLessThan(0.3);
    expect(d.heightM).toBe(0.18);
  });
});
