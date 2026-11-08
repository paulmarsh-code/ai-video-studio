"use client";

// Schematic camera view: a simple perspective sketch of what a plan camera sees.
// Deterministic geometry only — no AI, no credits. People are sized by distance,
// placed by their angle in the lens, and the shoulder person is drawn soft from behind.

import { PRESET_FOV, readCamera } from "@/lib/domain/geometry";
import type { CastMember, GeometryPlanData, PlanCamera, Point } from "@/lib/domain/types";

const W = 480;
const H = 270; // 16:9
const EYE_M = 1.6; // camera at eye level
const HEAD_R_M = 0.11;
const SHOULDER_M = 0.46;
const TABLE_TOP_M = 1.05;
const COLOURS = ["#e11d48", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];
const VIEW_COLOURS: Record<string, string> = {
  "screen wall": "#1e293b",
  bar: "#78350f",
  "windows and entrance": "#bae6fd",
  "lounge seating": "#e7e5e4",
};

function project(cam: PlanCamera, fovDeg: number, p: Point) {
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

export function CameraView({
  plan,
  cameraId,
  cast,
  onlyIds,
  subjectId,
}: {
  plan: GeometryPlanData;
  cameraId: string;
  cast: CastMember[];
  /** Limit drawing to these characters (the shot's visible set). */
  onlyIds?: string[];
  subjectId?: string;
}) {
  const cam = plan.cameras.find((c) => c.id === cameraId);
  if (!cam) return null;
  const fov = cam.fovDeg ?? PRESET_FOV[cam.preset];
  const reading = readCamera(plan, cam);
  const horizon = H * 0.4;
  const wall = reading.backgroundView ?? "";
  const colour = (id: string) => COLOURS[Math.max(0, cast.findIndex((c) => c.id === id)) % COLOURS.length];
  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;

  const people = reading.actors
    .filter((a) => a.depthM > 0.3 && (!onlyIds || onlyIds.includes(a.characterId)))
    .map((a) => {
      const pos = plan.actors.find((x) => x.characterId === a.characterId)!.position;
      return { ...a, pr: project(cam, fov, pos) };
    })
    .filter((a) => a.pr.x > -W && a.pr.x < 2 * W)
    .sort((a, b) => b.depthM - a.depthM); // far first

  const tables = (plan.furniture ?? [])
    .map((t) => ({ t, pr: project(cam, fov, t.position) }))
    .filter((x) => x.pr.depth > 0.5);

  return (
    <figure className="overflow-hidden rounded-lg border border-neutral-300 bg-neutral-100">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Schematic view from ${cam.name}`}>
        <defs>
          <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <clipPath id="frame"><rect width={W} height={H} /></clipPath>
        </defs>
        <g clipPath="url(#frame)">
          {/* Background wall and floor */}
          <rect width={W} height={horizon + 25} fill={VIEW_COLOURS[wall] ?? "#cbd5e1"} />
          <rect y={horizon + 25} width={W} height={H} fill="#d6d3d1" />
          {wall && (
            <text x={W / 2} y={28} textAnchor="middle" fontSize={14} fill={wall === "windows and entrance" || wall === "lounge seating" ? "#334155" : "#e2e8f0"} letterSpacing={2}>
              {wall.toUpperCase()}
            </text>
          )}

          {/* Furniture */}
          {tables.map(({ t, pr }) => {
            const y = horizon + (EYE_M - TABLE_TOP_M) * pr.scale;
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
            const cy = horizon;
            const fg = p.foreground;
            const isSubject = p.characterId === subjectId;
            const fill = colour(p.characterId);
            return (
              <g key={p.characterId} filter={fg ? "url(#soft)" : undefined} opacity={fg ? 0.9 : 1}>
                <path
                  d={`M ${cx - sh} ${H + 40} L ${cx - sh} ${cy + headR * 2.2} Q ${cx - sh} ${cy + headR * 1.3} ${cx - headR * 0.9} ${cy + headR * 1.25} L ${cx + headR * 0.9} ${cy + headR * 1.25} Q ${cx + sh} ${cy + headR * 1.3} ${cx + sh} ${cy + headR * 2.2} L ${cx + sh} ${H + 40} Z`}
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
        </g>
        <rect width={W} height={H} fill="none" stroke="#0004" />
      </svg>
      <figcaption className="px-3 py-1.5 text-xs text-neutral-600">
        {cam.name}: schematic preview from the floor plan, not a render. Soft dark shape = over-the-shoulder person seen from behind.
      </figcaption>
    </figure>
  );
}
