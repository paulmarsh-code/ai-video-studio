// Who looks at whom (D21b). Bodies face the way the floor plan says; eyes follow the moment.
// General rules, for any scene:
//   - the panel text wins when it says so ("Jade looks at Chase", "Marcus and Nina exchange glances");
//   - someone speaking looks at the person they're talking to: their partner on the line of action
//     if in the scene, otherwise the group;
//   - everyone else looks at whoever is speaking, or at the panel's main person when nobody speaks;
//   - someone arriving looks across the room towards the group;
//   - nobody looks at the camera.

import type { ShotSpec } from "./types";

export interface Gaze { id: string; at: string }

const LOOK = /\b(?:(?:looks?|looking|glances?|glancing|stares?|staring|glares?|glaring|turns?|turning|smiles?|smiling)\s+(?:back\s+|over\s+|up\s+|across\s+)?(?:at|to|towards?)|spots?|spotting|notices?|noticing|sees|seeing|watches|watching|eyes|eyeing)\s+([A-Z][a-z]+)/g;
const EXCHANGE = /\b([A-Z][a-z]+)\s+and\s+([A-Z][a-z]+)\s+(?:exchange|swap|share|trade)\s+(?:\w+\s+)?(?:glances|looks)\b/;

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

  // 1. What the panel says. "X ... looks at Y": the looker is the last name before the verb.
  const text = i.description;
  const pair = text.match(EXCHANGE);
  if (pair) {
    const a = byFirst(pair[1]), b = byFirst(pair[2]);
    if (a && b) { out.set(a.id, b.id); out.set(b.id, a.id); }
  }
  for (const m of text.matchAll(LOOK)) {
    const target = byFirst(m[1]);
    if (!target) continue;
    const before = text.slice(0, m.index ?? 0);
    const names = [...before.matchAll(/\b([A-Z][a-z]+)\b/g)].map((x) => byFirst(x[1])).filter((p): p is NonNullable<typeof p> => !!p && p.id !== target.id);
    const looker = names[names.length - 1] ?? (shot.subjectId ? i.people.find((p) => p.id === shot.subjectId) : undefined);
    if (looker && !out.has(looker.id)) out.set(looker.id, target.id);
  }

  // 2. The defaults.
  const speaker = shot.speakerId;
  const main = speaker ?? shot.subjectId ?? shot.visibleIds[0];
  const partnerOf = (id: string) => (i.line && i.line.includes(id) ? i.line.find((x) => x !== id) : undefined);
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
  const parts = shown.map((g) => `${name(g.id)} ${g.at === "ahead" ? "looks ahead, not at the camera" : g.at === "the group" ? "looks towards the group" : g.at === "each other" ? "is talking with the others, not looking at the newcomer" : `looks at ${g.at}`}`);
  return `Who looks at whom: ${parts.join("; ")}. Heads and eyes turned to match; nobody looks at the camera.`;
}
