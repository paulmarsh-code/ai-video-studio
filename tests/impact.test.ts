// Occlusion (R-OCCLUSION) and floor-plan impact warnings.
import { describe, expect, it } from "vitest";
import { occlusions, readCamera } from "../src/lib/domain/geometry";
import { planImpact } from "../src/lib/domain/impact";
import type { GeometryPlanData, ShotSpec } from "../src/lib/domain/types";
import { validateShot } from "../src/lib/domain/validator";
import { ALL_IDS, CAST } from "../src/lib/demo/paidOnTime";

// Plan v7 (matches the approved takes).
const V7: GeometryPlanData = {
  bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
  furniture: [{ id: "table", name: "cocktail table", position: { x: 0.5, y: 4.82 }, radiusM: 0.4 }],
  actors: [
    { characterId: "chase", position: { x: 0.0, y: 4.4 } },
    { characterId: "marcus", position: { x: 0.9, y: 3.8 } },
    { characterId: "nina", position: { x: 1.0, y: 4.4 } },
    { characterId: "jade", position: { x: 1.0, y: 5.24 } },
  ],
  cameras: [
    { id: "main", name: "Main OTS", preset: "main-ots", position: { x: -0.3, y: 3.36 }, lookAt: { x: 0.7, y: 5.5 } },
    { id: "reverse", name: "Reverse OTS", preset: "reverse-ots", position: { x: 2.01, y: 5.44 }, lookAt: { x: 0.0, y: 4.4 } },
    { id: "jade-cu", name: "Jade close-up", preset: "single-cu", position: { x: 0.55, y: 3.75 }, lookAt: { x: 1.0, y: 5.24 } },
  ],
  views: [
    { name: "screen wall", directionDeg: 90 },
    { name: "bar", directionDeg: 180 },
    { name: "windows and entrance", directionDeg: 270 },
    { name: "lounge seating", directionDeg: 0 },
  ],
  lineOfAction: ["chase", "jade"],
  referenceCameraId: "main",
};

const shot = (over: Partial<ShotSpec>): ShotSpec => ({
  code: "T", venueName: "venue", sceneContext: "", presentIds: ALL_IDS, visibleIds: [], excludedIds: [],
  actions: "", durationSec: 4, audioMode: "native-on", ...over,
});

const C2B = shot({ code: "C2b", visibleIds: ["chase", "jade", "marcus", "nina"], speakerId: "chase", dialogue: "We'll let you know.", cameraId: "reverse", durationSec: 3 });
const C2A = shot({ code: "C2a", visibleIds: ["chase", "jade"], speakerId: "jade", dialogue: "Hi everyone.", cameraId: "main", durationSec: 3 });

describe("Occlusion (R-OCCLUSION)", () => {
  it("v7 reverse: Chase's face is clear", () => {
    const r = readCamera(V7, V7.cameras[1]);
    expect(occlusions(r, C2B.visibleIds).filter((o) => o.characterId === "chase" && o.level === "face")).toEqual([]);
  });
  it("moving Marcus between the reverse camera and Chase hides Chase", () => {
    const moved = { ...V7, actors: V7.actors.map((a) => (a.characterId === "marcus" ? { ...a, position: { x: 1.0, y: 4.9 } } : a)) };
    const f = validateShot(C2B, CAST, moved);
    expect(f.map((x) => x.code)).toContain("SUBJECT_HIDDEN");
  });
  it("excluded characters block nothing (they are framed out)", () => {
    const moved = { ...V7, actors: V7.actors.map((a) => (a.characterId === "marcus" ? { ...a, position: { x: 1.0, y: 4.9 } } : a)) };
    const onlyTwo = { ...C2B, visibleIds: ["chase", "jade"], excludedIds: ["marcus", "nina"] };
    expect(validateShot(onlyTwo, CAST, moved).map((x) => x.code)).not.toContain("SUBJECT_HIDDEN");
  });
});

describe("Impact warnings", () => {
  const shots = [{ id: "1", code: "C2a", spec: C2A }, { id: "2", code: "C2b", spec: C2B, approved: true }];
  it("no change, no impact", () => {
    expect(planImpact(V7, V7, shots, CAST)).toEqual([]);
  });
  it("moving Jade beside Chase takes her out of the Main OTS frame", () => {
    const moved = { ...V7, actors: V7.actors.map((a) => (a.characterId === "jade" ? { ...a, position: { x: 1.3, y: 4.4 } } : a)) };
    const c2a = planImpact(V7, moved, shots, CAST).find((i) => i.shotCode === "C2a")!;
    expect(c2a.changes.map((c) => c.code)).toContain("VISIBLE_OUT_OF_VIEW");
  });
  it("turning the Main OTS towards the right wall changes the background behind Jade", () => {
    const moved = { ...V7, cameras: V7.cameras.map((c) => (c.id === "main" ? { ...c, lookAt: { x: 2.5, y: 4.4 } } : c)) };
    const c2a = planImpact(V7, moved, shots, CAST).find((i) => i.shotCode === "C2a")!;
    expect(c2a.changes.map((c) => c.code)).toContain("BACKGROUND_CHANGED");
  });
  it("a change to a shot with an approved take is flagged as needing a re-shoot", () => {
    const moved = { ...V7, actors: V7.actors.map((a) => (a.characterId === "marcus" ? { ...a, position: { x: 1.0, y: 4.9 } } : a)) };
    const c2b = planImpact(V7, moved, shots, CAST).find((i) => i.shotCode === "C2b")!;
    expect(c2b.changes[0].code).toBe("APPROVED_TAKE_AFFECTED");
    expect(c2b.changes.map((c) => c.code)).toContain("SUBJECT_HIDDEN");
  });
  it("moving the reverse camera across the line is reported", () => {
    const moved = { ...V7, cameras: V7.cameras.map((c) => (c.id === "reverse" ? { ...c, position: { x: 0.2, y: 6.2 } } : c)) };
    const c2b = planImpact(V7, moved, shots, CAST).find((i) => i.shotCode === "C2b")!;
    expect(c2b.changes.map((c) => c.code)).toContain("CROSSES_LINE_OF_ACTION");
  });
});
