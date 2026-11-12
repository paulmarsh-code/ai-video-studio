// Generate an image through the configured provider (decision D15).
// Returns 501 when no provider is configured — the UI then offers manual upload only.

import fs from "node:fs";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cleanBaseCode, storeAsset } from "@/lib/assetStore";
import { getImageProvider, imageSettings, SIZES } from "@/lib/providers/images";
import { frameVariant, recordDraw, testMode } from "@/lib/testRecords";
import { renderLayoutForShot } from "@/lib/layoutImage";
import { renderBackgroundForShot } from "@/lib/backgroundImage";
import { renderBlockingForShot, renderBlockingOnPlate } from "@/lib/blockingImage";
import { ensurePlate, onPlate, openAIMask } from "@/lib/plateImage";
import { ensureHeldItems } from "@/lib/heldItemsServer";
import * as repo from "@/lib/repo";

export async function POST(req: Request) {
  const provider = getImageProvider();
  if (!provider) return NextResponse.json({ error: "No image provider is connected. Copy the prompt into ChatGPT and upload the image." }, { status: 501 });
  const body = (await req.json()) as { projectId?: string; baseCode?: string; kind?: string; prompt?: string; refAssetIds?: string[]; size?: "portrait" | "landscape" | "square"; layoutShotId?: string; backgroundShotId?: string; blockingShotId?: string; baseAssetId?: string; test?: { panelCode: string; kind: "draw" | "correction" | "redraw"; variant: string; conflicts?: string[] } };
  if (!body.projectId || !body.baseCode || !body.prompt) return NextResponse.json({ error: "projectId, baseCode and prompt are required" }, { status: 400 });
  const db = await getDb();
  const refs: { data: Buffer; mime: string; name: string }[] = (body.refAssetIds ?? []).map((id) => repo.getAsset(db, id)).filter((a) => a && fs.existsSync(a.path))
    .map((a) => ({ data: fs.readFileSync(a!.path), mime: a!.mime, name: a!.assetCode }));
  // A correction edits the picture itself (D34): it goes first, the shot to change.
  if (body.baseAssetId) {
    const a = repo.getAsset(db, body.baseAssetId);
    if (a && fs.existsSync(a.path)) refs.unshift({ data: fs.readFileSync(a.path), mime: a.mime, name: "picture_to_fix.png" });
  }
  // The blocking frame (D34) goes first, as the shot to finish; it already holds the
  // background and the layout, so those aren't sent separately.
  // Version C (D66): image 1 on the camera's finished plate, which goes back after GPT draws.
  let onPlateOf: { plate: Buffer; area: Buffer; W: number; H: number } | undefined;
  if (body.blockingShotId) {
    const shot = repo.getShot(db, body.blockingShotId);
    if (shot) await ensureHeldItems(db, body.projectId);
    let png: Buffer | null = null;
    if (frameVariant() === "fill") {
      try {
        const plate = await ensurePlate(db, body.blockingShotId, provider, body.test ? { panelCode: body.test.panelCode, variant: body.test.variant } : undefined);
        const on = plate ? await renderBlockingOnPlate(db, body.blockingShotId, plate) : null;
        if (plate && on) { png = on.png; onPlateOf = { plate, area: on.area, W: on.W, H: on.H }; }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error(`[images/generate] background plate for ${body.baseCode}: ${error}`);
        return NextResponse.json({ error: `Couldn't make this camera's background: ${error}` }, { status: 502 });
      }
    }
    png ??= await renderBlockingForShot(db, body.blockingShotId);
    if (png) {
      const at = body.baseAssetId ? 1 : 0;
      refs.splice(at, 0, { data: Buffer.from(png), mime: "image/png", name: "blocking_frame.png" });
      // Test B (D60): image 1 is a grey-box room, so the room's look from this camera goes right
      // after it, as image 2, which is what the request says.
      if (frameVariant() === "box" && body.backgroundShotId) {
        const look = await renderBackgroundForShot(db, body.backgroundShotId);
        if (look) refs.splice(at + 1, 0, { data: Buffer.from(look), mime: "image/png", name: "room_look.png" });
      }
      body.backgroundShotId = undefined;
      body.layoutShotId = undefined;
    }
  }
  // The background this camera sees, cut from the room's 360° ring (D20).
  if (body.backgroundShotId) {
    const png = await renderBackgroundForShot(db, body.backgroundShotId);
    if (png) refs.push({ data: Buffer.from(png), mime: "image/png", name: "background.png" });
  }
  // The layout sketch from the floor plan goes last (D18f).
  if (body.layoutShotId) {
    const png = await renderLayoutForShot(db, body.layoutShotId);
    if (png) refs.push({ data: Buffer.from(png), mime: "image/png", name: "layout_sketch.png" });
  }
  try {
    const img = await provider.generate(body.prompt, refs, body.size ?? "portrait", onPlateOf ? { mask: await openAIMask(onPlateOf.area, onPlateOf.W, onPlateOf.H) } : undefined);
    // Version C (D66): the plate goes back everywhere but the people and props.
    const put = onPlateOf ? await onPlate(img.data, onPlateOf.plate, onPlateOf.area, onPlateOf.W, onPlateOf.H) : undefined;
    const data = put?.png ?? img.data;
    const saved = storeAsset(db, {
      projectId: body.projectId, baseCode: cleanBaseCode(body.baseCode), kind: body.kind ?? "image", ext: "png", mime: put ? "image/png" : img.mime, data, note: `${img.providerNote}${put ? "; background plate pasted back" : ""}`,
    });
    // Test mode (B4): keep exactly what this picture was drawn from.
    if (testMode() && body.test) {
      const s = imageSettings();
      const ids = [...(body.baseAssetId ? [body.baseAssetId] : []), ...(body.refAssetIds ?? [])];
      recordDraw({
        panelCode: body.test.panelCode, kind: body.test.kind, variant: body.test.variant, prompt: body.prompt, conflicts: body.test.conflicts,
        inputs: refs.map((r) => { const a = ids.map((id) => repo.getAsset(db, id)).find((x) => x?.assetCode === r.name); return { name: r.name, data: r.data, mime: r.mime, assetId: a?.id, assetCode: a?.assetCode }; }),
        model: s.model, quality: s.quality, size: SIZES[body.size ?? "portrait"], endpoint: refs.length ? "images/edits" : "images/generations",
        output: { assetId: saved.id, data, note: img.providerNote },
        extras: onPlateOf && put ? [
          { name: "gpt_picture.png", data: img.data },
          { name: "draw_area.png", data: onPlateOf.area },
          { name: "plate.png", data: onPlateOf.plate },
          { name: "pasted.json", data: JSON.stringify(put.numbers, null, 2) },
        ] : undefined,
      });
    }
    return NextResponse.json(saved);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[images/generate] ${body.baseCode} (${refs.length} reference pictures): ${error}`);
    return NextResponse.json({ error }, { status: 502 });
  }
}
