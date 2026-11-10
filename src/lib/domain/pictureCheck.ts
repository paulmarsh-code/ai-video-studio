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
    ...(refNames.length ? [`The next images are reference pictures of the characters, in this order: ${refNames.join(", ")}. Use them to tell who is who.`] : []),
    "",
    `Expected main characters, left to right: ${e.order.length ? e.order.join(", ") : "none"}.`,
    `Key props that should be visible: ${e.props.length ? e.props.join(", ") : "none"}.`,
    `Background people expected: ${e.crowd === "none" ? "no one else" : e.crowd === "few" ? "a few other people" : "a busy crowd"}.`,
    "",
    "Ignore style, lighting, clothing detail and small differences in pose or expression.",
    "Reply with JSON only, no other text:",
    '{"left_to_right": ["the main characters you see, left to right, by name; use \\"unknown\\" for anyone you cannot match"], "props_seen": ["key props you can see"], "background_people": "none | few | busy", "notes": "one short sentence on anything clearly wrong, or empty"}',
  ].join("\n");
}

/** Decide pass or fail from what the model saw, by rule. */
export function judgePicture(e: PictureExpectation, reply: string): PictureCheck {
  // The answer is JSON, possibly inside a code fence: take the object itself.
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  let seen: { left_to_right?: unknown; props_seen?: unknown; background_people?: unknown; notes?: unknown };
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
  const unknown = people.filter((p) => !expected.includes(first(p)));
  if (unknown.length > 0 && e.order.length > 0) problems.push(`${unknown.length} extra main ${unknown.length === 1 ? "person" : "people"} who shouldn't be there.`);
  if (!missing.length) {
    const wrong = expected.some((n, i) => found[i] !== n);
    if (wrong) problems.push(`Wrong order: expected ${e.order.join(", ")} from left to right.`);
  }
  const props = list(seen.props_seen).map(norm);
  const propMissing = e.props.filter((p) => !props.some((s) => s.includes(norm(p).slice(-6)) || norm(p).includes(s)));
  if (propMissing.length) problems.push(`The ${propMissing.join(" and the ")} ${propMissing.length === 1 ? "is" : "are"} missing.`);
  const bg = String(seen.background_people ?? "").toLowerCase();
  if (e.crowd !== "none" && /none/.test(bg)) problems.push("No background people, but the scene has them.");
  return { pass: problems.length === 0, problems };
}

/** The extra instruction for the one automatic redraw. */
export function fixLine(problems: string[]): string {
  return `\nThe last attempt did not match the approved layout. Fix these problems: ${problems.join(" ")}`;
}
