// GPT connection (decisions D15, D17).
// Without OPENAI_API_KEY the app is manual: it writes the prompts, the user works in ChatGPT.
// With a key, "Create with GPT" does the round trip: description (text model) then the
// image board (image model). Settings, all optional apart from the key:
//   OPENAI_IMAGE_MODEL   default gpt-image-2.6-sunburst (D70)
//   OPENAI_IMAGE_QUALITY default medium (low | medium | high)
//   OPENAI_TEXT_MODEL    default gpt-5-mini
//   OPENAI_BASE_URL      default https://api.openai.com/v1 (tests point this at a stand-in)
// The same interfaces can be backed by an MCP connector later.
// The app never claims an image was generated unless a provider actually returned one.

import sharp from "sharp";
import { Agent, setGlobalDispatcher } from "undici";

const baseUrl = () => (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

// Image requests with several reference pictures can take minutes. Node's built-in fetch
// gives up after 5 minutes of silence; allow 10 (D18b).
setGlobalDispatcher(new Agent({ headersTimeout: 600_000, bodyTimeout: 600_000, connectTimeout: 30_000 }));

/**
 * Reference pictures are only a guide for the model, so send them small: longest side 1024 px,
 * JPEG. A full-size PNG board can be several MB; five of them made requests fail mid-upload.
 */
export async function shrinkRef<T extends { data: Buffer; mime: string; name?: string }>(r: T): Promise<T> {
  try {
    const data = await sharp(r.data).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
    return data.length < r.data.length ? { ...r, data, mime: "image/jpeg", ...(r.name ? { name: r.name.replace(/\.\w+$/, "") + ".jpg" } : {}) } : r;
  } catch {
    return r; // not an image sharp can read: send it as it is
  }
}

/** fetch with one retry when the connection itself fails (not when OpenAI answers with an error). */
async function fetchWithRetry(url: string, init: () => RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init());
    } catch (e) {
      if (attempt >= 2) {
        const cause = (e as { cause?: { code?: string; message?: string } }).cause;
        throw new Error(`Couldn't reach OpenAI: ${(e as Error).message}${cause ? ` (${cause.code ?? cause.message})` : ""}`);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

export interface GeneratedImage {
  data: Buffer;
  mime: string;
  providerNote: string;
}

export interface ImageProvider {
  id: string;
  label: string;
  /**
   * `firstFullSize` (D67): the first picture goes as it is, not shrunk to 1,024 pixels and made a
   * JPEG; for image 1, whose background GPT keeps far better when it is sharp. `mask` (D66): a
   * PNG the size of the first picture, clear where GPT may draw.
   */
  generate(prompt: string, refs: { data: Buffer; mime: string; name: string }[], size: "portrait" | "landscape" | "square", opts?: { mask?: Buffer; firstFullSize?: boolean }): Promise<GeneratedImage>;
}

export const SIZES = { portrait: "1024x1536", landscape: "1536x1024", square: "1024x1024" } as const;

/** The image model and quality in use (OPENAI_IMAGE_MODEL, OPENAI_IMAGE_QUALITY), for test records (B4). */
// The newer model by default (D70): it fixed the camera in T3, and at about 5–7 US cents a picture
// it costs a fraction of gpt-image-2, which made most of the spend on 10 and 11 November.
export const imageSettings = () => ({ model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.6-sunburst", quality: process.env.OPENAI_IMAGE_QUALITY || "medium" });

/** OpenAI Images API (generations, or edits when reference images are given). */
export function openAIProvider(apiKey: string, model = imageSettings().model, quality = imageSettings().quality): ImageProvider {
  return {
    id: "openai",
    label: `OpenAI ${model}`,
    async generate(prompt, refs, size, opts) {
      let res: Response;
      let note = "";
      if (refs.length) {
        const small = await Promise.all(refs.map((r, k) => (k === 0 && (opts?.mask || opts?.firstFullSize) ? r : shrinkRef(r))));
        const send = (mask?: Buffer) => fetchWithRetry(`${baseUrl()}/images/edits`, () => {
          const form = new FormData();
          form.set("model", model);
          form.set("prompt", prompt);
          form.set("size", SIZES[size]);
          form.set("quality", quality);
          for (const r of small) form.append("image[]", new Blob([new Uint8Array(r.data)], { type: r.mime }), r.name);
          if (mask) form.set("mask", new Blob([new Uint8Array(mask)], { type: "image/png" }), "mask.png");
          return { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form };
        });
        res = await send(opts?.mask);
        // A model that takes no mask: draw without it; the background is pasted back either way.
        if (!res.ok && opts?.mask && res.status === 400 && /mask/i.test(await res.clone().text())) {
          res = await send();
          note = ", mask not accepted";
        }
      } else {
        res = await fetchWithRetry(`${baseUrl()}/images/generations`, () => ({
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt, size: SIZES[size], quality }),
        }));
      }
      if (!res.ok) throw new Error(`OpenAI image request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
      const body = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = body.data?.[0]?.b64_json;
      if (!b64) throw new Error("OpenAI returned no image data.");
      return { data: Buffer.from(b64, "base64"), mime: "image/png", providerNote: `Generated by ${model} (${quality}${note})` };
    },
  };
}

/** The configured provider, or null for manual upload only. */
export function getImageProvider(): ImageProvider | null {
  const key = process.env.OPENAI_API_KEY;
  return key ? openAIProvider(key) : null;
}

// ---- Describe (D16): turn a picture or an idea into labelled fields ----

export interface TextProvider {
  id: string;
  label: string;
  /** Run the prompt, with optional images (in order), and return the model's text reply. */
  describe(prompt: string, images?: { data: Buffer; mime: string }[]): Promise<string>;
}

/** OpenAI Chat Completions with optional image input. */
export function openAITextProvider(apiKey: string, model = process.env.OPENAI_TEXT_MODEL || "gpt-5-mini"): TextProvider {
  return {
    id: "openai",
    label: `OpenAI ${model}`,
    async describe(prompt, images = []) {
      const content: unknown[] = [{ type: "text", text: prompt }];
      for (const image of await Promise.all(images.map(shrinkRef))) content.push({ type: "image_url", image_url: { url: `data:${image.mime};base64,${image.data.toString("base64")}` } });
      const res = await fetchWithRetry(`${baseUrl()}/chat/completions`, () => ({
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content }] }),
      }));
      if (!res.ok) throw new Error(`OpenAI request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content;
      if (!text) throw new Error("OpenAI returned no text.");
      return text;
    },
  };
}

export function getTextProvider(): TextProvider | null {
  const key = process.env.OPENAI_API_KEY;
  return key ? openAITextProvider(key) : null;
}

/** The model for the picture check (D51): OPENAI_CHECK_MODEL, else the text model. */
export function getCheckProvider(): TextProvider | null {
  const key = process.env.OPENAI_API_KEY;
  return key ? openAITextProvider(key, process.env.OPENAI_CHECK_MODEL || process.env.OPENAI_TEXT_MODEL || "gpt-5-mini") : null;
}
