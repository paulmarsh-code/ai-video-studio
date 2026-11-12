// Coloured stand-ins (D62). In image 1 every character was the same pale figure with a small name
// tag, and GPT swapped the two women sitting opposite each other in two panels of three (T6, the
// rooftop bar). Each stand-in's body is now shaded in the colours of that character's clothes,
// read from their wardrobe words, so who is where shows at a glance, as it will in the finished
// picture. Pure: words in, colours out.

/** Colour words and the shade each is drawn in. */
const SHADES: [RegExp, string][] = [
  [/\b(?:light|pale|baby|sky|powder)[- ]blue\b/, "#93c5fd"],
  [/\b(?:dark|deep|bottle|forest|hunter)[- ]green\b/, "#166534"],
  [/\b(?:light|pale|heather|dove)[- ]gr[ae]y\b/, "#d1d5db"],
  [/\b(?:dark|deep)[- ]gr[ae]y\b|\bcharcoal\b|\bgraphite\b|\bslate\b/, "#374151"],
  [/\bnavy\b|\bmidnight\b/, "#1e3a8a"],
  [/\bblack\b|\bjet\b/, "#1f1f1f"],
  [/\bwhite\b|\bsnow\b/, "#f8f8f6"],
  [/\bcream\b|\bivory\b|\boff[- ]white\b|\becru\b|\boatmeal\b/, "#f1e7cf"],
  [/\bbeige\b|\bstone\b|\bsand\b|\bnude\b/, "#e0d2b4"],
  [/\bcamel\b|\btan\b|\bcaramel\b/, "#c49a6c"],
  [/\bkhaki\b/, "#b5a46a"],
  [/\bbrown\b|\bchocolate\b|\bcoffee\b|\bmocha\b|\bchestnut\b/, "#6b4226"],
  [/\brust\b|\bterracotta\b|\bcopper\b/, "#b7472a"],
  [/\borange\b|\btangerine\b|\bapricot\b|\bpeach\b/, "#f97316"],
  [/\bmustard\b|\bochre\b/, "#c9a227"],
  [/\bgold\b|\bgolden\b/, "#d4a72c"],
  [/\byellow\b|\blemon\b/, "#facc15"],
  [/\bburgundy\b|\bmaroon\b|\boxblood\b|\bwine\b/, "#7f1d1d"],
  [/\bred\b|\bscarlet\b|\bcrimson\b|\bcherry\b/, "#dc2626"],
  [/\bcoral\b|\bsalmon\b/, "#fb7185"],
  [/\bpink\b|\bblush\b|\bfuchsia\b|\bmagenta\b/, "#ec4899"],
  [/\blilac\b|\blavender\b|\bmauve\b/, "#c4b5fd"],
  [/\bplum\b|\baubergine\b/, "#6b2a5c"],
  [/\bpurple\b|\bviolet\b/, "#7e22ce"],
  [/\bteal\b|\bturquoise\b|\baqua\b/, "#0d9488"],
  [/\bmint\b/, "#a7f3d0"],
  [/\bsage\b/, "#9caf88"],
  [/\bolive\b/, "#6b7a2f"],
  [/\bemerald\b|\bgreen\b/, "#16a34a"],
  [/\bdenim\b|\bindigo\b|\bcobalt\b|\bblue\b/, "#2563eb"],
  [/\bsilver\b|\bgr[ae]y\b/, "#9ca3af"],
];

/** What's worn over everything else: a coat over a shirt shows the coat. */
const OUTER = /\b(coat|overcoat|trench|parka|anorak|jacket|blazer|bomber|cardigan|jumper|sweater|hoodie|sweatshirt|fleece|gilet|waistcoat|suit|poncho|cape|shawl)\b/i;
/** What's under it, or worn alone. */
const MAIN = /\b(dress|gown|jumpsuit|playsuit|boiler ?suit|overalls|dungarees|uniform|shirt|t-shirt|blouse|top(?!\s+(?:two|three|of|button|buttons|stitch|edge))|tee|polo|tunic|camisole|cami|bodysuit|scrubs|tabard|robe|kaftan|sari|kimono)\b/i;

/** Every colour word in `text`, a longer name winning over the shorter one inside it ("light blue" over "blue"). */
function colourWords(text: string): { at: number; end: number; shade: string }[] {
  const t = text.toLowerCase();
  const all: { at: number; end: number; shade: string }[] = [];
  for (const [re, shade] of SHADES) {
    const g = new RegExp(re.source, "g");
    for (let m = g.exec(t); m; m = g.exec(t)) all.push({ at: m.index, end: m.index + m[0].length, shade });
  }
  return all.filter((a) => !all.some((b) => b !== a && b.at <= a.at && b.end >= a.end && b.end - b.at > a.end - a.at)).sort((a, b) => a.at - b.at);
}

/** The colour of the garment `garment` finds in one sentence: the colour word just before it, else the first after. */
function garmentColour(sentence: string, garment: RegExp): string | undefined {
  // Only the words about this garment: "a cream blazer over an orange top" is cream.
  const clauses = sentence.split(/,|;|\bover\b|\bwith\b|\bunder(?:neath)?\b|\bbeneath\b/i);
  for (const piece of [clauses.find((c) => garment.test(c)), sentence]) {
    if (!piece) continue;
    const at = piece.search(garment);
    const words = colourWords(piece);
    const pick = [...words].reverse().find((w) => w.end <= at) ?? words.find((w) => w.at > at);
    if (pick) return pick.shade;
  }
  return undefined;
}

/**
 * The colours of someone's clothes, from their wardrobe words: the outermost garment's colour,
 * then the colour of the dress or top under it when it differs. One colour when only one is named
 * (or the first colour mentioned); none when the words name no colour, and the stand-in stays pale.
 */
export function outfitColours(wardrobe?: string): string[] {
  if (!wardrobe?.trim()) return [];
  // Sentences, leaving out what they don't wear ("No jackets or handbags").
  const sentences = wardrobe.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x && !/^(?:no|without|never)\b/i.test(x));
  const find = (garment: RegExp) => {
    for (const s of sentences) if (garment.test(s)) { const c = garmentColour(s, garment); if (c) return c; }
    return undefined;
  };
  const out = [find(OUTER), find(MAIN)].filter((c): c is string => !!c);
  if (!out.length) {
    const first = sentences.map((s) => colourWords(s)[0]).find(Boolean);
    return first ? [first.shade] : [];
  }
  return [...new Set(out)];
}
