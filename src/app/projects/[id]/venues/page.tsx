import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import * as studio from "@/lib/studioRepo";
import { venueViewPrompt } from "@/lib/domain/imagePrompts";
import { getImageProvider } from "@/lib/providers/images";
import { setVenueViewImageAction } from "@/app/studioActions";
import { ImageSlot } from "@/components/ImageSlot";
import { VenueEditor } from "@/components/VenueEditor";
import { VenueWizard } from "@/components/VenueWizard";

export const dynamic = "force-dynamic";

const codeName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

export default async function VenuesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; new?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const project = repo.getProject(db, id);
  if (!project) notFound();
  const venues = studio.listVenues(db, id);
  const style = String((project.brief as { style?: string }).style ?? "photorealistic");
  const genre = repo.getProjectGenre(db, id);
  const canGenerate = !!getImageProvider();

  // One venue at a time: the one in ?v=, else the first. ?new=1 starts a new one.
  const adding = sp.new === "1" || venues.length === 0;
  const venue = adding ? undefined : venues.find((x) => x.id === sp.v) ?? venues[0];
  const hasImages = !!venue?.views.some((v) => v.imageAssetId);
  const created = !!venue && (hasImages || !!venue.description.trim());
  const baseCode = venue ? `${project.code}_VEN_${codeName(venue.name).slice(0, 24)}` : "";

  return (
    <div className="max-w-6xl">
      <p className="text-sm text-neutral-500"><Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>{project.name}</Link> /</p>
      <h1 className="text-2xl font-semibold">Venue creation</h1>

      {venues.length > 0 && (
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Venues" data-testid="venue-switcher">
          {venues.map((x) => (
            <Link key={x.id} href={`?v=${x.id}`}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${x.id === venue?.id ? "border-blue-700 bg-blue-700 text-white" : "border-neutral-300 bg-white hover:bg-neutral-50"}`}>
              {x.name}
              <span className={`h-2 w-2 rounded-full ${x.status === "approved" ? "bg-green-500" : "bg-amber-400"}`} title={x.status} />
            </Link>
          ))}
        </nav>
      )}

      <div className="mt-5">
        {adding ? (
          <VenueWizard key="new" projectId={id} projectCode={project.code} />
        ) : venue && !created ? (
          <VenueWizard key={venue.id} projectId={id} projectCode={project.code} existing={{ id: venue.id, name: venue.name, views: venue.views }} />
        ) : venue && (
          <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h2 className="mb-3 text-lg font-semibold">{venue.name}</h2>
            <VenueEditor key={venue.id} venue={venue} projectId={id} baseCode={baseCode}
              images={hasImages ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {venue.views.map((v) => (
                    <ImageSlot
                      key={v.name}
                      simple
                      noChange
                      label={v.name}
                      projectId={id}
                      baseCode={`${baseCode}_${codeName(v.name)}`}
                      kind="venue-ref"
                      assetId={v.imageAssetId}
                      prompt={venueViewPrompt({ name: venue.name, description: venue.description, setting: venue.setting === "exterior" ? "exterior" : "interior" }, v.name, genre, style)}
                      shape="landscape"
                      canGenerate={canGenerate}
                      onAttach={setVenueViewImageAction.bind(null, venue.id, v.name)}
                    />
                  ))}
                </div>
              ) : null} />
          </section>
        )}
      </div>

      {!adding ? (
        <div className="mt-6">
          <Link href="?new=1" className="inline-block rounded-md border border-blue-700 px-4 py-2 text-sm text-blue-700 hover:bg-blue-50" data-testid="add-venue">+ Add venue</Link>
        </div>
      ) : venues.length > 0 && (
        <p className="mt-4 text-sm"><Link className="text-blue-700 underline" href="?">Cancel</Link></p>
      )}
    </div>
  );
}
