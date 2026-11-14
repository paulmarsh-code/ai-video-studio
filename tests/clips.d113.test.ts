// D113: clips from Kling Elements. Panels grouped into multi-shot clips; each clip binds characters,
// venue and fixed props as Elements and says, from the plan, places, shots, action, lines, voices.
import { describe, expect, it } from "vitest";
import { elementKey, groupClips, sceneClips, voiceShort, type ClipPanel } from "../src/lib/domain/clips";

const plan = {
  aspect: "9:16" as const, bounds: { minX: -5, maxX: 5, minY: 0, maxY: 10 }, views: [], lineOfAction: ["ava", "bo"] as [string, string],
  actors: [{ characterId: "ava", position: { x: 0.9, y: 5 } }, { characterId: "bo", position: { x: -0.9, y: 5 } }],
  furniture: [{ id: "t", name: "bar table", detail: "two candles", position: { x: 0, y: 5 }, radiusM: 0.35, heightM: 1.1 }],
  cameras: [{ id: "w", name: "Wide", preset: "wide" as const, position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 },
    { id: "o", name: "OTS", preset: "main-ots" as const, position: { x: -1.6, y: 4.6 }, lookAt: { x: 0.9, y: 5 }, fovDeg: 45 }],
};
const cast = [{ id: "ava", name: "Ava Stone", pronoun: "she" as const, voiceLock: "Warm Scottish woman, thirties. Quick and dry. Never shouts." }, { id: "bo", name: "Bo Lind", pronoun: "he" as const, voiceLock: "Low Swedish man." }];
const P = (order: number, sec: number, o: Partial<ClipPanel["spec"]>, dialogue: ClipPanel["dialogue"] = [], description = "They talk."): ClipPanel =>
  ({ order, durationSec: sec, description, dialogue, spec: { code: `P${order}`, visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], cameraId: "w", shot: "full shot", audioMode: "on", durationSec: sec, venueName: "v", ...o } as never });
const elements = {
  [elementKey.character("ava")]: { id: "111", name: "Ava" }, [elementKey.character("bo")]: { id: "222", name: "Bo" },
  [elementKey.venue("v1")]: { id: "333", name: "Roof bar" }, [elementKey.prop("bar table")]: { id: "444", name: "Table" },
};

describe("Clips from Kling Elements (D113)", () => {
  it("groups panels into clips of up to 15 s and 4 shots", () => {
    const g = groupClips([P(1, 4, {}), P(2, 5, {}), P(3, 5, {}), P(4, 3, {}), P(5, 2, {})]);
    expect(g.map((c) => c.map((p) => p.order))).toEqual([[1, 2, 3], [4, 5]]);
  });
  it("binds Elements, says places, each shot with its time and the speaker's exact line", () => {
    const panels = [P(1, 4, {}), P(2, 3, { cameraId: "o", shot: "medium close-up, over-the-shoulder shot", speakerId: "ava" }, [{ characterId: "ava", text: "You're late." }], "Ava turns to Bo.")];
    const [c] = sceneClips({ panels, cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Roof bar" }, crowd: "a few drinkers", elements });
    expect(c.prompt).toContain("In <<<333>>>: a few drinkers.");
    expect(c.prompt).toContain("Ava is <<<111>>>; Bo is <<<222>>>.");
    expect(c.prompt).toContain("stands <<<444>>>.");
    expect(c.prompt).not.toContain("two candles"); // the Element is the table's look
    expect(c.prompt).toContain("left to right as seen from the room: Bo, Ava");
    expect(c.prompt).toContain('Shot 2 (4–7 s), medium close-up over Bo\'s shoulder on Ava: Ava turns to Bo. Ava says: "You\'re late."');
    expect(c.webPrompt).toContain("Ava is @Ava");
    expect(c.seconds).toBe(7);
    expect(c.credits).toBe(70);
    expect(c.missing).toEqual([]);
  });
  it("says what has no Element, and keeps a voice short", () => {
    const [c] = sceneClips({ panels: [P(1, 4, {})], cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Roof bar" }, elements: {} });
    expect(c.missing).toContain("Ava Stone");
    expect(c.prompt).toContain("(two candles)");
    expect(voiceShort("One. Two two two two two two two. Three.", 12)).toBe("One");
  });
});

describe("Clip requests after the first full clip (D115)", () => {
  it("numbers lines said once each, keeps someone arriving short of the group, and keeps footsteps quiet", () => {
    const panels = [
      P(1, 4, { at: { ava: "arriving" } } as never, [], "Ava walks in."),
      P(2, 3, {}, [{ characterId: "ava", text: "Hello." }]),
      P(3, 3, { cameraId: "o", shot: "medium close-up, over-the-shoulder shot", speakerId: "ava" }, [{ characterId: "ava", text: "Well?" }]),
    ];
    const [c] = sceneClips({ panels, cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Roof bar" }, elements });
    expect(c.prompt).toContain('Line 1, Ava says: "Hello."');
    expect(c.prompt).toContain('Line 2, Ava says: "Well?"');
    expect(c.prompt).toContain("Each line is said once, in its own shot, word for word: 2 different lines in all.");
    expect(c.prompt).toContain("Ava has not reached the bar table yet: it is ahead of Ava, further into the room, and Ava walks towards it, never past.");
    expect(c.prompt).toContain("footsteps and movement quiet, never louder than speech");
  });
});

describe("Lines said with feeling (D116)", () => {
  it("a line carries its panel's feeling", () => {
    const p = { ...P(1, 4, {}, [{ characterId: "ava", text: "Well?" }]), emotion: "hopeful, expectant" };
    const [c] = sceneClips({ panels: [p], cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Roof bar" }, elements });
    expect(c.prompt).toContain('Ava says, hopeful, expectant, naturally, never flat: "Well?"');
  });
});
