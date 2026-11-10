// Suggested shots (D28): a named shot for every panel, from the guide's rules for building a
// scene. Open on an establishing shot; follow an arrival in a full shot; set a conversation up
// with a two-shot, then over-the-shoulder shots; save close-ups for the big line or feeling;
// reactions in a medium close-up; a group in a medium long shot; someone leaving in a long
// shot; inserts for the object the moment turns on; angles from the feeling; and no two shots
// in a row the same size. The words go into the panel's shot and the camera chooser follows
// them (D27). Works for any scene.

import { classifyMoment, type ShotInput } from "./director";
import { namedShot, SHOT_SIZES, type ShotSize } from "./shotLanguage";
import { verticalFor, dutchFor } from "./vertical";

export interface ShotSuggestion { shot: string; why: string }

const ORDER: ShotSize[] = ["ecu", "cu", "mcu", "ms", "cowboy", "mls", "fs", "ls", "ws"];
const SIZE_WORD: Record<ShotSize, string> = { ecu: "extreme close-up", cu: "close-up", mcu: "medium close-up", ms: "medium shot", cowboy: "cowboy shot", mls: "medium long shot", fs: "full shot", ls: "long shot", ws: "wide shot" };
const STRONG = /\b(angry|anger|furious|fury|rage|shock|shocked|disbelief|devastat|heartbroken|terrified|ecstatic|outraged|humiliat|tears?|crying|sobs?|breaks?\s+down|stunned|horrified|elated|overjoyed)\b/i;
const OBJECT = /\b(?:reads?|reading|checks?|checking|stares?\s+at|looks?\s+(?:down\s+)?at|glances?\s+at|picks?\s+up|holds?\s+up|hands?\s+over|slides?|opens?|signs?|unfolds?|turns?\s+over)\s+(?:the|her|his|their|a|an)\s+((?:\w+\s+)?(?:letter|note|phone|screen|ring|photo|photograph|card|invoice|contract|watch|key|keys|map|envelope|cheque|check|ticket|message|text|document|file|box|bill|receipt|badge|gun|knife|bottle|glass|book|diary|tablet|laptop))\b/i;
const SIGHT = /\b(?:sees|spots|notices|catches\s+sight\s+of|watches|glimpses|sees\s+that)\b/i;

/** The angle words for a moment from its feeling or body (D25-D27), if any. */
function angleWords(text: string, emotion?: string): { words: string[]; why: string[] } {
  const words: string[] = [], why: string[] = [];
  const v = verticalFor(text, emotion);
  if (v && v.kind !== "level") {
    const name = v.kind === "birds-eye" ? "bird's-eye view" : v.kind === "worms-eye" ? "worm's-eye view" : v.kind === "high" || v.kind === "overhead" ? "high angle" : v.kind === "low" && v.tiltDeg > 0 ? "low angle" : "";
    if (name) { words.push(name); why.push(v.why.split(":")[0]); }
  }
  if (dutchFor(`${text} ${emotion ?? ""}`)) { words.push("Dutch angle"); why.push("an unsettled moment: a tilted frame"); }
  return { words, why };
}

/** A suggested shot for each panel, in order. Panels that already name a shot keep their words. */
export function suggestShots(shots: ShotInput[], name: (id: string) => string = (id) => id): ShotSuggestion[] {
  const out: ShotSuggestion[] = [];
  const pairsSeen = new Set<string>();
  let prev: ShotSize | undefined;
  shots.forEach((sh, i) => {
    const s = sh.spec;
    const text = `${sh.description ?? ""} ${s.actions ?? ""}`;
    const written = namedShot(text);
    if (written.size || written.framing || written.move) {
      out.push({ shot: "", why: "the panel already names its shot" });
      prev = written.size ?? prev;
      return;
    }
    const moment = classifyMoment(sh, i);
    const subj = s.subjectId ?? s.speakerId ?? s.visibleIds[0];
    const nVis = s.visibleIds.length;
    let size: ShotSize, framing = "", move = "", why = "";
    const obj = OBJECT.exec(text);
    if (moment === "establishing" && i === 0 && !/\b(arrives?|walks? in|enters?)\b/i.test(text)) {
      size = "ws"; framing = "establishing shot"; why = "the first shot sets the place and where everyone is";
    } else if (moment === "establishing") {
      size = "fs"; move = "tracking shot"; why = `an arrival: a full shot that follows ${subj ? name(subj) : "them"} in shows who arrives and where they go`;
    } else if (moment === "exit") {
      size = "ls"; why = "someone leaving: a long shot lets them walk away and grow smaller in the space";
    } else if (moment === "peak" && nVis >= 3) {
      // Everyone the panel has in the picture stays in it (D30): the big moment in a group is
      // a medium shot on the speaker with the others around them, pushing in for strong feeling.
      size = "ms"; move = STRONG.test(`${text} ${s.emotion ?? ""}`) ? "slow push-in" : ""; why = `the big line or feeling with the group watching: a medium shot on ${subj ? name(subj) : "them"} keeps the others in the picture`;
    } else if (moment === "peak") {
      size = nVis === 2 ? "mcu" : "cu"; framing = nVis === 2 ? "over-the-shoulder shot" : ""; move = STRONG.test(`${text} ${s.emotion ?? ""}`) ? "slow push-in" : ""; why = nVis === 2 ? "the big line between the two of them: over the listener's shoulder, close on the speaker" : "the big line or feeling: a close-up, so nothing distracts from the face";
    } else if (moment === "dialogue") {
      const partner = s.visibleIds.find((id) => id !== s.speakerId);
      const key = [s.speakerId, partner].sort().join("|");
      if (!pairsSeen.has(key) && nVis >= 2) {
        pairsSeen.add(key);
        size = nVis >= 3 ? "mls" : "ms"; framing = nVis === 2 ? "two-shot" : ""; why = "the start of the conversation: a shot of both of them shows how they stand with each other";
      } else if (nVis >= 3) {
        // A conversation with the group watching (D30): over-the-shoulder would cut them out.
        size = "ms"; why = `the conversation goes on with the group around them: a medium shot on ${s.speakerId ? name(s.speakerId) : "the speaker"} with the others in the picture`;
      } else {
        pairsSeen.add(key);
        size = "mcu"; framing = "over-the-shoulder shot"; why = `the conversation goes on: over ${partner ? `${name(partner)}'s` : "the other person's"} shoulder onto ${s.speakerId ? name(s.speakerId) : "the speaker"}, so we follow the back-and-forth`;
      }
    } else if (obj && !s.speakerId && nVis <= 1) {
      size = "ecu"; framing = "insert shot"; why = `the ${obj[1].toLowerCase()} matters here: an insert shot shows the detail the story turns on`;
    } else if (SIGHT.test(text) && subj && !s.visibleIds.includes(subj) && nVis >= 1) {
      size = "ms"; framing = "POV shot"; why = `we see what ${name(subj)} sees, through their eyes`;
    } else if (nVis >= 3) {
      size = "mls"; framing = "three-shot"; why = "a group moment: a medium long shot keeps everyone and their body language in view";
      if (nVis > 3) framing = "";
    } else if (nVis === 2) {
      size = "ms"; framing = "two-shot"; why = "two people together: a two-shot shows how they relate";
    } else {
      size = STRONG.test(`${text} ${s.emotion ?? ""}`) ? "cu" : "mcu"; framing = "reaction shot"; why = `${subj ? name(subj) : "their"}${subj ? "'s" : ""} reaction: a ${SIZE_WORD[size]} on the face as they take it in`;
    }
    // Variety (the guide's progression of shot sizes): not the same size twice in a row.
    if (prev === size && framing !== "over-the-shoulder shot") {
      const k = ORDER.indexOf(size);
      // A group stays wide enough for everyone (D30): only one or two people step closer.
      const tighter = (nVis <= 2 && STRONG.test(`${text} ${s.emotion ?? ""}`)) || k >= ORDER.length - 2;
      size = ORDER[Math.max(0, Math.min(ORDER.length - 1, k + (tighter ? -1 : 1)))];
      why += `; ${tighter ? "a step closer" : "a step wider"} than the shot before, for variety`;
    }
    prev = size;
    const angle = angleWords(text, s.emotion);
    const parts = [framing === "establishing shot" ? framing : `${SIZE_WORD[size]}${framing ? `, ${framing}` : ""}`, ...angle.words, move].filter(Boolean);
    out.push({ shot: parts.join(", "), why: [why, ...angle.why].join("; ") });
  });
  return out;
}

/** The choices offered when changing a panel's shot. */
export const SHOT_CHOICES = {
  shot: ["establishing shot", "wide shot", "long shot", "full shot", "medium long shot", "cowboy shot", "medium shot", "medium shot, two-shot", "medium long shot, three-shot", "medium close-up, over-the-shoulder shot", "medium close-up, reverse shot", "medium close-up", "medium close-up, reaction shot", "close-up", "extreme close-up", "extreme close-up, insert shot", "medium shot, POV shot", "medium close-up, profile shot"],
  angle: ["eye level", "high angle", "low angle", "bird's-eye view", "worm's-eye view", "Dutch angle", "shoulder level", "hip level", "knee level", "ground level"],
  move: ["static camera", "tracking shot", "pan", "slow push-in", "push-out", "dolly in", "dolly out", "dolly zoom", "handheld", "crane shot", "orbit shot"],
};

/** Split shot words back into the three choices, for the change form. */
export function splitShot(words: string): { shot: string; angle: string; move: string } {
  const parts = words.split(/,\s*/).filter(Boolean);
  const isAngle = (p: string) => SHOT_CHOICES.angle.some((a) => a.toLowerCase() === p.toLowerCase());
  const isMove = (p: string) => SHOT_CHOICES.move.some((m) => m.toLowerCase() === p.toLowerCase()) || /tracking|push|dolly|pan|crane|handheld|orbit|zoom/i.test(p);
  return { shot: parts.filter((p) => !isAngle(p) && !isMove(p)).join(", "), angle: parts.filter(isAngle).join(", "), move: parts.filter(isMove).join(", ") };
}

/** The label for a size, for the board. */
export const sizeLabel = (s: ShotSize) => SHOT_SIZES[s].label;
