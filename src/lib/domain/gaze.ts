// Who looks at whom (D21b; wider wording D25). Bodies face the way the floor plan says; eyes follow the moment.
// General rules, for any scene:
//   - the panel text wins when it says so ("Jade looks at Chase", "Marcus and Nina exchange glances");
//   - someone speaking looks at the person they're talking to: their partner on the line of action
//     if in the scene, otherwise the group;
//   - everyone else looks at whoever is speaking, or at the panel's main person when nobody speaks;
//   - someone arriving looks across the room towards the group;
//   - nobody looks at the camera.

import type { ShotSpec } from "./types";

export interface Gaze { id: string; at: string }

// Verbs that point the eyes (D25). "Looks at", "smiles at", "turns to"… take a preposition;
// "spots", "watches", "addresses"… take the person straight after.
const WITH_PREP = String.raw`(?:look(?:s|ed|ing)?|glanc(?:e|es|ed|ing)|star(?:e|es|ed|ing)|glar(?:e|es|ed|ing)|gaz(?:e|es|ed|ing)|peer(?:s|ed|ing)?|peek(?:s|ed|ing)?|squint(?:s|ed|ing)?|scowl(?:s|ed|ing)?|frown(?:s|ed|ing)?|smil(?:e|es|ed|ing)|grin(?:s|ned|ning)?|smirk(?:s|ed|ing)?|wink(?:s|ed|ing)?|nod(?:s|ded|ding)?|beam(?:s|ed|ing)?|sneer(?:s|ed|ing)?|leer(?:s|ed|ing)?|point(?:s|ed|ing)?|wav(?:e|es|ed|ing)|gestur(?:e|es|ed|ing)|shout(?:s|ed|ing)?|yell(?:s|ed|ing)?|snap(?:s|ped|ping)?|call(?:s|ed|ing)? out|whisper(?:s|ed|ing)?|speak(?:s|ing)?|spoke|talk(?:s|ed|ing)?|turn(?:s|ed|ing)?|swing(?:s|ing)? round|spin(?:s|ning)? round|rolls? (?:her|his|their) eyes|fix(?:es|ed|ing)? (?:her|his|their) eyes|keep(?:s|ing)? (?:her|his|their) eyes)(?:\s+(?:back|over|up|across|round|around|straight|directly|coldly|warmly|sharply|briefly|nervously|angrily|slowly|quickly))*\s+(?:at|to|towards?|on|upon)`;
const DIRECT = String.raw`(?:spots?|spotted|spotting|notic(?:e|es|ed|ing)|sees|saw|seeing|watch(?:es|ed|ing)|eye(?:s|d|ing|ball(?:s|ed|ing)?)|observ(?:e|es|ed|ing)|stud(?:y|ies|ied|ying)|scan(?:s|ned|ning)|regard(?:s|ed|ing)|address(?:es|ed|ing)|asks?|asked|asking|tells?|told|telling|confront(?:s|ed|ing)?|fac(?:e|es|ed|ing)|follow(?:s|ed|ing)|checks? out|sizes? up)`;
const AWAY = String.raw`(?:ignor(?:e|es|ed|ing)|avoid(?:s|ed|ing)(?:\s+looking at)?|looks? away from|turns? (?:her|his|their) back on)`;
const POSSESSIVE = String.raw`(?:meet(?:s|ing)?|met|catch(?:es|ing)?|caught|hold(?:s|ing)?|held|search(?:es|ed|ing)?|avoid(?:s|ed|ing)?)\s+([A-Z][a-z]+)['’]s?\s+(?:gaze|eyes?|look|face)`;
const MUTUAL = /\b([A-Z][a-z]+)\s+and\s+([A-Z][a-z]+)\s+(?:(?:exchange|swap|share|trade)[sd]?\s+(?:a\s+)?(?:\w+\s+)?(?:glances?|looks?)|look\s+at\s+(?:each other|one another)|lock\s+eyes|stare\s+at\s+(?:each other|one another)|make\s+eye\s+contact)\b/;
const LOCK_WITH = /\b([A-Z][a-z]+)\s+(?:locks?|locked)\s+eyes\s+with\s+([A-Z][a-z]+)|\b([A-Z][a-z]+)\s+makes?\s+eye\s+contact\s+with\s+([A-Z][a-z]+)/;
const DIRECTION = /\b(?:look(?:s|ed|ing)?|glanc(?:e|es|ed|ing)|star(?:e|es|ed|ing)|gaz(?:e|es|ed|ing)|peer(?:s|ed|ing)?)\s+(down|up|away|around|round|out|back|ahead)(?:\s+(?:at|into|to|towards?|over|through|from)\s+(?:the\s+|her\s+|his\s+|their\s+|a\s+)?([a-z][a-z\s-]{1,30}?))?(?=[,.;!?]|\s+(?:and|as|while|before|then)\b|$)/i;
// Over the shoulder, left, right, behind (D25): "glances back over her shoulder (at Ben)",
// "looks to his left", "looks behind them".
const LOOK_VERB = String.raw`(?:look(?:s|ed|ing)?|glanc(?:e|es|ed|ing)|peer(?:s|ed|ing)?|star(?:e|es|ed|ing)|gaz(?:e|es|ed|ing)|peek(?:s|ed|ing)?|turn(?:s|ed|ing)?(?:\s+to\s+look)?|check(?:s|ed|ing)?)`;
const SHOULDER = new RegExp(String.raw`\b${LOOK_VERB}\s+(?:back\s+)?over\s+(?:her|his|their|its|one)\s+shoulder(?:\s+(?:at|to|towards?)\s+([A-Z][a-z]+))?`, "i");
const SIDEWAYS = new RegExp(String.raw`\b${LOOK_VERB}\s+(?:(?:to|towards)\s+)?(?:(?:the|her|his|their)\s+)?(left|right)\b|\b${LOOK_VERB}\s+(behind)\s+(?:her|him|them|herself|himself|themselves)\b|\b${LOOK_VERB}\s+(back)\b(?!\s+(?:at|to|over))`, "i");
// Mirrors and things looked through (D25): "looks in his rear-view mirror", "checks her mirrors",
// "peers through the keyhole", "looks out of the window". The object is kept in its own words.
// Vehicles looked out of (D25): "looks out of the car window", "stares out the plane window",
// "gazes out of the train", "looks out of the window of the plane".
const VEHICLE = String.raw`(?:car|taxi|cab|bus|coach|train|tram|carriage|plane|aeroplane|airplane|aircraft|jet|helicopter|boat|ship|ferry|yacht|cockpit|cabin|van|lorry|truck|limo|limousine)`;
const THROUGH_OBJ = String.raw`${VEHICLE}(?:['’]s)?(?:\s+(?:window|windscreen|windshield|porthole))?|(?:(?:rear[\s-]?view|rear|wing|side|door|bathroom|hand|compact|vanity)\s+)?mirrors?|(?:rear|back|side|car|front|shop|kitchen|bedroom)?\s*windows?|windscreen|windshield|binoculars|field\s+glasses|opera\s+glasses|telescope|spyglass|eye\s?glass|monocle|magnifying\s+glass|periscope|viewfinder|lens|scope|sights|peephole|keyhole|spyhole|letterbox|porthole|hatch|blinds|curtains|crack\s+in\s+the\s+door|gap\s+in\s+the\s+\w+|(?:open\s+|half-open\s+|front\s+|back\s+)?doorway|(?:open\s+|half-open\s+|front\s+|back\s+)?door|archway|gate|fence|bars|glass|screen|camera|phone`;
const THROUGH = new RegExp(String.raw`\b(?:${LOOK_VERB}|check(?:s|ed|ing)?|squint(?:s|ed|ing)?)\s+(?:back\s+)?(in|into|at|through|out\s+of|out\s+through|out)\s+(?:the|his|her|their|a|an)\s+(${THROUGH_OBJ})(?:\s+of\s+(?:the|his|her|their|a|an)\s+(${VEHICLE}))?\b|\bcheck(?:s|ed|ing)?\s+(?:his|her|their|the)\s+(mirrors?)\b`, "i");
// Reflections (D25): "looks at her reflection in the mirror", "stares at himself in the water",
// "checks her reflection in the shop window".
const REFLECTION = new RegExp(String.raw`\b(?:${LOOK_VERB}|check(?:s|ed|ing)?|catch(?:es|ing)?|caught|admir(?:e|es|ed|ing)|stud(?:y|ies|ied|ying))\s+(?:at\s+)?(?:(?:her|his|their|its)\s+(?:own\s+)?reflection|(?:herself|himself|themselves))(?:\s+(?:in|on)\s+(?:the|a|an|her|his|their)\s+([a-z][a-z\s-]{1,25}?))?(?=[,.;!?]|\s+(?:and|as|while|before|then)\b|$)`, "i");
const GROUP = /\b(?:everyone|everybody|the group|the others|they all|all of them|all three|all four|the whole group|the room)\b/i;
const PRONOUN = /^\s*(?:she|he|they)\b/i;

export function gazeFor(i: {
  shot: ShotSpec;
  description: string;
  /** Everyone at the scene: id and name. */
  people: { id: string; name: string }[];
  /** The two people on the line of action, if known. */
  line?: [string, string];
}): Gaze[] {
  const { shot } = i;
  const byFirst = (w: string) => i.people.find((p) => p.name.split(" ")[0].toLowerCase() === w.toLowerCase());
  const present = i.people.filter((p) => shot.presentIds.includes(p.id) || shot.visibleIds.includes(p.id));
  const out = new Map<string, string>();
  const nameOf = (id: string) => i.people.find((p) => p.id === id)?.name.split(" ")[0] ?? id;
  const main0 = shot.speakerId ?? shot.subjectId ?? shot.visibleIds[0];
  const partnerOf = (id: string) => (i.line && i.line.includes(id) ? i.line.find((x) => x !== id) : undefined);
  const set = (looker: string | undefined, at: string) => { if (looker && !out.has(looker) && looker !== at) out.set(looker, at); };

  // 1. What the panel says, clause by clause. The looker is the last name before the verb, or
  // a she/he/they carrying on from the clause before; "her"/"him" as the target is the person
  // they're talking with.
  const text = i.description;
  const mutual = text.match(MUTUAL);
  if (mutual) { const a = byFirst(mutual[1]), b = byFirst(mutual[2]); if (a && b) { out.set(a.id, b.id); out.set(b.id, a.id); } }
  const lock = text.match(LOCK_WITH);
  if (lock) { const a = byFirst(lock[1] ?? lock[3]), b = byFirst(lock[2] ?? lock[4]); if (a && b) { out.set(a.id, b.id); out.set(b.id, a.id); } }

  let lastLooker: string | undefined = shot.subjectId ?? main0;
  for (const clause of text.split(/(?<=[.;!?])\s+|,\s+(?=(?:and\s+|then\s+|while\s+|as\s+)?(?:[A-Z][a-z]+|she|he|they)\b)/)) {
    const lookerIn = (before: string): string | undefined => {
      if (GROUP.test(before)) return "group";
      const names = [...before.matchAll(/\b([A-Z][a-z]+)\b/g)].map((x) => byFirst(x[1])).filter((p): p is NonNullable<typeof p> => !!p);
      if (names.length) return names[names.length - 1].id;
      if (PRONOUN.test(before) || !before.trim()) return lastLooker;
      return lastLooker;
    };
    const targetOf = (word: string, looker?: string): string | undefined => {
      const p = byFirst(word);
      if (p) return p.id;
      if (/^(her|him|them)$/i.test(word) && looker) return partnerOf(looker) ?? (main0 !== looker ? main0 : undefined);
      return undefined;
    };
    const apply = (looker: string | undefined, at: string) => {
      if (looker === "group") { for (const p of present) if (p.id !== at) set(p.id, at); }
      else set(looker, at);
    };
    // A clause that starts with someone's name makes them the "she/he" of what follows.
    const lead = clause.match(/^\s*(?:and\s+|then\s+)?([A-Z][a-z]+)\b/);
    const leadP = lead ? byFirst(lead[1]) : undefined;
    if (leadP) lastLooker = leadP.id;
    let m: RegExpMatchArray | null;
    if ((m = clause.match(REFLECTION))) {
      const looker = lookerIn(clause.slice(0, m.index ?? 0));
      apply(looker, `reflection:${(m[1] ?? "mirror").toLowerCase().trim()}`);
      if (looker && looker !== "group") lastLooker = looker;
      continue;
    }
    if ((m = clause.match(THROUGH))) {
      const looker = lookerIn(clause.slice(0, m.index ?? 0));
      let how = (m[1] ?? "in").toLowerCase().replace(/\s+/g, " ");
      if (how === "out") how = "out of";
      // "the window of the plane" reads as "plane window".
      const obj = (m[3] ? `${m[3]} ${m[2]}` : (m[2] ?? m[4])).toLowerCase().replace(/['’]s\b/, "").replace(/\s+/g, " ").trim();
      apply(looker, `through:${/mirror/.test(obj) ? "in" : how === "at" ? "through" : how}:${obj}`);
      if (looker && looker !== "group") lastLooker = looker;
      continue;
    }
    // Possessives first: "meets Chase's gaze", "avoids his eyes".
    if ((m = clause.match(new RegExp(POSSESSIVE)))) {
      const looker = lookerIn(clause.slice(0, m.index ?? 0));
      const t = targetOf(m[1], typeof looker === "string" && looker !== "group" ? looker : undefined);
      if (t) apply(looker, /^avoid/i.test(m[0]) ? "away" : t);
      if (looker && looker !== "group") lastLooker = looker;
      continue;
    }
    if ((m = clause.match(new RegExp(`\\b${AWAY}\\s+([A-Z][a-z]+|her|him|them)\\b`, "i")))) {
      const looker = lookerIn(clause.slice(0, m.index ?? 0));
      apply(looker, "away");
      if (looker && looker !== "group") lastLooker = looker;
      continue;
    }
    if ((m = clause.match(new RegExp(`\\b(?:${WITH_PREP}|${DIRECT})\\s+(?:the\\s+)?([A-Z][a-z]+|her|him|them)\\b`)))) {
      const looker = lookerIn(clause.slice(0, m.index ?? 0));
      const t = targetOf(m[1], looker && looker !== "group" ? looker : undefined);
      if (t) apply(looker, t);
      if (looker && looker !== "group") lastLooker = looker;
      continue;
    }
    if ((m = clause.match(SHOULDER))) {
      const looker = lookerIn(clause.slice(0, m.index ?? 0));
      const t = m[1] ? targetOf(m[1], looker && looker !== "group" ? looker : undefined) : undefined;
      apply(looker, t ? `shoulder:${nameOf(t)}` : "shoulder");
      if (looker && looker !== "group") lastLooker = looker;
      continue;
    }
    if ((m = clause.match(SIDEWAYS))) {
      const looker = lookerIn(clause.slice(0, m.index ?? 0));
      apply(looker, (m[1] ?? m[2] ?? m[3]).toLowerCase());
      if (looker && looker !== "group") lastLooker = looker;
      continue;
    }
    if ((m = clause.match(DIRECTION))) {
      const looker = lookerIn(clause.slice(0, m.index ?? 0));
      const dir = m[1].toLowerCase().replace("round", "around");
      const what = m[2]?.trim();
      apply(looker, what ? `${dir}:${what}` : dir);
      if (looker && looker !== "group") lastLooker = looker;
    }
  }

  // 2. The defaults.
  const main = main0;
  for (const p of present) {
    if (out.has(p.id)) continue;
    if (shot.at?.[p.id] === "arriving") { out.set(p.id, "the group"); continue; }
    if (p.id === main) {
      const partner = partnerOf(p.id);
      out.set(p.id, partner && present.some((x) => x.id === partner) ? partner : present.length > 1 ? "the group" : "ahead");
      continue;
    }
    // Someone still arriving hasn't been noticed yet: the others carry on among themselves.
    if (main && shot.at?.[main] === "arriving") { out.set(p.id, "each other"); continue; }
    if (main && present.some((x) => x.id === main)) out.set(p.id, main);
  }
  return [...out.entries()].map(([id, at]) => ({ id, at: i.people.some((p) => p.id === at) ? nameOf(at) : at }));
}

/** One line for a picture or clip prompt. */
export function gazeLine(gaze: Gaze[], name: (id: string) => string, only?: string[]): string {
  const shown = gaze.filter((g) => !only || only.includes(g.id));
  if (!shown.length) return "";
  const say = (at: string) => {
    if (at === "ahead") return "looks ahead, not at the camera";
    if (at === "the group") return "looks towards the group";
    if (at === "each other") return "is talking with the others, not looking at the newcomer";
    if (at === "away") return "looks away, avoiding eye contact";
    if (at.startsWith("reflection:")) return `looks at their own reflection in the ${at.slice(11)}`;
    if (at.startsWith("through:")) {
      const [, how, obj] = at.split(":");
      return /mirror/.test(obj) ? `looks into the ${obj}, eyes on the reflection` : `looks ${how} the ${obj}`;
    }
    if (at === "shoulder") return "looks back over their shoulder, head turned, body still facing the other way";
    if (at.startsWith("shoulder:")) return `looks back over their shoulder at ${at.slice(9)}, head turned, body still facing the other way`;
    if (at === "left" || at === "right") return `turns their head to look to their own ${at}`;
    if (at === "behind" || at === "back") return "turns to look behind them";
    const [dir, what] = at.split(":");
    if (["down", "up", "around", "out", "back"].includes(dir)) return `looks ${dir}${what ? ` ${dir === "down" ? "at" : dir === "up" ? "at" : "at"} the ${what.replace(/^the\s+/, "")}` : ""}`;
    return `looks at ${at}`;
  };
  const parts = shown.map((g) => `${name(g.id)} ${say(g.at)}`);
  return `Who looks at whom: ${parts.join("; ")}. Heads and eyes turned to match; nobody looks at the camera.`;
}

/**
 * The look of a shot through something (D25). Each kind of thing looked through has its own
 * view: binoculars give two overlapping circles, a keyhole its shape, a mirror a reflection, a
 * window or doorway a frame within the frame. Used when the panel's main person looks through
 * it; the picture shows what they see that way.
 */
export function throughEffect(obj: string): string | undefined {
  const o = obj.toLowerCase();
  // From inside a vehicle, looking out (D25).
  if (/\b(plane|aeroplane|airplane|aircraft|jet)\b/.test(o)) return "from inside the plane, looking out through a small oval window with rounded corners, the cabin wall and seat edge around it, sky and clouds or the land far below outside";
  if (/\bhelicopter\b/.test(o)) return "from inside the helicopter, looking out through its curved window, the frame and controls at the edges, the ground below";
  if (/windscreen|windshield/.test(o) && !/\b(plane|aeroplane|airplane|aircraft|jet|helicopter|train|bus|coach)\b/.test(o)) return "from inside the vehicle, looking out through the windscreen, the dashboard along the bottom and the pillars at the sides";
  if (/\bcockpit\b/.test(o)) return "from inside the cockpit, looking out through the front windows, the frame and instruments at the edges";
  if (/\b(train|tram|carriage|coach|bus)\b/.test(o)) return "from inside, looking out of the window, its frame around the view, the scenery outside slightly blurred with movement, a faint reflection on the glass";
  if (/\b(boat|ship|ferry|yacht|cabin)\b/.test(o)) return "from inside, looking out through a round porthole or cabin window, its frame around the view, water outside";
  if (/\b(car|taxi|cab|van|lorry|truck|limo|limousine)\b/.test(o)) return /windscreen|windshield/.test(o)
    ? "from inside the vehicle, looking out through the windscreen, the dashboard along the bottom and the pillars at the sides"
    : "from inside the vehicle, looking out of the side window, the door frame and glass around the view, the world outside passing by";
  if (/binocular|field glasses|opera glasses/.test(o)) return "their point of view through binoculars: the view seen inside two overlapping circles with soft black edges all round, magnified, slightly unsteady";
  if (/telescope|spyglass|eye ?glass|monocle|periscope|scope|sights/.test(o)) return "their point of view through it: one round magnified view with a soft black vignette all round it";
  if (/magnifying/.test(o)) return "seen through a magnifying glass: a round, enlarged and slightly curved view inside the lens, the rest normal size and soft";
  if (/keyhole/.test(o)) return "their point of view through a keyhole: the scene seen through a keyhole-shaped opening, everything else black";
  if (/peephole|spyhole/.test(o)) return "their point of view through a door peephole: a small round fish-eye view with strongly curved edges, dark all round";
  if (/viewfinder|camera|lens/.test(o)) return "their point of view through a camera viewfinder: the scene inside a viewfinder frame with thin framing lines";
  if (/phone|screen/.test(o)) return "the scene as it appears on the screen they are looking at, the screen's edges framing it";
  if (/rear[\s-]?view|rear mirror/.test(o)) return "a tight shot of the rear-view mirror: their eyes or the road behind reflected in it, the mirror's frame across the top of the picture";
  if (/wing|side|door mirror/.test(o)) return "a tight shot of the side mirror: what is behind reflected in it, the car's body and window around the mirror";
  if (/mirror/.test(o)) return "seen in the mirror: the reflection fills the mirror, its frame around it";
  if (/window|windscreen|windshield|porthole|glass/.test(o)) return "a frame within the frame: seen through the window, its frame around the view, a faint reflection on the glass";
  if (/door|archway|gate/.test(o)) return "a frame within the frame: the view framed by the doorway's edges, the foreground in shadow";
  if (/blinds|curtains|letterbox|crack|gap|fence|bars|hatch/.test(o)) return "seen through the gap: narrow strips of the view between dark edges in the foreground";
  return undefined;
}

/** Their own reflection (D25): what the picture shows depends on what it's in. */
export function reflectionEffect(surface: string): string {
  const s = surface.toLowerCase();
  if (/water|pool|pond|lake|river|puddle|sea|fountain|bath|sink/.test(s)) return "looking down at their reflection in the water: their face mirrored on the surface below, rippling slightly, the camera high above the water";
  if (/window|glass|screen|shop/.test(s)) return "their faint reflection in the glass, overlaid on whatever is behind it, their face ghostly and see-through";
  if (/spoon|knife|blade|metal|chrome|car|helmet|visor|sunglasses|glasses/.test(s)) return `their face reflected small and curved in the ${s}`;
  return "over their shoulder into the mirror: their face seen in the reflection, the back of their head soft in the foreground";
}

/** The shot effect for a panel, from its main person's gaze. */
export function shotEffect(gaze: Gaze[], mainId: string | undefined): string | undefined {
  const g = gaze.find((x) => x.id === mainId) ?? gaze.find((x) => x.at.startsWith("through:") || x.at.startsWith("reflection:"));
  if (!g) return undefined;
  if (g.at.startsWith("reflection:")) return reflectionEffect(g.at.slice(11));
  if (!g.at.startsWith("through:")) return undefined;
  return throughEffect(g.at.split(":")[2] ?? "");
}
