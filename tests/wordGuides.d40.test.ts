// Every example in the ⓘ word guides (D40) is understood by the part of the app that reads it,
// so the help never promises words the app doesn't recognise.
import { describe, expect, it } from "vitest";
import { WORD_GUIDES, type GuideCheck } from "../src/lib/domain/wordGuides";
import { changeFromWords } from "../src/lib/domain/changeWords";
import { blockingFromWords, posturesFromWords, startPose, EXIT_RE } from "../src/lib/domain/panelWords";
import { addMovementMarks, propHeight, propKind, propWidth } from "../src/lib/domain/story";
import { gazeFor } from "../src/lib/domain/gaze";
import { gestureDetail } from "../src/lib/domain/gestures";
import { povFor, verticalFor } from "../src/lib/domain/vertical";
import { levelsFromWords } from "../src/lib/domain/levels";
import { guessRoom } from "../src/lib/domain/room";
import { carriedItems, lightingOf } from "../src/lib/domain/imagePrompts";
import type { GeometryPlanData, PlanCamera, ShotSpec } from "../src/lib/domain/types";

const people = [{ id: "ava", name: "Ava" }, { id: "ben", name: "Ben" }];
const plan: GeometryPlanData = {
  aspect: "9:16", bounds: { minX: -4.5, maxX: 4.5, minY: 0, maxY: 10 },
  actors: [{ characterId: "ava", position: { x: -1.2, y: 5 } }, { characterId: "ben", position: { x: 1.2, y: 5.2 } }],
  furniture: [
    { id: "t", name: "cocktail table", position: { x: 0, y: 5.1 }, radiusM: 0.4 }, { id: "sofa", name: "sofa", position: { x: -3, y: 8 }, radiusM: 0.9 },
    { id: "bed", name: "bed", position: { x: 3, y: 8.5 }, radiusM: 1 }, { id: "glass", name: "glass", position: { x: 0.2, y: 5.1 }, radiusM: 0.05 }, { id: "phone", name: "phone", position: { x: -0.2, y: 5.1 }, radiusM: 0.05 },
  ],
  cameras: [], lineOfAction: ["ava", "ben"],
  views: [{ name: "window", directionDeg: 90 }, { name: "bar", directionDeg: 180 }, { name: "door", directionDeg: 270 }, { name: "lounge", directionDeg: 0 }],
};
const cam: PlanCamera = { id: "c", name: "Wide", preset: "wide", position: { x: 0, y: 1 }, lookAt: { x: 0, y: 5 }, fovDeg: 60 };
const subject = (t: string) => (/^Ben\b|\bBen\s+(?:picks|puts|crosses|walks|leaves|heads|lies|sits|kneels|turns|looks)/.test(t) ? "ben" : "ava");
const shot = (visible = ["ava", "ben"]) => ({ visibleIds: visible, presentIds: visible, excludedIds: [] } as unknown as ShotSpec);
const b = plan.bounds!;

const CHECKS: Record<GuideCheck, (t: string) => boolean> = {
  change: (t) => { const r = changeFromWords(t, plan, cam, people); return r.understood.length > 0 && r.unclear.length === 0; },
  move: (t) => Object.keys(blockingFromWords(plan, [{ action: t, subjectId: subject(t), visibleIds: ["ava", "ben"] }], people)[0]).length > 0,
  arrive: (t) => { const r = addMovementMarks(plan, [{ action: t, subjectId: "ava" }]); return !!(r.at[0] || r.from[0]); },
  posture: (t) => posturesFromWords(plan, [{ action: t, subjectId: subject(t), visibleIds: ["ava", "ben"] }], people, { pose: "sitting" })[0][subject(t)]?.by === "app",
  look: (t) => {
    if (/\bturns?\b/.test(t)) return Object.keys(blockingFromWords(plan, [{ action: t, subjectId: subject(t), visibleIds: ["ava", "ben"] }], people)[0]).length > 0;
    // A third person on the line, so Ava's eyes only go to Ben when the words say so.
    const g = gazeFor({ shot: shot(["ava", "ben", "cal"]), description: t, people: [...people, { id: "cal", name: "Cal" }], line: ["ava", "cal"] });
    const at = (id: string) => g.find((x) => x.id === id)?.at ?? "";
    if (/exchange/.test(t)) return at("ava") === "Ben" && at("ben") === "Ava";
    if (/window/.test(t)) return /window/.test(at("ben"));
    return at("ava") === "Ben";
  },
  gesture: (t) => gestureDetail(t).length > 0,
  camera: (t) => !!verticalFor(t) || !!povFor(t, people, "ava"),
  "setting-pose": (t) => !!startPose(t, plan),
  "setting-level": (t) => levelsFromWords(t, "", b, { x: 0, y: 5 }).length > 0,
  "prop-size": (t) => propHeight(t) !== 0.75 || propWidth(t, "table") !== 0.7,
  "prop-kind": (t) => propKind(t) !== "table",
  "venue-room": (t) => guessRoom(t).label !== "a medium-large room",
  "venue-light": (t) => lightingOf(t).length > 0,
  "venue-level": (t) => levelsFromWords("", t, b, { x: 0, y: 5 }).length > 0,
  "venue-exit": (t) => EXIT_RE.test(t),
  held: (t) => carriedItems({ wardrobe: t } as never).length > 0,
};

describe("Word guides only list words the app understands (D40)", () => {
  for (const [name, g] of Object.entries(WORD_GUIDES)) {
    for (const grp of g.groups) {
      for (const ex of grp.examples) {
        it(`${name} › ${grp.heading} › “${ex}”`, () => { expect(CHECKS[grp.check](ex)).toBe(true); });
      }
    }
  }
});

describe("The checks catch words the app doesn't read (D40)", () => {
  const nope: [GuideCheck, string][] = [
    ["change", "make it more dramatic"], ["move", "Ava laughs"], ["arrive", "Ava laughs"], ["posture", "Ava laughs"],
    ["look", "Ava laughs"], ["gesture", "Ava laughs"], ["camera", "Ava laughs"], ["setting-pose", "standing around the table"],
    ["setting-level", "around the table"], ["prop-size", "white cloth"], ["prop-kind", "round table"], ["venue-room", "Ember"],
    ["venue-light", "an evening launch party"], ["venue-level", "a big room"], ["venue-exit", "bar"], ["held", "a tan satchel"],
  ];
  for (const [k, t] of nope) it(`${k} rejects “${t}”`, () => { expect(CHECKS[k](t)).toBe(false); });
});
