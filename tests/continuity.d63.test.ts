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

describe("An approved picture from the same camera (D69)", () => {
  const same = (cameraId: string, from: string) => panelPrompt({ description: "They talk.", shot: spec(cameraId), cast: cast as never, profiles: {}, plan, venueName: "roof", blockingHref: "/api/blocking/x", continuity: { assetId: "z", label: "approved scene picture (panel 3)", view: "skyline", cameraId: from } });
  it("keeps everything behind the characters exactly as in it", () => {
    const p = same("front", "front");
    expect(p.short).toMatch(/is from this same camera: keep the clothes, the furniture, what stands on the tables, the light and everything built behind the characters exactly as in it \(walls, railings, counters, fittings, lights and the view, the same shapes, sizes and thickness\).*not its background people, who move on/);
    expect(p.text).toMatch(/It is from this same camera: everything built behind the characters stays exactly as in it .*but not its background people/);
    expect(p.short).not.toMatch(/never copy the approved picture's framing/);
  });
  it("from another camera, gives looks only, as before", () => {
    const p = same("front", "ots");
    expect(p.short).toMatch(/Image 1 decides where everyone and everything is, how big and how high, and what is behind them/);
    expect(p.short).not.toMatch(/same camera/);
  });
});

describe("Background guests move with the time between panels (D73)", () => {
  const timed = (secondsApart?: number) => panelPrompt({ description: "They talk.", shot: spec("front"), cast: cast as never, profiles: {}, plan, venueName: "roof", blockingHref: "/api/blocking/x", continuity: { assetId: "z", label: "approved scene picture (panel 3)", view: "skyline", cameraId: "front", ...(secondsApart !== undefined ? { secondsApart } : {}) } });
  it("says how long before the approved picture this is, and how far a walker has gone", () => {
    // Two seconds: 2.6 m, about half this picture's width among the background people.
    const t = timed(2);
    for (const x of [t.text, t.short!]) expect(x).toMatch(/This moment is about 2 seconds before the approved picture, and the background people have moved in that time: .*anyone walking is about 3 metres from where they are in it, or out of the picture\. Never copy the background people's places from it\./);
    expect(timed(-2).short).toMatch(/about 2 seconds after the approved picture/);
    expect(timed().short).toMatch(/A few seconds have passed/);
  });
});

describe("A walker who has crossed the whole picture since is put at an edge (D76)", () => {
  const timed = (secondsApart: number, cameraId = "front", from = "front") => panelPrompt({ description: "They talk.", shot: spec(cameraId), cast: cast as never, profiles: {}, plan, venueName: "roof", blockingHref: "/api/blocking/x", continuity: { assetId: "z", label: "approved scene picture (panel 1)", view: "skyline", cameraId: from, secondsApart } });
  it("7 seconds on, from the same camera: whoever walked has left; anyone walking now is at an edge", () => {
    // The two-shot sees about 4.5 m across where background people stand; 7 s is about 9 m.
    const t = timed(-7);
    for (const x of [t.text, t.short!]) {
      expect(x).toMatch(/This moment is about 7 seconds after the approved picture, .*anyone walking has gone about 9 metres, more than the whole width of this picture, so whoever was walking in it has walked out of the picture by now\./);
      expect(x).toMatch(/If the description has someone walking, draw them only at the left or right edge of the picture, just coming in or going out and facing the way they walk; never in the middle or between the characters\./);
    }
  });
  it("works the same either way in time, and says 'well over' for long gaps", () => {
    expect(timed(7).short).toMatch(/7 seconds before the approved picture, .*has walked out of the picture by now/);
    expect(timed(-40).short).toMatch(/has gone well over 15 metres/);
  });
  it("not from another camera, whose walker may be anywhere in this picture", () => {
    const t = timed(-7, "front", "ots");
    expect(t.short).not.toMatch(/left or right edge/);
    expect(t.short).toMatch(/anyone walking is about 9 metres from where they are in it/);
  });
  it("not with no background people described", () => {
    const quiet = panelPrompt({ description: "They talk.", shot: { ...spec("front"), crowd: "" } as ShotSpec, cast: cast as never, profiles: {}, plan, venueName: "roof", blockingHref: "/api/blocking/x", continuity: { assetId: "z", label: "approved scene picture (panel 1)", view: "skyline", cameraId: "front", secondsApart: -7 } });
    for (const x of [quiet.text, quiet.short!]) expect(x).not.toMatch(/anyone walking|left or right edge/);
  });
});

describe("How far a walker crosses the picture (D76)", () => {
  it("is walking pace over the picture's width where background people stand", async () => {
    const { walkAcross, horizontalFov } = await import("../src/lib/domain/geometry");
    const cam = plan.cameras[0];
    // Characters 4 m from the lens; background people about 3 m behind them, at 7 m.
    const width = 2 * 7 * Math.tan((horizontalFov(plan, cam) * Math.PI) / 360);
    expect(walkAcross(plan, cam, 7)).toBeCloseTo((1.3 * 7) / width, 5);
    expect(walkAcross(plan, cam, -7)).toBeCloseTo(walkAcross(plan, cam, 7), 5);
    expect(walkAcross(plan, cam, 2)).toBeLessThan(1);
  });
});

describe("The background's one walker, gone from this picture, is left out of its words (D77)", () => {
  const SERVED = "about 10 guests mingling with drinks, a few seated at other tables, a server in black moving between groups";
  const timed = (secondsApart: number, from = "front") => panelPrompt({ description: "They talk.", shot: { ...spec("front"), crowd: SERVED } as ShotSpec, cast: cast as never, profiles: {}, plan, venueName: "roof", blockingHref: "/api/blocking/x", continuity: { assetId: "z", label: "approved scene picture (panel 1)", view: "skyline", cameraId: from, secondsApart } });
  it("7 seconds on from the same camera: no server in the background words", () => {
    const t = timed(-7);
    for (const x of [t.text, t.short!]) {
      expect(x).not.toMatch(/server/);
      expect(x).toMatch(/Background: about 10 guests mingling with drinks, a few seated at other tables\./);
      expect(x).toMatch(/whoever was walking in it has walked out of the picture by now\. Never copy/);
      expect(x).not.toMatch(/left or right edge/);
    }
  });
  it("kept when the picture is from another camera, or the gap is short", () => {
    expect(timed(-7, "ots").short).toMatch(/a server in black moving between groups/);
    expect(timed(-2).short).toMatch(/a server in black moving between groups/);
  });
});
