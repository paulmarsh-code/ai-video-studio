// Shot language (D27): the names film-makers use for shot sizes, framings and camera moves,
// read from a panel's words and turned into camera choices and prompt wording. Works for any
// scene. When a panel names a shot ("close-up on Ava", "two-shot", "Ben's POV", "tracking
// shot", "establishing shot"), that is what the camera chooser aims for; otherwise nothing here
// changes the choice it already makes.

/** How much of a person the frame holds, tightest first. */
export type ShotSize = "ecu" | "cu" | "mcu" | "ms" | "cowboy" | "mls" | "fs" | "ls" | "ws";

/** Who and how the frame is arranged. */
export type Framing = "ots" | "reverse" | "two-shot" | "three-shot" | "profile" | "pov" | "master" | "establishing" | "insert" | "reaction" | "single";

export type Move = "static" | "tracking" | "pan" | "tilt" | "dolly-in" | "dolly-out" | "dolly-zoom" | "push-in" | "push-out" | "handheld" | "crane" | "orbit" | "whip-pan" | "zoom-in" | "zoom-out";

export interface ShotSizeInfo { label: string; words: string; frameHeightM: number }

/** Each size: what it shows and how tall a slice of the person fills the frame. */
export const SHOT_SIZES: Record<ShotSize, ShotSizeInfo> = {
  ecu: { label: "Extreme close-up", words: "extreme close-up on one detail (the eyes, the mouth, a hand or an object) filling the frame", frameHeightM: 0.15 },
  cu: { label: "Close-up", words: "close-up: the face fills the frame, background soft", frameHeightM: 0.35 },
  mcu: { label: "Medium close-up", words: "medium close-up from the chest up: face and some body language", frameHeightM: 0.6 },
  ms: { label: "Medium shot", words: "medium shot from the waist up", frameHeightM: 0.95 },
  cowboy: { label: "Cowboy shot", words: "cowboy shot from mid-thigh up", frameHeightM: 1.25 },
  mls: { label: "Medium long shot", words: "medium long shot from the knees up", frameHeightM: 1.5 },
  fs: { label: "Full shot", words: "full shot: the whole body head to toe, with some room around", frameHeightM: 2.2 },
  ls: { label: "Long shot", words: "long shot: the whole body small in the frame, lots of the surroundings", frameHeightM: 3.5 },
  ws: { label: "Wide shot", words: "wide shot of the whole space and everyone in it", frameHeightM: 5 },
};

const SIZE_WORDS: [RegExp, ShotSize][] = [
  [/\b(?:extreme|big)\s+close[-\s]?up|\becu\b|\bmacro\s+shot\b/i, "ecu"],
  [/\bmedium\s+close[-\s]?up|\bmcu\b/i, "mcu"],
  [/\bclose[-\s]?up|\bcu\b|\btight\s+(?:shot|on)\b/i, "cu"],
  [/\bcowboy\s+shot|\bamerican\s+shot\b/i, "cowboy"],
  [/\bmedium\s+long\s+shot|\bmedium\s+wide\s+shot|\bmls\b|\bknees?\s+up\b/i, "mls"],
  [/\bmedium\s+shot|\bmid[-\s]shot|\bwaist[-\s]up\b/i, "ms"],
  [/\bfull\s+(?:body\s+)?shot|\bhead\s+to\s+toe\b|\bfull[-\s]length\s+shot\b/i, "fs"],
  [/\b(?:extreme\s+)?long\s+shot\b|\bels\b/i, "ls"],
  [/\b(?:extreme\s+)?wide\s+shot|\bwide\s+angle\s+shot|\bws\b/i, "ws"],
];

const FRAMING_WORDS: [RegExp, Framing][] = [
  [/\b(?:pov|point[-\s]of[-\s]view)\b|\bthrough\s+(?:[\w’'-]+['’]s|his|her|their)\s+eyes\b|\bwhat\s+(?:[\w’'-]+|he|she|they)\s+(?:sees?|saw|can\s+see)\b/i, "pov"],
  [/\breverse\s+(?:shot|angle)\b|\bcounter[-\s]?shot\b/i, "reverse"],
  [/\b(?:ots|over[-\s]the[-\s]shoulder)\b(?!\s+(?:at|to|towards))|\bshot\s+over\s+(?:[\w’'-]+['’]s|his|her|their)\s+shoulder\b|\bfrom\s+over\s+(?:[\w’'-]+['’]s|his|her|their)\s+shoulder\b/i, "ots"],
  [/\bthree[-\s]shot\b/i, "three-shot"],
  [/\btwo[-\s]shot\b/i, "two-shot"],
  [/\bprofile\s+(?:shot|view|angle)|\bin\s+profile\b|\bfrom\s+the\s+side\b|\bside[-\s]on\b/i, "profile"],
  [/\bestablishing\s+shot\b/i, "establishing"],
  [/\bmaster\s+shot\b/i, "master"],
  [/\binsert\s+shot|\bcut[-\s]?in\b/i, "insert"],
  [/\breaction\s+shot\b/i, "reaction"],
  [/\bsingle\s+shot\b|\bsingle\s+on\b/i, "single"],
];

const MOVE_WORDS: [RegExp, Move][] = [
  [/\bdolly\s+zoom|\bvertigo\s+(?:effect|shot|zoom)|\bzolly\b/i, "dolly-zoom"],
  [/\bwhip[-\s]pan\b/i, "whip-pan"],
  [/\bdolly\s+(?:in|forward)|\btrack(?:s|ing)?\s+in\b|\bcamera\s+moves\s+(?:in|closer)\b/i, "dolly-in"],
  [/\bdolly\s+(?:out|back)|\bpull(?:s|ing)?\s+back\b|\bcamera\s+moves\s+(?:out|back|away)\b/i, "dolly-out"],
  [/\bpush(?:es|ing)?[-\s]in\b|\bslow\s+push\b/i, "push-in"],
  [/\bpush(?:es|ing)?[-\s]out\b/i, "push-out"],
  [/\bzoom(?:s|ing)?\s+in\b/i, "zoom-in"],
  [/\bzoom(?:s|ing)?\s+out\b/i, "zoom-out"],
  [/\btracking\s+shot|\bcamera\s+(?:tracks|follows)\b|\bfollow(?:ing)?\s+shot\b|\bsteadicam\b/i, "tracking"],
  [/\bpan(?:s|ning)?\s+(?:across|left|right|over|round|around|to|from)\b|\bpan\s+shot\b|\bpanning\b/i, "pan"],
  [/\btilt(?:s|ing)?\s+(?:up|down)\s+(?:to|from|over)\b|\btilt\s+shot\b/i, "tilt"],
  [/\bcrane\s+shot|\bjib\s+shot|\bcamera\s+(?:rises|cranes|lifts)\b/i, "crane"],
  [/\b(?:orbit|arc)\s+shot|\bcamera\s+(?:circles|orbits|arcs)\b/i, "orbit"],
  [/\bhand[-\s]?held\b|\bshaky\s+cam\b/i, "handheld"],
  [/\bstatic\s+(?:shot|camera)|\blocked[-\s]off\b|\btripod\s+shot\b/i, "static"],
];

/** Words for each move, for the video prompt (a still picture is the move's first frame). */
export const MOVE_TEXT: Record<Move, string> = {
  static: "static camera",
  tracking: "tracking shot: the camera moves alongside them at their pace, keeping them in frame",
  pan: "slow pan: the camera turns on the spot, revealing more of the space",
  tilt: "tilt: the camera pivots up or down on the spot",
  "dolly-in": "dolly in: the camera moves steadily closer to them",
  "dolly-out": "dolly out: the camera moves steadily away, leaving them smaller in the space",
  "dolly-zoom": "dolly zoom (vertigo effect): the camera moves while zooming the other way, so they stay the same size while the background stretches or squeezes",
  "push-in": "slow push-in towards them, building focus",
  "push-out": "slow push-out away from them, revealing isolation",
  handheld: "handheld camera with natural, slight movement",
  crane: "crane shot: the camera rises smoothly, revealing the space from above",
  orbit: "the camera arcs slowly around them",
  "whip-pan": "whip pan: a fast blurred turn to the next view",
  "zoom-in": "slow zoom in, the camera staying put",
  "zoom-out": "slow zoom out, the camera staying put",
};

/** Words for each framing, added to the camera line of the prompt. */
export const FRAMING_TEXT: Partial<Record<Framing, string>> = {
  profile: "profile shot from the side, at right angles to them: we see their face side-on, not looking at the camera",
  establishing: "establishing shot: the whole place and where everyone is",
  master: "master shot: the whole scene and everyone's places",
  reaction: "reaction shot: their face as they take in what is happening",
  insert: "insert shot of the detail",
};

export interface NamedShot { size?: ShotSize; framing?: Framing; move?: Move }

/** The shot names in a panel's words. */
export function namedShot(text: string): NamedShot {
  const out: NamedShot = {};
  for (const [re, f] of FRAMING_WORDS) if (re.test(text)) { out.framing = f; break; }
  for (const [re, s] of SIZE_WORDS) if (re.test(text)) { out.size = s; break; }
  for (const [re, m] of MOVE_WORDS) if (re.test(text)) { out.move = m; break; }
  // An establishing or master shot is a wide one.
  if (!out.size && (out.framing === "establishing" || out.framing === "master")) out.size = "ws";
  if (!out.size && out.framing === "insert") out.size = "ecu";
  return out;
}

/** Full-frame focal length that gives this horizontal angle of view. */
export function lensMm(fovDeg: number): number {
  return Math.round(18 / Math.tan((fovDeg * Math.PI) / 360));
}

/** The lens in words: what a wide, normal or long lens does to the picture. */
export function lensText(fovDeg: number): string {
  const mm = lensMm(fovDeg);
  if (mm <= 28) return `wide lens, about ${mm} mm: more of the space in view, people and things look further apart, deep focus`;
  if (mm < 65) return `normal lens, about ${mm} mm: natural perspective, as the eye sees it`;
  return `long lens, about ${mm} mm: background compressed and close behind them, shallow depth of field, background soft`;
}

/**
 * The lens angle that frames this size at this distance. The size sets how tall a slice of the
 * person fills the frame; the frame's width follows from the picture's shape.
 */
export function fovForSize(size: ShotSize, distanceM: number, aspect = 16 / 9): number {
  const width = SHOT_SIZES[size].frameHeightM * aspect;
  const deg = (2 * Math.atan(width / 2 / Math.max(0.3, distanceM)) * 180) / Math.PI;
  return Math.round(Math.max(8, Math.min(100, deg)));
}

/** Which camera presets suit each framing, best first. */
export function presetsFor(n: NamedShot): string[] {
  switch (n.framing) {
    case "ots": return ["main-ots", "reverse-ots"];
    case "reverse": return ["reverse-ots", "main-ots"];
    case "two-shot": return ["two-shot"];
    case "establishing": case "master": return ["wide"];
    case "insert": return ["insert", "single-cu"];
    case "reaction": case "single": return ["single-cu"];
  }
  if (n.size === "ecu") return ["insert", "single-cu"];
  if (n.size === "cu" || n.size === "mcu") return ["single-cu"];
  if (n.size === "ws" || n.size === "ls") return ["wide"];
  return [];
}

/** What each angle does to how the audience sees them (the guide's meanings), for the prompt. */
const ANGLE_MEANING: Record<string, string> = {
  "birds-eye": "map-like, they look small and isolated in the space",
  overhead: "looking down into the space, showing what is below",
  high: "they look smaller and more vulnerable",
  low: "they look taller, stronger and more in charge",
  "worms-eye": "they tower over us, huge and dominant",
};

/**
 * The extra camera lines for a picture or video prompt (D27): the framing size, a named framing
 * (profile, establishing…), the lens and what it does, whose point of view, and what the angle
 * means. `kind` is the camera's vertical kind; `fovDeg` its real lens angle.
 */
export function shotLines(i: {
  cam: { size?: ShotSize; povId?: string; rollDeg?: number; heightM?: number };
  kind: string; fovDeg: number; text: string; name: (id: string) => string;
}): string[] {
  const out: string[] = [];
  const n = namedShot(i.text);
  const size = i.cam.size ?? n.size;
  if (size) out.push(`Framing: ${SHOT_SIZES[size].words}.`);
  if (n.framing && FRAMING_TEXT[n.framing] && !i.cam.povId) out.push(`Shot: ${FRAMING_TEXT[n.framing]}.`);
  if (i.cam.povId) {
    const who = i.name(i.cam.povId);
    out.push(`Point of view: we see exactly what ${who} sees, from ${who}'s own eyes. ${who} is not in the picture (at most their hands at the bottom edge).`);
  }
  out.push(`Lens: ${lensText(i.fovDeg)}.`);
  const meaning = ANGLE_MEANING[i.kind];
  const parts = [meaning, i.cam.rollDeg ? "the tilted frame feels uneasy and off-balance" : ""].filter(Boolean);
  if (parts.length && !i.cam.povId) out.push(`Why this angle: ${parts.join("; ")}.`);
  return out;
}
