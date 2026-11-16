// D138: how each line is delivered, written by the app, changed by the user, used by the clips.
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/client";
import { seedDemo } from "../src/db/seed";
import * as repo from "../src/lib/repo";
import { deliveryPrompt, parseDeliveries } from "../src/lib/domain/delivery";
import { setDelivery, writeDeliveries } from "../src/lib/deliveries";
import { elementKey, sceneClips, type ClipPanel } from "../src/lib/domain/clips";

describe("How each line is delivered (D138)", () => {
  it("asks for who they are in the moment, how it comes out, the face and one action, as JSON", () => {
    const p = deliveryPrompt({ story: "Ava asks Bo for money he owes.", characters: [{ name: "Ava" }, { name: "Bo" }],
      panels: [{ order: 2, speaker: "Ava", line: "You owe me.", emotion: "angry" }], around: [{ order: 1, description: "Ava walks up." }, { order: 2, description: "Ava steps in.", speaker: "Ava", line: "You owe me." }] });
    expect(p).toContain('2. Ava: "You owe me." (feeling: angry)');
    expect(p).toMatch(/who they are in this moment[^]*\n2\. how the words come out[^]*\n3\. what the face does[^]*\n4\. one small physical action/);
    expect(p).toContain("Don't repeat or change the words of the line");
    expect(parseDeliveries('Sure: [{"panel": 2, "delivery": " Ava, owed and done waiting:  clipped, level. "}]').get(2)).toBe("Ava, owed and done waiting: clipped, level.");
    expect(parseDeliveries("no json").size).toBe(0);
  });
  it("writes the missing ones, keeps yours, and the clip request carries it", async () => {
    const db = await openDb(":memory:");
    const projectId = seedDemo(db);
    const sceneId = repo.listScenes(db, projectId)[0].id;
    const spoken = repo.getScene(db, sceneId)!.panels.filter((p) => (p.dialogue as unknown[]).length);
    setDelivery(db, spoken[0].id, "Mine: quiet and sure.");
    let asked = "";
    const provider = { id: "t", label: "t", describe: async (prompt: string) => { asked = prompt; return JSON.stringify(spoken.slice(1).map((p) => ({ panel: p.order, delivery: `written for ${p.order}` }))); } };
    const r = await writeDeliveries(db, sceneId, provider);
    expect(r.asked).toBe(spoken.length - 1);
    expect(asked).not.toContain(`${spoken[0].order}. Jade:`);
    const after = repo.getScene(db, sceneId)!.panels;
    const del = (id: string) => (after.find((p) => p.id === id)!.dialogue as { delivery?: string }[])[0].delivery;
    expect(del(spoken[0].id)).toBe("Mine: quiet and sure.");
    expect(del(spoken[1].id)).toBe(`written for ${spoken[1].order}`);
    // In the clip request, before the line.
    const plan = { aspect: "9:16" as const, bounds: { minX: -5, maxX: 5, minY: 0, maxY: 10 }, views: [], actors: [{ characterId: "ava", position: { x: 0, y: 5 } }], furniture: [], cameras: [{ id: "w", name: "Wide", preset: "wide" as const, position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 }] };
    const panel: ClipPanel = { order: 1, durationSec: 4, description: "Ava speaks.", emotion: "angry", dialogue: [{ characterId: "ava", text: "You owe me.", delivery: "owed and done waiting; clipped and level; eyes fixed on him; a half step closer" }], spec: { code: "P1", visibleIds: ["ava"], excludedIds: [], presentIds: ["ava"], cameraId: "w", shot: "medium shot", audioMode: "on", durationSec: 4, venueName: "v" } as never };
    const [c] = sceneClips({ panels: [panel], cast: [{ id: "ava", name: "Ava Stone", pronoun: "she", voiceLock: "" }] as never, plan: plan as never, venue: { id: "v1", name: "Bar" }, elements: { [elementKey.character("ava")]: { id: "1", name: "Ava" } } });
    expect(c.prompt).toContain('Ava: owed and done waiting; clipped and level; eyes fixed on him; a half step closer. Ava says, angry, naturally, never flat');
  });
});
