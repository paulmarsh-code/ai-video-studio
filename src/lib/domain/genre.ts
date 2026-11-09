// Genre profiles: conventions that change *taste* (preferred shots, camera movement, light,
// lens and pacing). Continuity rules (180°, sightlines, screen side, background) never change.
// Sources: Mascelli, Katz, Brown and genre practice; see docs/CINEMA_RULES.md, "Genre".

export const GENRES = ["neutral", "comedy", "drama", "horror", "scifi", "action", "documentary"] as const;
export type Genre = (typeof GENRES)[number];

type Role = "ots" | "cu" | "group" | "wide";
type Moment = "establishing" | "dialogue" | "peak" | "reaction" | "exit";

export interface GenreProfile {
  label: string;
  summary: string;
  /** Extra points for a camera type, optionally per moment. */
  roleBonus: Partial<Record<Role, number>>;
  momentBonus?: Partial<Record<Moment, Partial<Record<Role, number>>>>;
  /** Multiplies the ideal subject distance: above 1 = wider framing, below 1 = tighter. */
  distanceFactor: number;
  /** Camera movement wording; replaces "static camera" in prompts. */
  movement: string;
  /** Lighting and lens wording added to prompts. */
  look: string;
  /** Pause after each line in the animatic, in seconds. */
  postGapSec: number;
  /** Comedy convention: short lines and put-downs play in a two-shot (points added to group shots for lines of up to 8 words). */
  shortLineTwoShotBonus?: number;
  /** Short reason shown when the genre influenced a choice. */
  reason: string;
}

export const GENRE_PROFILES: Record<Genre, GenreProfile> = {
  neutral: {
    label: "General",
    summary: "No genre bias: continuity and coverage rules only.",
    roleBonus: {},
    distanceFactor: 1,
    movement: "static camera",
    look: "natural, even lighting",
    postGapSec: 0.5,
    reason: "",
  },
  comedy: {
    label: "Comedy",
    summary: "Wider shots and two-shots so timing plays in one frame; hold on reactions; bright, even light; mostly still camera.",
    roleBonus: { group: 1.2, wide: 0.5, cu: -0.8 },
    momentBonus: { reaction: { group: 1 }, peak: { cu: 0.8 } },
    distanceFactor: 1.15,
    movement: "static camera",
    look: "bright, even lighting, natural lens, comedic tone",
    postGapSec: 0.8,
    shortLineTwoShotBonus: 7,
    reason: "Comedy: keep people together in frame and hold the reaction",
  },
  drama: {
    label: "Drama",
    summary: "Over-the-shoulders building to close-ups as tension rises; slow push-ins at key moments; soft motivated light; shallow focus.",
    roleBonus: { cu: 0.8, ots: 0.5, wide: -0.5 },
    momentBonus: { peak: { cu: 1 } },
    distanceFactor: 0.9,
    movement: "slow, subtle push-in",
    look: "soft motivated lighting, shallow depth of field, dramatic tone",
    postGapSec: 0.7,
    reason: "Drama: tighter framing to sit with the emotion",
  },
  horror: {
    label: "Horror",
    summary: "Tight frames that hide the surroundings, empty space, slow creeping moves, low-key light, long silences.",
    roleBonus: { cu: 1, ots: 0.5, wide: -1 },
    momentBonus: { establishing: { wide: 1.5 } },
    distanceFactor: 0.85,
    movement: "slow creeping camera move",
    look: "low-key lighting with deep shadows, tight framing, unsettling tone",
    postGapSec: 1.0,
    reason: "Horror: tight frame keeps what's around them hidden",
  },
  scifi: {
    label: "Sci-fi",
    summary: "Wide shots for scale and world, symmetrical framing, smooth glides and reveals, cool or coloured light.",
    roleBonus: { wide: 1.5, group: 0.5 },
    distanceFactor: 1.3,
    movement: "smooth, gliding camera move",
    look: "cool coloured lighting, wide lens, science-fiction tone",
    postGapSec: 0.6,
    reason: "Sci-fi: wider frame to show scale and the world",
  },
  action: {
    label: "Action",
    summary: "Wides for geography plus tight impact shots, low angles for power, energetic movement, fast cutting.",
    roleBonus: { wide: 1, cu: 0.5 },
    distanceFactor: 1,
    movement: "dynamic handheld camera",
    look: "high-contrast lighting, energetic framing, action tone",
    postGapSec: 0.3,
    reason: "Action: clear geography and punchy framing",
  },
  documentary: {
    label: "Documentary",
    summary: "Medium close interviews looking just past the lens, observational cutaways, natural light, steady or gentle handheld.",
    roleBonus: { ots: -1, group: 0.5, wide: 0.5, cu: 0.5 },
    distanceFactor: 1.05,
    movement: "steady observational camera",
    look: "natural lighting, documentary tone",
    postGapSec: 0.5,
    reason: "Documentary: observational framing, no staged over-the-shoulders",
  },
};

export function genreBonus(genre: Genre | undefined, role: Role, moment: Moment): number {
  const p = GENRE_PROFILES[genre ?? "neutral"];
  return (p.roleBonus[role] ?? 0) + (p.momentBonus?.[moment]?.[role] ?? 0);
}

export function asGenre(v: unknown): Genre {
  return (GENRES as readonly string[]).includes(String(v)) ? (v as Genre) : "neutral";
}
