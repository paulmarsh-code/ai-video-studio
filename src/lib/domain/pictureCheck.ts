// Automatic picture check (D19). Positions and cameras are geometry, approved and locked; an
// image model can still swap two people or drop a prop. So every GPT picture is compared with
// the approved layout before the user sees it: who is in it, left to right, the key props
// and the background people. The vision model only reports what it sees; the pass or fail
// is decided here, by rule.

import { itemGroup } from "./imagePrompts";

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
  /** Where each main person should be in the picture (B1), projected from the plan. */
  figures?: Figure[];
}

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
  /** What was measured for each person against the plan (B1): sizes as a multiple of the planned size, shifts as fractions of the picture. */
  measured?: { name: string; heightRatio?: number; headShift?: number; xShift?: number }[];
}

export function checkPrompt(e: PictureExpectation, refNames: string[]): string {
  return [
    "You are checking a storyboard picture against its approved layout. Report only what you actually see.",
    "",
    e.blocking
      ? "Image 1 is the picture to check. Image 2 is the approved shot: the real room from this camera with labelled stand-ins showing who stands where and which way they face, orange arrows for walking and yellow tags for held items."
      : "Image 1 is the picture to check. Image 2 is the layout sketch: simple labelled shapes showing who stands where and what the camera sees.",
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
    ...(e.figures?.length ? [
      "Measure where each main character you list is in image 1, as fractions of the picture: 0 is the left or top edge, 1 the right or bottom edge. box = [left, top, right, bottom] around their visible body; head_y = the top of their head; feet_y = where their feet meet the floor; feet = \"visible\", \"hidden\" (behind something) or \"below the bottom edge\". When you can't see their feet, feet_y is null: never guess a number for something you can't see.",
      "Also say whether the upright lines of the room (pillars, door frames, wall corners) stand upright and parallel, or lean in closer together at the bottom or at the top.",
      "",
    ] : []),
    "Ignore style, lighting and small differences in pose or expression. Do check clothes, accessories, carried items and props against their reference pictures: a missing stripe or panel, a different colour, a bag in the other hand, or a table without its cloth is a real difference.",
    "Reply with JSON only, no other text:",
    `{"left_to_right": ["the main characters you see, left to right, by name; use \\"unknown\\" for anyone you cannot match"], "clothes": [{"name": "character", "matches_reference": true, "difference": "what differs, or empty"}], "props": [{"name": "key prop", "side": "left | centre | right", "depth": "among the people | behind everyone | in front of everyone", "matches_picture": true, "difference": "what differs from its reference picture, or empty"}], "props_seen": ["key props you can see"], "background_left": "which venue area is at the left of the background, or none", "background_right": "which venue area is at the right of the background, or none", "background_people": "none | few | busy", "looking_at_camera": ["main characters looking straight into the camera, or empty"], "held": [{"name": "character", "item": "the item", "picture_side": "left | right | not visible"}], "postures": [{"name": "character", "pose": "standing | sitting | lying | kneeling | crouching"}], ${e.figures?.length ? '"figures": [{"name": "character", "box": [0.1, 0.3, 0.2, 0.7], "head_y": 0.3, "feet_y": 0.7, "feet": "visible | hidden | below the bottom edge"}], "verticals": "upright | closer at the bottom | closer at the top | can\'t tell", ' : ""}"notes": "one short sentence on anything clearly wrong, or empty"}`,
  ].join("\n");
}

/** Decide pass or fail from what the model saw, by rule. */
export function judgePicture(e: PictureExpectation, reply: string): PictureCheck {
  // The answer is JSON, possibly inside a code fence: take the object itself.
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  let seen: { left_to_right?: unknown; props_seen?: unknown; background_people?: unknown; notes?: unknown; clothes?: unknown; props?: unknown; background_left?: unknown; background_right?: unknown; looking_at_camera?: unknown; figures?: unknown; verticals?: unknown };
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
  // Nobody looks into the lens (D21b).
  const lookers = list(seen.looking_at_camera).filter((n) => expected.includes(first(n)));
  if (lookers.length) add("blocking", `${lookers.join(" and ")} ${lookers.length === 1 ? "is" : "are"} looking at the camera; they should look at each other as the moment says.`);
  const bg = String(seen.background_people ?? "").toLowerCase();
  if (e.crowd !== "none" && /none/.test(bg)) add("room", "No background people, but the scene has them.");

  // Sizes, places and eye level against the plan (B1). The model only measures; the plan
  // says what it should be. Anything it couldn't see is "not measured", never a pass.
  const measured: NonNullable<PictureCheck["measured"]> = [];
  if (e.figures?.length) {
    const figs = objs(seen.figures);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= -0.05 && v <= 1.05 ? v : undefined);
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const heads: number[] = [];
    for (const want of e.figures) {
      const got = figs.find((f) => first(String(f.name ?? "")) === first(want.name));
      if (!got) { if (!missing.some((m) => first(m) === first(want.name))) unmeasured.blocking.push(`${want.name}: not measured`); continue; }
      const m: (typeof measured)[number] = { name: want.name };
      measured.push(m);
      const box = Array.isArray(got.box) && got.box.length === 4 ? (got.box as unknown[]).map(num) : [];
      const okBox = box.length === 4 && box.every((v) => v !== undefined) && box[0]! < box[2]! && box[1]! < box[3]!;
      const headY = num(got.head_y);
      const feetSeen = /visible/i.test(String(got.feet ?? "")) || (got.feet === undefined && num(got.feet_y) !== undefined);
      const feetY = feetSeen ? num(got.feet_y) : undefined;
      if (headY !== undefined && want.headY > 0.02) { m.headShift = +(headY - want.headY).toFixed(3); heads.push(headY - want.headY); }
      // Across the picture: the middle of their visible body.
      if (okBox) {
        const cx = (box[0]! + box[2]!) / 2, dx = cx - want.x;
        m.xShift = +dx.toFixed(3);
        if (Math.abs(dx) > 0.2) add("blocking", `${want.name} is too far ${dx > 0 ? "right" : "left"} in the picture: at about ${pct(cx)} across instead of about ${pct(Math.min(1, Math.max(0, want.x)))}, as in image 1.`, true);
      } else unmeasured.blocking.push(`${want.name}: place across not measured`);
      // Size, for someone standing whose whole height should show (head below the top edge).
      const expH = want.feetY - want.headY;
      if (!want.standing || want.headY < 0.02 || expH >= 0.85) continue;
      const cutPlanned = want.feetY > 1.02;
      if (headY === undefined || feetY === undefined) {
        if (!cutPlanned) unmeasured.blocking.push(`${want.name}: size not measured (${/hidden/i.test(String(got.feet ?? "")) ? "feet hidden" : /below/i.test(String(got.feet ?? "")) ? "feet below the bottom edge" : "feet not seen"})`);
        else if (/below/i.test(String(got.feet ?? ""))) m.heightRatio = 1; // cut by the bottom edge, as planned
        continue;
      }
      if (cutPlanned) {
        if (feetY < 0.97) add("blocking", `${want.name}'s feet should be just out of the picture at the bottom edge, as in image 1, but the whole body is shown: the camera has moved back.`, true);
        continue;
      }
      const r = (feetY - headY) / expH;
      m.heightRatio = +r.toFixed(2);
      if (r > 1.5 || r < 0.67) add("blocking", `${want.name} is drawn about ${r >= 1 ? r.toFixed(1) : (1 / r).toFixed(1)} times too ${r > 1 ? "big" : "small"}: ${pct(feetY - headY)} of the picture's height instead of about ${pct(expH)}, so ${r > 1 ? "too close to the camera" : "too far away"}.`, true);
    }
    // Everyone higher or lower together: the camera was tilted or moved, not one person misplaced.
    const verts = String(seen.verticals ?? "").toLowerCase();
    const lean = /closer at the (bottom|top)/.test(verts);
    if (heads.length) {
      const sorted = [...heads].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
      if (Math.abs(med) > 0.1 || (lean && Math.abs(med) > 0.06)) add("blocking", `Heads are ${med < 0 ? "higher" : "lower"} in the picture than in image 1, by about ${pct(Math.abs(med))} of its height${lean ? `, and the room's upright lines lean in ${verts.replace(/.*closer/, "closer")}` : ""}: the camera has been tilted or moved. Keep it level, at image 1's height and angle.`, true);
    } else unmeasured.blocking.push("eye level: no heads measured");
  }

  const areas = Object.fromEntries((["blocking", "look", "room"] as CheckArea[]).map((a) => {
    const ps = issues.filter((x) => x.area === a).map((x) => x.text);
    return [a, { pass: ps.length === 0, problems: ps, unmeasured: unmeasured[a] }];
  })) as Record<CheckArea, AreaResult>;
  const problems = issues.map((x) => x.text);
  return { pass: problems.length === 0, problems, areas, ...(issues.some((x) => x.redraw) ? { redraw: true } : {}), ...(measured.length ? { measured } : {}) };
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
