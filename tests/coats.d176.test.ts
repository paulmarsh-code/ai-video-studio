// D176: coats, jackets, hats, scarves and bags stay on or off as the clip starts.
import { describe, expect, it } from "vitest";
import { elementKey, sceneClips, type ClipPanel } from "../src/lib/domain/clips";

const plan = {
  aspect: "9:16" as const, bounds: { minX: -5, maxX: 5, minY: 0, maxY: 10 }, views: [], lineOfAction: ["ava", "bo"] as [string, string],
  actors: [{ characterId: "ava", position: { x: 1, y: 5 } }, { characterId: "bo", position: { x: -1, y: 5 } }],
  furniture: [], cameras: [],
};
const cast = [{ id: "ava", name: "Ava Stone", pronoun: "she" as const }, { id: "bo", name: "Bo Lind", pronoun: "he" as const }];
const P = (order: number, description: string): ClipPanel =>
  ({ order, durationSec: 4, description, dialogue: [], imageAssetId: `pic${order}`, spec: { code: `P${order}`, visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], cameraId: "cam", shot: "wide", audioMode: "on", durationSec: 4, venueName: "v" } as never });
const elements = { [elementKey.character("ava")]: { id: "1", name: "Ava" }, [elementKey.character("bo")]: { id: "2", name: "Bo" }, [elementKey.venue("v1")]: { id: "3", name: "Café" } };
const input = (frames: object) => ({ panels: [P(1, "They sit at the table."), P(2, "Ava stands, takes her coat off the chair and puts it on.")], cast: cast as never, plan: plan as never, venue: { id: "v1", name: "Café" }, elements, frames: frames as never });

describe("Coats stay on or off as the clip starts (D176)", () => {
  it("with a start frame, coats stay as they are in it unless what happens moves them", () => {
    const [c] = sceneClips(input({ "1-2": { start: "s", startApproved: true } }));
    expect(c.prompt).toContain("Coats, jackets, hats, scarves and bags stay as they are in 图片1, worn or off (over a chair, on a hook, on the floor), in every shot and from every angle; they only come off or go on when what happens says so");
    expect(c.prompt).toContain("Ava stands, takes her coat off the chair and puts it on.");
  });
  it("without a start frame, coats stay as the clip starts", () => {
    const [c] = sceneClips(input({}));
    expect(c.prompt).toContain("Coats, jackets, hats, scarves and bags stay on or off as the clip starts");
  });
});
