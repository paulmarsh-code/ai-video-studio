import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import { briefOf } from "@/lib/studioRepo";
import { ProjectWizard } from "@/components/ProjectWizard";

export const dynamic = "force-dynamic";

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = repo.getProject(await getDb(), id);
  if (!project) notFound();
  const b = briefOf(project);
  return (
    <div className="max-w-3xl">
      <nav className="text-sm text-neutral-500" aria-label="Breadcrumb"><Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>{project.name}</Link> / <span className="text-neutral-800">Brief</span></nav>
      <h1 className="mb-4 text-2xl font-semibold">Project brief</h1>
      <ProjectWizard existing={{ id, name: project.name, ...b }} />
    </div>
  );
}
