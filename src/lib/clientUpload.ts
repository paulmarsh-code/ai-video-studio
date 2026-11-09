// Browser-side upload helper shared by the image steps.

export async function uploadBlob(projectId: string, baseCode: string, kind: string, blob: Blob, name: string): Promise<string> {
  const fd = new FormData();
  fd.set("file", new File([blob], name, { type: blob.type || "image/png" }));
  fd.set("projectId", projectId);
  fd.set("baseCode", baseCode);
  fd.set("kind", kind);
  const res = await fetch("/api/assets", { method: "POST", body: fd });
  const body = (await res.json()) as { id?: string; error?: string };
  if (!res.ok || !body.id) throw new Error(body.error ?? "Upload failed");
  return body.id;
}
