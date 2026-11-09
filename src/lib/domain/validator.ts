// Deterministic pre-generation validator (Stage 8). Independent of any LLM.
// Every rule returns a Finding with a plain-English message and a suggested fix.

import { deriveDuration } from "./duration";
import { checkLineOfAction, occlusions, readCamera } from "./geometry";
import { hasQuotes, mentionsGesture, QUOTE_CHARS } from "./text";
import {
  KLING_OMNI_PRESET,
  type CastMember,
  type Finding,
  type GeometryPlanData,
  type ProviderPreset,
  type ShotSpec,
} from "./types";

export function validateShot(
  shot: ShotSpec,
  cast: CastMember[],
  plan?: GeometryPlanData,
  preset: ProviderPreset = KLING_OMNI_PRESET,
): Finding[] {
  const out: Finding[] = [];
  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const known = new Set(cast.map((c) => c.id));

  for (const id of [...shot.presentIds, ...shot.visibleIds, ...shot.excludedIds]) {
    if (!known.has(id)) {
      out.push({ code: "UNKNOWN_CHARACTER", severity: "error", message: `Character "${id}" is not in the approved cast.` });
    }
  }

  // Visible vs excluded vs present.
  for (const id of shot.visibleIds) {
    if (shot.excludedIds.includes(id)) {
      out.push({
        code: "VISIBLE_AND_EXCLUDED", severity: "error", field: "visibleIds",
        message: `${name(id)} is marked both visible and excluded.`,
        fix: `Choose one: keep ${name(id)} in the visible list or the excluded list.`,
      });
    }
    if (!shot.presentIds.includes(id)) {
      out.push({
        code: "VISIBLE_NOT_PRESENT", severity: "error", field: "visibleIds",
        message: `${name(id)} is visible but not present in the scene.`,
        fix: `Add ${name(id)} to the characters present, or remove them from the visible list.`,
      });
    }
  }

  if (shot.subjectId && !shot.visibleIds.includes(shot.subjectId)) {
    out.push({
      code: "SUBJECT_NOT_VISIBLE", severity: "error", field: "subjectId",
      message: `${name(shot.subjectId)} is the main subject but is not visible.`,
      fix: `Make ${name(shot.subjectId)} visible, or choose another main subject.`,
    });
  }

  // Speaker and dialogue attribution.
  const hasDialogue = !!shot.dialogue && shot.dialogue.trim().length > 0;
  if (hasDialogue && !shot.speakerId) {
    out.push({
      code: "DIALOGUE_WITHOUT_SPEAKER", severity: "error", field: "speakerId",
      message: "There is dialogue but no speaking character.",
      fix: "Select who says the line.",
    });
  }
  if (shot.speakerId && !hasDialogue) {
    out.push({
      code: "SPEAKER_WITHOUT_DIALOGUE", severity: "error", field: "dialogue",
      message: `${name(shot.speakerId)} is the speaker but has no line.`,
      fix: "Enter the exact approved line, or clear the speaker for a silent shot.",
    });
  }
  if (shot.speakerId && !shot.visibleIds.includes(shot.speakerId)) {
    out.push({
      code: "SPEAKER_NOT_VISIBLE", severity: "warning", field: "speakerId",
      message: `${name(shot.speakerId)} speaks but is not visible. Native audio lip sync needs the speaker on screen.`,
      fix: `Make ${name(shot.speakerId)} visible, or treat the line as off-screen in the edit.`,
    });
  }
  for (const [id, line] of Object.entries(shot.otherDialogue ?? {})) {
    if (line && line.trim()) {
      out.push({
        code: "MULTIPLE_SPEAKERS", severity: "warning", field: "otherDialogue",
        message: `${name(id)} also has dialogue. One speaker per clip is the rule — two speakers cause wrong-speaker and lip-sync faults.`,
        fix: `Move ${name(id)}'s line to its own shot.`,
      });
    }
  }

  // Quote rule.
  for (const [field, text] of [
    ["sceneContext", shot.sceneContext],
    ["actions", shot.actions],
    ["emotion", shot.emotion],
    ["additionalInstructions", shot.additionalInstructions],
  ] as const) {
    if (hasQuotes(text)) {
      out.push({
        code: "QUOTES_OUTSIDE_DIALOGUE", severity: "warning", field,
        message: `The ${field} text contains quote marks. Kling may speak quoted words aloud.`,
        fix: "Quote marks will be removed when the prompt is composed; describe the moment in plain words.",
      });
    }
  }
  if (hasDialogue && hasQuotes(shot.dialogue)) {
    out.push({
      code: "QUOTES_INSIDE_DIALOGUE", severity: "warning", field: "dialogue",
      message: "The line itself contains quote marks, which can confuse where the speech starts and ends.",
      fix: "Remove quote marks from inside the line.",
    });
  }

  // Audio.
  if (!shot.speakerId && shot.audioMode === "native-on") {
    out.push({
      code: "SILENT_SHOT_AUDIO_ON", severity: "warning", field: "audioMode",
      message: "No one speaks but native audio is on. Kling tends to invent speech or murmurs.",
      fix: "Turn native audio off for this shot and add sound in the edit.",
    });
  }
  if (shot.speakerId && shot.audioMode === "off") {
    out.push({
      code: "SPEAKING_SHOT_AUDIO_OFF", severity: "error", field: "audioMode",
      message: "Someone speaks but native audio is off, so there will be no voice or lip sync.",
      fix: "Turn native audio on.",
    });
  }
  if (shot.audioReferenceCodes && shot.audioReferenceCodes.length) {
    out.push({
      code: "AUDIO_REFERENCE_ATTACHED", severity: "warning", field: "audioReferenceCodes",
      message: "An audio or voice reference is attached. Tests showed Kling ignores these; the voice comes from the written voice lock.",
      fix: "Remove the audio reference. The prompt already carries the character's voice lock text.",
    });
  }

  // Duration.
  const derived = deriveDuration(shot.dialogue, preset);
  if (shot.durationSec < preset.minDurationSec || shot.durationSec > preset.maxDurationSec) {
    out.push({
      code: "DURATION_OUT_OF_RANGE", severity: "error", field: "durationSec",
      message: `${shot.durationSec}s is outside the ${preset.label} range (${preset.minDurationSec}–${preset.maxDurationSec}s).`,
    });
  } else if (hasDialogue && Math.abs(shot.durationSec - derived) > 1) {
    out.push({
      code: "DURATION_MISMATCH", severity: "warning", field: "durationSec",
      message:
        shot.durationSec > derived
          ? `${shot.durationSec}s is longer than the line needs (about ${derived}s). Spare seconds get filled with invented sounds.`
          : `${shot.durationSec}s is too short for the line (about ${derived}s needed).`,
      fix: `Set the duration to ${derived}s.`,
    });
  }

  // Big performance vs a restrained voice lock.
  const speakerLock = cast.find((c) => c.id === shot.speakerId)?.voiceLock ?? "";
  if (shot.intensity === "big" && /\b(restrained|minimal facial)\b/i.test(speakerLock)) {
    out.push({
      code: "INTENSITY_CONFLICTS_WITH_VOICE_LOCK", severity: "warning", field: "intensity",
      message: `"Big" performance is requested, but ${name(shot.speakerId!)}'s approved voice lock asks for restrained or minimal facial movement. Kling gets two opposite instructions.`,
      fix: "Use natural intensity, or approve a scene-specific variant of the voice lock for big moments.",
    });
  }

  // Gesture caution.
  if (shot.speakerId && mentionsGesture(shot.actions)) {
    out.push({
      code: "GESTURE_DURING_SPEECH", severity: "info", field: "actions",
      message: "A hand gesture during speech often looks unnatural in Kling.",
      fix: "Consider moving the gesture to a silent cutaway.",
    });
  }

  // Geometry consistency.
  if (plan && shot.cameraId) {
    const cam = plan.cameras.find((c) => c.id === shot.cameraId);
    if (!cam) {
      out.push({ code: "UNKNOWN_CAMERA", severity: "error", field: "cameraId", message: `Camera "${shot.cameraId}" is not in the plan.` });
    } else {
      const reading = readCamera(plan, cam);
      for (const id of shot.visibleIds) {
        const a = reading.actors.find((x) => x.characterId === id);
        if (a && !a.inView) {
          out.push({
            code: "VISIBLE_OUT_OF_VIEW", severity: "warning", field: "cameraId",
            message: `${name(id)} should be visible, but on the plan they are ${a.frame.replace("-", " ")} of ${cam.name}.`,
            fix: `Choose another camera or adjust ${cam.name}. Characters are never moved silently.`,
          });
        }
      }
      for (const id of shot.excludedIds) {
        const a = reading.actors.find((x) => x.characterId === id);
        if (a && a.inView) {
          out.push({
            code: "EXCLUDED_IN_VIEW", severity: "info", field: "cameraId",
            message: `${name(id)} is excluded but stands inside ${cam.name}'s view on the plan. The prompt will frame them out.`,
            fix: "Use a tighter preset if they keep appearing.",
          });
        }
      }
      out.push(...checkLineOfAction({ ...plan, cameras: plan.cameras.filter((c) => c.id === cam.id || c.id === (plan.referenceCameraId ?? plan.cameras[0]?.id)) }, cast));
      const subjectId = shot.subjectId ?? shot.speakerId ?? shot.visibleIds[0];
      for (const o of occlusions(reading, shot.visibleIds)) {
        const isSubject = o.characterId === subjectId;
        if (o.level === "face") {
          out.push({
            code: isSubject ? "SUBJECT_HIDDEN" : "FACE_HIDDEN", severity: "warning", field: "cameraId",
            message: `${name(o.characterId)}${isSubject ? " (the main subject)" : ""} is hidden behind ${name(o.blockerId)} in ${cam.name}.`,
            fix: `Move ${name(o.blockerId)} or ${cam.name} on the floor plan until ${name(o.characterId)}'s face is clear in the viewfinder.`,
          });
        } else if (isSubject) {
          out.push({
            code: "SUBJECT_PARTLY_HIDDEN", severity: "info", field: "cameraId",
            message: `${name(o.blockerId)} partly covers ${name(o.characterId)}'s body in ${cam.name}. Usually fine; check the viewfinder.`,
          });
        }
      }
    }
  }

  return out;
}

/** Checks on the final prompt text — catches manual edits after composing. */
export function validatePrompt(
  text: string,
  shot: ShotSpec,
  cast: CastMember[],
  preset: ProviderPreset = KLING_OMNI_PRESET,
): Finding[] {
  const out: Finding[] = [];
  const speaker = cast.find((c) => c.id === shot.speakerId);

  if (text.length > preset.maxPromptChars) {
    out.push({
      code: "PROMPT_TOO_LONG", severity: "error",
      message: `The prompt is ${text.length} characters; ${preset.label} allows ${preset.maxPromptChars}.`,
      fix: "Shorten the scene or action description.",
    });
  }

  const quotes = (text.match(QUOTE_CHARS) ?? []).length;
  const allowed = speaker && shot.dialogue ? 2 : 0;
  if (quotes !== allowed) {
    out.push({
      code: "QUOTE_COUNT", severity: "error",
      message: allowed
        ? `Quote marks should appear only around the spoken line (2 expected, ${quotes} found).`
        : `This is a silent shot, but the prompt contains ${quotes} quote mark(s).`,
      fix: "Remove quote marks from everything except the spoken line.",
    });
  }

  if (speaker && shot.dialogue && !text.includes(`"${shot.dialogue}"`)) {
    out.push({
      code: "DIALOGUE_CHANGED", severity: "error",
      message: "The approved dialogue is missing or has been changed in the prompt.",
      fix: "Recompose the prompt; approved dialogue cannot be edited here.",
    });
  }

  if (speaker && !text.includes(speaker.voiceLock)) {
    out.push({
      code: "VOICE_LOCK_CHANGED", severity: "error",
      message: `${speaker.name}'s approved voice description is missing or has been edited. Voice consistency depends on it being word for word.`,
      fix: "Recompose the prompt, or change the voice lock in the Character Studio (creates a new approved version).",
    });
  }

  for (const id of shot.excludedIds) {
    const c = cast.find((x) => x.id === id);
    if (c && new RegExp(`\\b${c.name}\\b`).test(text)) {
      out.push({
        code: "EXCLUDED_NAMED", severity: "warning",
        message: `${c.name} is excluded but named in the prompt; naming people can make them appear.`,
        fix: `Remove ${c.name} from the prompt text.`,
      });
    }
  }
  return out;
}

export const blocking = (findings: Finding[]) => findings.filter((f) => f.severity === "error");
