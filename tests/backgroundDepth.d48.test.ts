// D48: any room, made-up names. The 360° views sit on the ring at the room's own scale, so the
// far wall isn't drawn right behind the group; the picture request says how big each person and
// tall prop is in the picture; and a full shot whose feet the picture cuts is said as it is.
import { describe, expect, it } from "vitest";
import { readCalibration, roomCentre, viewScale, wallDistance } from "../src/lib/domain/panorama";
import { framedSize, pictureShare } from "../src/lib/domain/geometry";
import { withSize } from "../src/lib/domain/shotLanguage";
import { panelPrompt } from "../src/lib/domain/imagePrompts";
import type { GeometryPlanData, PlanCamera, ShotSpec } from "../src/lib/domain/types";

const room: GeometryPlanData = {
  aspect: "9:16",
  bounds: { minX: -9, maxX: 9, minY: 0, maxY: 22 },
  actors: [{ characterId: "ava", position: { x: 4, y: 11 } }, { characterId: "ben", position: { x: -2, y: 11 } }],
  furniture: [{ id: "b", name: "logo backdrop", position: { x: -4, y: 11 }, radiusM: 1.5, heightM: 2.5 }],
  cameras: [{ id: "c", name: "Wide", preset: "wide", position: { x: 6.5, y: 11 }, lookAt: { x: 0, y: 11 }, fovDeg: 70, size: "fs" }],
  views: [{ name: "bar", directionDeg: 180 }, { name: "screen", directionDeg: 90 }],
};

describe("The 360° views at the room's own scale (D48)", () => {
  it("knows how far each wall is from the middle of the room", () => {
    const c = roomCentre(room);
    expect(c).toEqual({ x: 0, y: 11 });
    expect(wallDistance(room, c, 180)).toBeCloseTo(9);
    expect(wallDistance(room, c, 90)).toBeCloseTo(11);
  });

  it("a view whose far wall is drawn too near is made smaller, never bigger", () => {
    const photo = { width: 1672, height: 941 }, sector = { width: 1024, height: 768 };
    const cover = Math.max(1024 / 1672, 768 / 941);
    // Floor meets the bar well below eye level: the picture was taken a few metres from it.
    const f = viewScale({ horizon: 0.5, floor: 0.73 }, photo, sector, 9, 1024 / 90)!;
    expect(f).toBeLessThan(cover * 0.75);
    expect(f).toBeGreaterThan(cover * 0.5);
    // A floor line near eye level (a far wall, or an unsure reading): left as it is.
    expect(viewScale({ horizon: 0.5, floor: 0.585 }, photo, sector, 11, 1024 / 90)).toBeUndefined();
    expect(viewScale({ horizon: 0.6, floor: 0.55 }, photo, sector, 9, 1024 / 90)).toBeUndefined();
    // Never below a third of the ordinary fit, however far out a reading is.
    expect(viewScale({ horizon: 0.4, floor: 1 }, photo, sector, 30, 1024 / 90)).toBeCloseTo(cover * 0.35);
  });

  it("reads the vision model's measurement, and turns down one that can't be right", () => {
    expect(readCalibration('Here: {"horizon": 0.48, "floor_line": 0.731}')).toEqual({ horizon: 0.48, floor: 0.731 });
    expect(readCalibration('{"horizon": 0.7, "floor_line": 0.6}')).toBeNull();
    expect(readCalibration("no idea")).toBeNull();
  });
});

describe("How big things are in the picture (D48)", () => {
  const cam = room.cameras[0] as PlanCamera;
  it("someone across the room is small; someone near the lens runs off the bottom", () => {
    const far = pictureShare(room, cam, { x: -2, y: 11 }, 1.72, 8.5);
    expect(far.share).toBeGreaterThan(0.12);
    expect(far.share).toBeLessThan(0.25);
    expect(far.cut).toBe(false);
    expect(pictureShare(room, cam, { x: 4, y: 11 }, 1.72, 2.5).cut).toBe(true);
  });

  it("names the shot the picture really gives", () => {
    expect(framedSize(room, cam, { x: -2, y: 11 }, 8.5)?.size).toBe("ls");
    expect(framedSize(room, cam, { x: 2.5, y: 11 }, 4)?.size).toBe("fs");
    const near = framedSize(room, cam, { x: 4, y: 11 }, 2.5)!;
    expect(near.bottomM).toBeGreaterThan(0);
    expect(near.bottomM).toBeLessThan(0.3);
    expect(framedSize(room, cam, { x: 5, y: 11 }, 1.5)?.size).toBe("cowboy");
    expect(withSize("full shot, tracking shot", "mls")).toBe("medium long shot, tracking shot");
  });

  it("the picture request says each size, and a full shot cut at the ankles as it is", () => {
    const spec = { code: "P1", visibleIds: ["ava", "ben"], excludedIds: [], presentIds: ["ava", "ben"], subjectId: "ava", cameraId: "c", shot: "full shot", audioMode: "off", durationSec: 4, emotion: "calm", sceneContext: "At a launch.", venueName: "hall", actions: "Ava walks in." } as unknown as ShotSpec;
    const cast = [{ id: "ava", name: "Ava" }, { id: "ben", name: "Ben" }].map((c) => ({ ...c, pronoun: "she" as const, voiceLock: "", description: "" }));
    const text = panelPrompt({ description: "Ava walks in.", shot: spec, cast: cast as never, profiles: {}, plan: room, venueName: "hall" }).text;
    expect(text).toMatch(/Ben about 8\.5 m from the camera[^;.]*, head to toe about \d+% of the picture's height/);
    expect(text).toMatch(/Ava about 2\.5 m from the camera[^;.]*, from the head down past the bottom edge of the picture/);
    expect(text).toContain("Framing: full shot, but the bottom edge cuts Ava at the ankles");
    expect(text).toMatch(/the logo backdrop \([^)]*about \d+% of the picture's height\)/);
  });
});
