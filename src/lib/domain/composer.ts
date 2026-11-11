// Prompt Composer (Stage 7) — the proven Kling web-app template, built from structured data.
// It never rewrites approved dialogue and never names characters excluded from the shot.

import { gazeFor, gazeLine, shotEffect } from "./gaze";
import { bodyEffect, verticalOf } from "./vertical";
import { MOVE_TEXT, namedShot, shotLines } from "./shotLanguage";
import { levelLines } from "./levels";
import { describeFrame, PRESET_FOV, planForShot, presetText, readCamera } from "./geometry";
import { aimDetail, exitFrom, gestureDetail } from "./gestures";
import { GENRE_PROFILES, type Genre } from "./genre";
import { capitalise, joinNames, stripQuotes } from "./text";
import {
  KLING_OMNI_PRESET,
  type CastMember,
  type GeometryPlanData,
  type ProviderPreset,
  type ShotSpec,
} from "./types";

export interface ComposedPrompt {
  text: string;
  sections: Record<string, string>;
  settings: {
    model: string;
    resolution: string;
    durationSec: number;
    nativeAudio: "on" | "off";
    recommendedAudio: "on" | "off";
    multiShot: false;
    audioReferences: "none";
  };
}

const DISTANCE_TEXT = {
  conversational: "They stand about an arm's length apart.",
  "social-group": "They stand together as a small social group.",
  "across-room": "They are across the room from each other.",
} as const;

const INTENSITY_TEXT = {
  subtle: "Subtle, restrained facial expression.",
  natural: "Natural, believable expression.",
  big: "Big, clearly readable facial expression.",
} as const;

/** Distance line, naming the nearest piece of furniture from the plan (e.g. "at the cocktail table") when there is one. */
function distanceText(distance: keyof typeof DISTANCE_TEXT, plan: GeometryPlanData, ids: string[]): string {
  const base = DISTANCE_TEXT[distance];
  const pts = plan.actors.filter((a) => ids.includes(a.characterId)).map((a) => a.position);
  if (distance !== "conversational" || !pts.length || !plan.furniture?.length) return base;
  const mid = { x: pts.reduce((n, p) => n + p.x, 0) / pts.length, y: pts.reduce((n, p) => n + p.y, 0) / pts.length };
  const near = plan.furniture
    .map((f) => ({ f, d: Math.hypot(f.position.x - mid.x, f.position.y - mid.y) - f.radiusM }))
    .filter((x) => x.d <= 1.2)
    .sort((a, b) => a.d - b.d)[0];
  return near ? `${base.slice(0, -1)} at the ${stripQuotes(near.f.name)}.` : base;
}

/** Main subject: explicit, else the speaker, else the first visible character. */
export function mainSubjectId(shot: ShotSpec): string | undefined {
  return shot.subjectId ?? shot.speakerId ?? shot.visibleIds[0];
}

export function composeKlingPrompt(
  shot: ShotSpec,
  cast: CastMember[],
  plan?: GeometryPlanData,
  preset: ProviderPreset = KLING_OMNI_PRESET,
  genre: Genre = "neutral",
): ComposedPrompt {
  const byId = (id: string) => cast.find((c) => c.id === id);
  const povCam = plan?.cameras.find((c) => c.id === shot.cameraId);
  // A point of view (D27) is someone's eyes: they are not in their own clip.
  const visible = shot.visibleIds.filter((id) => id !== povCam?.povId).map(byId).filter((c): c is CastMember => !!c);
  const speaker = shot.speakerId ? byId(shot.speakerId) : undefined;
  const s: Record<string, string> = {};
  const subjectId = mainSubjectId(shot);
  const subject = subjectId ? byId(subjectId) : undefined;

  // 1. References — only visible characters, never excluded ones.
  const refs = visible.map((c) => `${c.name}'s approved character image`);
  s.references =
    `Use ${joinNames([...refs, `the ${shot.venueName} reference`])}.` +
    (shot.startFrameAssetCode ? " Start from the supplied start frame." : "");

  // 2. Scene and story moment — quotes removed so nothing earlier is re-spoken.
  s.scene = stripQuotes(shot.sceneContext);
  // Scene setting (D18c): the same spot and background people in every clip of the scene.
  if (shot.spot?.trim()) s.scene += ` They are ${stripQuotes(shot.spot).trim().replace(/[.]$/, "")}.`;
  if (shot.crowd?.trim()) s.scene += ` In the background: ${stripQuotes(shot.crowd).trim().replace(/[.]$/, "")}, out of focus.`;
  {
    // Who looks at whom (D21b).
    const gz = gazeFor({ shot, description: shot.actions ?? "", people: cast.map((c) => ({ id: c.id, name: c.name })), line: plan?.lineOfAction });
    const gl = gazeLine(gz, (id) => byId(id)?.name ?? id, shot.visibleIds);
    if (gl) s.scene += ` ${gl}`;
    const fx = shotEffect(gz, subjectId);
    if (fx) s.scene += ` Shot effect: ${fx}.`;
    // Gestures aimed at the person they look at; walking away while looking back (D30).
    const tgt = subjectId ? gz.find((g) => g.id === subjectId)?.at : undefined;
    const tgtPerson = tgt ? cast.find((c) => c.name === tgt || c.name.split(/\s+/)[0] === tgt) : undefined;
    const camR = plan && shot.cameraId ? plan.cameras.find((c) => c.id === shot.cameraId) : undefined;
    const fwd = camR ? readCamera(planForShot(plan!, shot), camR).forwardDeg : undefined;
    if (subjectId && tgtPerson) { const ad = aimDetail(shot.actions ?? "", byId(subjectId)?.name ?? subjectId, tgtPerson.name.split(/\s+/)[0], fwd !== undefined && plan ? exitFrom(plan.views, fwd) : undefined); if (ad.length) s.scene += ` ${ad.join(" ")}`; }
    // Lying down, falling, free fall (D26).
    const bx = bodyEffect(shot.actions ?? "", subjectId ? byId(subjectId)?.name ?? "they" : "they");
    if (bx) s.scene += ` Body and angle: ${bx}.`;
  }
  // A prop taken away on this panel or an earlier one (D35) isn't listed; one in someone's hands (D36) is said.
  const goneProps = new Set((plan?.furniture ?? []).filter((f) => shot.blocking?.[`prop:${f.id}`]?.gone).map((f) => f.name));
  for (const f of plan?.furniture ?? []) {
    const holder = shot.blocking?.[`prop:${f.id}`]?.with;
    if (!holder || shot.blocking?.[holder]?.gone) continue;
    s.scene += ` ${byId(holder)?.name ?? holder} has the ${f.name}${f.detail ? ` (${stripQuotes(f.detail).replace(/[.]$/, "")})` : ""} in hand throughout.`;
  }
  const keptProps = (shot.props ?? []).filter((p) => !goneProps.has(p.name));
  if (keptProps.length) s.scene += ` Key props, unchanged in every clip: ${keptProps.map((p) => `${p.name}${p.detail ? ` (${stripQuotes(p.detail).replace(/[.]$/, "")})` : ""}`).join("; ")}.`;

  // Movement in this clip (D20): from where they start to where they end.
  for (const [id, fromId] of Object.entries(shot.from ?? {})) {
    const marks = plan?.actors.find((a) => a.characterId === id)?.marks ?? [];
    const start = fromId === "place" ? "their own place at the group" : marks.find((m) => m.id === fromId)?.label.split(",")[0];
    const endId = shot.at?.[id];
    const end = endId ? marks.find((m) => m.id === endId)?.label.split(",")[0] : "their own place with the others";
    if (start && end && !shot.blocking?.[id]) s.scene += ` ${byId(id)?.name ?? id} walks from ${start} to ${end} during the shot.`;
  }

  // A walk set for this panel on the storyboard (D35): from their spot to where they end.
  {
    const sp = plan ? planForShot(plan, shot) : undefined;
    const camW = sp && shot.cameraId ? sp.cameras.find((c) => c.id === shot.cameraId) : undefined;
    for (const [id, b] of Object.entries(shot.blocking ?? {})) {
      if (!b.to || id.startsWith("prop:")) continue;
      const d = Math.round(Math.hypot(b.to.x - b.at.x, b.to.y - b.at.y) * 2) / 2;
      // Where the walk ends, as this camera sees it: off the side, past the lens, away or nearer.
      let where = "to the spot the floor plan sets for the end of it";
      if (sp && camW) {
        const r0 = readCamera(sp, camW).actors.find((a) => a.characterId === id);
        const r1 = readCamera({ ...sp, actors: sp.actors.map((a) => (a.characterId === id ? { ...a, position: b.to!, to: undefined } : a)) }, camW).actors.find((a) => a.characterId === id);
        if (r1) {
          where = r1.frame === "out-left" ? "and out of the picture on the left"
            : r1.frame === "out-right" ? "and out of the picture on the right"
            : r1.frame === "behind" ? "past the camera and out of the picture"
            : !r1.inView ? "and out of the picture"
            : r0 && r1.depthM > r0.depthM + 1 ? `away from the camera, ending ${r1.frame === "centre" ? "in the centre" : `on the ${r1.frame.replace("frame-", "")}`} of the picture`
            : r0 && r1.depthM < r0.depthM - 1 ? `towards the camera, ending ${r1.frame === "centre" ? "in the centre" : `on the ${r1.frame.replace("frame-", "")}`} of the picture`
            : `across to the ${r1.frame === "centre" ? "centre" : r1.frame.replace("frame-", "")} of the picture`;
        }
      }
      s.scene += ` ${byId(id)?.name ?? id} walks about ${d} m during the shot, from where they start in the first frame ${where}, at a natural pace.`;
    }
  }

  // 3 + 7. Positions, distance and background from the plan.
  const cam = plan?.cameras.find((c) => c.id === shot.cameraId);
  if (plan && cam) {
    const reading = readCamera(planForShot(plan, shot), cam);
    // Others at the same spot whom this camera would see (D18d): partly in frame, silent.
    const closeUp = cam.preset === "single-cu" || cam.preset === "insert";
    const edgeIds = closeUp ? [] : reading.actors
      .filter((a) => a.inView && !shot.visibleIds.includes(a.characterId) && !shot.excludedIds.includes(a.characterId) && shot.presentIds.includes(a.characterId))
      .map((a) => a.characterId);
    const frame = describeFrame(reading, cast, [...shot.visibleIds, ...edgeIds], subjectId);
    // Over-the-shoulder foreground: only on an over-the-shoulder camera, a non-subject person, and only when 2+ people are visible.
    const fg = reading.actors
      .filter(
        (a) =>
          (cam.preset === "main-ots" || cam.preset === "reverse-ots") &&
          a.foreground &&
          shot.visibleIds.length > 1 &&
          a.characterId !== subjectId &&
          shot.visibleIds.includes(a.characterId),
      )
      .map((a) => byId(a.characterId)?.name)
      .filter(Boolean) as string[];
    s.positions =
      `Positions: ${frame}.` +
      (fg.length ? ` ${joinNames(fg)} in the soft foreground, seen from behind over the shoulder.` : "") +
      (edgeIds.length ? ` ${joinNames(edgeIds.map((id) => byId(id)?.name ?? id))} partly visible at the edge of frame, out of focus, silent.` : "") +
      (shot.distance && visible.length > 1 ? ` ${distanceText(shot.distance, plan, shot.visibleIds)}` : "");
    if (reading.backgroundView) {
      const subj = subject?.name ?? "the subject";
      s.background = `Background behind ${subj}: the ${reading.backgroundView}.`;
    }
    // A camera move named in the panel (D27) replaces the genre's usual move.
    const named = namedShot(`${shot.actions ?? ""} ${shot.shot ?? ""}`);
    const move = named.move ? MOVE_TEXT[named.move] : GENRE_PROFILES[genre].movement;
    s.camera = presetText(cam).includes("static camera") ? presetText(cam).replace("static camera", move) : `${presetText(cam).replace(/\.$/, "")}, ${move}.`;
    if (shot.shot?.trim()) s.camera = `Shot: ${shot.shot.trim()}. ${s.camera}`;
    // Raised and lowered floors (D29).
    const lv = levelLines(planForShot(plan, shot), cam, visible.map((c) => c.id), (id) => byId(id)?.name ?? id);
    if (lv.length) s.positions = `${s.positions ?? ""} ${lv.join(" ")}`.trim();
    s.camera += ` ${shotLines({ cam, kind: verticalOf(cam).kind, fovDeg: cam.fovDeg ?? PRESET_FOV[cam.preset], text: `${shot.actions ?? ""} ${shot.shot ?? ""}`, name: (id) => byId(id)?.name ?? id }).join(" ")}`;
  }

  // 4. Character and voice lock — word for word.
  if (speaker) {
    s.character = `${speaker.name} is ${speaker.voiceLock}`;
  }
  const listeners = visible.filter((c) => c.id !== speaker?.id).map((c) => c.name);
  if (speaker && listeners.length) s.listeners = `${joinNames(listeners)} listen${listeners.length === 1 ? "s" : ""} silently.`;

  // 5. Dialogue — the only quoted text in the prompt.
  const performance = [
    shot.emotion ? `Emotion: ${stripQuotes(shot.emotion)}.` : "",
    shot.intensity ? INTENSITY_TEXT[shot.intensity] : "",
    shot.actions ? stripQuotes(shot.actions) : "",
  ]
    .filter(Boolean)
    .join(" ");
  const gestures = gestureDetail(shot.sceneContext, shot.actions);
  if (performance || gestures.length) s.performance = [performance, ...gestures].filter(Boolean).join(" ");
  if (shot.spot?.trim()) s.scene += " Everyone keeps their own place and posture; no one leans on the furniture unless the moment says so.";
  if (speaker && shot.dialogue) {
    s.dialogue = `${capitalise(speaker.pronoun)} says exactly once: "${shot.dialogue}"`;
  }
  if (shot.additionalInstructions) s.additional = stripQuotes(shot.additionalInstructions);

  // Genre look (lighting, lens, tone) — never contradicts the camera line.
  if (genre !== "neutral") s.style = `Look: ${GENRE_PROFILES[genre].look}.`;

  // 8. Guard lines.
  const guards: string[] = [];
  if (speaker) {
    guards.push(`Only ${speaker.name} has intelligible dialogue. No repeated words or additional speech.`);
  } else {
    guards.push("No one speaks. No dialogue, no humming, no vocal sounds.");
  }
  if (visible.length === 1) {
    guards.push(shot.crowd?.trim()
      ? `Only ${visible[0].name} is in the foreground. Background guests stay out of focus and never speak to the camera.`
      : `Only ${visible[0].name} is in frame. No other people visible.`);
  } else if (visible.length > 1) {
    guards.push(`Exactly one of each person: ${joinNames(visible.map((c) => c.name))}.`);
  }
  guards.push("No text, no logos.");
  s.guards = guards.join(" ");

  const order = [
    "references", "scene", "positions", "character", "listeners", "performance",
    "dialogue", "camera", "background", "style", "additional", "guards",
  ];
  const text = order.filter((k) => s[k]).map((k) => s[k]).join("\n");

  const recommendedAudio = speaker ? "on" : "off";
  return {
    text,
    sections: s,
    settings: {
      model: preset.label,
      resolution: preset.resolution,
      durationSec: shot.durationSec,
      nativeAudio: shot.audioMode === "native-on" ? "on" : "off",
      recommendedAudio,
      multiShot: false,
      audioReferences: "none",
    },
  };
}
