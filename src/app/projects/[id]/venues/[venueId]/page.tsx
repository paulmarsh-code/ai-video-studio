import { redirect } from "next/navigation";

// Venues now live on one page (Venue creation), one venue at a time.
export default async function VenueRedirect({ params }: { params: Promise<{ id: string; venueId: string }> }) {
  const { id, venueId } = await params;
  redirect(`/projects/${id}/venues?v=${venueId}`);
}
