import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import * as studio from "@/lib/studioRepo";
import { SceneSetup } from "@/components/SceneSetup";

export const dynamic = "force-dynamic";

export default async function NewScenePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const project = repo.getProject(db, id);
  if (!project) notFound();
  const venues = studio.listVenues(db, id).map((v) => ({ id: v.id, name: v.name, approved: v.status === "approved" }));
  const characters = studio.listCharacters(db, id).map((c) => ({ id: c.slug, name: c.name, role: c.role, approved: !!c.approved }));
  return (
    <div className="max-w-3xl">
      <nav className="text-sm text-neutral-500" aria-label="Breadcrumb"><Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>{project.name}</Link> / <span className="text-neutral-800">New scene</span></nav>
      <h1 className="mb-4 text-2xl font-semibold">New scene</h1>
      <SceneSetup projectId={id} venues={venues} characters={characters} />
    </div>
  );
}
