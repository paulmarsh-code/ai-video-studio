// D103: drawing on the fixed set. The pictures say what is where and how it looks; the words say
// only the moment, what everyone does and the background people. Any scene; made-up names.
import { describe, expect, it } from "vitest";
import { panelPrompt } from "../src/lib/domain/imagePrompts";
import { KEY, layoutSketchSvg } from "../src/lib/domain/layoutSketch";
import { asStaging } from "../src/lib/domain/story";
import type { ShotSpec } from "../src/lib/domain/types";

const plan = {
  aspect: "9:16" as const,
  bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
  actors: [{ characterId: "ava", position: { x: 0.8, y: 5 } }, { characterId: "bo", position: { x: -0.8, y: 5 } }],
  furniture: [{ id: "t", name: "small round table", detail: "dark wood", position: { x: 0, y: 5 }, radiusM: 0.35, heightM: 0.75, imageAssetId: "tablepic" }],
  cameras: [{ id: "front", name: "Two-shot", preset: "two-shot" as const, position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 }],
  views: [{ name: "skyline", directionDeg: 90 }, { name: "bar", directionDeg: 180 }],
  lineOfAction: ["ava", "bo"] as [string, string],
};
const cast = [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }].map((c) => ({ ...c, pronoun: "she" as const, voiceLock: "", description: "" }));
const spec = { code: "P2", visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], subjectId: "ava", cameraId: "front", shot: "medium shot", audioMode: "off", durationSec: 4, venueName: "roof", crowd: "a few guests chatting by the glowing display", spot: "at the table, near the glowing display" } as unknown as ShotSpec;
const draw = (frame?: "set") => panelPrompt({ description: "Ava laughs at Bo's joke.", emotion: "amused", shot: spec, cast: cast as never, profiles: {}, plan, venueName: "roof bar", venueDescription: "Warm festoon lights glow overhead.", blockingHref: "/api/blocking/x", frame, continuity: { assetId: "z", label: "approved scene picture (panel 3)", view: "skyline" } });

describe("Drawing on the fixed set (D103)", () => {
  it("the request is the moment and the people, nothing about where things are or how the room looks", () => {
    const p = draw("set");
    expect(p.image).toBeDefined();
    expect(p.image).toContain("ALREADY FINISHED EXCEPT FOR THE PEOPLE");
    expect(p.image).toContain("Moment: Ava laughs at Bo's joke.");
    expect(p.image).toContain("a few guests");
    expect(p.image).not.toMatch(/Where:|Lighting|Key props|Sizes:|metres|near the glowing display, /);
    // Positions and props are said from the same plan and pictures as image 1 (D108).
    expect(p.image).toMatch(/left to right: Bo and Ava; keep this order;/);
    expect(p.image).toContain("The small round table: exactly as in the small round table picture");
    // The people's and props' pictures go with image 1 (D106), never an earlier picture.
    expect(p.attach.map((a) => a.label)).not.toContain("approved scene picture (panel 3)");
    expect(p.attach.map((a) => a.label)).toContain("small round table picture");
    // The shot the app chose is described (D106).
    expect(p.image).toMatch(/^Shot: full shot\.$/m); // what this camera really frames (D48), not the panel's "medium shot"
    expect(draw().image).toBeUndefined();
  });
  it("set pieces are drawn in the key colour, so the set's own table goes back in front of whoever is behind it", () => {
    const svg = layoutSketchSvg({ plan: plan as never, camera: plan.cameras[0] as never, size: "portrait", overlay: true, people: [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }], keyPieces: true });
    expect(svg).toContain(KEY);
    expect(svg).not.toContain("small round table<");
  });
  it("the switch is kept with the scene's setting", () => {
    expect(asStaging({ spot: "x", onSet: true }).onSet).toBe(true);
    expect(asStaging({ spot: "x" }).onSet).toBeUndefined();
  });
});

describe("Room height from its words (D104)", () => {
  it("a warehouse is lofty, a flat isn't", async () => {
    const { roomHeight } = await import("../src/lib/setImage");
    expect(roomHeight("A converted industrial warehouse")).toBe(7);
    expect(roomHeight("A small kitchen")).toBe(3);
    expect(roomHeight("A loft-style flat with high ceilings")).toBe(7);
  });
  it("the request names no venue, and holds the framing", () => {
    const p = draw("set").image!;
    expect(p.split("\n")[0]).not.toContain("roof bar");
    expect(p).toContain("Keep image 1's framing exactly");
  });
});
