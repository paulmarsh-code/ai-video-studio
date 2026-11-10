import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import "./globals.css";
import { getDb } from "@/db/client";
import * as t from "@/db/schema";
import * as repo from "@/lib/repo";
import { SideNav, type NavProject } from "@/components/SideNav";

export const metadata: Metadata = {
  title: "AI Video Production Studio",
  description: "Mind First Group Ltd — plan, check and log AI video shots before spending credits.",
};

export const dynamic = "force-dynamic";

async function navProjects(): Promise<NavProject[]> {
  try {
    const db = await getDb();
    return repo.listProjects(db).map((p) => ({
      id: p.id,
      name: p.name,
      venues: db.select().from(t.venues).where(eq(t.venues.projectId, p.id)).all().map((v) => ({ id: v.id, name: v.name })),
      scenes: repo.listScenes(db, p.id).map((s) => ({ id: s.id, label: `${s.number}. ${s.title}` })),
    }));
  } catch {
    return [];
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const projects = await navProjects();
  return (
    <html lang="en-GB">
      <body className="antialiased bg-neutral-50 text-neutral-900">
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="border-b border-neutral-200 bg-neutral-900 px-4 py-3 text-neutral-100 md:w-72 md:shrink-0 md:border-b-0 md:border-r md:py-6">
            <Link href="/" className="block text-lg font-semibold">Video Studio</Link>
            <p className="text-xs text-neutral-400">Mind First</p>
            <Suspense><SideNav projects={projects} /></Suspense>
          </aside>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
