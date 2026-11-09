import Link from "next/link";
import { ProjectWizard } from "@/components/ProjectWizard";

export default function NewProjectPage() {
  return (
    <div className="max-w-3xl">
      <nav className="text-sm text-neutral-500" aria-label="Breadcrumb"><Link href="/">Projects</Link> / <span className="text-neutral-800">New project</span></nav>
      <h1 className="mb-4 text-2xl font-semibold">New project</h1>
      <ProjectWizard />
    </div>
  );
}
