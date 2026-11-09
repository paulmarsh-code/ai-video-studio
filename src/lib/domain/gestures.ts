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
    match: /\b(raises? (a|his|her) glass|toast(s|ing)?)\b/i,
    text: "Toast: the glass is raised to about eye height, arm half extended towards the others.",
  },
];

/** The precise wording for any common gesture named in the text, or nothing. */
export function gestureDetail(...texts: (string | undefined)[]): string[] {
  const all = texts.filter(Boolean).join(" ");
  return GESTURES.filter((g) => g.match.test(all)).map((g) => g.text);
}
