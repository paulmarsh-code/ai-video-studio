// D148–D150, from Paul's clip 2 (panels 9–12): the walk away cut short, eyes wandering after a line,
// and an older look of the room taken from storyboard pictures.
import { describe, expect, it } from "vitest";
import { elementKey, exitSeconds, sceneClips, shotSeconds, type ClipPanel } from "../src/lib/domain/clips";

const plan = {
  aspect: "9:16" as const, bounds: { minX: -5, maxX: 5, minY: 0, maxY: 10 }, views: [], lineOfAction: ["ava", "bo"] as [string, string],
  actors: [{ characterId: "ava", position: { x: 0.9, y: 5 } }, { characterId: "bo", position: { x: -0.9, y: 5 } }],
  furniture: [{ id: "t", name: "bar table", position: { x: 0, y: 5 }, radiusM: 0.35, heightM: 1.1 }],
  cameras: [{ id: "w", name: "Wide", preset: "wide" as const, position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 }],
};
const cast = [{ id: "ava", name: "Ava Stone", pronoun: "she" as const }, { id: "bo", name: "Bo Lind", pronoun: "he" as const }];
const P = (order: number, sec: number, dialogue: ClipPanel["dialogue"] = [], description = "They talk."): ClipPanel =>
  ({ order, durationSec: sec, description, dialogue, imageAssetId: `a${order}`, spec: { code: `P${order}`, visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], cameraId: "w", shot: "long shot", audioMode: "on", durationSec: sec, venueName: "v" } as never });
const elements = { [elementKey.character("ava")]: { id: "1", name: "Ava" }, [elementKey.character("bo")]: { id: "2", name: "Bo" }, [elementKey.venue("v1")]: { id: "3", name: "Bar" } };
const input = (panels: ClipPanel[], kept?: never) => ({ panels, cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Roof bar" }, elements, ...(kept ? { kept } : {}) });

describe("Walking off is seen in full (D148)", () => {
  it("gives a walk off two seconds more, past the panel's own time, and says it is seen", () => {
    expect(exitSeconds("Jade scoffs and turns away to walk off before she says anything worse")).toBe(2);
    expect(exitSeconds("Bo storms out")).toBe(2);
    expect(exitSeconds("Ava walks towards the bar")).toBe(0);
    const off = P(2, 3, [{ characterId: "ava", text: "Unbelievable" }], "Ava scoffs and walks away.");
    expect(shotSeconds(off)).toBe(4);
    const [c] = sceneClips(input([P(1, 3, [{ characterId: "bo", text: "Go on then." }]), off]));
    expect(c.prompt).toMatch(/Shot 2 \(\d+–\d+ s\)[^\n]*"Unbelievable"\. The walk away is seen in full: still walking away, in the picture, when the shot ends\./);
  });
  it("never makes a clip longer than 15 s", () => {
    const long = [1, 2, 3, 4].map((n) => P(n, 5, [{ characterId: "ava", text: "One two three four five six seven eight nine." }], "Ava takes it, glances at it, and walks off."));
    const [c] = sceneClips(input(long));
    expect(c.seconds).toBeLessThanOrEqual(15);
  });
});

describe("Eyes on the conversation (D149)", () => {
  it("has the speaker keep looking at the person spoken to after the line", () => {
    const [c] = sceneClips(input([P(1, 3, [{ characterId: "bo", text: "You're wrong." }])]));
    expect(c.prompt).toContain("Whoever speaks looks at the person they are speaking to and keeps looking at them after the line; the others watch the speaker. Nobody glances round at the others or stares blankly away unless the shot says so.");
  });
});
