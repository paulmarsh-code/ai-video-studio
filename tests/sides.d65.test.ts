// D65: sides said outright for two, the bag kept when seated or side-on, and the approved
// picture's guests not frozen. Any scene; made-up names.
import { describe, expect, it } from "vitest";
import { panelPrompt } from "../src/lib/domain/imagePrompts";
import type { ShotSpec } from "../src/lib/domain/types";

const plan = {
  aspect: "9:16" as const,
  bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
  actors: [{ characterId: "ava", position: { x: 0.8, y: 5 } }, { characterId: "bo", position: { x: -0.8, y: 5 } }],
  furniture: [{ id: "t", name: "small round table", position: { x: 0, y: 5 }, radiusM: 0.35, heightM: 0.75 }],
  cameras: [{ id: "c", name: "Two-shot", preset: "two-shot" as const, position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 }],
  views: [{ name: "skyline", directionDeg: 90 }],
  lineOfAction: ["ava", "bo"] as [string, string],
};
const cast = [{ id: "ava", name: "Ava" }, { id: "bo", name: "Bo" }].map((c) => ({ ...c, pronoun: "she" as const, voiceLock: "", description: "" }));
const profiles = { ava: { appearance: "", wardrobe: "Cream jacket. Carries a tan leather satchel in her right hand.", refs: { front: "af" } }, bo: { appearance: "", wardrobe: "Lilac jumpsuit.", refs: { front: "bf" } } };
const seat = { pose: "sitting" as const, by: "you" as const };
const draw = (posture: Record<string, typeof seat> | undefined, continuity?: boolean, crowd = "a few guests") => panelPrompt({
  description: "They talk.", cast: cast as never, profiles: profiles as never, plan, venueName: "roof", blockingHref: "/api/blocking/x",
  shot: { code: "P1", visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], cameraId: "c", shot: "medium shot", audioMode: "off", durationSec: 4, venueName: "roof", crowd, ...(posture ? { posture } : {}) } as unknown as ShotSpec,
  ...(continuity ? { continuity: { assetId: "z", label: "approved scene picture (panel 3)" } } : {}),
});

describe("Two people: each side said outright (D65)", () => {
  it("names who is on the left and who on the right, in both requests", () => {
    const p = draw(undefined);
    const [left, right] = p.text.match(/from left to right: (\w+) and (\w+)\./)!.slice(1);
    expect(p.text).toContain(`${left} is on the left of the picture and ${right} on the right, as in image 1.`);
    expect(p.short).toContain(`${left} is on the left of the picture and ${right} on the right, as in image 1.`);
  });
});

describe("A bag stays with its owner when seated or side-on (D65)", () => {
  it("seated: on her lap or the seat beside her, never in a hand", () => {
    const p = draw({ ava: seat, bo: seat });
    expect(p.text).toMatch(/Carried: Ava's tan leather satchel is with her, on her lap or on the seat beside her\./);
    expect(p.short).toMatch(/Carried: Ava's satchel on her lap or the seat beside her\./);
    expect(p.text).not.toMatch(/satchel is in her right hand/);
  });
});

describe("The approved picture: each keeps their drink; guests move on (D65)", () => {
  it("asks for the same drink in front of each character, and guests not frozen in place", () => {
    const p = draw({ ava: seat, bo: seat }, true);
    expect(p.short).toMatch(/each character with the same drink and things in front of them/);
    expect(p.text).toMatch(/Each character keeps the same drink and things in front of them\./);
    for (const t of [p.text, p.short!]) expect(t).toMatch(/A few seconds have passed: background people have shifted a little and anyone walking is somewhere else; never copy their exact places\./);
  });
  it("says nothing about guests moving when there is no crowd or no approved picture", () => {
    expect(draw({ ava: seat, bo: seat }, true, "").text).not.toMatch(/A few seconds have passed/);
    expect(draw({ ava: seat, bo: seat }, false).text).not.toMatch(/A few seconds have passed/);
  });
});
