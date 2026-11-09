// Browser-side call to "Create with GPT" (D17).

export class GptError extends Error {
  /** The description, when GPT wrote it but the image board failed. */
  reply?: string;
  constructor(message: string, reply?: string) {
    super(message);
    this.reply = reply;
  }
}

export async function gptCreate(body: {
  projectId: string;
  what: "character" | "place";
  prompt: string;
  baseCode: string;
  describeImageIds?: string[];
  boardRefIds?: string[];
  references?: { for: string; assetId: string }[];
}): Promise<{ reply: string; boardAssetId: string }> {
  const res = await fetch("/api/gpt/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const r = (await res.json()) as { reply?: string; boardAssetId?: string; error?: string };
  if (!res.ok || !r.reply || !r.boardAssetId) throw new GptError(r.error ?? "GPT didn't return a description and image board.", r.reply);
  return { reply: r.reply, boardAssetId: r.boardAssetId };
}
