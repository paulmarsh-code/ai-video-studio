import Link from "next/link";
import { getDb } from "@/db/client";
import { listProjects } from "@/lib/repo";
import { briefOf } from "@/lib/studioRepo";
import { shapeLine } from "@/lib/domain/story";

export const dynamic = "force-dynamic";

export default async function Home() {
  const projects = listProjects(await getDb());
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">Projects</h1>
      <p className="mt-1 text-neutral-600">Plan, check and log AI video shots before you spend generation credits.</p>
      <Link href="/projects/new" className="mt-4 inline-block rounded-md bg-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800" data-testid="new-project">+ New project</Link>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`} className="block rounded-xl border border-neutral-200 bg-white p-5 shadow-sm hover:border-neutral-400">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">{p.name}</span>
                <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs">{p.code}</span>
              </div>
              <p className="mt-1 text-sm text-neutral-600">{shapeLine(briefOf(p)) || p.type}</p>
              {p.demo && <p className="mt-2 text-xs text-amber-700">Demo project: illustrative data</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
