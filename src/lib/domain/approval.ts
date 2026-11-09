// Approval checks shared by the server (enforced) and the editors (shown before saving).

import type { CharacterProfile } from "./imagePrompts";
import { hasQuotes } from "./text";

/** Problems that block approving a character version. Empty = can approve. */
export function approvalProblems(v: { voiceLock: string; profile: CharacterProfile; invented?: boolean; consentRef?: string }): string[] {
  const out: string[] = [];
  if (v.invented === false && !v.consentRef?.trim()) out.push("This character portrays a real person: record their consent (who agreed, when and how) before approving.");
  if (!v.voiceLock.trim()) out.push("Write the voice lock (how the character sounds). It goes word for word into every prompt where they speak.");
  if (hasQuotes(v.voiceLock)) out.push("Remove quote marks from the voice lock. Quote marks are only for the spoken line.");
  if (!v.profile.appearance?.trim()) out.push("Describe the character's appearance, so image prompts are consistent.");
  return out;
}
