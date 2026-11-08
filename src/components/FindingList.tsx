import type { Finding } from "@/lib/domain/types";

const tone = {
  error: "border-red-300 bg-red-50 text-red-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-sky-300 bg-sky-50 text-sky-900",
} as const;

const order = { error: 0, warning: 1, info: 2 } as const;

export function FindingList({ findings, emptyText = "All checks passed. Ready to generate." }: { findings: Finding[]; emptyText?: string }) {
  if (!findings.length) return <p className="mt-2 text-sm text-green-700">{emptyText}</p>;
  return (
    <ul className="mt-2 space-y-2">
      {[...findings].sort((a, b) => order[a.severity] - order[b.severity]).map((f, i) => (
        <li key={`${f.code}-${i}`} className={`rounded-md border px-3 py-2 text-sm ${tone[f.severity]}`}>
          <strong className="uppercase">{f.severity}</strong> · {f.message}
          {f.fix && <div className="mt-1 opacity-80">Fix: {f.fix}</div>}
        </li>
      ))}
    </ul>
  );
}
