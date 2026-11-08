// Demonstration project: Paid On Time, Episode 1 Scene 1 (launch party).
// Editable illustrative data only — not approved production assets.
// Layout follows Blocking Plan v4: screen wall at the far end (+y), bar along the left (−x),
// windows and entrance at the near end. Chase always frame-left, Jade always frame-right.

import type { CastMember, GeometryPlanData } from "../domain/types";

export const CAST: CastMember[] = [
  {
    id: "jade",
    name: "Jade",
    pronoun: "she",
    voiceLock:
      "a confident, accomplished British content creator. Natural British English, warm professional enthusiasm, spontaneous conversational rhythm and expressive but restrained facial movements.",
  },
  {
    id: "chase",
    name: "Chase",
    pronoun: "he",
    voiceLock:
      "a polished, self-satisfied British marketing executive in his forties. Smooth, unhurried British English, quietly condescending, minimal facial movement.",
  },
  {
    id: "marcus",
    name: "Marcus",
    pronoun: "he",
    voiceLock: "a friendly junior marketing colleague in his late twenties. Relaxed London English.",
  },
  {
    id: "nina",
    name: "Nina",
    pronoun: "she",
    voiceLock: "an upbeat events coordinator in her thirties. Bright, quick British English.",
  },
];

export const SCENE1_PLAN: GeometryPlanData = {
  bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
  furniture: [{ id: "table", name: "cocktail table", position: { x: 0.6, y: 5.1 }, radiusM: 0.4 }],
  actors: [
    { characterId: "chase", position: { x: -0.6, y: 4.4 } },
    { characterId: "marcus", position: { x: -0.2, y: 4.55 } },
    { characterId: "nina", position: { x: 0.2, y: 4.7 } },
    { characterId: "jade", position: { x: 1.5, y: 5.4 } },
  ],
  cameras: [
    { id: "main", name: "Main OTS", preset: "main-ots", position: { x: -1.4, y: 3.0 }, lookAt: { x: 0.3, y: 5.0 } },
    { id: "reverse", name: "Reverse OTS", preset: "reverse-ots", position: { x: 2.9, y: 5.3 }, lookAt: { x: -0.3, y: 4.5 } },
    { id: "jade-cu", name: "Jade close-up", preset: "single-cu", position: { x: 0.4, y: 3.6 }, lookAt: { x: 1.5, y: 5.4 } },
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

export const ALL_IDS = CAST.map((c) => c.id);
