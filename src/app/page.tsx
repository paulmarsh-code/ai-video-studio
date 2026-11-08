import Link from "next/link";
import { getDb } from "@/db/client";
import { listProjects } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const projects = listProjects(await getDb());
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">Projects</h1>
      <p className="mt-1 text-neutral-600">Plan, check and log AI video shots before you spend generation credits.</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`} className="block rounded-xl border border-neutral-200 bg-white p-5 shadow-sm hover:border-neutral-400">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">{p.name}</span>
                <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs">{p.code}</span>
              </div>
              <p className="mt-1 text-sm text-neutral-600">{p.type} · {p.generator}</p>
              {p.demo && <p className="mt-2 text-xs text-amber-700">Demo project: illustrative data</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
