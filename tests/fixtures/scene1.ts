// Shared Scene 1 fixture: plan v7 people (no cameras) and the storyboard shots.
import type { GeometryPlanData, ShotSpec } from "../../src/lib/domain/types";
import { ALL_IDS, CAST } from "../../src/lib/demo/paidOnTime";

export const name = (id: string) => CAST.find((c) => c.id === id)?.name ?? id;
export const PLAN: GeometryPlanData = {
  bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
  furniture: [{ id: "table", name: "cocktail table", position: { x: 0.5, y: 4.82 }, radiusM: 0.4 }],
  actors: [
    { characterId: "chase", position: { x: 0.0, y: 4.4 } },
    { characterId: "marcus", position: { x: 0.9, y: 3.8 } },
    { characterId: "nina", position: { x: 1.0, y: 4.4 } },
    { characterId: "jade", position: { x: 1.0, y: 5.24 } },
  ],
  cameras: [],
  views: [
    { name: "screen wall", directionDeg: 90 },
    { name: "bar", directionDeg: 180 },
    { name: "windows and entrance", directionDeg: 270 },
    { name: "lounge seating", directionDeg: 0 },
  ],
  lineOfAction: ["chase", "jade"],
};
export const S = (code: string, o: Partial<ShotSpec>, description = "") => ({
  id: code, code, description,
  spec: { code, venueName: "v", sceneContext: "", presentIds: ALL_IDS, visibleIds: [], excludedIds: [], actions: "", durationSec: 4, audioMode: "native-on", ...o } as ShotSpec,
});
export const SCENE = [
  S("C1", { subjectId: "jade", visibleIds: ALL_IDS, actions: "Jade walks towards the table.", audioMode: "off", durationSec: 5 }, "Jade walks in"),
  S("C2a", { speakerId: "jade", dialogue: "Hi everyone, I'm Jade. So which partners are you lining up for the launch campaign?", visibleIds: ["chase", "jade"], excludedIds: ["marcus", "nina"], emotion: "warm", durationSec: 6 }),
  S("C2b", { speakerId: "chase", dialogue: "We'll let you know.", visibleIds: ["chase", "jade"], excludedIds: ["marcus", "nina"], emotion: "smug", durationSec: 3 }),
  S("C3", { subjectId: "marcus", visibleIds: ["marcus", "nina"], excludedIds: ["chase", "jade"], actions: "Marcus and Nina exchange an awkward look.", audioMode: "off", durationSec: 2 }),
  S("C4a", { speakerId: "jade", dialogue: "Unbelievable.", visibleIds: ["jade"], excludedIds: ["chase", "marcus", "nina"], emotion: "angry", durationSec: 3 }),
  S("C4b", { speakerId: "chase", dialogue: "You're lucky we booked you at all.", visibleIds: ["chase", "jade"], excludedIds: ["marcus", "nina"], emotion: "dismissive", durationSec: 4 }),
  S("C4c", { subjectId: "jade", visibleIds: ["jade", "marcus", "nina"], excludedIds: ["chase"], actions: "Jade walks away. Marcus and Nina look shocked.", audioMode: "off", durationSec: 5 }, "Jade walks off"),
];

