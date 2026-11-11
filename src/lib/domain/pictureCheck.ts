// Automatic picture check (D19). Positions and cameras are geometry, approved and locked; an
// image model can still swap two people or drop a prop. So every GPT picture is compared with
// the approved layout before the user sees it: who is in it, left to right, the key props
// and the background people. The vision model only reports what it sees; the pass or fail
// is decided here, by rule.

import { itemGroup } from "./imagePrompts";
import type { Person, Thing } from "./peopleDetect";

/** The plan check measured (D53): everyone the detector found, numbered, and which number the model says is whom. */
export interface MeasuredPlan { people: Person[]; reply: string; /** The picture's height over its width. */ aspect: number; /** Furniture the detector found (D55). */ things?: Thing[] }

export interface PictureExpectation {
  /** Main characters the camera sees, left to right, from the approved floor plan. */
  order: string[];
  /** Key props the camera sees. */
  props: string[];
  /** Background people expected. */
  crowd: "none" | "few" | "busy";
  /** Seen from behind at the edge of frame (an over-the-shoulder shot): allowed, not required (D19c). */
  shoulder?: string[];
  /** Only partly in the frame, cut by its edge (D31): allowed, not required. */
  edge?: string[];
  /** Where each key prop must be (D21): side of the frame and depth relative to the people. */
  propPlaces?: { name: string; side: "left" | "centre" | "right"; depth: "among the people" | "behind everyone" | "in front of everyone" }[];
  /** Props that have a reference picture, sent with the check. */
  propPictures?: string[];
  /** Venue areas expected at the left and right of the background (D21), from the 360° ring. */
  backgroundSides?: { left?: string; right?: string };
  /** All the venue's area names, for the model to choose from. */
  venueAreas?: string[];
  /** Items held on one side (D34): who, what, and which side of the picture it must be on. */
  held?: { name: string; item: string; side: "left" | "right" }[];
  /** Image 2 is the blocking frame (the approved shot) rather than the plain layout sketch. */
  blocking?: boolean;
  /** How each person's body must be (D37): standing, sitting, lying, kneeling or crouching. */
  postures?: { name: string; pose: "standing" | "sitting" | "lying" | "kneeling" | "crouching"; on?: string }[];
  /** Eye contact is asked on close crops of each face (D54), not on the whole picture. */
  gazeByFace?: boolean;
  /**
   * Props the detector can find (D55): their kind, where across the picture they should be, and
   * where their foot should meet the floor (0 top, 1 bottom), projected from the plan.
   */
  propSpots?: { name: string; kind: string; x: number; baseY: number; among?: boolean }[];
  /** Where each main person should be in the picture (B1), projected from the plan. */
  figures?: Figure[];
}

/** Who a main character is, for the plan check (D52): their name and one line on how to recognise them. */
export interface Who { name: string; look: string }

/**
 * Where a main person should be in the storyboard picture (B1), as fractions of its width and
 * height (0 = left or top edge): the middle of their body across, the top of their head and
 * their feet (beyond 1 when the bottom edge cuts them). Only standing people get a size.
 */
export interface Figure { name: string; x: number; headY: number; feetY: number; standing: boolean }

/** The three things a picture can get wrong, judged separately (B1): one can't make up for another. */
export type CheckArea = "blocking" | "look" | "room";
export const AREA_LABEL: Record<CheckArea, string> = { blocking: "Blocking", look: "Characters' look", room: "Room and props" };
export interface AreaResult { pass: boolean; problems: string[]; unmeasured: string[] }

export interface PictureCheck {
  pass: boolean;
  problems: string[];
  /** A wrong composition (size, eye level, framing, place across): redrawn from image 1, not edited (B2). */
  redraw?: boolean;
  /** Blocking, the characters' look, and the room and props, each passed or failed on its own (B1). */
  areas?: Record<CheckArea, AreaResult>;
  /** Each person against their planned box (D51, D52): the model's comparison, roughly how many times the planned height, and where their head is (0 top, 1 bottom) against where the plan puts it. */
  measured?: { name: string; fit?: string; heightRatio?: number; headY?: number; plannedHeadY?: number; x?: number; plannedX?: number; /** The detector's outline number (D53). */ box?: number }[];
  /** Each detectable prop's measured place against the plan (D55). */
  propsMeasured?: { name: string; x: number; plannedX: number; baseY: number; plannedBaseY: number }[];
  /** How sizes and heads were found (D53): measured by the detector, or the vision model's estimate. */
  measuredBy?: "detector" | "estimate";
  /** Heads against the planned eye level (D52): "on", "above" or "below", read from where the heads are. */
  eyeLevel?: string;
}

export function checkPrompt(e: PictureExpectation, refNames: string[]): string {
  return [
    "You are checking a storyboard picture against its approved layout. Report only what you actually see.",
    "",
    "Image 1 is the picture to check.",
    e.blocking
      ? "Image 2 is the approved shot: the real room from this camera with labelled stand-ins showing who stands where and which way they face, orange arrows for walking and yellow tags for held items."
      : "Image 2 is the layout sketch: simple labelled shapes showing who stands where and what the camera sees.",
    ...(refNames.length ? [`The next images are reference pictures, in this order: ${refNames.join(", ")}. Use the character ones to tell who is who and to check their clothes; use the prop ones to check how each prop looks.`] : []),
    "",
    `Expected main characters, left to right: ${e.order.length ? e.order.join(", ") : "none"}.${e.shoulder?.length ? ` ${e.shoulder.join(" and ")} may also be seen from behind in the foreground; don't list them.` : ""}`,
    ...(e.edge?.length ? [`${e.edge.join(" and ")} may also be partly visible, cut by the edge of the picture; list them too if you can see them.`] : []),
    `Key props that should be visible: ${e.props.length ? e.props.join(", ") : "none"}.`,
    `Background people expected: ${e.crowd === "none" ? "no one else" : e.crowd === "few" ? "a few other people" : "a busy crowd"}.`,
    ...(e.held?.length ? [`Held items to locate: ${e.held.map((h) => `${h.name}'s ${h.item}`).join(", ")}. For each, say which side of the picture it is on, as you look at it.`] : []),
    ...(e.postures?.length ? [`Postures to check: ${e.postures.map((x) => x.name).join(", ")}. For each, say whether they are standing, sitting, lying, kneeling or crouching.`] : []),
    "",
    ...(e.venueAreas?.length ? [`The venue's areas are: ${e.venueAreas.join(", ")}.`] : []),
    "",
    "Ignore style, lighting and small differences in pose or expression. Do check clothes, accessories, carried items and props against their reference pictures: a missing stripe or panel, a different colour, a bag in the other hand, or a table without its cloth is a real difference.",
    "Reply with JSON only, no other text:",
    `{"left_to_right": ["the main characters you see, left to right, by name; use \\"unknown\\" for anyone you cannot match"], "clothes": [{"name": "character", "matches_reference": true, "difference": "what differs, or empty"}], "props": [{"name": "key prop", "side": "left | centre | right", "depth": "among the people | behind everyone | in front of everyone", "matches_picture": true, "difference": "what differs from its reference picture, or empty"}], "props_seen": ["key props you can see"], "background_left": "which venue area is at the left of the background, or none", "background_right": "which venue area is at the right of the background, or none", "background_people": "none | few | busy", ${e.gazeByFace ? "" : '"looking_at_camera": ["main characters whose eyes look straight into the lens, making eye contact with the viewer (facing the camera while looking at someone else does not count), or empty"], '} "held": [{"name": "character", "item": "the item", "picture_side": "left | right | not visible"}], "postures": [{"name": "character", "pose": "standing | sitting | lying | kneeling | crouching"}], "notes": "one short sentence on anything clearly wrong, or empty"}`,
  ].join("\n");
}

/**
 * The plan check (D52), asked on its own so it gets the model's full attention: the picture,
 * then the same picture with the plan drawn on it. Heads are read as numbers, which the model
 * reads well; size is a comparison with the box, which it can make. Who is who comes from a line
 * on how each person looks, because the boxes sit where people should be, not where they are.
 */
export function planPrompt(e: PictureExpectation, who: Who[]): string {
  const names = (e.figures ?? []).map((f) => f.name);
  return [
    "You are checking where people are in a storyboard picture against its plan. Report only what you actually see.",
    "",
    "Image 1 is the picture. Image 2 is the same picture with the plan drawn on it: a dashed, named box for each main character showing where they should be and how tall they should look (the top of the box is the top of their head, the bottom is their feet; a box can run off the bottom edge), and a white dashed line for the planned eye level.",
    "",
    `The main characters, expected left to right: ${names.join(", ")}. How to recognise them:`,
    ...who.filter((w) => names.includes(w.name)).map((w) => `- ${w.name}: ${w.look}`),
    "Find each person in image 1 by how they look. The boxes in image 2 are where they should be, not where they are.",
    "",
    "For each main character:",
    "- head_top: how far down the picture the top of their head (hair included) is, from 0 at the top edge to 1 at the bottom edge, to two decimals. Read it from image 1.",
    "- vs_box: their whole body compared with their box in image 2: \"about the same\", \"taller\", \"shorter\", \"away from it\" (they stand clearly somewhere else), or \"hidden\" (you can't see enough of them).",
    "- times: roughly how many times the box's height they are (2 means twice as tall, 0.5 half as tall).",
    "",
    "Reply with JSON only, no other text:",
    '{"people": [{"name": "character", "head_top": 0.5, "vs_box": "about the same | taller | shorter | away from it | hidden", "times": 1}]}',
  ].join("\n");
}

/**
 * Which outline is whom (D53). The detector has outlined and numbered everyone; the model only
 * matches the main characters to numbers, which it does well. All measuring is done by rule.
 */
export function marksPrompt(e: PictureExpectation, who: Who[], count: number): string {
  const names = (e.figures ?? []).map((f) => f.name);
  return [
    "You are matching people in a storyboard picture. Report only what you actually see.",
    "",
    `Image 1 is the picture with every person found in it outlined and numbered 1 to ${count}, left to right.`,
    "",
    `The main characters, expected left to right: ${names.join(", ")}. How to recognise them:`,
    ...who.filter((w) => names.includes(w.name)).map((w) => `- ${w.name}: ${w.look}`),
    "",
    "For each main character, give the number of the outline around them. Use 0 if they aren't in the picture or have no outline of their own. A number belongs to one person only.",
    "",
    "Reply with JSON only, no other text:",
    '{"people": [{"name": "character", "box": 1}]}',
  ].join("\n");
}

/** The JSON object in a model's reply, possibly inside a code fence; an empty object if there isn't one. */
function replyObject(text: string): Record<string, unknown> {
  try { return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "") as Record<string, unknown>; } catch { return {}; }
}

/**
 * Which outline is whom (D53), from the model's answer: one outline per person, and only the
 * main characters the check judges.
 */
export function matchPeople(e: PictureExpectation, plan: MeasuredPlan): { name: string; box: Person }[] {
  const people = replyObject(plan.reply).people;
  const picks = Array.isArray(people) ? people.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : [];
  const first = (t: string) => (t.split(/\s+/)[0] ?? t).toLowerCase().replace(/[^a-z]/g, "");
  const used = new Set<number>();
  return (e.figures ?? []).flatMap((want) => {
    const n = Math.round(Number(picks.find((f) => first(String(f.name ?? "")) === first(want.name))?.box));
    const box = Number.isFinite(n) && n > 0 && !used.has(n) ? plan.people.find((p) => p.n === n) : undefined;
    if (!box) return [];
    used.add(n);
    return [{ name: want.name, box }];
  });
}

/**
 * Eye contact (D54), asked on a close crop of each main character's face, in the order given. The
 * crop also confirms the match: if the person in the middle of it isn't the one described, the
 * outline picked was someone else's, and that person isn't measured.
 */
export function gazePrompt(people: Who[]): string {
  return [
    "You are checking people in close-ups from a storyboard picture. Report only what you actually see.",
    "",
    "Each image is a close crop of one person's head and shoulders, in this order:",
    ...people.map((p, i) => `- image ${i + 1} should be ${p.name}${p.look ? `: ${p.look}` : ""}`),
    "",
    "For each image, look at the person in the middle of it:",
    "- is_them: \"yes\" if they fit the description, \"no\" only if they are clearly someone else (a different face, hair or clothes that the close-up shows), \"can't tell\" if not enough of them shows. Clothes the close-up can't show don't count against them: someone seen from behind, whose described clothes are out of view, is \"can't tell\" unless their hair or what does show clearly differs.",
    "- eyes: \"into the lens\" only if their eyes look straight into the camera, making eye contact with the viewer. Someone whose face or body is turned towards the camera but whose eyes look at another person or anything else is \"elsewhere\"; so is someone seen from behind or side-on. \"can't tell\" if you can't see their eyes clearly enough.",
    "",
    "Reply with JSON only, no other text:",
    '{"people": [{"name": "character", "is_them": "yes | no | can\'t tell", "eyes": "into the lens | elsewhere | can\'t tell"}]}',
  ].join("\n");
}

/** Who the face check says was matched to the wrong person (D54). */
function wrongMatches(gaze: GazeEvidence | undefined): Set<string> {
  if (!gaze) return new Set();
  const v = replyObject(gaze.reply).people;
  const said = Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : [];
  const first = (t: string) => (t.split(/\s+/)[0] ?? t).toLowerCase().replace(/[^a-z]/g, "");
  return new Set(gaze.asked.filter((n) => /^no\b/.test(String(said.find((x) => first(String(x.name ?? "")) === first(n))?.is_them ?? "").toLowerCase().trim())));
}

/** The face check's evidence (D54): its answer, who was asked, and who was too small to ask about. */
export interface GazeEvidence { reply: string; asked: string[]; tooSmall: string[] }

/**
 * One line on how to recognise a character (D52): the first sentence of their clothes that names
 * a colour (a general opening like "smart-casual style" tells the model nothing), else the
 * first sentence, else their first anchor; cut at a word near 110 characters.
 */
export function lookLine(wardrobe: string, anchors: string[] = []): string {
  const colour = /\b(black|white|grey|gray|navy|blue|green|red|orange|tangerine|yellow|gold|pink|purple|lilac|lavender|violet|brown|tan|cream|ivory|beige|burgundy|maroon|teal|silver|khaki|olive|denim)\b/i;
  const sentences = wardrobe.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  const pick = sentences.find((x) => colour.test(x)) ?? sentences[0] ?? anchors[0] ?? "";
  if (pick.length <= 110) return pick.replace(/\.$/, "");
  const cut = pick.slice(0, 110);
  return cut.slice(0, cut.lastIndexOf(" ") > 60 ? cut.lastIndexOf(" ") : 110).replace(/[,;:]$/, "") + "…";
}

/** Decide pass or fail from what the model saw, by rule. */
export function judgePicture(e: PictureExpectation, reply: string, plan?: string | MeasuredPlan, gaze?: GazeEvidence): PictureCheck {
  // The answer is JSON, possibly inside a code fence: take the object itself.
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  let seen: { left_to_right?: unknown; props_seen?: unknown; background_people?: unknown; notes?: unknown; clothes?: unknown; props?: unknown; background_left?: unknown; background_right?: unknown; looking_at_camera?: unknown };
  try {
    seen = JSON.parse(json ?? "");
  } catch {
    return { pass: false, problems: ["The check couldn't read the picture. Look at it yourself."] };
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const first = (s: string) => norm(s.split(/\s+/)[0] ?? s);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const people = list(seen.left_to_right);
  // Each problem belongs to one area (B1); a composition problem is redrawn rather than edited (B2).
  const issues: { area: CheckArea; text: string; redraw?: boolean }[] = [];
  const unmeasured: Record<CheckArea, string[]> = { blocking: [], look: [], room: [] };
  const add = (area: CheckArea, text: string, redraw = false) => issues.push({ area, text, ...(redraw ? { redraw } : {}) });

  const expected = e.order.map(first);
  const found = people.map(first).filter((n) => expected.includes(n));
  const missing = e.order.filter((n) => !found.includes(first(n)));
  if (missing.length) add("blocking", `${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} missing.`);
  const shoulder = [...(e.shoulder ?? []), ...(e.edge ?? [])].map(first);
  const unknown = people.filter((p) => !expected.includes(first(p)) && !shoulder.includes(first(p)));
  if (unknown.length > 0 && e.order.length > 0) add("blocking", `${unknown.length} extra main ${unknown.length === 1 ? "person" : "people"} who shouldn't be there.`);
  if (!missing.length) {
    const wrong = expected.some((n, i) => found[i] !== n);
    if (wrong) add("blocking", `Wrong order: expected ${e.order.join(", ")} from left to right.`);
  }
  const props = list(seen.props_seen).map(norm);
  const propMissing = e.props.filter((p) => !props.some((s) => s.includes(norm(p).slice(-6)) || norm(p).includes(s)));
  if (propMissing.length) add("room", `The ${propMissing.join(" and the ")} ${propMissing.length === 1 ? "is" : "are"} missing.`);
  // Clothes and carried items against the reference pictures (D21).
  const objs = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : []);
  for (const c of objs(seen.clothes)) {
    if (c.matches_reference === false && expected.includes(first(String(c.name ?? "")))) add("look", `${String(c.name)}'s clothes differ from the reference: ${String(c.difference ?? "").trim() || "check them"}.`);
  }
  // Props: in their place and looking like their picture (D21).
  for (const p of objs(seen.props)) {
    const want = e.propPlaces?.find((x) => norm(x.name) === norm(String(p.name ?? "")) || norm(String(p.name ?? "")).includes(norm(x.name).slice(-6)));
    if (!want) continue;
    const side = String(p.side ?? "").toLowerCase();
    const depth = String(p.depth ?? "").toLowerCase();
    // Only the opposite side counts as wrong; centre is close enough either way.
    const opposite = want.side === "left" ? "right" : want.side === "right" ? "left" : "";
    if (opposite && side.includes(opposite)) add("room", `The ${want.name} should be on the ${want.side}, not the ${opposite}.`);
    const key = (d: string) => (/behind/.test(d) ? "behind" : /front/.test(d) ? "front" : /among/.test(d) ? "among" : "");
    // Behind versus in front is a real mistake; "among" is the boundary between them.
    if (key(depth) && key(want.depth) !== "among" && key(depth) !== "among" && key(depth) !== key(want.depth)) add("room", `The ${want.name} should be ${want.depth}, not ${depth}.`);
    if (key(want.depth) === "behind" && key(depth) === "among") add("room", `The ${want.name} should be ${want.depth}, several metres back, not beside the people.`);
    if (p.matches_picture === false && e.propPictures?.some((n) => norm(n) === norm(want.name))) add("room", `The ${want.name} doesn't look like its picture: ${String(p.difference ?? "").trim() || "check it"}.`);
  }
  // The room's order (D21): what's at the left and right of the background.
  const area = (v: unknown) => norm(String(v ?? ""));
  const sides = e.backgroundSides;
  if (sides?.left && sides.right) {
    const l = area(seen.background_left), r = area(seen.background_right);
    if (l && r && l.includes(norm(sides.right).slice(0, 5)) && r.includes(norm(sides.left).slice(0, 5))) add("room", `The room is the wrong way round: the ${sides.left} belongs on the left and the ${sides.right} on the right.`);
  }
  // Held items on the right side of the picture (D34): decided here from the floor plan and
  // the reference, not left to the model's sense of left and right.
  for (const h of objs((seen as { held?: unknown }).held)) {
    // Matched by kind of thing: the check may call the satchel a handbag.
    const want = e.held?.find((x) => first(x.name) === first(String(h.name ?? "")) && itemGroup(String(h.item ?? "")) === itemGroup(x.item));
    const side = String(h.picture_side ?? "").toLowerCase();
    if (want && /^(left|right)$/.test(side) && side !== want.side) add("look", `${want.name}'s ${want.item} is on the ${side} of the picture; move it to the ${want.side} side of the picture, into ${want.name}'s other hand, as in the reference. The hand on the ${side} side is then empty and relaxed.`);
  }
  // Posture (D37): someone who should still be lying isn't standing.
  for (const x of objs((seen as { postures?: unknown }).postures)) {
    const want = e.postures?.find((w) => first(w.name) === first(String(x.name ?? "")));
    const got = String(x.pose ?? "").toLowerCase().trim();
    if (want && /^(standing|sitting|lying|kneeling|crouching)$/.test(got) && got !== want.pose) add("blocking", `${want.name} is ${got}; ${want.name} must be ${want.pose}${want.on ? ` ${want.pose === "standing" ? "by" : "on"} ${want.on}` : ""}, as in the approved shot.`);
  }
  // Nobody looks into the lens (D21b), judged on a close crop of each face when there is one
  // (D54): on the whole picture the model took facing the camera for eye contact.
  let lookers = list(seen.looking_at_camera).filter((n) => expected.includes(first(n)));
  if (gaze) {
    const eyes = (() => { const v = replyObject(gaze.reply).people; return Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : []; })();
    lookers = [];
    const wrong = wrongMatches(gaze);
    for (const name of gaze.asked.filter((n) => !wrong.has(n))) {
      const said = String(eyes.find((x) => first(String(x.name ?? "")) === first(name))?.eyes ?? "").toLowerCase();
      if (/into the lens/.test(said)) lookers.push(name);
      else if (!/elsewhere/.test(said)) unmeasured.blocking.push(`${name}: eyes not clear, eye contact not judged`);
    }
    for (const name of gaze.tooSmall) unmeasured.blocking.push(`${name}: face too small to see where they look`);
  }
  else if (e.gazeByFace && e.order.length) unmeasured.blocking.push("eye contact: not judged");
  if (lookers.length) add("blocking", `${lookers.join(" and ")} ${lookers.length === 1 ? "is" : "are"} looking at the camera; they should look at each other as the moment says.`);
  const bg = String(seen.background_people ?? "").toLowerCase();
  if (e.crowd !== "none" && /none/.test(bg)) add("room", "No background people, but the scene has them.");

  // Eye level, sizes and places against the plan (B1, D51 to D53), from the separate plan check.
  // Anything it couldn't see is "couldn't judge", never a pass.
  const measured: NonNullable<PictureCheck["measured"]> = [];
  let eyeLevel: string | undefined;
  let measuredBy: PictureCheck["measuredBy"];
  const pct = (y: number) => `${Math.round(y * 100)}%`;
  const offsets: { head: number; planned: number }[] = [];
  const parsePlan = (text: string) => { try { return objs((JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "") as { people?: unknown }).people); } catch { return []; } };
  const judged = (e.figures ?? []).filter((want) => !(want.headY < 0.02 || want.feetY - want.headY >= 0.85) && !missing.some((m) => first(m) === first(want.name)));

  if (typeof plan === "object" && e.figures?.length) {
    // Measured (D53): the detector's outline for each person, matched by the model.
    measuredBy = "detector";
    const matched = matchPeople(e, plan);
    const wrong = wrongMatches(gaze);
    for (const want of judged) {
      const box = matched.find((x) => x.name === want.name)?.box;
      if (!box) { unmeasured.blocking.push(`${want.name}: not matched to anyone found, not measured`); continue; }
      if (wrong.has(want.name)) { unmeasured.blocking.push(`${want.name}: the outline picked was someone else, not measured`); continue; }
      const n = box.n!;
      const cx = (box.x0 + box.x1) / 2;
      const m: (typeof measured)[number] = { name: want.name, box: n, headY: +box.y0.toFixed(3), plannedHeadY: want.headY, x: +cx.toFixed(3), plannedX: want.x };
      measured.push(m);
      offsets.push({ head: box.y0, planned: want.headY });
      // Place across: off by more than their own planned width, and at least 15% of the picture.
      const plannedTall = Math.min(want.feetY, 1) - want.headY;
      if (Math.abs(cx - want.x) > Math.max(0.15, 0.28 * plannedTall * plan.aspect)) {
        m.fit = "elsewhere";
        add("blocking", `${want.name} is about ${pct(cx)} of the way across the picture; image 1 has them about ${pct(want.x)} across.`, true);
        continue;
      }
      if (!want.standing || plannedTall < 0.03) continue; // a seated or kneeling body's height can't be judged the same way
      // An outline much less than twice as tall as it is wide, not cut by the bottom edge, is
      // someone partly behind something (a table, another person): their height isn't theirs.
      const atEdge = box.y1 > 0.97;
      if (!atEdge && ((box.y1 - box.y0) * plan.aspect) / Math.max(0.001, box.x1 - box.x0) < 1.9) { unmeasured.blocking.push(`${want.name}: partly hidden, size not measured`); continue; }
      const tall = Math.min(box.y1, 1) - box.y0, ratio = tall / plannedTall;
      m.heightRatio = +ratio.toFixed(2);
      m.fit = ratio >= 1.5 ? "bigger" : ratio <= 0.67 ? "smaller" : "fits";
      if (m.fit === "bigger") add("blocking", `${want.name} is drawn about ${ratio.toFixed(1)} times the planned height (${pct(tall)} of the picture's height, planned ${pct(plannedTall)}), so too close to the camera; in image 1 they are much smaller and further back.`, true);
      if (m.fit === "smaller") add("blocking", `${want.name} is drawn at about ${pct(tall)} of the picture's height, planned ${pct(plannedTall)}${want.feetY > 1.05 && !atEdge ? ": the camera has moved back to show the whole body, but image 1 cuts them at the bottom edge" : ", so too far away"}.`, true);
    }
  } else if (typeof plan === "string" && e.figures?.length) {
    // The vision model's estimate (D52), when the detector can't run.
    measuredBy = "estimate";
    unmeasured.blocking.push("exact sizes and heads (the person detector isn't running, so these are the vision model's estimate; run npm install and restart)");
    const got = parsePlan(plan);
    for (const want of judged) {
      const g = got.find((f) => first(String(f.name ?? "")) === first(want.name));
      const vs = String(g?.vs_box ?? "").toLowerCase().trim();
      const t = Number(g?.times), h = Number(g?.head_top);
      const times = Number.isFinite(t) && t > 0 && t < 20 ? t : undefined;
      const head = Number.isFinite(h) && h >= 0 && h <= 1 && g?.head_top !== null && g?.head_top !== "" ? h : undefined;
      const m: (typeof measured)[number] = { name: want.name, plannedHeadY: want.headY };
      if (head !== undefined) { m.headY = +head.toFixed(2); offsets.push({ head, planned: want.headY }); }
      measured.push(m);
      if (/hidden/.test(vs) || !/same|taller|shorter|away/.test(vs)) { unmeasured.blocking.push(`${want.name}: ${/hidden/.test(vs) ? "hidden, size not judged" : "size not judged"}`); continue; }
      m.fit = /same/.test(vs) ? "fits" : /taller/.test(vs) ? "bigger" : /shorter/.test(vs) ? "smaller" : "elsewhere";
      if (times !== undefined) m.heightRatio = +times.toFixed(2);
      if (m.fit === "elsewhere") { add("blocking", `${want.name} isn't where image 1 puts them: they stand clearly away from their place.`, true); continue; }
      if (!want.standing || m.fit === "fits") continue;
      // Someone the plan cuts at the bottom edge shows as much of themselves as their head's
      // height allows, so their size is the eye level's; only pulling back to show more counts.
      const cut = want.feetY > 0.98;
      if (m.fit === "bigger" && !cut && (times === undefined || times >= 1.5)) {
        add("blocking", `${want.name} is drawn ${times !== undefined ? `about ${times.toFixed(1)} times` : "clearly"} taller than planned, so too close to the camera; in image 1 they are much smaller and further back.`, true);
      }
      if (m.fit === "smaller" && (times === undefined || times <= 0.67)) {
        add("blocking", `${want.name} is drawn ${times !== undefined ? `about ${(1 / times).toFixed(1)} times` : "clearly"} shorter than planned${cut ? ": the camera has moved back to show the whole body, but image 1 cuts them at the bottom edge" : ", so too far away"}.`, true);
      }
    }
  }
  if (plan !== undefined && e.figures?.length) {
    // Eye level: where the heads are against where the plan puts them. The middle of the
    // differences, so one misread head doesn't decide it; a level camera at eye height keeps
    // standing heads on the eye-level line, near or far.
    if (offsets.length) {
      const d = offsets.map((o) => o.head - o.planned).sort((a, b) => a - b);
      const mid = d.length % 2 ? d[(d.length - 1) / 2] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2;
      const avg = (k: "head" | "planned") => offsets.reduce((a, o) => a + o[k], 0) / offsets.length;
      if (mid < -0.08) { eyeLevel = "above"; add("blocking", `The camera is too high or tilted down: heads are about ${pct(avg("head"))} of the way down the picture, but image 1 has them about ${pct(avg("planned"))} down, on the eye-level line. Keep the camera level at image 1's height, so heads sit where they are in image 1.`, true); }
      else if (mid > 0.08) { eyeLevel = "below"; add("blocking", `The camera is too low or tilted up: heads are about ${pct(avg("head"))} of the way down the picture, but image 1 has them about ${pct(avg("planned"))} down, on the eye-level line. Keep the camera level at image 1's height, so heads sit where they are in image 1.`, true); }
      else eyeLevel = "on";
    } else unmeasured.blocking.push("eye level: not judged");
  }

  // Props the detector knows, against their planned place (D55): the same measuring as the people,
  // judged only when the eye level is right; when the camera is wrong everything moves and the
  // camera problem says so. A table several metres in front of the group it should stand among
  // passed the model's front-or-behind question.
  const propsMeasured: NonNullable<PictureCheck["propsMeasured"]> = [];
  if (typeof plan === "object" && e.propSpots?.length) {
    for (const spot of e.propSpots) {
      if (eyeLevel !== "on") break;
      const near = (plan.things ?? []).filter((t) => t.kind === spot.kind)
        .map((t) => ({ t, dx: Math.abs((t.x0 + t.x1) / 2 - spot.x) })).sort((a, b) => a.dx - b.dx)[0];
      if (!near || near.dx > 0.3) { unmeasured.room.push(`the ${spot.name}: not found by the detector, place not measured`); continue; }
      const cx = (near.t.x0 + near.t.x1) / 2, foot = Math.min(near.t.y1, 1);
      propsMeasured.push({ name: spot.name, x: +cx.toFixed(3), plannedX: spot.x, baseY: +foot.toFixed(3), plannedBaseY: spot.baseY });
      const where = `its foot is about ${pct(foot)} of the way down the picture, but image 1 has it about ${pct(spot.baseY)} down${spot.among ? ", among the people" : ""}`;
      if (foot - spot.baseY > 0.08) add("room", `The ${spot.name} is well in front of where image 1 puts it: ${where}. Keep it where image 1 shows it.`, true);
      else if (spot.baseY - foot > 0.08) add("room", `The ${spot.name} is well behind where image 1 puts it: ${where}. Keep it where image 1 shows it.`, true);
      else if (Math.abs(cx - spot.x) > 0.15) add("room", `The ${spot.name} is about ${pct(cx)} of the way across the picture; image 1 has it about ${pct(spot.x)} across.`, true);
    }
  }

  const areas = Object.fromEntries((["blocking", "look", "room"] as CheckArea[]).map((a) => {
    const ps = issues.filter((x) => x.area === a).map((x) => x.text);
    return [a, { pass: ps.length === 0, problems: ps, unmeasured: unmeasured[a] }];
  })) as Record<CheckArea, AreaResult>;
  const problems = issues.map((x) => x.text);
  return { pass: problems.length === 0, problems, areas, ...(issues.some((x) => x.redraw) ? { redraw: true } : {}), ...(measured.length ? { measured } : {}), ...(eyeLevel ? { eyeLevel } : {}), ...(measuredBy ? { measuredBy } : {}), ...(propsMeasured.length ? { propsMeasured } : {}) };
}

/** The extra instruction for the one automatic redraw. */
export function fixLine(problems: string[]): string {
  return `\nThe last attempt did not match the approved layout. Fix these problems: ${problems.join(" ")}`;
}

/**
 * The reference pictures a correction needs (D41): only those of the people and props its
 * problems name. The picture being fixed already shows everyone else as they should be, so
 * sending every reference again only adds cost. Views and earlier approved pictures aren't sent.
 */
export function correctionRefs(problems: string[], attach: { label: string; assetId: string; href?: string }[]): string[] {
  const text = problems.join(" ").toLowerCase();
  const named = (w: string) => w.length > 2 && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);
  return attach.filter((a) => !a.href && a.assetId).filter((a) => {
    const m = /^(.*?)\s+(reference|back|picture)$/i.exec(a.label);
    if (!m) return false;
    const words = m[1].toLowerCase().split(/\s+/);
    // People by first name ("Chase" for Chase Whitmore); props by full name or last word ("table").
    return m[2].toLowerCase() === "picture" ? named(m[1].toLowerCase()) || named(words[words.length - 1]) : named(words[0]);
  }).map((a) => a.assetId);
}

/**
 * A targeted correction (D34): image 1 is the picture that didn't match; it is edited to fix
 * only what the check found, keeping everything else. With a blocking frame, image 2 is the
 * approved shot to match.
 */
export function correctionPrompt(problems: string[], withBlocking: boolean): string {
  return [
    "Edit image 1. It is nearly right; fix ONLY these problems and change nothing else. Each fix must be clearly visible in the new picture; returning the same picture is not acceptable:",
    ...problems.map((p) => `- ${p}`),
    withBlocking
      ? "Image 2 is the approved shot: who stands where, which way each person faces, the yellow tags for held items, the orange arrows for walking, and the background. Make image 1 match image 2 on the points above. Do not copy image 2's outlines, labels, arrows or tags into the picture."
      : "The layout sketch attached last shows who stands where; make image 1 match it on the points above.",
    "The remaining images are reference pictures: use them for how each character and prop looks. Keep a carried item in the hand the reference shows (their left hand is on the right of the picture when they face us, on the left when we see their back).",
    "Keep everyone's face, hair, clothes and pose, the room, the light, the camera position and the framing exactly as in image 1, apart from these fixes.",
  ].join("\n");
}
