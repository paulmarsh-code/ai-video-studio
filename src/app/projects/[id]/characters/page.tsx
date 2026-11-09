import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import * as repo from "@/lib/repo";
import * as studio from "@/lib/studioRepo";
import { characterRefPrompt, MIN_REF_ASPECT, REF_VIEWS } from "@/lib/domain/imagePrompts";
import { getImageProvider } from "@/lib/providers/images";
import { setCharacterRefAction } from "@/app/studioActions";
import { CharacterEditor } from "@/components/CharacterEditor";
import { ImageSlot } from "@/components/ImageSlot";
import { CharacterWizard } from "@/components/CharacterWizard";

export const dynamic = "force-dynamic";

const VIEW_LABEL = { front: "Front, full body", back: "Back, full body", face: "Face" } as const;

export default async function CharactersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string; new?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const project = repo.getProject(db, id);
  if (!project) notFound();
  const chars = studio.listCharacters(db, id);
  const style = String((project.brief as { style?: string }).style ?? "photorealistic");
  const canGenerate = !!getImageProvider();

  // One character at a time: the one in ?c=, else the first. ?new=1 starts a new one.
  const adding = sp.new === "1" || chars.length === 0;
  const c = adding ? undefined : chars.find((x) => x.slug === sp.c) ?? chars[0];
  const profile = c?.working?.profile ?? {};
  const hasImages = REF_VIEWS.some((v) => !!profile.refs?.[v]);
  const created = !!c && (hasImages || !!profile.appearance?.trim());
  const code = c ? `${project.code}_CHR_${c.slug.toUpperCase().replace(/-/g, "_")}` : "";
  const status = (x: (typeof chars)[number]) => (x.draft ? "draft" : x.approved ? "approved" : "new");

  return (
    <div className="max-w-6xl">
      <p className="text-sm text-neutral-500"><Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>{project.name}</Link> /</p>
      <h1 className="text-2xl font-semibold">Character creation</h1>

      {chars.length > 0 && (
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Characters" data-testid="character-switcher">
          {chars.map((x) => (
            <Link key={x.id} href={`?c=${x.slug}`}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${x.id === c?.id ? "border-blue-700 bg-blue-700 text-white" : "border-neutral-300 bg-white hover:bg-neutral-50"}`}>
              {x.name}
              <span className={`h-2 w-2 rounded-full ${status(x) === "approved" ? "bg-green-500" : status(x) === "draft" ? "bg-amber-400" : "bg-neutral-300"}`} title={status(x)} />
            </Link>
          ))}
        </nav>
      )}

      <div className="mt-5">
        {adding ? (
          <CharacterWizard key="new" projectId={id} projectCode={project.code} />
        ) : c && !created ? (
          <CharacterWizard key={c.id} projectId={id} projectCode={project.code}
            existing={{ id: c.id, slug: c.slug, name: c.name, pronoun: c.pronoun, role: c.role, invented: c.invented, consentRef: c.consentRef, voiceLock: c.working?.voiceLock ?? "" }} />
        ) : c && (
          <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h2 className="text-lg font-semibold">{c.name}</h2>
            <div className="mt-3">
              <CharacterEditor key={c.id} c={c} projectId={id} baseCode={code}
                images={hasImages ? (
                <div className="grid grid-cols-3 gap-2 self-start">
                  {REF_VIEWS.map((v) => (
                    <ImageSlot
                      key={v}
                      simple
                      noChange
                      label={VIEW_LABEL[v]}
                      projectId={id}
                      baseCode={`${code}_${v.toUpperCase()}`}
                      kind="character-ref"
                      assetId={profile.refs?.[v]}
                      prompt={characterRefPrompt(c.name, profile, v, style)}
                      attach={v !== "front" && profile.refs?.front ? [{ label: `${c.name}'s front image`, assetId: profile.refs.front }] : []}
                      minAspect={MIN_REF_ASPECT}
                      shape="portrait"
                      canGenerate={canGenerate}
                      onAttach={setCharacterRefAction.bind(null, c.id, v)}
                    />
                  ))}
                </div>
) : null} />
            </div>
          </section>
        )}
      </div>

      {!adding && (
        <div className="mt-6">
          <Link href="?new=1" className="inline-block rounded-md border border-blue-700 px-4 py-2 text-sm text-blue-700 hover:bg-blue-50" data-testid="add-character">+ Add character</Link>
        </div>
      )}
      {adding && chars.length > 0 && (
        <p className="mt-4 text-sm"><Link className="text-blue-700 underline" href="?">Cancel</Link></p>
      )}
    </div>
  );
}
