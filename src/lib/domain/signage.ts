// Logos and signs on props (D47): any scene, any brand. A prop that carries lettering or a
// logo (a logo backdrop, a shop sign, a poster) is the one place text belongs in the picture.
// The rule at the end of every prompt said "No text, no logos", which contradicted it: GPT left
// the backdrop out, then a correction made a new logo up, different in every picture.
import { joinNames } from "./text";

const SIGN_RE = /\b(logos?|signs?|signage|banners?|posters?|lettering|wordmarks?|billboards?|placards?|menu boards?|branding)\b/i;

export interface PropLike { name: string; detail?: string; imageAssetId?: string }

/** Whether a prop carries lettering or a logo, from its name or description. */
export const isSign = (p: PropLike) => SIGN_RE.test(`${p.name} ${p.detail ?? ""}`);

export function signProps<T extends PropLike>(props: T[] | undefined): T[] {
  return (props ?? []).filter((p) => p.name.trim() && isSign(p));
}

/**
 * The closing "no text" rule, leaving the scene's own signs alone: "No text, no logos" when
 * there are none; otherwise only their lettering and logo, as described or as in their picture.
 */
export function noTextRule(props: PropLike[] | undefined, extra: string[] = [], withPicture: string[] = []): string {
  const signs = signProps(props);
  if (!signs.length) return `${["No text", "no logos", ...extra].join(", ")}.`;
  const names = joinNames(signs.map((s) => `the ${s.name}`));
  const pic = signs.some((s) => withPicture.includes(s.name));
  return `${["No other text or logos", ...extra].join(", ")}: the only lettering and logo are on ${names}, exactly ${pic ? "as in its attached picture" : "as described"}.`;
}

/** Props that carry a logo or lettering but have no picture: drawn differently in each picture. */
export function signsWithoutPicture(props: PropLike[] | undefined): string[] {
  return signProps(props).filter((p) => !p.imageAssetId).map((p) => p.name);
}
