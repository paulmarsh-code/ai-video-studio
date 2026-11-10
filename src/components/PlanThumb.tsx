// A small top-down view of the floor plan (D19): who stands where, the key props, and the
// cameras once chosen. Used on the storyboard to check positions before approving them.

import type { GeometryPlanData } from "@/lib/domain/types";

const COLOURS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#be185d", "#4d7c0f"];

export function PlanThumb({ plan, names }: { plan: GeometryPlanData; names: Record<string, string> }) {
  const pts = [...plan.actors.map((a) => a.position), ...(plan.furniture ?? []).map((f) => f.position)];
  if (!pts.length) return <p className="text-xs text-neutral-500">No positions yet.</p>;
  const pad = 1.4;
  const minX = Math.min(...pts.map((p) => p.x)) - pad, maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad, maxY = Math.max(...pts.map((p) => p.y)) + pad;
  const W = 260, H = Math.round((W * (maxY - minY)) / (maxX - minX));
  const sx = (x: number) => ((x - minX) / (maxX - minX)) * W;
  const sy = (y: number) => H - ((y - minY) / (maxY - minY)) * H; // north up
  const m = W / (maxX - minX);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded border border-neutral-200 bg-neutral-50" role="img" aria-label="Floor plan from above" data-testid="plan-thumb">
      {(plan.furniture ?? []).map((f) => (
        <g key={f.id}>
          <circle cx={sx(f.position.x)} cy={sy(f.position.y)} r={Math.max(4, f.radiusM * m)} fill="#e5e5e5" stroke="#737373" />
          <text x={sx(f.position.x)} y={sy(f.position.y) + Math.max(4, f.radiusM * m) + 11} fontSize="9" textAnchor="middle" fill="#525252">{f.name}</text>
        </g>
      ))}
      {plan.cameras.map((c) => (
        <line key={c.id} x1={sx(c.position.x)} y1={sy(c.position.y)} x2={sx(c.position.x + (c.lookAt.x - c.position.x) * 0.25)} y2={sy(c.position.y + (c.lookAt.y - c.position.y) * 0.25)} stroke="#a3a3a3" strokeWidth="2" />
      ))}
      {plan.actors.map((a, k) => (
        <g key={a.characterId}>
          <circle cx={sx(a.position.x)} cy={sy(a.position.y)} r="7" fill={COLOURS[k % COLOURS.length]} />
          <text x={sx(a.position.x)} y={sy(a.position.y) - 10} fontSize="10" fontWeight="600" textAnchor="middle" fill="#111">{names[a.characterId] ?? a.characterId}</text>
        </g>
      ))}
    </svg>
  );
}
