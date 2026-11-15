// D113: clips from Kling Elements. Panels grouped into multi-shot clips; each clip binds characters,
// venue and fixed props as Elements and says, from the plan, places, shots, action, lines, voices.
import { describe, expect, it } from "vitest";
import { elementKey, groupClips, sceneClips, shotSeconds, voiceShort, type ClipPanel } from "../src/lib/domain/clips";

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
    expect(c.prompt).toContain("Bo and Ava stand at the bar table, each close enough to rest a hand on it.");
    expect(c.prompt).toContain("Shot 2 (2–4 s), medium close-up over Bo's shoulder on Ava, both of them in the picture: Bo's shoulder and the side of their head in the foreground: Ava turns to Bo.");
    expect(c.prompt).toContain("From the floor plan: Ava and Bo face each other across the bar table.");
    expect(c.webPrompt).toContain("Ava is @Ava");
    expect(c.seconds).toBe(4); // shots timed to need (D120)
    expect(c.credits).toBe(40);
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
    expect(c.prompt).toContain('Line 1, Ava says, naturally, never flat, in a spontaneous conversational rhythm, the face expressive but restrained, accurate lip-sync: "Hello."');
    expect(c.prompt).toContain('Line 2, Ava says, naturally, never flat, in a spontaneous conversational rhythm, the face expressive but restrained, accurate lip-sync: "Well?"');
    expect(c.prompt).toContain("Each line is said once, in its own shot, word for word: 2 different lines in all.");
    expect(c.prompt).toContain("Ava has not reached the bar table yet: it is ahead of Ava, further into the room, and Ava walks towards it, never past.");
    expect(c.prompt).toContain("footsteps and movement quiet, never louder than speech");
    expect(c.prompt).toContain("nobody smiles or softens unless the shot says so"); // D122
    expect(c.prompt).toContain("no music at all, it is added in the edit"); // D131
  });
});

describe("Lines said with feeling (D116)", () => {
  it("a line carries its panel's feeling", () => {
    const p = { ...P(1, 4, {}, [{ characterId: "ava", text: "Well?" }]), emotion: "hopeful, expectant" };
    const [c] = sceneClips({ panels: [p], cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Roof bar" }, elements });
    expect(c.prompt).toContain('Ava says, hopeful, expectant, naturally, never flat, in a spontaneous conversational rhythm, the face expressive but restrained, accurate lip-sync: "Well?"'); // D133
    expect(c.prompt).toContain("Only Ava has words anyone can make out; the guests' chatter stays a murmur. No repeated words, no extra speech."); // D133
    expect(c.prompt).toContain("Natural, subtle acting, no exaggerated gestures. Guests behind the group stay in soft focus."); // D133
  });
});

describe("One circle round the table, one of each (D118)", () => {
  it("says the order going round the table, not a row, and keeps everyone at it in every shot", () => {
    const four = {
      ...plan,
      actors: [{ characterId: "ava", position: { x: 0.7, y: 5 } }, { characterId: "bo", position: { x: -0.7, y: 5 } }, { characterId: "cy", position: { x: -0.4, y: 5.6 } }, { characterId: "di", position: { x: 0.4, y: 5.6 } }],
    };
    const c4 = [...cast, { id: "cy", name: "Cy Moss", pronoun: "he" as const }, { id: "di", name: "Di Roe", pronoun: "she" as const }];
    const vis = { visibleIds: ["ava", "bo", "cy", "di"], presentIds: ["ava", "bo", "cy", "di"] };
    const [c] = sceneClips({ panels: [P(1, 4, vis), P(2, 3, { ...vis, shot: "medium shot", speakerId: "bo" }, [{ characterId: "bo", text: "Go." }])], cast: c4 as never, plan: four as never, venue: { id: "v1", name: "Roof bar" }, elements });
    expect(c.prompt).toContain("in this order going round it: Bo, Cy, Di, Ava; the side of the bar table between Ava and Bo is open, nobody stands there.");
    expect(c.prompt).not.toContain("left to right as seen from the room");
    expect(c.prompt).toContain("Ava, Bo, Cy and Di each appear once in the picture, never twice; no guest looks or dresses like any of them.");
    expect(c.prompt).toContain("whoever is out of frame is still standing in their place at the bar table.");
    expect(c.prompt).toContain("Nobody else stands at the bar table or touches it; other guests stay at their own tables, a few metres away."); // D132
  });
});

describe("Things handed over or put down stay where the shot leaves them (D132)", () => {
  it("lets a shot hand something over or drop it on the table, instead of freezing both", () => {
    const [c] = sceneClips({ panels: [P(1, 4, {}, [], "Ava hands Bo the letter; he drops it in the ice bucket.")], cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Roof bar" }, elements });
    expect(c.prompt).toContain("anything they carry stays in the same hand until a shot says it is handed over or put down, then stays where that shot leaves it.");
    expect(c.prompt).toContain("stay exactly the same throughout, except what a shot puts on, takes off or drops in; that stays as the shot leaves it.");
    expect(c.prompt).not.toContain("anything they carry throughout");
  });
});

describe("Storyboard pictures stage each shot (D119)", () => {
  it("lists each shot's picture in order and points the shot at it; looks stay with the Elements", () => {
    const panels = [{ ...P(1, 4, {}), imageAssetId: "a1" }, P(2, 3, {}), { ...P(3, 3, {}), imageAssetId: "a3" }];
    const [c] = sceneClips({ panels, cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Roof bar" }, elements });
    expect(c.pictures).toEqual([{ shot: 1, panel: 1, assetId: "a1" }, { shot: 3, panel: 3, assetId: "a3" }]);
    expect(c.prompt).toContain("图片1, 图片2 are the storyboard pictures for shots 1, 3 in turn: each shot keeps its picture's camera angle, framing, background and who stands where. Faces, clothes, the bar table and the venue come from their Elements, not from the pictures.");
    expect(c.prompt).toContain("Shot 1 (0–2 s), full shot, as in 图片1:");
    expect(c.prompt).toContain("Shot 3 (4–6 s), full shot, as in 图片2:");
    expect(c.prompt).toMatch(/Shot 2 \(2–4 s\), full shot: /);
    expect(c.webPrompt).toContain("Shot 1 (0–2 s), full shot, as in picture 1:");
    expect(c.webPrompt).toContain("\nPicture 1, picture 2 are the storyboard pictures");
  });
});

describe("Shots timed to what they need inside a clip (D120)", () => {
  it("a silent beat 2 s, a line its speaking time and half a second, never more than its panel", () => {
    expect(shotSeconds(P(9, 3, {}, [], "Jade clenches her jaw."))).toBe(2);
    expect(shotSeconds(P(10, 4, {}, [{ characterId: "bo", text: "I'm bored now — just go now, run along." }]))).toBe(4);
    expect(shotSeconds(P(11, 3, {}, [{ characterId: "ava", text: "Unbelievable" }]))).toBe(2);
    expect(shotSeconds(P(12, 2, {}, [{ characterId: "ava", text: "one two three four five six seven eight nine ten eleven" }]))).toBe(2);
    const [c] = sceneClips({ panels: [P(9, 3, {}), P(10, 4, {}, [{ characterId: "bo", text: "I'm bored now — just go now, run along." }]), P(11, 3, {}, [{ characterId: "ava", text: "Unbelievable" }])], cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Roof bar" }, elements });
    expect(c.seconds).toBe(8);
    expect(c.prompt).toContain("Shot 3 (6–8 s)");
  });
  it("a clip of one shot keeps its panel's time", () => {
    const [c] = sceneClips({ panels: [P(1, 5, {})], cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Roof bar" }, elements });
    expect(c.seconds).toBe(5);
  });
});

describe("Keeping a finished take (D130)", () => {
  it("gives the kept panels no clip, and opens the next clip on the take's chosen frame", () => {
    const panels = [1, 2, 3, 4].map((n) => ({ ...P(n, 3, {}), imageAssetId: `a${n}` }));
    const clips = sceneClips({ panels, cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Roof bar" }, elements, kept: [{ from: 1, to: 2, frameAssetId: "frame" }] });
    expect(clips.flatMap((c) => c.panels)).toEqual([3, 4]);
    const [c] = clips;
    expect(c.continues).toEqual({ from: 1, to: 2 });
    expect(c.pictures).toEqual([{ shot: 1, panel: 3, assetId: "frame", continuity: true }, { shot: 2, panel: 4, assetId: "a4" }]);
    expect(c.prompt).toContain("图片1 is the last moment of the clip before this one, already made: this clip follows straight on from it, a moment later");
    expect(c.prompt).toContain("Where 图片1 and anything else here differ, 图片1 is right.");
    expect(c.prompt).toContain("图片2 is the storyboard picture for shot 2");
    expect(c.prompt).toMatch(/Shot 1 \([^)]*\), [^:]*following straight on from 图片1:/);
  });
  it("never runs a clip across a kept take", () => {
    const panels = [1, 2, 3, 4].map((n) => P(n, 2, {}));
    const clips = sceneClips({ panels, cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Roof bar" }, elements, kept: [{ from: 2, to: 3 }] });
    expect(clips.map((c) => c.panels)).toEqual([[1], [4]]);
  });
});
