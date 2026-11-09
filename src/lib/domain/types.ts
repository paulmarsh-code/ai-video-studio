// Core domain types. Pure TypeScript — no database or framework imports,
// so the rules engine can be tested in isolation (Build Spec v1.4, Stages 2, 5–8).

export type Pronoun = "she" | "he" | "they";

export interface CastMember {
  id: string;
  name: string;
  pronoun: Pronoun;
  /** Approved voice/character description, injected word for word (Stage 2 voice lock). */
  voiceLock: string;
  /** Short visual identity line used in the references line. */
  referenceLabel?: string;
}

export interface Point {
  x: number; // metres, scene-local: +x to the right when facing the far end
  y: number; // metres, +y towards the far end of the venue
}

export type CameraPreset =
  | "wide"
  | "main-ots"
  | "reverse-ots"
  | "single-cu"
  | "two-shot"
  | "insert";

export interface PlanActor {
  characterId: string;
  position: Point;
}

export interface PlanCamera {
  id: string;
  name: string;
  preset: CameraPreset;
  position: Point;
  lookAt: Point;
  /** Horizontal field of view in degrees; defaults by preset. */
  fovDeg?: number;
  /** If the camera intentionally crosses the line, the reason (override). */
  overrideReason?: string;
}

export interface PlanView {
  name: string; // e.g. "screen wall"
  directionDeg: number; // look direction that sees this view (0 = +x, 90 = +y)
}

export interface PlanFurniture {
  id: string;
  name: string; // e.g. "cocktail table"
  position: Point;
  radiusM: number;
}

export interface GeometryPlanData {
  /** Room extent in metres (scene-local). */
  bounds?: { minX: number; maxX: number; minY: number; maxY: number };
  furniture?: PlanFurniture[];
  actors: PlanActor[];
  cameras: PlanCamera[];
  views: PlanView[];
  /** Two character ids defining the 180° line of action. */
  lineOfAction?: [string, string];
  /** Camera id that sets the reference side of the line (normally the main camera). */
  referenceCameraId?: string;
}

export type DistancePreset = "conversational" | "social-group" | "across-room";
export type Intensity = "subtle" | "natural" | "big";
export type AudioMode = "native-on" | "off";

export interface ShotSpec {
  code: string;
  venueName: string;
  /** Story moment in plain words. Must not quote earlier dialogue. */
  sceneContext: string;
  presentIds: string[];
  visibleIds: string[];
  excludedIds: string[];
  /** Main subject of the shot (who the camera is about). Defaults to the speaker. */
  subjectId?: string;
  speakerId?: string;
  /** Exact approved dialogue for the speaker (locked field). */
  dialogue?: string;
  /** Dialogue entered for other characters — normally empty; any entry is flagged. */
  otherDialogue?: Record<string, string>;
  actions: string;
  emotion?: string;
  intensity?: Intensity;
  cameraId?: string;
  distance?: DistancePreset;
  durationSec: number;
  audioMode: AudioMode;
  startFrameAssetCode?: string;
  /** Any audio/voice reference files attached (should be none — v1.3 rule). */
  audioReferenceCodes?: string[];
  additionalInstructions?: string;
  /** From the scene setting (D18c): where the characters are, e.g. "around a tall cocktail table". */
  spot?: string;
  /** Background people, e.g. "about 30 guests mingling"; empty means no one else. */
  crowd?: string;
}

export type Severity = "error" | "warning" | "info";

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  /** Plain-English fix suggestion. */
  fix?: string;
  field?: string;
}

export const FAILURE_CATEGORIES = [
  "wrong-speaker",
  "wrong-voice",
  "extra-dialogue",
  "unwanted-vocalisation",
  "missing-audio",
  "wrong-camera-angle",
  "extra-actor",
  "identity-drift",
  "wrong-venue",
  "failed-action",
  "lip-sync-mismatch",
  "duplicate-person",
  "wrong-distance-blocking",
  "wrong-background",
] as const;
export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export interface ProviderPreset {
  id: string;
  label: string;
  maxPromptChars: number;
  minDurationSec: number;
  maxDurationSec: number;
  resolution: string;
}

/** Editable project preset — not a claim about every Kling model. */
export const KLING_OMNI_PRESET: ProviderPreset = {
  id: "kling-3.0-omni",
  label: "Kling 3.0 Omni (web app)",
  maxPromptChars: 2500,
  minDurationSec: 3,
  maxDurationSec: 15,
  resolution: "720p",
};
