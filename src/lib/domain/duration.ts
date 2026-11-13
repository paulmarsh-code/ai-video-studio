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

/**
 * Real physical action in a panel's words (D87): a drop-in, a trick, a jump, a run, a fall.
 * Three seconds, sized for a silent panel or a short line, gave Kling time for Kai to crouch
 * at the rim and stop; nothing happened. Lower case only, so a name (Chase, Rider) isn't an action.
 */
const PHYSICAL = /\b(?:drop(?:s|ped|ping)?\s+in(?:to)?|rid(?:e|es|ing)|rode|skat(?:e|es|ed|ing)|carv(?:e|es|ed|ing)|grind(?:s|ing)?|ollie\w*|kickflip\w*|flip(?:s|ped|ping)?|trick\w*|jump(?:s|ed|ing)?|leap(?:s|t|ing)?|div(?:e|es|ed|ing)|dove|swim(?:s|ming)?|swam|run(?:s|ning)?|ran|sprint\w*|chas(?:e|es|ed|ing)|kick(?:s|ed|ing)?|throw(?:s|ing)?|threw|catch(?:es|ing)?|caught|fall(?:s|ing)?|fell|climb\w*|ski(?:s|ed|ing)?|snowboard\w*|push(?:es|ed|ing)?\s+off|tackl\w*|punch\w*|fight(?:s|ing)?|fought|danc(?:e|es|ed|ing)|crash\w*|spin(?:s|ning)?|spun|skid\w*|surf\w*|cycl(?:e|es|ed|ing)|pedal\w*|shoot(?:s|ing)?\s+(?:at\s+goal|the\s+ball)|serv(?:e|es|ing)\s+the\s+ball|swing(?:s|ing)?\s+(?:the|his|her|a)\s+(?:bat|club|racket))\b/;

/** At least this long for a panel with real physical action (D87). */
export const ACTION_MIN_SEC = 5;

export function physicalAction(text: string | undefined): boolean {
  return !!text && PHYSICAL.test(text);
}

/**
 * Suggested clip duration in whole seconds, clamped to the provider's range: sized to the line,
 * and at least `ACTION_MIN_SEC` when the panel's words have real physical action in them (D87).
 */
export function deriveDuration(
  dialogue: string | undefined,
  preset: ProviderPreset = KLING_OMNI_PRESET,
  action?: string,
): number {
  const floor = physicalAction(action) ? ACTION_MIN_SEC : preset.minDurationSec;
  if (!dialogue || countWords(dialogue) === 0) return Math.min(preset.maxDurationSec, floor);
  const raw = Math.round(spokenSeconds(dialogue) + LEAD_SECONDS);
  return Math.min(preset.maxDurationSec, Math.max(floor, raw));
}
