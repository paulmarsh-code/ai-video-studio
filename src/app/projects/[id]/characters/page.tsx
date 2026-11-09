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
import { AddCharacterForm } from "@/components/AddForms";

export const dynamic = "force-dynamic";

const VIEW_LABEL = { front: "Front, full body", back: "Back, full body", face: "Face" } as const;

export default async function CharactersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const project = repo.getProject(db, id);
  if (!project) notFound();
  const chars = studio.listCharacters(db, id);
  const style = String((project.brief as { style?: string }).style ?? "photorealistic");
  const canGenerate = !!getImageProvider();

  return (
    <div className="max-w-6xl">
      <p className="text-sm text-neutral-500"><Link href="/">Projects</Link> / <Link href={`/projects/${id}`}>{project.name}</Link> /</p>
      <h1 className="text-2xl font-semibold">Characters</h1>
      <p className="mt-1 max-w-3xl text-neutral-600">
        Describe each character, write their voice lock, and add three reference images made in ChatGPT: front, back and face.
        Changes are saved as a new draft version; approve it to use it in prompts. Approved versions are never edited.
      </p>
      {!canGenerate && <p className="mt-2 text-sm text-neutral-500">Images: manual upload. A direct GPT link can be switched on later, and a Generate button will then appear beside each image.</p>}

      <div className="mt-6 space-y-8">
        {chars.map((c) => {
          const profile = c.working?.profile ?? {};
          const code = `${project.code}_CHR_${c.slug.toUpperCase().replace(/-/g, "_")}`;
          return (
            <section key={c.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <h2 className="text-lg font-semibold">{c.name}</h2>
              <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                <CharacterEditor key={c.working?.id} c={c} />
                <div>
                  <p className="mb-2 text-xs text-neutral-600">Reference images (portrait, no narrower than 1:2). Prompts use the saved description; save first if you&apos;ve changed it.</p>
                  <div className="grid grid-cols-3 gap-2">
                    {REF_VIEWS.map((v) => (
                      <ImageSlot
                        key={v}
                        label={VIEW_LABEL[v]}
                        projectId={id}
                        baseCode={`${code}_${v.toUpperCase()}`}
                        kind="character-ref"
                        assetId={profile.refs?.[v]}
                        prompt={characterRefPrompt(c.name, profile, v, style)}
                        attach={v !== "front" && profile.refs?.front ? [{ label: `${c.name} front`, assetId: profile.refs.front }] : []}
                        minAspect={MIN_REF_ASPECT}
                        shape="portrait"
                        canGenerate={canGenerate}
                        onAttach={setCharacterRefAction.bind(null, c.id, v)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-neutral-300 p-4">
        <AddCharacterForm projectId={id} />
        <p className="mt-2 text-xs text-neutral-500">Invented characters only. Real people need recorded consent before they can be used.</p>
      </div>
    </div>
  );
}
