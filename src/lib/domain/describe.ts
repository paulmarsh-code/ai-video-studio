// "Start from a picture or a one-line idea" (decision D16).
// The app writes a prompt that asks ChatGPT (or a connected vision model) to describe a
// character or place in a fixed labelled format; the reply is parsed into the studio fields.
// Rules built into every prompt:
// - a likeness inspired by the picture, never a copy of a real person's face;
// - no names, brands, logos or known characters;
// - identity anchors: the 3–5 features that make the character or place recognisable.

import { stripQuotes } from "./text";

export interface Field {
  key: string;
  label: string;
  hint: string;
}

export const CHARACTER_FIELDS: Field[] = [
  { key: "age", label: "AGE RANGE", hint: "e.g. mid-twenties" },
  { key: "build", label: "BUILD AND HEIGHT", hint: "body shape, approximate height, posture" },
  { key: "face", label: "FACE", hint: "face shape, features, expression at rest" },
  { key: "hair", label: "HAIR", hint: "colour, length, cut, texture, fringe/parting" },
  { key: "skin", label: "SKIN", hint: "tone and texture, freckles, facial hair" },
  { key: "eyes", label: "EYES", hint: "colour and shape" },
  { key: "grooming", label: "MAKE-UP AND GROOMING", hint: "make-up, glasses, tattoos, jewellery worn on the face" },
  { key: "outfit", label: "OUTFIT", hint: "each garment: cut, fabric, colour, from top to shoes" },
  { key: "accessories", label: "ACCESSORIES", hint: "bag, jewellery, watch, hat" },
  { key: "colours", label: "COLOUR PALETTE", hint: "the 2–4 main colours of the look" },
  { key: "anchors", label: "IDENTITY ANCHORS", hint: "3 to 5 short phrases separated by semicolons: the features that must match in every image" },
  { key: "mannerisms", label: "MANNERISMS", hint: "how they stand, move and hold themselves" },
  { key: "voice", label: "SUGGESTED VOICE", hint: "one sentence on how they might sound: accent, pace, tone (no quote marks)" },
];

export const VENUE_FIELDS: Field[] = [
  { key: "setting", label: "SETTING", hint: "exactly one word: indoors or outdoors" },
  { key: "place", label: "PLACE", hint: "what kind of place it is, in one sentence, with no business or brand names" },
  { key: "layout", label: "LAYOUT", hint: "what is where, using ahead, left, right and behind from the main viewpoint" },
  { key: "materials", label: "MATERIALS AND DECOR", hint: "surfaces, furniture, colours, textures" },
  { key: "light", label: "LIGHT AND TIME OF DAY", hint: "light sources, warmth, time of day, weather if outdoors" },
  { key: "anchors", label: "IDENTITY ANCHORS", hint: "3 to 5 short phrases separated by semicolons: the features that make this place recognisable" },
  { key: "views", label: "VIEWS", hint: "four lines, each 'name: direction' where direction is ahead, left, behind or right, e.g. 'bar: left'" },
];

function format(fields: Field[]): string {
  return fields.map((f) => `${f.label}: <${f.hint}>`).join("\n");
}

const REPLY_RULES = [
  "Step 1: write the description as exactly these labelled lines, in this order. No markdown, no bullet points, no headings, no other commentary.",
  "Use plain description. Do not use quote marks.",
];

/** Layout of the one-image reference sheet that the app cuts into separate views. */
export const CHARACTER_SHEET = { cols: 3, rows: 1, views: ["front", "back", "face"] as const };
export const VENUE_SHEET = { cols: 2, rows: 2 };

const SHEET_COMMON = "Thin plain white dividers between panels, all panels exactly the same size, nothing crossing from one panel into another. No text, labels, numbers, logos or watermark anywhere in the image.";

/** Step 2 of the character prompt: one image, three equal panels side by side. */
export function characterSheetRequest(style = "photorealistic"): string {
  return [
    `Step 2: using the description above, create ONE ${style} image: a character reference sheet in landscape 3:2 format, divided into three equal vertical panels side by side.`,
    "Left panel: front view, the whole body from the top of the head to the shoes, standing naturally, facing the camera.",
    "Middle panel: back view, the whole body from the top of the head to the shoes, facing directly away from the camera, face not visible.",
    "Right panel: face close-up, head and shoulders, looking straight into the camera, neutral relaxed expression.",
    "In the two full-body panels the head must not be cropped: leave a clear gap above the head and below the shoes, and make the figures smaller if needed to fit.",
    "Exactly the same person, hair, outfit and accessories in all three panels. Plain light-grey studio background, soft even lighting.",
    SHEET_COMMON,
  ].join("\n");
}

/** Step 2 of the venue prompt: one image, a 2x2 grid of the four named views. */
export function venueSheetRequest(viewNames?: string[], style = "photorealistic"): string {
  const order = viewNames?.length === 4
    ? `Top-left: looking towards the ${viewNames[0]}. Top-right: the ${viewNames[1]}. Bottom-left: the ${viewNames[2]}. Bottom-right: the ${viewNames[3]}.`
    : "Use the four VIEWS in the order you listed them: top-left is the first view, top-right the second, bottom-left the third, bottom-right the fourth.";
  return [
    `Step 2: using the description above, create ONE ${style} image in landscape 3:2 format, divided into a 2 by 2 grid of four equal panels, each showing the same place from the main viewpoint looking in a different direction.`,
    order,
    "Eye-level wide shots, no people, the same layout, materials and light in every panel.",
    SHEET_COMMON,
  ].join("\n");
}

const STEP2_FALLBACK = "If you can only do one thing in this reply, write the description and stop; I will then ask for the image.";

export type DescribeSource = "image" | "idea" | "change";

export interface CurrentCharacter {
  appearance?: string;
  wardrobe?: string;
  mannerisms?: string;
  anchors?: string[];
}

/**
 * "Make changes": the saved description plus what the user wants changed. ChatGPT rewrites the
 * full labelled description with only that change, and draws a new sheet, so the fields and
 * all three views stay in step. Attach the current sheet or front image so the rest stays the same.
 */
export function characterChangePrompt(current: CurrentCharacter, change: string): string {
  return [
    "I am refining an original character for a short AI video. The current description is below, and the attached image shows how the character looks now.",
    `Change only this: ${stripQuotes(change).trim() || "(describe the change here)"}`,
    "Keep everything else exactly the same: the same person, face, proportions and any details the change does not mention.",
    "",
    "Current description:",
    current.appearance ? `APPEARANCE: ${stripQuotes(current.appearance)}` : "",
    current.wardrobe ? `OUTFIT AND ACCESSORIES: ${stripQuotes(current.wardrobe)}` : "",
    current.anchors?.length ? `IDENTITY ANCHORS: ${current.anchors.map(stripQuotes).join("; ")}` : "",
    current.mannerisms ? `MANNERISMS: ${stripQuotes(current.mannerisms)}` : "",
    "",
    "Do not use brand names, logos or text on clothing.",
    ...REPLY_RULES,
    "Rewrite the whole description with the change applied, in this format:",
    "",
    format(CHARACTER_FIELDS),
    "",
    characterSheetRequest(),
    STEP2_FALLBACK,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

export function venueChangePrompt(current: { setting?: string; description: string; views: string[] }, change: string): string {
  return [
    "I am refining a location for a short AI video. The current description is below, and the attached image shows how it looks now.",
    `Change only this: ${stripQuotes(change).trim() || "(describe the change here)"}`,
    "Keep everything else exactly the same, including the four views and their names unless the change says otherwise.",
    "",
    "Current description:",
    `SETTING: ${current.setting === "exterior" ? "outdoors" : "indoors"}`,
    `DESCRIPTION: ${stripQuotes(current.description)}`,
    `VIEWS: ${current.views.join("; ")}`,
    "",
    ...REPLY_RULES,
    "Rewrite the whole description with the change applied, in this format:",
    "",
    format(VENUE_FIELDS),
    "",
    venueSheetRequest(current.views.length === 4 ? current.views : undefined),
    STEP2_FALLBACK,
  ].join("\n");
}

/** Prompt to paste into ChatGPT together with the picture, or with a one-line idea. */
export function characterDescribePrompt(source: DescribeSource, idea = "", personality = ""): string {
  // A picture shows looks, not personality: the user's own words drive mannerisms, voice and expression.
  const who = stripQuotes(personality).trim();
  const intro = source === "image"
    ? [
        "I am designing an original character for a short AI video. Use the attached picture only as inspiration.",
        "Describe a fictional character with a similar look and style: a likeness, not a copy. Do not identify or name anyone, and do not try to reproduce a real person's exact face.",
        "If the picture shows a famous person or a well-known fictional character, say so on the first line as KNOWN: yes, and describe a clearly different original character in the same spirit instead.",
      ]
    : [
        `I am designing an original character for a short AI video. The idea: ${stripQuotes(idea).trim() || "(describe the character here)"}`,
        "Invent a specific, believable look for this character in enough detail that an image generator draws the same person every time.",
      ];
  return [
    ...intro,
    ...(who ? [`Personality and mannerisms: ${who}. Use this for MANNERISMS and SUGGESTED VOICE, and let it show in the resting expression and posture.`] : []),
    "Be specific and visual: exact colours, cuts, lengths and materials, not general words like nice or stylish.",
    "Do not use brand names, logos or text on clothing.",
    ...REPLY_RULES,
    "",
    format(CHARACTER_FIELDS),
    "",
    characterSheetRequest(),
    STEP2_FALLBACK,
  ].join("\n");
}

export function venueDescribePrompt(source: DescribeSource, idea = ""): string {
  const intro = source === "image"
    ? [
        "I am designing a location for a short AI video. Use the attached picture as the reference for the place.",
        "Describe a place with the same layout, style and light. Leave out any people, and any business names, logos, signs or text.",
      ]
    : [
        `I am designing a location for a short AI video. The idea: ${stripQuotes(idea).trim() || "(describe the place here)"}`,
        "Invent a specific, believable place in enough detail that an image generator draws the same place every time, from different directions.",
      ];
  return [
    ...intro,
    "Imagine standing at the main viewpoint, where a scene would usually start, and describe what is ahead, to the left, to the right and behind.",
    ...REPLY_RULES,
    "",
    format(VENUE_FIELDS),
    "",
    venueSheetRequest(),
    STEP2_FALLBACK,
  ].join("\n");
}

const CHAT_LINE = /^(here(?:'s| is| are)|i(?:'ve| have| will|'ll)|below|now|sure|great|okay|ok[,.!]|let me|this (?:is|sheet|image))\b/i;

/** Parse a labelled reply. Tolerates markdown bold, bullets, numbering, case and line wraps. */
export function parseLabelled(text: string, fields: Field[]): { values: Record<string, string>; missing: string[]; known: boolean } {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
  const byLabel = new Map(fields.map((f) => [norm(f.label), f.key]));
  // Accept some natural variants.
  const alias: Record<string, string> = { MAKEUP: "grooming", GROOMING: "grooming", AGE: "age", BUILD: "build", COLOURS: "colours", COLORS: "colours", COLORPALETTE: "colours", ANCHORS: "anchors", VOICE: "voice", MATERIALS: "materials", MATERIALSANDDECOR: "materials", LIGHT: "light", LIGHTING: "light" };
  const values: Record<string, string> = {};
  let known = false;
  let current: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\*\*|__/g, "").replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
    if (!line) continue;
    if (/^step\s*2\b/i.test(line)) break; // anything after the description is about the image
    if (/^step\s*1\b/i.test(line)) continue;
    const m = line.match(/^([A-Za-z][A-Za-z &/-]{1,40}):\s*(.*)$/);
    if (m) {
      const n = norm(m[1]);
      if (n === "KNOWN") { known = /^y/i.test(m[2].trim()); current = undefined; continue; }
      const key = byLabel.get(n) ?? alias[n];
      if (key) { current = key; values[key] = m[2].trim(); continue; }
    }
    // A wrapped line continues the current field; ChatGPT's own chat ("Here is the sheet…") ends it.
    if (CHAT_LINE.test(line)) { current = undefined; continue; }
    if (current) values[current] = `${values[current]} ${line}`.trim();
  }
  for (const k of Object.keys(values)) values[k] = stripQuotes(values[k].replace(/^<|>$/g, "")).trim();
  const missing = fields.filter((f) => !values[f.key]).map((f) => f.label);
  return { values, missing, known };
}

function sentence(s: string | undefined): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  const c = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(c) ? c : `${c}.`;
}

export function splitAnchors(s: string | undefined): string[] {
  return (s ?? "").split(/;|\n/).map((x) => x.trim().replace(/[.]$/, "")).filter(Boolean).slice(0, 6);
}

export interface CharacterFill {
  appearance: string;
  wardrobe: string;
  mannerisms: string;
  anchors: string[];
  voice: string;
}

export function characterFillFromReply(reply: string): CharacterFill & { missing: string[]; known: boolean } {
  const { values: v, missing, known } = parseLabelled(reply, CHARACTER_FIELDS);
  return {
    appearance: [v.age, v.build, v.face, v.hair, v.skin, v.eyes && `${v.eyes.replace(/\.$/, "")}${/eye/i.test(v.eyes) ? "" : " eyes"}`, v.grooming].map(sentence).filter(Boolean).join(" "),
    wardrobe: [v.outfit, v.accessories, v.colours && `Colour palette: ${v.colours}`].map(sentence).filter(Boolean).join(" "),
    mannerisms: sentence(v.mannerisms),
    anchors: splitAnchors(v.anchors),
    voice: sentence(v.voice),
    missing,
    known,
  };
}

const DIRECTION_DEG: Record<string, number> = { ahead: 90, front: 90, forward: 90, far: 90, left: 180, right: 0, behind: 270, back: 270, near: 270 };

export interface VenueFill {
  setting: "interior" | "exterior";
  description: string;
  anchors: string[];
  views: { name: string; directionDeg: number }[];
}

export function venueFillFromReply(reply: string): VenueFill & { missing: string[] } {
  // Views come one per line, so read them separately from the joined value.
  const viewLines: string[] = [];
  let inViews = false;
  for (const raw of reply.split(/\r?\n/)) {
    const line = raw.replace(/\*\*|__/g, "").replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
    if (/^views\s*:/i.test(line)) { inViews = true; const rest = line.replace(/^views\s*:/i, "").trim(); if (rest) viewLines.push(...rest.split(/[;,](?=[^:;,]+:)/)); continue; }
    if (inViews) {
      if (/^[A-Z][A-Z &/-]{2,40}:/.test(line) && !/:\s*(ahead|left|right|behind|front|back|forward|far|near)\b/i.test(line)) break;
      if (line) viewLines.push(line);
    }
  }
  const views: { name: string; directionDeg: number }[] = [];
  for (const l of viewLines) {
    const m = l.match(/^(.+?)\s*[:—–-]\s*(ahead|left|right|behind|front|back|forward|far|near)\b/i);
    if (!m) continue;
    const name = stripQuotes(m[1]).replace(/^(the|a)\s+/i, "").trim().toLowerCase();
    const deg = DIRECTION_DEG[m[2].toLowerCase()];
    if (name && !views.some((x) => x.name === name)) views.push({ name, directionDeg: deg });
  }
  const { values: v, missing } = parseLabelled(reply, VENUE_FIELDS);
  return {
    setting: /out|ext/i.test(v.setting ?? "") ? "exterior" : "interior",
    description: [
      ...[v.place, v.layout, v.materials, v.light].map(sentence),
      splitAnchors(v.anchors).length ? `Signature features that must match in every view: ${splitAnchors(v.anchors).join("; ")}.` : "",
    ].filter(Boolean).join(" "),
    anchors: splitAnchors(v.anchors),
    views,
    missing: missing.filter((l) => !(l === "VIEWS" && views.length)),
  };
}
