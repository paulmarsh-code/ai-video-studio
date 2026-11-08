// Seeds the Paid On Time demonstration project (spec §"Demo data").
// Illustrative, editable data — not approved production assets. Dialogue marked
// "illustrative" stands in for the real approved lines until they are entered.

import { randomUUID } from "node:crypto";
import { CAST, SCENE1_PLAN } from "../lib/demo/paidOnTime";
import type { ShotSpec } from "../lib/domain/types";
import type { DB } from "./client";
import * as t from "./schema";

const uid = () => randomUUID();
const VENUE = "GLOWVANE launch-party venue";
const ALL = CAST.map((c) => c.id);

interface PanelSeed {
  code: string;
  description: string;
  emotion: string;
  durationSec: number;
  speaker?: string;
  line?: string;
  shot: Omit<ShotSpec, "code" | "venueName" | "presentIds" | "durationSec" | "speakerId" | "dialogue">;
}

const PANELS: PanelSeed[] = [
  {
    code: "C1", description: "Jade walks in from the screen-wall end towards the group at the cocktail table.",
    emotion: "confident, upbeat", durationSec: 5,
    shot: { subjectId: "jade", sceneContext: "Jade arrives at the GLOWVANE launch party and walks towards the group at the cocktail table.", visibleIds: ["jade", "chase", "marcus", "nina"], excludedIds: [], actions: "Jade walks towards the table holding a champagne glass, smiling.", cameraId: "main", audioMode: "off", intensity: "natural" },
  },
  {
    code: "C2a", description: "Jade joins the group and asks about the campaign.", emotion: "warm, professional",
    durationSec: 6, speaker: "jade", line: "Hi everyone, I'm Jade. So which partners are you lining up for the launch campaign?",
    shot: { sceneContext: "Jade has just joined Chase and his colleagues at the cocktail table.", visibleIds: ["chase", "jade"], excludedIds: ["marcus", "nina"], actions: "Jade places her glass on the table in front of her.", cameraId: "main", distance: "conversational", audioMode: "native-on", intensity: "natural" },
  },
  {
    code: "C2b", description: "Chase brushes her off.", emotion: "smug", durationSec: 3,
    speaker: "chase", line: "We'll let you know.",
    shot: { sceneContext: "Chase answers Jade without much interest.", visibleIds: ["chase", "jade"], excludedIds: ["marcus", "nina"], actions: "Chase barely looks at her.", cameraId: "reverse", distance: "conversational", audioMode: "native-on", intensity: "subtle" },
  },
  {
    code: "C4a", description: "Jade, angry: Unbelievable.", emotion: "angry", durationSec: 3,
    speaker: "jade", line: "Unbelievable.",
    shot: { sceneContext: "Jade reacts to Chase brushing her off.", visibleIds: ["jade"], excludedIds: ["chase", "marcus", "nina"], actions: "Jade stares at Chase in disbelief.", cameraId: "jade-cu", audioMode: "native-on", intensity: "natural" },
  },
  {
    code: "C4b", description: "Chase dismisses her.", emotion: "dismissive", durationSec: 4,
    speaker: "chase", line: "You're lucky we booked you at all.",
    shot: { sceneContext: "Chase puts Jade down in front of his colleagues.", visibleIds: ["chase", "jade"], excludedIds: ["marcus", "nina"], actions: "Chase moves his hand from his chest towards her, palm facing his chest, a dismissive gesture.", cameraId: "reverse", distance: "conversational", audioMode: "native-on", intensity: "natural" },
  },
  {
    code: "C4c", description: "Jade sets her glass down, makes a rude gesture at Chase and walks off. Marcus and Nina are shocked.",
    emotion: "furious, then defiant", durationSec: 5,
    shot: { subjectId: "jade", sceneContext: "Jade leaves the conversation.", visibleIds: ["jade", "marcus", "nina"], excludedIds: ["chase"], actions: "Jade sets her glass down, makes a rude one-finger gesture towards Chase, and walks away towards the screen wall. Marcus and Nina look utterly shocked.", cameraId: "main", audioMode: "off", intensity: "big" },
  },
];

export function seedIfEmpty(db: DB): boolean {
  if (db.select().from(t.projects).limit(1).all().length) return false;
  seedDemo(db);
  return true;
}

export function seedDemo(db: DB): string {
  const projectId = uid();
  db.insert(t.projects).values({
    id: projectId, code: "POT", name: "Paid On Time", type: "series", demo: true,
    brief: { concept: "A creator chases late payment from a dismissive brand team.", episodes: 4, episodeSec: 30, aspect: "9:16", style: "photorealistic", note: "Illustrative demo data" },
  }).run();

  for (const c of CAST) {
    const charId = uid();
    db.insert(t.characters).values({ id: charId, projectId, slug: c.id, name: c.name, pronoun: c.pronoun }).run();
    db.insert(t.characterVersions).values({ id: uid(), characterId: charId, version: 1, status: "approved", voiceLock: c.voiceLock }).run();
  }

  const venueId = uid();
  db.insert(t.venues).values({ id: venueId, projectId, name: VENUE, status: "approved", views: SCENE1_PLAN.views, description: "Launch party: screen wall at the far end, bar along the left, windows and entrance at the near end." }).run();

  const sceneId = uid();
  db.insert(t.scenes).values({ id: sceneId, projectId, venueId, episode: 1, number: 1, title: "Jade joins the group and walks off" }).run();
  db.insert(t.plans).values({ id: uid(), sceneId, name: "Blocking plan v4", version: 1, data: SCENE1_PLAN }).run();

  PANELS.forEach((p, i) => {
    const panelId = uid();
    db.insert(t.panels).values({
      id: panelId, sceneId, code: p.code, order: i + 1, description: p.description, emotion: p.emotion,
      durationSec: p.durationSec, status: "approved",
      dialogue: p.speaker ? [{ characterId: p.speaker, text: p.line }] : [],
    }).run();
    const spec: ShotSpec = {
      ...p.shot, code: `EP01_S01_${p.code}`, venueName: VENUE, presentIds: ALL,
      speakerId: p.speaker, dialogue: p.line, durationSec: p.durationSec, emotion: p.emotion,
    };
    db.insert(t.shots).values({ id: uid(), sceneId, panelId, code: spec.code, spec }).run();
  });
  return projectId;
}
