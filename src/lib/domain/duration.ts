// Duration derived from dialogue (Stage 6). Proven 7 Nov 2026: spare seconds get filled
// with invented filler sounds, so clips are sized to the line.

import { KLING_OMNI_PRESET, type ProviderPreset } from "./types";

export const WORDS_PER_SECOND = 2.75; // midpoint of the 2.5–3 w/s rule
export const LEAD_SECONDS = 1.0;

export function countWords(text: string): number {
  return text
    .replace(/[“”"]/g, "")
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Spoken-time estimate in seconds, before rounding and provider limits. */
export function spokenSeconds(text: string): number {
  return countWords(text) / WORDS_PER_SECOND;
}

/** Suggested clip duration in whole seconds, clamped to the provider's range. */
export function deriveDuration(
  dialogue: string | undefined,
  preset: ProviderPreset = KLING_OMNI_PRESET,
): number {
  if (!dialogue || countWords(dialogue) === 0) return preset.minDurationSec;
  const raw = Math.round(spokenSeconds(dialogue) + LEAD_SECONDS);
  return Math.min(preset.maxDurationSec, Math.max(preset.minDurationSec, raw));
}
