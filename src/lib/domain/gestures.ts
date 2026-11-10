// Precise gesture wording (D18e). Image and video models read loose gesture words their own
// way: Paul's "dismissive wave" came back as a raised-palm stop sign. When a panel's words
// name a common gesture, the prompt spells out the hand, the palm and the movement.

const GESTURES: { match: RegExp; text: string }[] = [
  {
    match: /\b(dismissive (wave|gesture|flick)|shoo(s|ing)?\b|wav(e|es|ing) (her|him|them|you) (away|off)|brush(es|ing)? (her|him|them) off with (a|his|her) hand)/i,
    text: "Dismissive shoo-away gesture: the hand is low and relaxed at chest height, palm facing down or inwards, and the fingers flick outwards and away from the body once, as if brushing someone away. It is not a raised-palm stop sign and not a friendly wave.",
  },
  {
    match: /\b(stop (sign|gesture)|holds? up (a|his|her) (hand|palm)|palm out)\b/i,
    text: "Stop gesture: the arm is raised with the palm flat and facing outwards towards the other person, fingers together.",
  },
  {
    match: /\bshrug(s|ging)?\b/i,
    text: "Shrug: both shoulders lift and the palms turn up and outwards at waist height, eyebrows slightly raised.",
  },
  {
    match: /\b(eye[- ]?roll|rolls? (her|his|their) eyes)\b/i,
    text: "Eye-roll: the eyes turn up and to the side, the head tilts slightly and the mouth flattens; the hands stay still.",
  },
  {
    match: /\bpoint(s|ing)? (at|to|towards)\b/i,
    text: "Pointing: one arm extended, index finger pointing straight at the person or thing, other fingers curled.",
  },
  {
    match: /\b(face ?palm|head in (his|her|their) hands?)\b/i,
    text: "Facepalm: one hand covers the forehead and eyes, head bowed slightly.",
  },
  {
    match: /\b(middle[- ]finger|flips? (him|her|them) off|gives? (him|her|them|\w+) the finger)\b/i,
    text: "Middle-finger gesture: one hand raised to about shoulder height, back of the hand towards the other person, only the middle finger extended.",
  },
  {
    match: /\b(raises? (a|his|her) glass|toast(s|ing)?)\b/i,
    text: "Toast: the glass is raised to about eye height, arm half extended towards the others.",
  },
];

/** The precise wording for any common gesture named in the text, or nothing. */
export function gestureDetail(...texts: (string | undefined)[]): string[] {
  const all = texts.filter(Boolean).join(" ");
  return GESTURES.filter((g) => g.match.test(all)).map((g) => g.text);
}

const GESTURE_WORDS = /\b(wave|waves|waving|gestur(?:e|es|ed|ing)|point(?:s|ing)?|middle[- ]finger|the finger|flips?\s+\w+\s+off|shoo(?:s|ing)?|beckon(?:s|ing)?|thumbs?[- ]up|toast(?:s|ing)?|raises?\s+(?:a|his|her|their)\s+glass|flicks?|brush(?:es|ing)?\s+\w+\s+off)\b/i;
const WALK_OFF = /\b(turns?\s+(?:away|on\s+(?:her|his|their)\s+heel)|walks?\s+(?:off|away|out)|walking\s+(?:off|away)|storms?\s+(?:off|out)|leaves?|leaving|heads?\s+for\s+the\s+(?:door|exit)|strides?\s+(?:off|away))\b/i;

/**
 * Where a gesture and the head point (D30). A gesture is aimed at the person the subject is
 * looking at; someone walking away from a person they are still reacting to has their body
 * turned away and their head turned back over the shoulder to them.
 */
export function aimDetail(text: string, who: string, target: string | undefined, exit?: { name: string; where: string }): string[] {
  if (!target) return [];
  const out: string[] = [];
  const walking = WALK_OFF.test(text);
  if (GESTURE_WORDS.test(text)) out.push(`${who}'s gesture is aimed at ${target}: the hand and arm point towards ${target}, not at anyone else and not at the camera.`);
  // Leaving heads for the way out (D33), when the venue has one: walking naturally, mid-stride.
  const heading = exit ? `, heading for the ${exit.name} (${exit.where})` : "";
  if (walking) out.push(`${who} has turned and is walking away from ${target}${heading}: body, hips and feet pointing that way, caught mid-stride with one foot in front of the other (legs apart, never crossed), while the head turns back over the shoulder towards ${target}${GESTURE_WORDS.test(text) ? " and the gesture is thrown back towards them" : ""}.`);
  else if (out.length) out.push(`${who} faces ${target} while doing it.`);
  return out;
}

/** The venue's way out (D33): its name and where it is from this camera, in picture words. */
export function exitFrom(views: { name: string; directionDeg: number }[], forwardDeg: number): { name: string; where: string } | undefined {
  const v = views.find((x) => /\b(entrance|exit|door|doors|doorway|way out|lobby|foyer)\b/i.test(x.name));
  if (!v) return undefined;
  const rel = ((v.directionDeg - forwardDeg + 540) % 360) - 180; // positive is to the camera's left
  const where = Math.abs(rel) <= 45 ? "ahead, deeper into the picture, away from the camera"
    : Math.abs(rel) >= 135 ? "behind the camera, so walking towards the camera and past it"
    : rel > 0 ? "off to the left of the picture" : "off to the right of the picture";
  return { name: v.name, where };
}
