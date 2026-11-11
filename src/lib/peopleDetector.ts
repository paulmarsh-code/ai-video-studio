// D53: the person detector, run on this computer. YOLOX-S (Apache 2.0) through onnxruntime-node
// (MIT). Its file (36 MB) is fetched once, checked against its fingerprint, and kept in
// data/models. No cost per picture; about a second each. If it can't run, the check falls back
// to asking the vision model (D52) and says so.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DETECT_SIZE, decodePeople, detectScale, type Person } from "./domain/peopleDetect";

const MODEL = {
  url: "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx",
  sha256: "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063",
  file: "yolox_s.onnx",
};

let fetching: Promise<string> | undefined;
let session: Promise<{ run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: ArrayLike<number>; dims: readonly number[] }>>; inputNames: readonly string[]; outputNames: readonly string[] }> | undefined;
let tensor: (new (type: "float32", data: Float32Array, dims: number[]) => unknown) | undefined;

/** The detector's file: PEOPLE_MODEL if set, else data/models, fetched and checked the first time. */
async function modelFile(): Promise<string> {
  const target = process.env.PEOPLE_MODEL || path.join(process.cwd(), "data", "models", MODEL.file);
  if (fs.existsSync(target)) return target;
  fetching ??= (async () => {
    const res = await fetch(MODEL.url);
    if (!res.ok) throw new Error(`Couldn't fetch the person detector (${res.status}).`);
    const data = Buffer.from(await res.arrayBuffer());
    if (crypto.createHash("sha256").update(data).digest("hex") !== MODEL.sha256) throw new Error("The person detector's file isn't the expected one.");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(`${target}.part`, data);
    fs.renameSync(`${target}.part`, target);
    return target;
  })().finally(() => { fetching = undefined; });
  return fetching;
}

/**
 * Everyone the detector finds in the picture, with the picture's size. Throws when the detector
 * can't run, so the caller can fall back.
 */
export async function detectPeople(picture: Buffer): Promise<{ people: Person[]; width: number; height: number }> {
  if (!session) {
    session = (async () => {
      // Loaded when the check runs, not when the app is built, so a computer without the package
      // still builds and the check falls back to the estimate instead of failing to compile.
      const ort = (await import(/* webpackIgnore: true */ "onnxruntime-node")) as typeof import("onnxruntime-node");
      tensor = ort.Tensor as unknown as typeof tensor;
      return ort.InferenceSession.create(await modelFile()) as unknown as Awaited<NonNullable<typeof session>>;
    })();
    session.catch(() => { session = undefined; });
  }
  const s = await session;
  // Measured as stored, like the plan drawn over it.
  const meta = await sharp(picture).metadata();
  const width = meta.width || 1, height = meta.height || 1;
  const scale = detectScale(width, height);
  const w = Math.round(width * scale), h = Math.round(height * scale);
  const rgb = await sharp(picture).removeAlpha().resize(w, h, { fit: "fill" })
    .extend({ right: DETECT_SIZE - w, bottom: DETECT_SIZE - h, background: { r: 114, g: 114, b: 114 } }).raw().toBuffer();
  // The model was trained on blue-green-red planes, 0 to 255.
  const plane = DETECT_SIZE * DETECT_SIZE, data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) { data[i] = rgb[i * 3 + 2]; data[plane + i] = rgb[i * 3 + 1]; data[2 * plane + i] = rgb[i * 3]; }
  const out = (await s.run({ [s.inputNames[0]]: new tensor!("float32", data, [1, 3, DETECT_SIZE, DETECT_SIZE]) }))[s.outputNames[0]];
  return { people: decodePeople(out.data, out.dims[2], scale, width, height), width, height };
}
