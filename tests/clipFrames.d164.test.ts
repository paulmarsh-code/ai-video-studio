// D164: clips open on an approved start frame and Kling chooses the shots.
import { describe, expect, it } from "vitest";
import { elementKey, sceneClips, type ClipPanel } from "../src/lib/domain/clips";
import { framePrompt } from "../src/lib/sceneClips";

const plan = {
  aspect: "9:16" as const, bounds: { minX: -5, maxX: 5, minY: 0, maxY: 10 }, views: [], lineOfAction: ["ava", "bo"] as [string, string],
  actors: [{ characterId: "ava", position: { x: 3, y: 5 } }, { characterId: "bo", position: { x: 0, y: 5 } }],
  furniture: [{ id: "spot", name: "bar counter", position: { x: -1, y: 5 }, radiusM: 1 }],
  cameras: [],
};
const cast = [{ id: "ava", name: "Ava Stone", pronoun: "she" as const }, { id: "bo", name: "Bo Lind", pronoun: "he" as const }];
const P = (order: number, sec: number, dialogue: ClipPanel["dialogue"] = [], description = "They wait.", where?: Record<string, string>): ClipPanel =>
  ({ order, durationSec: sec, description, dialogue, imageAssetId: `pic${order}`, spec: { code: `P${order}`, visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], cameraId: "cam", shot: "wide", audioMode: "on", durationSec: sec, venueName: "v", ...(where ? { where } : {}) } as never });
const elements = { [elementKey.character("ava")]: { id: "1", name: "Ava" }, [elementKey.character("bo")]: { id: "2", name: "Bo" }, [elementKey.venue("v1")]: { id: "3", name: "Bar" }, [elementKey.voice("bo")]: { id: "voice-bo", name: "Bo voice" } };
const base = (frames: Record<string, object>, kept?: object[]) => ({ panels: [P(1, 4, [], "Bo leans on the counter, phone to his ear.", { bo: "at the bar counter", ava: "behind Bo among guests" }), P(2, 6, [{ characterId: "bo", text: "Let 'em wait." }], "Bo laughs into the phone.")], cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Roof bar" }, elements, crowd: "about 20 guests", frames: frames as never, ...(kept ? { kept: kept as never } : {}) });

describe("Start frames and Kling's own shots (D164)", () => {
  it("no storyboard pictures or shot list; the start frame is picture 1 and the clip opens on it", () => {
    const [c] = sceneClips(base({ "1-2": { start: "startpic", startApproved: true } }));
    expect(c.pictures).toEqual([{ shot: 1, panel: 1, assetId: "startpic", continuity: true }]);
    expect(c.start).toEqual({ assetId: "startpic", from: "chosen", approved: true });
    expect(c.prompt).toContain("图片1 is the first frame of this clip: the clip opens exactly on it");
    expect(c.prompt).toContain("Choose the camera shots yourself");
    expect(c.prompt).toContain("Where everyone is at the start: Ava behind Bo among guests; Bo at the bar counter.");
    expect(c.prompt).toMatch(/\n0–\d+ s: Bo leans on the counter/);
    expect(c.prompt).toContain('Bo says, naturally, never flat, in a spontaneous conversational rhythm, accurate lip-sync: "Let \'em wait."');
    expect(c.prompt).toContain("exactly the voice in 音频1");
    expect(c.prompt).not.toMatch(/Shot \d|storyboard/);
  });
  it("without a start frame of its own, the clip before's last frame is offered, unapproved", () => {
    const [c] = sceneClips({ ...base({}), panels: [P(3, 4), P(4, 5)], kept: [{ from: 1, to: 2, frameAssetId: "lastframe" }] as never });
    expect(c.start).toEqual({ assetId: "lastframe", from: "previous clip", approved: false });
    expect(c.prompt).toContain("the last moment of the clip before it");
  });
  it("an end frame is the last picture and the clip ends on it", () => {
    const [c] = sceneClips(base({ "1-2": { start: "s", startApproved: true, end: "e" } }));
    expect(c.pictures.map((x) => x.assetId)).toEqual(["s", "e"]);
    expect(c.prompt).toContain("图片2 is the last frame: the clip ends exactly on it");
  });
  it("a start frame's words put guests between people, so nobody stands alone in the open", () => {
    const p = framePrompt({ which: "start", venue: "Roof bar", crowd: "about 20 guests", aspect: "9:16", people: [{ name: "Bo", where: "at the bar counter" }, { name: "Ava", where: "behind Bo among guests" }], props: [{ name: "phone", detail: "black smartphone" }], moment: "Bo leans on the counter" });
    expect(p).toContain("Bo, at the bar counter; Ava, behind Bo among guests");
    expect(p).toContain("nobody stands alone on open floor");
    expect(p).toContain("9:16 portrait");
  });
});

describe("Positions in the user's words (D165)", () => {
  const note = "Jade stands close enough to hear Chase's call but hidden from him, with a couple of guests between them; Chase leans facing the bar, his back to her.";
  it("goes into the clip request instead of the panels' place words (D167)", () => {
    const [c] = sceneClips({ ...base({ "1-2": { start: "s", startApproved: true } }), positionsNote: note });
    expect(c.prompt).toContain(`Where everyone is: ${note.replace(/\.$/, "")}.`);
    expect(c.prompt).not.toContain("behind Bo among guests");
    expect(c.prompt).not.toContain("Where everyone is at the start:");
  });
  it("goes into the start frame's words, with facing and hiding as said, not posed for the camera (D167)", () => {
    const p = framePrompt({ which: "start", positions: note, venue: "Roof bar", crowd: "about 20 guests", aspect: "9:16", people: [{ name: "Bo", where: "at the bar counter" }], props: [], moment: "Bo talks on the phone" });
    expect(p).toContain(`Where everyone is: ${note.replace(/\.$/, "")}.`);
    expect(p).not.toContain("Bo, at the bar counter");
    expect(p).toContain("Everyone faces where the words say, not the camera");
  });
});
