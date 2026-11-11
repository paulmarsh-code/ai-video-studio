"use client";

// Schematic camera view: a simple perspective sketch of what a plan camera sees.
// Deterministic geometry only — no AI, no credits. People are sized by distance,
// placed by their angle in the lens, and the shoulder person is drawn soft from behind.

import { cameraZ, floorZ } from "@/lib/domain/levels";
import { horizontalFov, readCamera } from "@/lib/domain/geometry";
import { viewSlice } from "@/lib/domain/panorama";
import type { CastMember, GeometryPlanData, PlanCamera, Point } from "@/lib/domain/types";

// The viewfinder has the video's shape (D31): 16:9, or 9:16 for a portrait project, so it shows
// exactly the slice of the room (and of the 360° view) that the pictures get.
const LW = 480, LH = 270;
const PW = 300, PH = 533;
const EYE_M = 1.6; // camera at eye level
const HEAD_R_M = 0.11;
const SHOULDER_M = 0.46;
const TABLE_TOP_M = 1.05;
const COLOURS = ["#e11d48", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];
// Background colour per named view: picked from a fixed palette by the view's name, so any
// venue's views get distinct, stable colours. Text colour follows the background's lightness.
const VIEW_PALETTE = [
  { bg: "#1e293b", fg: "#e2e8f0" },
  { bg: "#78350f", fg: "#fef3c7" },
  { bg: "#bae6fd", fg: "#334155" },
  { bg: "#e7e5e4", fg: "#334155" },
  { bg: "#14532d", fg: "#dcfce7" },
  { bg: "#fde68a", fg: "#334155" },
  { bg: "#581c87", fg: "#f3e8ff" },
  { bg: "#fecaca", fg: "#334155" },
];
function viewColour(name: string) {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return VIEW_PALETTE[h % VIEW_PALETTE.length];
}

function project(cam: PlanCamera, fovDeg: number, p: Point, W: number) {
  const fx = cam.lookAt.x - cam.position.x;
  const fy = cam.lookAt.y - cam.position.y;
  const l = Math.hypot(fx, fy) || 1;
  const f = { x: fx / l, y: fy / l };
  const r = { x: f.y, y: -f.x };
  const rx = p.x - cam.position.x;
  const ry = p.y - cam.position.y;
  const depth = rx * f.x + ry * f.y;
  const lateral = rx * r.x + ry * r.y;
  const focal = W / 2 / Math.tan(((fovDeg / 2) * Math.PI) / 180);
  return { depth, x: W / 2 + (lateral / depth) * focal, scale: focal / depth };
}

/** The venue's 360° ring (D21): a small copy, twice round, and where it starts. */
export interface RingInfo { url: string; startDeg: number; width: number; height: number; pxPerDeg: number; previewHeight: number }

export function CameraView({
  plan,
  cameraId,
  cast,
  onlyIds,
  subjectId,
  compact,
  ring,
}: {
  /** With a ring, the background is the real venue slice this camera sees, from where it stands. */
  ring?: RingInfo;
  plan: GeometryPlanData;
  cameraId: string;
  cast: CastMember[];
  /** Limit drawing to these characters (the shot's visible set). */
  onlyIds?: string[];
  subjectId?: string;
  /** Hide the explanatory caption (for compact grids). */
  compact?: boolean;
}) {
  const cam = plan.cameras.find((c) => c.id === cameraId);
  if (!cam) return null;
  const portrait = plan.aspect === "9:16";
  const W = portrait ? PW : LW, H = portrait ? PH : LH;
  // The angle across the frame's width: a portrait lens angle is for its height (D19).
  const fov = horizontalFov(plan, cam);
  const reading = readCamera(plan, cam);
  // Up and down (D25): tilting down raises the horizon in the frame, tilting up lowers it.
  const focalPx = W / 2 / Math.tan(((fov / 2) * Math.PI) / 180);
  const horizon = H * 0.4 + Math.tan(((cam.tiltDeg ?? 0) * Math.PI) / 180) * focalPx;
  const wall = reading.backgroundView ?? "";
  // The lens's height above the room's floor (D29): eye level, a high or low camera, or on a balcony.
  const camAbs = cameraZ(plan, cam);
  const colour = (id: string) => COLOURS[Math.max(0, cast.findIndex((c) => c.id === id)) % COLOURS.length];
  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;

  const people = reading.actors
    .filter((a) => a.depthM > 0.3 && (!onlyIds || onlyIds.includes(a.characterId)))
    .map((a) => {
      const pos = plan.actors.find((x) => x.characterId === a.characterId)!.position;
      return { ...a, pr: project(cam, fov, pos, W) };
    })
    .filter((a) => a.pr.x > -W && a.pr.x < 2 * W)
    .sort((a, b) => b.depthM - a.depthM); // far first

  const tables = (plan.furniture ?? [])
    .map((t) => ({ t, pr: project(cam, fov, t.position, W) }))
    .filter((x) => x.pr.depth > 0.5);

  return (
    <figure className="overflow-hidden rounded-lg border border-neutral-300 bg-neutral-100">
      <svg viewBox={`0 0 ${W} ${H}`} className={portrait ? "mx-auto block w-full max-w-[300px]" : "block w-full"} role="img" aria-label={`Schematic view from ${cam.name}`}>
        <defs>
          <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <clipPath id="frame"><rect width={W} height={H} /></clipPath>
        </defs>
        <g clipPath="url(#frame)"><g transform={rollTransform(cam.rollDeg, W, H)}>
          {/* Background wall and floor */}
          <rect width={W} height={horizon + 25} fill={wall ? viewColour(wall).bg : "#cbd5e1"} />
          <rect y={horizon + 25} width={W} height={H} fill="#d6d3d1" />
          {ring && (() => {
            // The slice of the venue ring this camera sees, scaled to fill the frame's width (D21).
            const sl = viewSlice(plan, cam);
            const k = ring.previewHeight / ring.height; // ring pixels → preview pixels
            let x0 = (ring.startDeg - sl.leftDeg) * ring.pxPerDeg;
            x0 = ((x0 % ring.width) + ring.width) % ring.width;
            const w = (sl.leftDeg - sl.rightDeg) * ring.pxPerDeg;
            const s = W / (w * k);
            const imgH = ring.previewHeight * s;
            return <image href={ring.url} x={-x0 * k * s} y={horizon + 25 - imgH * 0.62} width={ring.width * 2 * k * s} height={imgH} preserveAspectRatio="none" data-testid="ring-background" />;
          })()}
          {ring && <rect y={horizon + 25} width={W} height={H} fill="#d6d3d1" opacity={0.35} />}
          {wall && !ring && (
            <text x={10} y={22} textAnchor="start" fontSize={12} fill={viewColour(wall).fg} letterSpacing={2}>
              {wall.toUpperCase()}
            </text>
          )}

          {/* Furniture */}
          {tables.map(({ t, pr }) => {
            const y = horizon + (camAbs - floorZ(plan, t.position) - TABLE_TOP_M) * pr.scale;
            const rx = t.radiusM * pr.scale;
            return (
              <g key={t.id}>
                <rect x={pr.x - rx * 0.12} y={y} width={rx * 0.24} height={H} fill="#57534e" />
                <ellipse cx={pr.x} cy={y} rx={rx} ry={Math.max(3, rx * 0.22)} fill="#a8a29e" stroke="#57534e" />
              </g>
            );
          })}

          {/* People, far to near */}
          {people.map((p) => {
            const s = p.pr.scale;
            const headR = HEAD_R_M * s;
            const sh = (SHOULDER_M * s) / 2;
            const cx = p.pr.x;
            // Heads at their own height (D29): above the horizon on a balcony, below it in a pit.
            const actor = plan.actors.find((x) => x.characterId === p.characterId)!;
            const z0 = floorZ(plan, actor.position);
            // Posture (D37): a seated or kneeling head is lower; someone lying is flat.
            const seat = actor.poseOn && /\b(bed|sofa|couch|settee|bench|chair|seat|stool|armchair)\b/i.test(actor.poseOn) ? 0.5 : actor.pose === "lying" ? 0.12 : 0.45;
            const eye = actor.pose === "sitting" ? seat + 0.75 : actor.pose === "kneeling" ? 1.15 : actor.pose === "crouching" ? 0.9 : actor.pose === "lying" ? seat + 0.15 : EYE_M;
            const cy = horizon + (camAbs - (z0 + eye)) * s;
            const feetY = Math.min(H + 40, horizon + (camAbs - z0) * s);
            const fg = p.foreground;
            const isSubject = p.characterId === subjectId;
            const fill = colour(p.characterId);
            if (actor.pose === "lying") return (
              <g key={p.characterId}>
                <rect x={cx - 0.85 * s} y={cy - 0.14 * s} width={1.7 * s} height={0.28 * s} rx={0.14 * s} fill={fill} opacity={0.85} />
                <circle cx={cx + 0.75 * s} cy={cy - 0.05 * s} r={headR} fill="#f5d0b5" stroke={fill} strokeWidth={Math.max(1, headR * 0.12)} />
                <text x={cx} y={Math.max(14, cy - 0.3 * s)} textAnchor="middle" fontSize={12} fontWeight={isSubject ? 700 : 500} fill="#fff" stroke="#0008" strokeWidth={3} paintOrder="stroke">{name(p.characterId)} (lying)</text>
              </g>
            );
            return (
              <g key={p.characterId} filter={fg ? "url(#soft)" : undefined} opacity={fg ? 0.9 : 1}>
                <path
                  d={`M ${cx - sh} ${feetY} L ${cx - sh} ${cy + headR * 2.2} Q ${cx - sh} ${cy + headR * 1.3} ${cx - headR * 0.9} ${cy + headR * 1.25} L ${cx + headR * 0.9} ${cy + headR * 1.25} Q ${cx + sh} ${cy + headR * 1.3} ${cx + sh} ${cy + headR * 2.2} L ${cx + sh} ${feetY} Z`}
                  fill={fg ? "#262626" : fill}
                  opacity={fg ? 1 : 0.85}
                />
                <circle cx={cx} cy={cy} r={headR} fill={fg ? "#171717" : "#f5d0b5"} stroke={fg ? "none" : fill} strokeWidth={Math.max(1, headR * 0.12)} />
                {!fg && (
                  <text x={cx} y={Math.max(14, cy - headR - 6)} textAnchor="middle" fontSize={12} fontWeight={isSubject ? 700 : 500} fill="#fff" stroke="#0008" strokeWidth={3} paintOrder="stroke">
                    {name(p.characterId)}
                  </text>
                )}
              </g>
            );
          })}
          {/* Unblurred labels for over-the-shoulder figures */}
          {people.filter((p) => p.foreground).map((p) => (
            <text key={`fg-${p.characterId}`} x={Math.min(W - 40, Math.max(40, p.pr.x))} y={H - 12} textAnchor="middle" fontSize={12} fill="#fff" stroke="#0009" strokeWidth={3} paintOrder="stroke">
              {name(p.characterId)} (back)
            </text>
          ))}
        </g></g>
        {cam.povId && <text x={10} y={20} fontSize={13} fill="#fff" stroke="#0009" strokeWidth={3} paintOrder="stroke">{name(cam.povId)}&apos;s eyes</text>}
        {cam.rollDeg ? <text x={W - 10} y={20} textAnchor="end" fontSize={13} fill="#fff" stroke="#0009" strokeWidth={3} paintOrder="stroke">Dutch {Math.round(cam.rollDeg)}°</text> : null}
        <rect width={W} height={H} fill="none" stroke="#0004" />
      </svg>
      {!compact && <figcaption className="px-3 py-1.5 text-xs text-neutral-600">
        {cam.name}: sketch from the floor plan, not a render. Black blurred shape = the over-the-shoulder person, seen from behind.
      </figcaption>}
    </figure>
  );
}

/** A Dutch angle (D27): the picture rolled about its centre, scaled so the corners stay filled. */
export function rollTransform(rollDeg: number | undefined, w: number, h: number): string | undefined {
  if (!rollDeg) return undefined;
  const t = (Math.abs(rollDeg) * Math.PI) / 180;
  const k = Math.cos(t) + Math.sin(t) * Math.max(w / h, h / w);
  return `translate(${w / 2} ${h / 2}) rotate(${rollDeg}) scale(${k.toFixed(3)}) translate(${-w / 2} ${-h / 2})`;
}
