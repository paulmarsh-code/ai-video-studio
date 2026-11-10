// Automatic picture check (D19). Positions and cameras are geometry, approved and locked; an
// image model can still swap two people or drop a prop. So every GPT picture is compared with
// the approved layout before the user sees it: who is in it, left to right, the key props
// and the background people. The vision model only reports what it sees; the pass or fail
// is decided here, by rule.

export interface PictureExpectation {
  /** Main characters the camera sees, left to right, from the approved floor plan. */
  order: string[];
  /** Key props the camera sees. */
  props: string[];
  /** Background people expected. */
  crowd: "none" | "few" | "busy";
  /** Seen from behind at the edge of frame (an over-the-shoulder shot): allowed, not required (D19c). */
  shoulder?: string[];
  /** Where each key prop must be (D21): side of the frame and depth relative to the people. */
  propPlaces?: { name: string; side: "left" | "centre" | "right"; depth: "among the people" | "behind everyone" | "in front of everyone" }[];
  /** Props that have a reference picture, sent with the check. */
  propPictures?: string[];
  /** Venue areas expected at the left and right of the background (D21), from the 360° ring. */
  backgroundSides?: { left?: string; right?: string };
  /** All the venue's area names, for the model to choose from. */
  venueAreas?: string[];
}

export interface PictureCheck {
  pass: boolean;
  problems: string[];
}

export function checkPrompt(e: PictureExpectation, refNames: string[]): string {
  return [
    "You are checking a storyboard picture against its approved layout. Report only what you actually see.",
    "",
    "Image 1 is the picture to check. Image 2 is the layout sketch: simple labelled shapes showing who stands where and what the camera sees.",
    ...(refNames.length ? [`The next images are reference pictures, in this order: ${refNames.join(", ")}. Use the character ones to tell who is who and to check their clothes; use the prop ones to check how each prop looks.`] : []),
    "",
    `Expected main characters, left to right: ${e.order.length ? e.order.join(", ") : "none"}.${e.shoulder?.length ? ` ${e.shoulder.join(" and ")} may also be seen from behind in the foreground; don't list them.` : ""}`,
    `Key props that should be visible: ${e.props.length ? e.props.join(", ") : "none"}.`,
    `Background people expected: ${e.crowd === "none" ? "no one else" : e.crowd === "few" ? "a few other people" : "a busy crowd"}.`,
    "",
    ...(e.venueAreas?.length ? [`The venue's areas are: ${e.venueAreas.join(", ")}.`] : []),
    "",
    "Ignore style, lighting and small differences in pose or expression. Do check clothes, accessories, carried items and props against their reference pictures: a missing stripe or panel, a different colour, a bag in the other hand, or a table without its cloth is a real difference.",
    "Reply with JSON only, no other text:",
    '{"left_to_right": ["the main characters you see, left to right, by name; use \\"unknown\\" for anyone you cannot match"], "clothes": [{"name": "character", "matches_reference": true, "difference": "what differs, or empty"}], "props": [{"name": "key prop", "side": "left | centre | right", "depth": "among the people | behind everyone | in front of everyone", "matches_picture": true, "difference": "what differs from its reference picture, or empty"}], "props_seen": ["key props you can see"], "background_left": "which venue area is at the left of the background, or none", "background_right": "which venue area is at the right of the background, or none", "background_people": "none | few | busy", "notes": "one short sentence on anything clearly wrong, or empty"}',
  ].join("\n");
}

/** Decide pass or fail from what the model saw, by rule. */
export function judgePicture(e: PictureExpectation, reply: string): PictureCheck {
  // The answer is JSON, possibly inside a code fence: take the object itself.
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  let seen: { left_to_right?: unknown; props_seen?: unknown; background_people?: unknown; notes?: unknown; clothes?: unknown; props?: unknown; background_left?: unknown; background_right?: unknown };
  try {
    seen = JSON.parse(json ?? "");
  } catch {
    return { pass: false, problems: ["The check couldn't read the picture. Look at it yourself."] };
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const first = (s: string) => norm(s.split(/\s+/)[0] ?? s);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const people = list(seen.left_to_right);
  const problems: string[] = [];

  const expected = e.order.map(first);
  const found = people.map(first).filter((n) => expected.includes(n));
  const missing = e.order.filter((n) => !found.includes(first(n)));
  if (missing.length) problems.push(`${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} missing.`);
  const shoulder = (e.shoulder ?? []).map(first);
  const unknown = people.filter((p) => !expected.includes(first(p)) && !shoulder.includes(first(p)));
  if (unknown.length > 0 && e.order.length > 0) problems.push(`${unknown.length} extra main ${unknown.length === 1 ? "person" : "people"} who shouldn't be there.`);
  if (!missing.length) {
    const wrong = expected.some((n, i) => found[i] !== n);
    if (wrong) problems.push(`Wrong order: expected ${e.order.join(", ")} from left to right.`);
  }
  const props = list(seen.props_seen).map(norm);
  const propMissing = e.props.filter((p) => !props.some((s) => s.includes(norm(p).slice(-6)) || norm(p).includes(s)));
  if (propMissing.length) problems.push(`The ${propMissing.join(" and the ")} ${propMissing.length === 1 ? "is" : "are"} missing.`);
  // Clothes and carried items against the reference pictures (D21).
  const objs = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : []);
  for (const c of objs(seen.clothes)) {
    if (c.matches_reference === false && expected.includes(first(String(c.name ?? "")))) problems.push(`${String(c.name)}'s clothes differ from the reference: ${String(c.difference ?? "").trim() || "check them"}.`);
  }
  // Props: in their place and looking like their picture (D21).
  for (const p of objs(seen.props)) {
    const want = e.propPlaces?.find((x) => norm(x.name) === norm(String(p.name ?? "")) || norm(String(p.name ?? "")).includes(norm(x.name).slice(-6)));
    if (!want) continue;
    const side = String(p.side ?? "").toLowerCase();
    const depth = String(p.depth ?? "").toLowerCase();
    // Only the opposite side counts as wrong; centre is close enough either way.
    const opposite = want.side === "left" ? "right" : want.side === "right" ? "left" : "";
    if (opposite && side.includes(opposite)) problems.push(`The ${want.name} should be on the ${want.side}, not the ${opposite}.`);
    const key = (d: string) => (/behind/.test(d) ? "behind" : /front/.test(d) ? "front" : /among/.test(d) ? "among" : "");
    // Behind versus in front is a real mistake; "among" is the boundary between them.
    if (key(depth) && key(want.depth) !== "among" && key(depth) !== "among" && key(depth) !== key(want.depth)) problems.push(`The ${want.name} should be ${want.depth}, not ${depth}.`);
    if (key(want.depth) === "behind" && key(depth) === "among") problems.push(`The ${want.name} should be ${want.depth}, several metres back, not beside the people.`);
    if (p.matches_picture === false && e.propPictures?.some((n) => norm(n) === norm(want.name))) problems.push(`The ${want.name} doesn't look like its picture: ${String(p.difference ?? "").trim() || "check it"}.`);
  }
  // The room's order (D21): what's at the left and right of the background.
  const area = (v: unknown) => norm(String(v ?? ""));
  const sides = e.backgroundSides;
  if (sides?.left && sides.right) {
    const l = area(seen.background_left), r = area(seen.background_right);
    if (l && r && l.includes(norm(sides.right).slice(0, 5)) && r.includes(norm(sides.left).slice(0, 5))) problems.push(`The room is the wrong way round: the ${sides.left} belongs on the left and the ${sides.right} on the right.`);
  }
  const bg = String(seen.background_people ?? "").toLowerCase();
  if (e.crowd !== "none" && /none/.test(bg)) problems.push("No background people, but the scene has them.");
  return { pass: problems.length === 0, problems };
}

/** The extra instruction for the one automatic redraw. */
export function fixLine(problems: string[]): string {
  return `\nThe last attempt did not match the approved layout. Fix these problems: ${problems.join(" ")}`;
}
