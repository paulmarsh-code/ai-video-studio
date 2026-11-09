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

export const dynamic = "force-dynamic";

export default async function VenuePage({ params }: { params: Promise<{ id: string; venueId: string }> }) {
  const { id, venueId } = await params;
  const db = await getDb();
  const project = repo.getProject(db, id);
  const venue = studio.getVenue(db, venueId);
  if (!project || !venue || venue.projectId !== id) notFound();
  const style = String((project.brief as { style?: string }).style ?? "photorealistic");
  const genre = repo.getProjectGenre(db, id);
  const canGenerate = !!getImageProvider();
  const slug = venue.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24);

  return (
    <div className="max-w-6xl">
      <p className="text-sm text-neutral-500"><Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>{project.name}</Link> /</p>
      <h1 className="text-2xl font-semibold">Venue: {venue.name}</h1>
      <p className="mt-1 max-w-3xl text-neutral-600">Describe the space and name what you see looking each way. Then make one reference image per view in ChatGPT and upload it. The venue is used for every scene set here.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <VenueEditor key={venue.id} venue={venue} />
        <div>
          <p className="mb-2 text-xs text-neutral-600">View images (landscape, no people). Prompts use the saved description and setting.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {venue.views.map((v) => (
              <ImageSlot
                key={v.name}
                label={v.name}
                projectId={id}
                baseCode={`${project.code}_VEN_${slug}_${v.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`}
                kind="venue-ref"
                assetId={v.imageAssetId}
                prompt={venueViewPrompt({ name: venue.name, description: venue.description, setting: venue.setting === "exterior" ? "exterior" : "interior" }, v.name, genre, style)}
                shape="landscape"
                canGenerate={canGenerate}
                onAttach={setVenueViewImageAction.bind(null, venueId, v.name)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
