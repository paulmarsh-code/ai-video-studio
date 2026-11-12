// D68: seated framing said as image 1 shows it; the table judged against the group; a group
// drawn closer than image 1 named for what it is. Any scene; made-up names.
import { describe, expect, it } from "vitest";
import { framedSize, planForShot } from "../src/lib/domain/geometry";
import { panelPrompt } from "../src/lib/domain/imagePrompts";
import { judgePicture, type MeasuredPlan, type PictureExpectation } from "../src/lib/domain/pictureCheck";
import type { ShotSpec } from "../src/lib/domain/types";
import { numberPeople } from "../src/lib/domain/peopleDetect";

const plan = {
  aspect: "9:16" as const,
  bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
  actors: [{ characterId: "ava", position: { x: 1, y: 5.3 } }, { characterId: "bo", position: { x: -1, y: 5.3 } }],
  furniture: [{ id: "t", name: "small round table", position: { x: 0, y: 5.3 }, radiusM: 0.35, heightM: 0.75 }],
  cameras: [
    { id: "two", name: "Two-shot", preset: "two-shot" as const, position: { x: 0, y: 0.8 }, lookAt: { x: 0, y: 5.3 }, fovDeg: 60, size: "ms" as const },
    { id: "ots", name: "OTS", preset: "main-ots" as const, position: { x: -2.2, y: 5 }, lookAt: { x: 1, y: 5.4 }, fovDeg: 45, size: "mcu" as const },
  ],
  views: [{ name: "skyline", directionDeg: 90 }],
  lineOfAction: ["ava", "bo"] as [string, string],
};
const seated = { ava: { pose: "sitting" as const, by: "you" as const }, bo: { pose: "sitting" as const, by: "you" as const } };
const cast = [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }].map((c) => ({ ...c, pronoun: "she" as const, voiceLock: "", description: "" }));
const request = (cameraId: string, shotWords: string) => panelPrompt({ description: "They talk.", cast: cast as never, profiles: {}, plan, venueName: "roof", blockingHref: "/api/blocking/x",
  shot: { code: "P1", visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], subjectId: "ava", cameraId, shot: shotWords, audioMode: "off", durationSec: 4, venueName: "roof", posture: seated } as unknown as ShotSpec });

describe("Seated framing as image 1 shows it (D68)", () => {
  it("reads a seated person's framing from their own height", () => {
    const sp = planForShot(plan, { posture: seated, visibleIds: ["ava", "bo"] });
    const cam = sp.cameras[0];
    expect(framedSize(sp, cam, { x: 1, y: 5.3 }, 4.5, { seated: true })?.size).toBe("ls");
    expect(framedSize(sp, { ...cam, fovDeg: 40 }, { x: 1, y: 5.3 }, 4.5, { seated: true })?.size).toBe("fs");
    expect(framedSize(sp, { ...cam, fovDeg: 20 }, { x: 1, y: 5.3 }, 4.5, { seated: true })?.size).toBe("cowboy");
  });
  it("says 'long shot' when a two-shot named medium shows two seated people whole and small", () => {
    const p = request("two", "Medium shot, two-shot");
    expect(p.text).toMatch(/Shot: long shot, two-shot\./);
    expect(p.text).not.toMatch(/from the waist up/);
  });
  it("leaves an over-the-shoulder shot's words alone", () => {
    expect(request("ots", "Medium close-up, over-the-shoulder shot").text).toMatch(/Shot: Medium close-up, over-the-shoulder shot\./);
  });
});

describe("The table judged against the group (D68)", () => {
  const e = {
    order: ["Bo", "Ava"], crowd: "none", props: [],
    figures: [{ name: "Bo", x: 0.16, headY: 0.48, feetY: 0.77, standing: false }, { name: "Ava", x: 0.84, headY: 0.48, feetY: 0.77, standing: false }],
    propSpots: [{ name: "small round table", kind: "dining table", x: 0.5, baseY: 0.77, among: true }],
  } as unknown as PictureExpectation;
  const reply = JSON.stringify({ left_to_right: ["Bo", "Ava"], clothes: [], props: [], props_seen: [], background_people: "none" });
  const measuredPlan = (feet: number, tableFoot: number): MeasuredPlan => ({
    people: numberPeople([{ x0: 0.05, x1: 0.27, y0: 0.47, y1: feet, score: 0.9 }, { x0: 0.73, x1: 0.95, y0: 0.47, y1: feet, score: 0.9 }]),
    reply: JSON.stringify({ people: [{ name: "Bo", box: 1 }, { name: "Ava", box: 2 }] }), aspect: 1024 / 1536,
    things: [{ kind: "dining table", x0: 0.4, x1: 0.6, y0: 0.6, y1: tableFoot, score: 0.8 }],
  });
  it("records a group drawn closer without failing it, and doesn't call its table moved (D71)", () => {
    const c = judgePicture(e, reply, measuredPlan(0.91, 0.93));
    expect(c.pass).toBe(true);
    expect(c.groupFeetShift).toBeCloseTo(0.14, 2);
  });
  it("still reports a table moved away from a group that is where it should be", () => {
    const c = judgePicture(e, reply, measuredPlan(0.78, 0.97));
    expect(c.problems.join(" ")).toMatch(/The small round table is well in front of where image 1 puts it/);
    expect(c.groupFeetShift).toBeCloseTo(0.01, 2);
  });
  it("passes a group and table where image 1 has them", () => {
    expect(judgePicture(e, reply, measuredPlan(0.78, 0.79)).pass).toBe(true);
  });
});
