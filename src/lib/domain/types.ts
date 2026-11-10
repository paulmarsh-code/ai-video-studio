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
  /**
   * Other places this person stands in some panels (D19b), e.g. where they arrive from.
   * A shot picks one with ShotSpec.at; otherwise the person is at `position`.
   */
  marks?: { id: string; label: string; position: Point }[];
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
  /** Lens height above the floor in metres (D25); eye level, 1.6 m, when absent. */
  heightM?: number;
  /** Tilt in degrees (D25): negative looks down, positive looks up; level when absent. */
  tiltDeg?: number;
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
  /** Height in metres (D19): drawn at this height in every camera view. */
  heightM?: number;
  /** Size, height and colour in words, kept identical in every picture and clip. */
  detail?: string;
  /** A reference picture of the prop (D19c): sent with every panel picture it appears in. */
  imageAssetId?: string;
}

export interface GeometryPlanData {
  /** Room extent in metres (scene-local). */
  bounds?: { minX: number; maxX: number; minY: number; maxY: number };
  furniture?: PlanFurniture[];
  /** Which version of the app's layout rules made this plan (D19c); older plans can be updated. */
  rules?: number;
  actors: PlanActor[];
  cameras: PlanCamera[];
  views: PlanView[];
  /** Two character ids defining the 180° line of action. */
  lineOfAction?: [string, string];
  /** Camera id that sets the reference side of the line (normally the main camera). */
  referenceCameraId?: string;
  /**
   * The video's shape (D19). Lens angles are for the frame's long side, so a portrait (9:16)
   * frame sees a narrower width. Missing means landscape (older plans).
   */
  aspect?: "9:16" | "16:9";
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
  /** Per-shot marks (D19b): character id → mark id, e.g. { jade: "arriving" }. */
  at?: Record<string, string>;
  /**
   * Where someone starts when the panel moves them (D20): mark id, or "place" for their own
   * spot. The picture shows where they end (`at`, or their place); the clip moves them across.
   */
  from?: Record<string, string>;
  /** Key props of the scene (D19), identical in every picture and clip. */
  props?: { name: string; detail: string; imageAssetId?: string }[];
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
