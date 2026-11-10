"use client";

// The left-hand navigation (D22): projects open like folders, in the order the work flows:
// brief, characters, venues, then each scene with its floor plan and cameras, storyboard,
// shot design and animatic. The project and scene you're in open by themselves; anything
// you open or close is remembered in this browser.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export interface NavProject {
  id: string;
  name: string;
  venues: { id: string; name: string }[];
  scenes: { id: string; label: string }[];
}

const KEY = "studio-nav-open";

function load(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>; } catch { return {}; }
}

export function SideNav({ projects }: { projects: NavProject[] }) {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { setOpen(load()); }, []);
  const toggle = (k: string, now: boolean) => setOpen((o) => {
    const next = { ...o, [k]: !now };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private window: not remembered */ }
    return next;
  });
  // What you're looking at is always open.
  const isOpen = (k: string, here: boolean, fallback = false) => (open[k] ?? (here || fallback));
  const projectsOpen = isOpen("projects", path === "/" || path.startsWith("/projects"), true);

  const item = (href: string, label: string, testId?: string, exact = false) => {
    const active = exact ? path === href : path === href || path.startsWith(href + "/");
    return (
      <Link href={href} data-testid={testId}
        className={`block truncate rounded px-2 py-1 ${active ? "bg-neutral-700 text-white" : "text-neutral-300 hover:bg-neutral-800 hover:text-white"}`}>
        {label}
      </Link>
    );
  };
  const twisty = (k: string, now: boolean, label: string, testId?: string) => (
    <button type="button" onClick={() => toggle(k, now)} aria-expanded={now} data-testid={testId}
      className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-neutral-200 hover:bg-neutral-800">
      <span className={`inline-block w-3 text-[10px] transition-transform ${now ? "rotate-90" : ""}`}>▶</span>
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <nav aria-label="Studio" className="mt-4 text-sm md:mt-6">
      <div className="flex items-center gap-1">
        <div className="flex-1">{twisty("projects", projectsOpen, "Projects", "nav-projects")}</div>
        <Link href="/" className="rounded px-1 text-xs text-neutral-400 hover:text-white" title="All projects">all</Link>
      </div>
      {projectsOpen && (
        <ul className="ml-2 border-l border-neutral-700 pl-2">
          {projects.map((p) => {
            const base = `/projects/${p.id}`;
            const here = path.startsWith(base);
            const pOpen = isOpen(`p:${p.id}`, here);
            const scenesOpen = isOpen(`s:${p.id}`, here && path.includes("/scenes/"), true);
            const venuesOpen = isOpen(`v:${p.id}`, here && path.includes("/venues"));
            return (
              <li key={p.id} data-testid={`nav-project-${p.id}`}>
                {twisty(`p:${p.id}`, pOpen, p.name)}
                {pOpen && (
                  <ul className="ml-2 border-l border-neutral-700 pl-2">
                    <li>{item(base, "Overview", undefined, true)}</li>
                    <li>{item(`${base}/brief`, "Brief")}</li>
                    <li>{item(`${base}/characters`, "Characters", `nav-characters-${p.id}`)}</li>
                    <li>
                      {twisty(`v:${p.id}`, venuesOpen, `Venues (${p.venues.length})`)}
                      {venuesOpen && (
                        <ul className="ml-2 border-l border-neutral-700 pl-2">
                          <li>{item(`${base}/venues`, "All venues", undefined, true)}</li>
                          {p.venues.map((v) => <li key={v.id}>{item(`${base}/venues/${v.id}`, v.name)}</li>)}
                        </ul>
                      )}
                    </li>
                    <li>
                      {twisty(`s:${p.id}`, scenesOpen, `Scenes (${p.scenes.length})`, `nav-scenes-${p.id}`)}
                      {scenesOpen && (
                        <ul className="ml-2 border-l border-neutral-700 pl-2">
                          {p.scenes.map((s) => {
                            const sb = `${base}/scenes/${s.id}`;
                            const sOpen = isOpen(`sc:${s.id}`, path.startsWith(sb));
                            return (
                              <li key={s.id}>
                                {twisty(`sc:${s.id}`, sOpen, s.label, `nav-scene-${s.id}`)}
                                {sOpen && (
                                  <ul className="ml-2 border-l border-neutral-700 pl-2">
                                    <li>{item(sb, "Scene set-up", undefined, true)}</li>
                                    <li>{item(`${sb}/plan`, "Floor plan & cameras", `nav-plan-${s.id}`)}</li>
                                    <li>{item(`${sb}/storyboard`, "Storyboard", `nav-storyboard-${s.id}`)}</li>
                                    <li>{item(`${sb}/design`, "Shot design")}</li>
                                    <li>{item(`${sb}/animatic`, "Animatic")}</li>
                                  </ul>
                                )}
                              </li>
                            );
                          })}
                          <li>{item(`${base}/scenes/new`, "+ New scene")}</li>
                        </ul>
                      )}
                    </li>
                  </ul>
                )}
              </li>
            );
          })}
          <li>{item("/projects/new", "+ New project")}</li>
        </ul>
      )}
      <div className="mt-2">{item("/library", "Library", "nav-library")}</div>
    </nav>
  );
}
