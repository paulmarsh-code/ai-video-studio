// Small text helpers shared by the composer and validator.

export const QUOTE_CHARS = /["“”„«»]/g;

/** True if the text contains any double-quote characters. */
export function hasQuotes(text: string | undefined): boolean {
  return !!text && /["“”„«»]/.test(text);
}

/**
 * Reword text so it carries no quote marks (Stage 8 quote rule).
 * Kling may speak any quoted phrase aloud, so quoted words outside the
 * spoken line are turned into plain description.
 */
export function stripQuotes(text: string): string {
  return text.replace(QUOTE_CHARS, "").replace(/\s{2,}/g, " ").trim();
}

export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const GESTURE_WORDS =
  /\b(gestur\w*|points?|pointing|waves?|waving|shrugs?|hand|hands|palm|finger|thumbs?)\b/i;

export function mentionsGesture(text: string | undefined): boolean {
  return !!text && GESTURE_WORDS.test(text);
}
