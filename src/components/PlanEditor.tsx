"use client";

// Top-down Scene Geometry and Camera Studio (Stage 5).
// Drag characters, furniture, cameras and camera aim points. The rules engine reads each
// camera live: who is frame-left/centre/right, the soft foreground, the background view,
// and 180° line warnings. Characters are only ever moved by the user.

import { useMemo, useState, useTransition } from "react";
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text, Wedge } from "react-konva";
import { savePlanAction, addPlanToLibraryAction } from "@/app/actions";
import { checkLineOfAction, describeFrame, PRESET_FOV, readCamera } from "@/lib/domain/geometry";
import type { CameraPreset, CastMember, GeometryPlanData, Point } from "@/lib/domain/types";
import { CameraView } from "./CameraView";
import { FindingList } from "./FindingList";

const SCALE = 66; // pixels per metre
const PAD = 30;
const CONE_M = 7;
const COLOURS = ["#e11d48", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

export function PlanEditor(props: { sceneId: string; initial: GeometryPlanData; version: number; cast: CastMember[] }) {
  const { cast } = props;
  const [plan, setPlan] = useState<GeometryPlanData>(props.initial);
  const [saved, setSaved] = useState<GeometryPlanData>(props.initial);
  const [savedVersion, setSavedVersion] = useState(props.version);
  const [selectedCam, setSelectedCam] = useState(props.initial.cameras[0]?.id ?? "");
  const [status, setStatus] = useState("");
  const [pending, start] = useTransition();

  const b = plan.bounds ?? { minX: -5, maxX: 5, minY: 0, maxY: 10 };
  const width = (b.maxX - b.minX) * SCALE + PAD * 2;
  const height = (b.maxY - b.minY) * SCALE + PAD * 2;
  const toPx = (p: Point) => ({ x: PAD + (p.x - b.minX) * SCALE, y: PAD + (b.maxY - p.y) * SCALE });
  const toM = (x: number, y: number): Point => ({
    x: Math.round(((x - PAD) / SCALE + b.minX) * 100) / 100,
    y: Math.round((b.maxY - (y - PAD) / SCALE) * 100) / 100,
  });
  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const colour = (id: string) => COLOURS[Math.max(0, cast.findIndex((c) => c.id === id)) % COLOURS.length];

  const lineFindings = useMemo(() => checkLineOfAction(plan, cast), [plan, cast]);
  const cam = plan.cameras.find((c) => c.id === selectedCam);
  const reading = cam ? readCamera(plan, cam) : undefined;
  const dirty = JSON.stringify(plan) !== JSON.stringify(saved);

  const moveActor = (id: string, p: Point) =>
    setPlan((pl) => ({ ...pl, actors: pl.actors.map((a) => (a.characterId === id ? { ...a, position: p } : a)) }));
  const moveFurniture = (id: string, p: Point) =>
    setPlan((pl) => ({ ...pl, furniture: (pl.furniture ?? []).map((f) => (f.id === id ? { ...f, position: p } : f)) }));
  const moveCam = (id: string, patch: Partial<{ position: Point; lookAt: Point; preset: CameraPreset; overrideReason?: string }>) =>
    setPlan((pl) => ({ ...pl, cameras: pl.cameras.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  // Line of action endpoints.
  const loa = plan.lineOfAction?.map((id) => plan.actors.find((a) => a.characterId === id)?.position);

  // Views drawn on the wall they face.
  const viewLabel = (deg: number) => {
    const d = ((deg % 360) + 360) % 360;
    if (d === 90) return { x: width / 2, y: 10, align: "top" };
    if (d === 270) return { x: width / 2, y: height - 22, align: "bottom" };
    if (d === 180) return { x: 4, y: height / 2, align: "left" };
    return { x: width - 4, y: height / 2, align: "right" };
  };

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[auto_1fr]">
      <div className="overflow-auto rounded-xl border border-neutral-200 bg-white p-2">
        <Stage width={width} height={height}>
          <Layer>
            <Rect x={PAD} y={PAD} width={width - PAD * 2} height={height - PAD * 2} stroke="#a3a3a3" strokeWidth={2} fill="#fafafa" />
            {plan.views.map((v) => {
              const l = viewLabel(v.directionDeg);
              const vertical = l.align === "left" || l.align === "right";
              return (
                <Text
                  key={v.name}
                  text={v.name.toUpperCase()}
                  x={l.align === "right" ? l.x - 14 : l.x + (vertical ? 14 : -80)}
                  y={vertical ? l.y + 60 : l.y}
                  width={vertical ? undefined : 160}
                  align="center"
                  rotation={l.align === "left" ? -90 : l.align === "right" ? 90 : 0}
                  fontSize={11}
                  fill="#737373"
                />
              );
            })}

            <Group clipX={PAD} clipY={PAD} clipWidth={width - PAD * 2} clipHeight={height - PAD * 2} listening={false}>
            {/* Camera cones */}
            {plan.cameras.map((c) => {
              const r = readCamera(plan, c);
              const p = toPx(c.position);
              const fov = c.fovDeg ?? PRESET_FOV[c.preset];
              const sel = c.id === selectedCam;
              return (
                <Wedge key={`cone-${c.id}`} x={p.x} y={p.y} radius={CONE_M * SCALE} angle={fov} rotation={-r.forwardDeg - fov / 2}
                  fill={sel ? "rgba(37,99,235,0.14)" : "rgba(115,115,115,0.06)"} stroke={sel ? "#2563eb" : "#d4d4d4"} strokeWidth={1} listening={false} />
              );
            })}

            {/* Line of action */}
            {loa && loa[0] && loa[1] && (() => {
              const a = toPx(loa[0]!), c = toPx(loa[1]!);
              const dx = c.x - a.x, dy = c.y - a.y, k = 4;
              return <Line points={[a.x - dx * k, a.y - dy * k, c.x + dx * k, c.y + dy * k]} stroke="#f59e0b" strokeWidth={1.5} dash={[8, 6]} listening={false} />;
            })()}
            </Group>

            {(plan.furniture ?? []).map((f) => {
              const p = toPx(f.position);
              return (
                <Group key={f.id} x={p.x} y={p.y} draggable onDragMove={(e) => moveFurniture(f.id, toM(e.target.x(), e.target.y()))} onDragEnd={(e) => moveFurniture(f.id, toM(e.target.x(), e.target.y()))}>
                  <Circle radius={f.radiusM * SCALE} fill="#e5e5e5" stroke="#737373" />
                  <Text text={f.name} fontSize={10} fill="#525252" x={-40} y={-5} width={80} align="center" />
                </Group>
              );
            })}

            {/* Cameras: body + aim handle */}
            {plan.cameras.map((c) => {
              const p = toPx(c.position);
              const t = toPx(c.lookAt);
              const sel = c.id === selectedCam;
              return (
                <Group key={c.id}>
                  <Arrow points={[p.x, p.y, t.x, t.y]} stroke={sel ? "#2563eb" : "#a3a3a3"} fill={sel ? "#2563eb" : "#a3a3a3"} strokeWidth={1} pointerLength={6} pointerWidth={6} listening={false} />
                  <Group x={p.x} y={p.y} draggable onMouseDown={() => setSelectedCam(c.id)} onTouchStart={() => setSelectedCam(c.id)}
                    onDragMove={(e) => moveCam(c.id, { position: toM(e.target.x(), e.target.y()) })} onDragEnd={(e) => moveCam(c.id, { position: toM(e.target.x(), e.target.y()) })}>
                    <Rect x={-9} y={-7} width={18} height={14} cornerRadius={3} fill={sel ? "#1d4ed8" : "#404040"} />
                    <Text text={c.name} fontSize={11} fontStyle="bold" fill={sel ? "#1d4ed8" : "#404040"} x={-50} y={10} width={100} align="center" />
                  </Group>
                  {sel && (
                    <Circle x={t.x} y={t.y} radius={7} fill="#fff" stroke="#2563eb" strokeWidth={2} draggable
                      onDragMove={(e) => moveCam(c.id, { lookAt: toM(e.target.x(), e.target.y()) })} onDragEnd={(e) => moveCam(c.id, { lookAt: toM(e.target.x(), e.target.y()) })} />
                  )}
                </Group>
              );
            })}

            {/* Characters */}
            {plan.actors.map((a) => {
              const p = toPx(a.position);
              return (
                <Group key={a.characterId} x={p.x} y={p.y} draggable onDragMove={(e) => moveActor(a.characterId, toM(e.target.x(), e.target.y()))} onDragEnd={(e) => moveActor(a.characterId, toM(e.target.x(), e.target.y()))}>
                  <Circle radius={11} fill={colour(a.characterId)} stroke="#fff" strokeWidth={2} />
                  <Text text={name(a.characterId).charAt(0)} fontSize={12} fontStyle="bold" fill="#fff" x={-5} y={-6} />
                  <Text text={name(a.characterId)} fontSize={11} fill="#171717" x={13} y={-6} />
                </Group>
              );
            })}
          </Layer>
        </Stage>
        <p className="px-2 pb-1 text-xs text-neutral-500">
          Drag people, furniture and cameras. Select a camera, then drag its white handle to aim it. Dashed amber line: the 180° line of action. Scale: {SCALE}px = 1 m.
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Cameras</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {plan.cameras.map((c) => (
              <button key={c.id} type="button" onClick={() => setSelectedCam(c.id)}
                className={`rounded-md border px-3 py-1 text-sm ${c.id === selectedCam ? "border-blue-600 bg-blue-50 text-blue-800" : "border-neutral-300"}`}>
                {c.name}
              </button>
            ))}
          </div>
          {cam && reading && (
            <div className="mt-4 space-y-3 text-sm">
              <label className="block">
                Preset
                <select value={cam.preset} onChange={(e) => moveCam(cam.id, { preset: e.target.value as CameraPreset })}
                  className="ml-2 rounded-md border border-neutral-300 px-2 py-1">
                  {Object.keys(PRESET_FOV).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <div>
                <p className="mb-1 font-medium">Viewfinder: updates as you drag</p>
                <CameraView plan={plan} cameraId={cam.id} cast={cast} />
              </div>
              <div>
                <p className="font-medium">What this camera sees (written into prompts)</p>
                <p className="mt-1 rounded-md bg-neutral-100 px-3 py-2">{describeFrame(reading, cast) || "Nobody in view."}</p>
              </div>
              <ul className="space-y-1">
                {reading.actors.map((a) => (
                  <li key={a.characterId}>
                    <strong>{name(a.characterId)}</strong>: {a.frame.replace("-", " ")}{a.foreground ? ", soft foreground" : ""}{" "}
                    <span className="text-neutral-500">({a.depthM.toFixed(1)} m)</span>
                  </li>
                ))}
              </ul>
              <label className="block">
                Reason for crossing the line (only if intentional)
                <input value={cam.overrideReason ?? ""} onChange={(e) => moveCam(cam.id, { overrideReason: e.target.value || undefined })}
                  className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2" placeholder="Leave empty unless deliberate" />
              </label>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Continuity checks</h2>
          <FindingList findings={lineFindings} emptyText="No continuity problems: every camera is on the same side of the line." />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!dirty || pending}
            onClick={() => start(async () => { const r = await savePlanAction(props.sceneId, plan); setSaved(plan); setSavedVersion(r.version); setStatus(`Saved as plan version ${r.version}. Earlier versions are kept.`); })}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">
            Save plan (new version)
          </button>
          <button type="button" disabled={dirty || pending}
            title={dirty ? "Save the plan first" : ""}
            onClick={() => start(async () => { await addPlanToLibraryAction(props.sceneId, "Venue and blocking plan"); setStatus("Plan saved to your library."); })}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50">
            Save to library
          </button>
          <span className="text-sm text-neutral-600">Current: v{savedVersion}{dirty ? " (unsaved changes)" : ""}</span>
          {status && <span className="text-sm text-green-700">{status}</span>}
        </div>
      </div>
    </div>
  );
}
