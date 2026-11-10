// Server side of the layout sketch (D18f): build it for a shot from the latest floor plan and
// turn the SVG into a PNG for GPT (and for download on the by-hand route).

import sharp from "sharp";
import type { DB } from "@/db/client";
import { planForShot, readCamera } from "./domain/geometry";
import { layoutSketchSvg } from "./domain/layoutSketch";
import { mainSubjectId } from "./domain/composer";
import { crowdLevelOf } from "./domain/story";
import * as repo from "./repo";

export async function renderLayoutForShot(db: DB, shotId: string): Promise<Buffer | null> {
  const shot = repo.getShot(db, shotId);
  if (!shot?.spec.cameraId) return null;
  const scene = repo.getScene(db, shot.sceneId);
  const fullPlan = scene?.plan?.data;
  const plan = fullPlan ? planForShot(fullPlan, shot.spec) : undefined; // on a mark, they stand there (D19b)
  const cam = plan?.cameras.find((c) => c.id === shot.spec.cameraId);
  if (!scene || !plan || !cam) return null;
  const project = repo.getProject(db, scene.scene.projectId);
  const cast = repo.getCast(db, scene.scene.projectId);
  const aspect = String((project?.brief as { aspect?: string } | undefined)?.aspect ?? "9:16");
  const svg = layoutSketchSvg({
    plan, camera: cam, size: aspect.startsWith("16") ? "landscape" : "portrait",
    people: plan.actors.map((a) => ({ id: a.characterId, name: cast.find((c) => c.id === a.characterId)?.name ?? a.characterId })),
    subjectId: mainSubjectId(shot.spec), backgroundView: readCamera(plan, cam).backgroundView,
    crowd: crowdLevelOf(shot.spec.crowd ?? ""),
  });
  return sharp(Buffer.from(svg)).png().toBuffer();
}
