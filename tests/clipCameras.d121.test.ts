// D121: at most two camera angles in a clip. Clip 3 cut from a wide, to the reverse, to a wide from
// a third spot, and looked odd (Paul: "2 or 1 should be maximum").
import { describe, expect, it } from "vitest";
import { groupByTime, limitClipAngles, sameAngle } from "../src/lib/domain/clipCameras";
import { groupClips, type ClipPanel } from "../src/lib/domain/clips";

const cams = [
  { id: "w", name: "Wide", preset: "wide" as const, position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 },
  { id: "close", name: "Group", preset: "two-shot" as const, position: { x: 0, y: 3 }, lookAt: { x: 0, y: 5 }, fovDeg: 50 },
  { id: "rev", name: "Reverse", preset: "main-ots" as const, position: { x: 0.3, y: 7.5 }, lookAt: { x: 0.6, y: 5 }, fovDeg: 45 },
  { id: "w3", name: "Wide from the side", preset: "wide" as const, position: { x: -4, y: 4 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 },
];
const plan = {
  aspect: "9:16" as const, bounds: { minX: -6, maxX: 6, minY: 0, maxY: 10 }, views: [],
  actors: [{ characterId: "ava", position: { x: 0.7, y: 5 } }, { characterId: "bo", position: { x: -0.7, y: 5 } }],
  furniture: [], cameras: cams,
};
const spec = (cameraId: string, o: object = {}) => ({ code: "x", visibleIds: ["ava", "bo"], excludedIds: [], presentIds: ["ava", "bo"], cameraId, audioMode: "on", durationSec: 3, venueName: "v", ...o }) as never;

describe("Two camera angles at most in a clip (D121)", () => {
  it("a wide and a closer shot along the same line are one angle (a punch-in)", () => {
    expect(sameAngle(cams[0], cams[1])).toBe(true);
    expect(sameAngle(cams[0], cams[2])).toBe(false);
    // 30° off but 1.6 m to the side (clip 3's last wide): a new camera.
    expect(sameAngle({ position: { x: 0.5, y: 6.26 }, lookAt: { x: 0.5, y: 10.6 } }, { position: { x: 2.1, y: 7.64 }, lookAt: { x: 0.2, y: 10.9 } })).toBe(false);
  });
  it("a shot that would bring a third angle starts the next clip", () => {
    const g = groupByTime(["w", "rev", "w3", "w"], () => 3, (id) => cams.find((c) => c.id === id)!);
    expect(g).toEqual([["w", "rev"], ["w3", "w"]]);
    const P = (order: number, cameraId: string): ClipPanel => ({ order, durationSec: 3, description: "", dialogue: [], spec: spec(cameraId) });
    expect(groupClips([P(1, "w"), P(2, "close"), P(3, "rev")], plan as never).map((c) => c.map((p) => p.order))).toEqual([[1, 2, 3]]);
    expect(groupClips([P(1, "w"), P(2, "rev"), P(3, "w3")], plan as never).map((c) => c.map((p) => p.order))).toEqual([[1, 2], [3]]);
  });
  it("a wide shot that would be a third angle goes back to the clip's wide, at its own size; a closer one keeps its own", () => {
    const shots = [
      { id: "a", spec: spec("w"), camera: cams[0] },
      { id: "b", spec: spec("rev", { speakerId: "bo" }), camera: cams[2] },
      { id: "c", spec: spec("w3"), camera: { ...cams[3], size: "ls" as const } },
    ];
    const r = limitClipAngles(plan as never, shots);
    expect(r.replace.get("c")?.position).toEqual(cams[0].position);
    expect(r.replace.get("c")?.size).toBe("ls");
    const closer = limitClipAngles(plan as never, [shots[0], shots[1], { id: "d", spec: spec("x", { speakerId: "ava" }), camera: { ...cams[2], id: "ots2", preset: "main-ots" as const, position: { x: -4, y: 4.5 }, lookAt: { x: 0.7, y: 5 } } }]);
    expect(closer.replace.size).toBe(0);
  });
});
