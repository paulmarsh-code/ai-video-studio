// The floor plan editor's data for one scene (D39), for the planner that opens from a
// storyboard panel's "Need to change something?".

import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { planEditorProps } from "@/lib/planEditorData";

export async function GET(_req: Request, { params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  const data = await planEditorProps(await getDb(), sceneId);
  if (!data) return NextResponse.json({ error: "This scene has no floor plan yet." }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
