// D177 voice in the Element, D178 the venue's walls in every clip, D179 coat on / coat off looks.
import { describe, expect, it } from "vitest";
import { WEARS_OUTER, elementKey, outerOf, sceneClips, withoutOuter, type ClipPanel } from "../src/lib/domain/clips";
import { lookPrompt } from "../src/components/SceneLooks";

const plan = {
  aspect: "9:16" as const, bounds: { minX: -5, maxX: 5, minY: 0, maxY: 10 }, views: [], lineOfAction: ["ava", "bo"] as [string, string],
  actors: [{ characterId: "ava", position: { x: 1, y: 5 } }, { characterId: "bo", position: { x: -1, y: 5 } }], furniture: [], cameras: [],
};
const cast = [{ id: "ava", name: "Ava Stone", pronoun: "she" as const, voiceLock: "Warm London voice." }, { id: "bo", name: "Bo Lind", pronoun: "he" as const, voiceLock: "Low Scottish voice." }];
const P = (order: number, description: string, dialogue: ClipPanel["dialogue"] = []): ClipPanel =>
  ({ order, durationSec: 3, description, dialogue, imageAssetId: `pic${order}`, spec: { code: `P${order}`, visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], cameraId: "cam", shot: "wide", audioMode: "on", durationSec: 3, venueName: "v" } as never });
const base = { [elementKey.venue("v1")]: { id: "3", name: "Café" }, [elementKey.voice("ava")]: { id: "va", name: "Ava voice" }, [elementKey.voice("bo")]: { id: "vb", name: "Bo voice" } };
const input = (elements: object, extra: object = {}, panels = [P(1, "They sit at the table.", [{ characterId: "ava", text: "Hello." }]), P(2, "Bo nods.")]) =>
  ({ panels, cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Café" }, elements: { ...base, ...elements } as never, frames: { "1-2": { start: "s", startApproved: true } } as never, ...extra });

describe("The voice comes with the character's Element (D177)", () => {
  it("sends the voice file even when the Element was made with a voice (D183)", () => {
    const [c] = sceneClips(input({ [elementKey.character("ava")]: { id: "1", name: "Ava", voiceAssetId: "va" }, [elementKey.character("bo")]: { id: "2", name: "Bo", voiceAssetId: "vb" } }));
    expect(c.audios.map((a) => a.characterId)).toEqual(["ava"]);
    expect(c.voiced).toEqual([]);
    expect(c.prompt).toContain("Ava: exactly the voice in 音频1");
    expect(c.prompt).not.toContain("comes with <<<1>>>");
    expect(c.prompt).toContain("never anyone else's voice");
  });
  it("falls back to the voice file when the Element was made before the voice (or with another one)", () => {
    const [c] = sceneClips(input({ [elementKey.character("ava")]: { id: "1", name: "Ava", voiceAssetId: "old" }, [elementKey.character("bo")]: { id: "2", name: "Bo" } }));
    expect(c.audios.map((a) => a.characterId)).toEqual(["ava"]);
    expect(c.prompt).toContain("Ava: exactly the voice in 音频1");
  });
});

describe("The venue's walls go with every clip (D178)", () => {
  it("adds each wall as a labelled picture after the start frame, before the end frame", () => {
    const [c] = sceneClips(input({ [elementKey.character("ava")]: { id: "1", name: "Ava" }, [elementKey.character("bo")]: { id: "2", name: "Bo" } }, { walls: [{ name: "front windows", assetId: "w1" }, { name: "brick wall", assetId: "w2" }], frames: { "1-2": { start: "s", startApproved: true, end: "e" } } }));
    expect(c.pictures.map((p) => p.assetId)).toEqual(["s", "w1", "w2", "e"]);
    expect(c.prompt).toContain("图片2 to 图片3 show <<<3>>> towards each of its walls: 图片2 front windows; 图片3 brick wall.");
    expect(c.prompt).toContain("whatever is behind the people is the matching wall in these pictures");
    expect(c.prompt).toContain("图片4 is the last frame");
  });
});

describe("Coat on, coat off (D179)", () => {
  const els = { [elementKey.character("ava")]: { id: "1", name: "Ava coat on" }, [elementKey.character("bo")]: { id: "2", name: "Bo" } };
  it("uses the coat-off Element indoors", () => {
    const [c] = sceneClips(input(els, { coatOff: { ava: { id: "9", name: "Ava indoors" } } }));
    expect(c.elements.find((e) => e.key === elementKey.character("ava"))?.id).toBe("9");
    expect(c.prompt).toContain("Ava is <<<9>>>");
  });
  it("keeps the coat on when what happens has them arriving, leaving or putting it on", () => {
    const [c] = sceneClips(input(els, { coatOff: { ava: { id: "9", name: "Ava indoors" } } }, [P(1, "Ava stands, takes her coat off the chair and puts it on.", [{ characterId: "ava", text: "Bye." }]), P(2, "Bo waves.")]));
    expect(c.prompt).toContain("Ava is <<<1>>>");
  });
  it("finds the outer layers in the clothes words", () => {
    const w = "black ribbed polo-neck, camel A-line mini skirt, black opaque tights, black ankle boots, gold hoops, short bottle-green wool coat, burgundy leather shoulder bag";
    expect(outerOf(w)).toEqual(["short bottle-green wool coat", "burgundy leather shoulder bag"]);
    expect(withoutOuter(w)).toBe("black ribbed polo-neck, camel A-line mini skirt, black opaque tights, black ankle boots, gold hoops");
    expect(lookPrompt("indoors", w)).toContain("They have taken off short bottle-green wool coat and burgundy leather shoulder bag");
    expect(WEARS_OUTER.test("They sit and talk.")).toBe(false);
    expect(WEARS_OUTER.test("Samantha arrives, shaking off the rain.")).toBe(true);
  });
});

describe("Wearing words (D179)", () => {
  it("knows putting a coat on from hanging it on a chair", () => {
    expect(WEARS_OUTER.test("Ava takes her coat off the chair and puts it on.")).toBe(true);
    expect(WEARS_OUTER.test("Ava takes her coat off and puts it on the back of her chair.")).toBe(false);
    expect(WEARS_OUTER.test("Ava hangs her coat over the chair.")).toBe(false);
  });
});

describe("Linked Elements keep their voice (D177)", () => {
  it("setKlingElement keeps voiceAssetId", async () => {
    const src = (await import("node:fs")).readFileSync("src/lib/studioRepo.ts", "utf8");
    expect(src).toMatch(/voiceAssetId: el\.voiceAssetId/);
  });
});

describe("Two speakers may share a clip again (D184, D180 undone)", () => {
  it("keeps panels together by time, whoever speaks", () => {
    const panels = [P(1, "They sit.", [{ characterId: "ava", text: "Hello." }]), P(2, "Bo frowns."), P(3, "Bo answers.", [{ characterId: "bo", text: "Hi." }]), P(4, "Ava again.", [{ characterId: "ava", text: "Well." }])];
    const clips = sceneClips({ panels, cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Café" }, elements: base as never });
    expect(clips.map((c) => c.panels)).toEqual([[1, 2, 3, 4]]);
  });
});

describe("Only the walls behind the people (D181)", () => {
  it("picks the wall beyond each person as seen from the other", async () => {
    const { wallsBehind } = await import("../src/lib/domain/clips");
    const p2 = { ...plan, views: [{ name: "windows", directionDeg: 0 }, { name: "bookshelf", directionDeg: 90 }, { name: "brick", directionDeg: 180 }, { name: "counter", directionDeg: 270 }] };
    // Ava at x=1 (towards the windows), Bo at x=-1 (towards the brick wall).
    expect(wallsBehind(p2 as never, ["ava", "bo"]).sort()).toEqual(["brick", "windows"]);
    const [c] = sceneClips(input({ [elementKey.character("ava")]: { id: "1", name: "Ava" }, [elementKey.character("bo")]: { id: "2", name: "Bo" } }, { plan: p2, walls: [{ name: "windows", assetId: "w1" }, { name: "bookshelf", assetId: "w2" }, { name: "brick", assetId: "w3" }, { name: "counter", assetId: "w4" }] }));
    expect(c.pictures.map((p) => p.assetId)).toEqual(["s", "w1", "w3"]);
  });
});

describe("Coats off said outright, and drinks get drunk (D182)", () => {
  it("names who has their coat off and keeps the season for the guests", () => {
    const [c] = sceneClips(input({ [elementKey.character("ava")]: { id: "1", name: "Ava" }, [elementKey.character("bo")]: { id: "2", name: "Bo" } }, { coatOff: { ava: { id: "9", name: "Ava in" }, bo: { id: "8", name: "Bo in" } }, when: "a wet autumn afternoon" }));
    expect(c.prompt).toContain("Ava and Bo have taken off their coats: in every shot, including any shot they first appear in, they wear exactly what their Elements show");
    expect(c.prompt).toContain("what the guests and passers-by wear suit it");
  });
  it("asks for sips and a falling level when there are drinks", () => {
    const p3 = { ...plan, furniture: [{ id: "t", name: "small table", position: { x: 0, y: 5 }, radiusM: 0.3, detail: "Ava's coffee - ceramic cup; Bo's tea - mug" }] };
    const panels = [P(1, "They sit.", [{ characterId: "ava", text: "Hello there, how have you been keeping?" }]), P(2, "Bo listens.")];
    const [c] = sceneClips(input({ [elementKey.character("ava")]: { id: "1", name: "Ava" }, [elementKey.character("bo")]: { id: "2", name: "Bo" } }, { plan: p3 }, panels));
    expect(c.prompt).toContain("The drinks (Ava's coffee, Bo's tea) get drunk: at least one sip in this clip");
    expect(c.prompt).toContain("the level never goes back up");
    expect(c.prompt).toContain("Nobody drinks or eats while saying a line");
  });
});

describe("No wall pictures from the scene (D184)", () => {
  it("buildSceneClips no longer passes walls", async () => {
    const src = (await import("node:fs")).readFileSync("src/lib/sceneClips.ts", "utf8");
    expect(src).not.toMatch(/coatOff, walls \}/);
  });
});
