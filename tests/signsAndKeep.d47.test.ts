// D47: any scene, made-up names. A logo or sign that is part of the scene is the one text the
// pictures and clips may show; a prop with a logo and no picture is flagged. Someone in a
// panel's own shot doesn't drop out because its camera was moved: a turn keeps them in when it
// can, otherwise the app's nearest camera that has everyone in it.
import { describe, expect, it } from "vitest";
import { isSign, noTextRule, signsWithoutPicture } from "../src/lib/domain/signage";
import { nearestKeeping, readCamera, turnToKeep } from "../src/lib/domain/geometry";
import { panelPrompt } from "../src/lib/domain/imagePrompts";
import { composeKlingPrompt } from "../src/lib/domain/composer";
import type { GeometryPlanData, PlanCamera, ShotSpec } from "../src/lib/domain/types";

describe("Logos and signs (D47)", () => {
  it("knows a prop that carries a logo or lettering", () => {
    expect(isSign({ name: "ACME illuminated logo backdrop" })).toBe(true);
    expect(isSign({ name: "shop front", detail: "a neon sign saying OPEN over the door" })).toBe(true);
    expect(isSign({ name: "poster wall" })).toBe(true);
    expect(isSign({ name: "cocktail table", detail: "round, white cloth" })).toBe(false);
    expect(isSign({ name: "designer sofa" })).toBe(false);
    expect(signsWithoutPicture([{ name: "logo banner" }, { name: "menu board", imageAssetId: "a" }, { name: "lamp" }])).toEqual(["logo banner"]);
  });

  it("the closing rule allows the scene's own sign and nothing else", () => {
    expect(noTextRule([{ name: "lamp" }], ["no watermark"])).toBe("No text, no logos, no watermark.");
    const r = noTextRule([{ name: "lamp" }, { name: "ACME logo backdrop" }], ["no watermark"]);
    expect(r).toBe("No other text or logos, no watermark: the only lettering and logo are on the ACME logo backdrop, exactly as described.");
    expect(noTextRule([{ name: "ACME logo backdrop" }], [], ["ACME logo backdrop"])).toContain("exactly as in its attached picture");
  });

  const plan: GeometryPlanData = {
    aspect: "9:16",
    bounds: { minX: -5, maxX: 5, minY: 0, maxY: 12 },
    actors: [{ characterId: "ava", position: { x: -0.5, y: 6 } }, { characterId: "ben", position: { x: 0.5, y: 6 } }],
    furniture: [{ id: "b", name: "ACME logo backdrop", detail: "black banner, gold lettering", position: { x: 0, y: 10 }, radiusM: 1.5 }],
    cameras: [{ id: "c", name: "Cam A", preset: "wide", position: { x: 0, y: 1 }, lookAt: { x: 0, y: 6 }, fovDeg: 60 }],
    views: [{ name: "back wall", directionDeg: 90 }],
  };
  const spec = { code: "P1", visibleIds: ["ava", "ben"], excludedIds: [], presentIds: ["ava", "ben"], cameraId: "c", audioMode: "off", durationSec: 4, emotion: "calm", sceneContext: "Two friends at a launch.", venueName: "hall", actions: "Ava and Ben chat.", props: [{ name: "ACME logo backdrop", detail: "black banner, gold lettering" }] } as unknown as ShotSpec;
  const cast = [{ id: "ava", name: "Ava" }, { id: "ben", name: "Ben" }].map((c) => ({ ...c, pronoun: "she" as const, voiceLock: "", description: "" }));

  it("the picture request no longer forbids the logo it asks for", () => {
    const text = panelPrompt({ description: "Ava and Ben chat.", shot: spec, cast: cast as never, profiles: {}, plan, venueName: "hall" }).text;
    expect(text).not.toContain("No text, no logos");
    expect(text).toContain("the only lettering and logo are on the ACME logo backdrop");
  });

  it("nor does the video prompt", () => {
    const p = composeKlingPrompt(spec, cast as never, plan);
    expect(p.text).not.toContain("No text, no logos.");
    expect(p.text).toContain("No other text or logos: the only lettering and logo are on the ACME logo backdrop");
  });
});

describe("Nobody in a panel's shot drops out (D47)", () => {
  const room: GeometryPlanData = {
    aspect: "9:16",
    bounds: { minX: -9, maxX: 9, minY: 0, maxY: 20 },
    actors: [{ characterId: "a", position: { x: 0, y: 8 } }, { characterId: "b", position: { x: -1.2, y: 8 } }, { characterId: "c", position: { x: 1.2, y: 8 } }],
    cameras: [],
    views: [],
  };
  const cam: PlanCamera = { id: "k~1", name: "Wide, for this panel", preset: "wide", position: { x: 0, y: 2 }, lookAt: { x: 3, y: 8 }, fovDeg: 70 };
  const whole = (c: PlanCamera, ids: string[]) => ids.every((id) => { const x = readCamera(room, c).actors.find((y) => y.characterId === id); return !!x && x.inView && !x.partial; });

  it("turns the camera, same place and lens, to bring someone back in", () => {
    expect(whole(cam, ["a", "b", "c"])).toBe(false);
    const t = turnToKeep(room, cam, ["a", "b", "c"])!;
    expect(t.position).toEqual(cam.position);
    expect(t.fovDeg).toBe(cam.fovDeg);
    expect(whole(t, ["a", "b", "c"])).toBe(true);
    expect(turnToKeep(room, t, ["a", "b", "c"])).toBe(t);
  });

  it("when no turn can, the app's camera nearest the moved one that has everyone in", () => {
    const close: PlanCamera = { ...cam, position: { x: 0, y: 6.6 }, lookAt: { x: 0, y: 8 } };
    expect(turnToKeep(room, close, ["a", "b", "c"])).toBeUndefined();
    const options = [
      { kind: "far", camera: { ...cam, id: "x", position: { x: 0, y: 0.5 }, lookAt: { x: 0, y: 8 } } },
      { kind: "near, but someone is out", camera: { ...cam, id: "y", position: { x: 0, y: 5.5 }, lookAt: { x: 2, y: 8 } } },
      { kind: "near enough", camera: { ...cam, id: "z", position: { x: 0, y: 3 }, lookAt: { x: 0, y: 8 } } },
    ];
    expect(nearestKeeping(room, options, ["a", "b", "c"], close.position)?.kind).toBe("near enough");
  });
});
