// Prompt Composer (Stage 7) — the proven Kling web-app template, built from structured data.
// It never rewrites approved dialogue and never names characters excluded from the shot.

import { describeFrame, PRESET_TEXT, readCamera } from "./geometry";
import { capitalise, joinNames, stripQuotes } from "./text";
import {
  KLING_OMNI_PRESET,
  type CastMember,
  type GeometryPlanData,
  type ProviderPreset,
  type ShotSpec,
} from "./types";

export interface ComposedPrompt {
  text: string;
  sections: Record<string, string>;
  settings: {
    model: string;
    resolution: string;
    durationSec: number;
    nativeAudio: "on" | "off";
    recommendedAudio: "on" | "off";
    multiShot: false;
    audioReferences: "none";
  };
}

const DISTANCE_TEXT = {
  conversational: "They stand about an arm's length apart at the cocktail table.",
  "social-group": "They stand together as a small social group.",
  "across-room": "They are across the room from each other.",
} as const;

const INTENSITY_TEXT = {
  subtle: "Subtle, restrained facial expression.",
  natural: "Natural, believable expression.",
  big: "Big, clearly readable facial expression.",
} as const;

/** Main subject: explicit, else the speaker, else the first visible character. */
export function mainSubjectId(shot: ShotSpec): string | undefined {
  return shot.subjectId ?? shot.speakerId ?? shot.visibleIds[0];
}

export function composeKlingPrompt(
  shot: ShotSpec,
  cast: CastMember[],
  plan?: GeometryPlanData,
  preset: ProviderPreset = KLING_OMNI_PRESET,
): ComposedPrompt {
  const byId = (id: string) => cast.find((c) => c.id === id);
  const visible = shot.visibleIds.map(byId).filter((c): c is CastMember => !!c);
  const speaker = shot.speakerId ? byId(shot.speakerId) : undefined;
  const s: Record<string, string> = {};
  const subjectId = mainSubjectId(shot);
  const subject = subjectId ? byId(subjectId) : undefined;

  // 1. References — only visible characters, never excluded ones.
  const refs = visible.map((c) => `${c.name}'s approved character image`);
  s.references =
    `Use ${joinNames([...refs, `the ${shot.venueName} reference`])}.` +
    (shot.startFrameAssetCode ? " Start from the supplied start frame." : "");

  // 2. Scene and story moment — quotes removed so nothing earlier is re-spoken.
  s.scene = stripQuotes(shot.sceneContext);

  // 3 + 7. Positions, distance and background from the plan.
  const cam = plan?.cameras.find((c) => c.id === shot.cameraId);
  if (plan && cam) {
    const reading = readCamera(plan, cam);
    const frame = describeFrame(reading, cast, shot.visibleIds, subjectId);
    // Over-the-shoulder foreground: only a non-subject person, and only when 2+ people are visible.
    const fg = reading.actors
      .filter(
        (a) =>
          a.foreground &&
          shot.visibleIds.length > 1 &&
          a.characterId !== subjectId &&
          shot.visibleIds.includes(a.characterId),
      )
      .map((a) => byId(a.characterId)?.name)
      .filter(Boolean) as string[];
    s.positions =
      `Positions: ${frame}.` +
      (fg.length ? ` ${joinNames(fg)} in the soft foreground, seen from behind over the shoulder.` : "") +
      (shot.distance && visible.length > 1 ? ` ${DISTANCE_TEXT[shot.distance]}` : "");
    if (reading.backgroundView) {
      const subj = subject?.name ?? "the subject";
      s.background = `Background behind ${subj}: the ${reading.backgroundView}.`;
    }
    s.camera = PRESET_TEXT[cam.preset];
  }

  // 4. Character and voice lock — word for word.
  if (speaker) {
    s.character = `${speaker.name} is ${speaker.voiceLock}`;
  }
  const listeners = visible.filter((c) => c.id !== speaker?.id).map((c) => c.name);
  if (speaker && listeners.length) s.listeners = `${joinNames(listeners)} listen${listeners.length === 1 ? "s" : ""} silently.`;

  // 5. Dialogue — the only quoted text in the prompt.
  const performance = [
    shot.emotion ? `Emotion: ${stripQuotes(shot.emotion)}.` : "",
    shot.intensity ? INTENSITY_TEXT[shot.intensity] : "",
    shot.actions ? stripQuotes(shot.actions) : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (performance) s.performance = performance;
  if (speaker && shot.dialogue) {
    s.dialogue = `${capitalise(speaker.pronoun)} says exactly once: "${shot.dialogue}"`;
  }
  if (shot.additionalInstructions) s.additional = stripQuotes(shot.additionalInstructions);

  // 8. Guard lines.
  const guards: string[] = [];
  if (speaker) {
    guards.push(`Only ${speaker.name} has intelligible dialogue. No repeated words or additional speech.`);
  } else {
    guards.push("No one speaks. No dialogue, no humming, no vocal sounds.");
  }
  if (visible.length === 1) {
    guards.push(`Only ${visible[0].name} is in frame. No other people visible.`);
  } else if (visible.length > 1) {
    guards.push(`Exactly one of each person: ${joinNames(visible.map((c) => c.name))}.`);
  }
  guards.push("No text, no logos.");
  s.guards = guards.join(" ");

  const order = [
    "references", "scene", "positions", "character", "listeners", "performance",
    "dialogue", "camera", "background", "additional", "guards",
  ];
  const text = order.filter((k) => s[k]).map((k) => s[k]).join("\n");

  const recommendedAudio = speaker ? "on" : "off";
  return {
    text,
    sections: s,
    settings: {
      model: preset.label,
      resolution: preset.resolution,
      durationSec: shot.durationSec,
      nativeAudio: shot.audioMode === "native-on" ? "on" : "off",
      recommendedAudio,
      multiShot: false,
      audioReferences: "none",
    },
  };
}
