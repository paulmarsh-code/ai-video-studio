"use client";

// Top-down Scene Geometry and Camera Studio (Stage 5).
// Drag characters, furniture, cameras and camera aim points. The rules engine reads each
// camera live: who is frame-left/centre/right, the soft foreground, the background view,
// and 180° line warnings. Characters are only ever moved by the user.

import { useMemo, useState } from "react";
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text, Wedge } from "react-konva";
import { savePlanAction, addPlanToLibraryAction } from "@/app/actions";
import { checkLineOfAction, describeFrame, PRESET_FOV, readCamera } from "@/lib/domain/geometry";
import { planImpact, type ShotRef } from "@/lib/domain/impact";
import type { CameraPreset, CastMember, GeometryPlanData, PlanCamera, Point } from "@/lib/domain/types";
import { CameraView, type RingInfo } from "./CameraView";
import { fovForSize, lensText, SHOT_SIZES, type ShotSize } from "@/lib/domain/shotLanguage";
import { propKind } from "@/lib/domain/story";
import { FindingList } from "./FindingList";
import { ActionButton } from "./ActionButton";

const SCALE = 66; // pixels per metre
const PAD = 30;
const CONE_M = 7;
const COLOURS = ["#e11d48", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

export function PlanEditor(props: { sceneId: string; initial: GeometryPlanData; version: number; cast: CastMember[]; shots: ShotRef[]; ring?: RingInfo }) {
  const { cast } = props;
  const [plan, setPlan] = useState<GeometryPlanData>(props.initial);
  const [saved, setSaved] = useState<GeometryPlanData>(props.initial);
  const [savedVersion, setSavedVersion] = useState(props.version);
  const [selectedCam, setSelectedCam] = useState(props.initial.cameras[0]?.id ?? "");
  const [status, setStatus] = useState("");
  const [history, setHistory] = useState<GeometryPlanData[]>([]);
  const pushHistory = () => setHistory((h) => [...h.slice(-49), plan]);
  const undo = () => {
    if (!history.length) return;
    setPlan(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };

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
  const impact = useMemo(() => planImpact(saved, plan, props.shots, cast), [saved, plan, props.shots, cast]);
  const cam = plan.cameras.find((c) => c.id === selectedCam);
  const reading = cam ? readCamera(plan, cam) : undefined;
  const dirty = JSON.stringify(plan) !== JSON.stringify(saved);

  const moveActor = (id: string, p: Point) =>
    setPlan((pl) => ({ ...pl, actors: pl.actors.map((a) => (a.characterId === id ? { ...a, position: p } : a)) }));
  const moveFurniture = (id: string, p: Point) =>
    setPlan((pl) => ({ ...pl, furniture: (pl.furniture ?? []).map((f) => (f.id === id ? { ...f, position: p } : f)) }));
  const moveCam = (id: string, patch: Partial<Omit<PlanCamera, "id" | "name">>) =>
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
              // Drawn by kind (D21): a backdrop or screen is a long thin panel facing the group,
              // a long counter a long block, a table or stand a circle.
              const kind = propKind(`${f.name} ${f.detail ?? ""}`, f.name);
              const long = kind === "flat" || f.radiusM > 0.8;
              const people = plan.actors.map((a) => toPx(a.position));
              const g = people.length ? { x: people.reduce((t, q) => t + q.x, 0) / people.length, y: people.reduce((t, q) => t + q.y, 0) / people.length } : { x: p.x, y: p.y + 1 };
              const facingDeg = (Math.atan2(g.y - p.y, g.x - p.x) * 180) / Math.PI;
              return (
                <Group key={f.id} x={p.x} y={p.y} draggable onDragStart={pushHistory} onDragMove={(e) => moveFurniture(f.id, toM(e.target.x(), e.target.y()))} onDragEnd={(e) => moveFurniture(f.id, toM(e.target.x(), e.target.y()))}>
                  {long
                    ? <Rect rotation={facingDeg + 90} x={0} y={0} offsetX={f.radiusM * SCALE} offsetY={(kind === "flat" ? 0.12 : 0.5) * SCALE / 2} width={f.radiusM * 2 * SCALE} height={(kind === "flat" ? 0.12 : 0.5) * SCALE} fill={kind === "flat" ? "#ede9fe" : "#e5e5e5"} stroke="#737373" />
                    : <Circle radius={f.radiusM * SCALE} fill="#e5e5e5" stroke="#737373" />}
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
                  <Group x={p.x} y={p.y} draggable onDragStart={pushHistory} onMouseDown={() => setSelectedCam(c.id)} onTouchStart={() => setSelectedCam(c.id)}
                    onDragMove={(e) => moveCam(c.id, { position: toM(e.target.x(), e.target.y()) })} onDragEnd={(e) => moveCam(c.id, { position: toM(e.target.x(), e.target.y()) })}>
                    <Rect x={-9} y={-7} width={18} height={14} cornerRadius={3} fill={sel ? "#1d4ed8" : "#404040"} />
                    <Text text={c.name} fontSize={11} fontStyle="bold" fill={sel ? "#1d4ed8" : "#404040"} x={-50} y={10} width={100} align="center" />
                  </Group>
                  {sel && (
                    <Circle x={t.x} y={t.y} radius={7} fill="#fff" stroke="#2563eb" strokeWidth={2} draggable onDragStart={pushHistory}
                      onDragMove={(e) => moveCam(c.id, { lookAt: toM(e.target.x(), e.target.y()) })} onDragEnd={(e) => moveCam(c.id, { lookAt: toM(e.target.x(), e.target.y()) })} />
                  )}
                </Group>
              );
            })}

            {/* Characters */}
            {plan.actors.map((a) => {
              const p = toPx(a.position);
              return (
                <Group key={a.characterId} x={p.x} y={p.y} draggable onDragStart={pushHistory} onDragMove={(e) => moveActor(a.characterId, toM(e.target.x(), e.target.y()))} onDragEnd={(e) => moveActor(a.characterId, toM(e.target.x(), e.target.y()))}>
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
                <select value={cam.preset} onChange={(e) => { pushHistory(); moveCam(cam.id, { preset: e.target.value as CameraPreset, fovDeg: undefined }); }}
                  className="ml-2 rounded-md border border-neutral-300 px-2 py-1">
                  {Object.keys(PRESET_FOV).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <div>
                <p className="mb-1 font-medium">Viewfinder: updates as you drag{props.ring ? ", with the venue's 360° view behind" : ""}</p>
                <CameraView plan={plan} cameraId={cam.id} cast={cast} ring={props.ring} />
                <label className="mt-2 block text-xs">
                  Lens: {Math.round(cam.fovDeg ?? PRESET_FOV[cam.preset])}° {(cam.fovDeg ?? PRESET_FOV[cam.preset]) > 60 ? "(wide)" : (cam.fovDeg ?? PRESET_FOV[cam.preset]) < 30 ? "(long)" : ""}
                  <input type="range" min={15} max={90} step={1} value={Math.round(cam.fovDeg ?? PRESET_FOV[cam.preset])} className="ml-2 align-middle" aria-label="Lens angle"
                    onChange={(e) => moveCam(cam.id, { fovDeg: Number(e.target.value) })} onMouseDown={pushHistory} />
                </label>
                {/* Up and down (D25): height and tilt, with quick choices. */}
                <div className="mt-2 text-xs" data-testid="camera-vertical">
                  <p className="mb-1">Height and angle: {(cam.heightM ?? 1.6).toFixed(1)} m up, {cam.tiltDeg ? `${Math.abs(cam.tiltDeg)}° ${cam.tiltDeg < 0 ? "down" : "up"}` : "level"}{cam.rollDeg ? `, Dutch ${cam.rollDeg}°` : ""}{cam.povId ? ` · ${name(cam.povId)}'s point of view` : ""}</p>
                  <div className="mb-1 flex flex-wrap gap-1">
                    {/* The standard angles and camera heights (D27). */}
                    {([["Eye level", 1.6, 0], ["Shoulder level", 1.45, 0], ["Hip level", 1.0, 0], ["Knee level", 0.5, 0], ["Ground level", 0.15, 0], ["High, looking down", 2.8, -35], ["Low, looking up", 0.6, 25], ["Bird's-eye", 6, -90], ["Worm's-eye", 0.1, 55]] as const).map(([label, h, t]) => (
                      <button key={label} type="button" className={`rounded border px-2 py-0.5 ${(cam.heightM ?? 1.6) === h && (cam.tiltDeg ?? 0) === t ? "border-blue-700 bg-blue-50" : "border-neutral-300"}`}
                        onClick={() => { pushHistory(); moveCam(cam.id, { heightM: h === 1.6 ? undefined : h, tiltDeg: t === 0 ? undefined : t }); }} data-testid={`cam-vert-${label.split(",")[0].toLowerCase().replace(/\s+/g, "-")}`}>{label}</button>
                    ))}
                  </div>
                  <label className="block">Height <input type="range" min={0.1} max={6} step={0.1} value={cam.heightM ?? 1.6} aria-label="Camera height" className="ml-2 align-middle"
                    onMouseDown={pushHistory} onChange={(e) => moveCam(cam.id, { heightM: Number(e.target.value) })} /></label>
                  <label className="block">Tilt <input type="range" min={-90} max={60} step={1} value={cam.tiltDeg ?? 0} aria-label="Camera tilt" className="ml-2 align-middle"
                    onMouseDown={pushHistory} onChange={(e) => moveCam(cam.id, { tiltDeg: Number(e.target.value) })} /></label>
                  <label className="block">Dutch angle <input type="range" min={-45} max={45} step={1} value={cam.rollDeg ?? 0} aria-label="Dutch angle" className="ml-2 align-middle" data-testid="cam-roll"
                    onMouseDown={pushHistory} onChange={(e) => moveCam(cam.id, { rollDeg: Number(e.target.value) || undefined })} /> <span className="text-neutral-500">tilts the frame for unease, usually 15–45°</span></label>
                  <label className="block">Shot size <select className="ml-2 rounded border border-neutral-300 px-1 py-0.5" value={cam.size ?? ""} aria-label="Shot size" data-testid="cam-size"
                    onChange={(e) => {
                      pushHistory();
                      // Choosing a size sets the lens to frame it from where the camera stands (D27).
                      const size = (e.target.value || undefined) as ShotSize | undefined;
                      const d = Math.hypot(cam.lookAt.x - cam.position.x, cam.lookAt.y - cam.position.y);
                      moveCam(cam.id, size ? { size, fovDeg: fovForSize(size, d, plan.aspect === "9:16" ? 9 / 16 : 16 / 9) } : { size: undefined });
                    }}>
                    <option value="">From the camera type</option>
                    {(Object.keys(SHOT_SIZES) as ShotSize[]).map((k) => <option key={k} value={k}>{SHOT_SIZES[k].label}</option>)}
                  </select></label>
                  <p className="text-neutral-500">Lens: {lensText(cam.fovDeg ?? PRESET_FOV[cam.preset])}.</p>
                </div>
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

        <div className={`rounded-xl border bg-white p-5 ${impact.length ? "border-amber-400" : "border-neutral-200"}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Impact on shots</h2>
            <button type="button" disabled={!history.length} onClick={undo}
              className="rounded-md border border-neutral-300 px-3 py-1 text-sm disabled:opacity-40">Undo last move</button>
          </div>
          <p className="text-xs text-neutral-500">Changes since the last save, checked against every shot that uses these cameras.</p>
          {impact.length === 0 ? (
            <p className="mt-2 text-sm text-green-700">{dirty ? "No shot is affected by these changes." : "No unsaved changes."}</p>
          ) : (
            <div className="mt-2 space-y-3">
              {impact.map((i) => (
                <div key={i.shotId}>
                  <p className="font-mono text-sm font-semibold">{i.shotCode}</p>
                  <FindingList findings={i.changes} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Continuity checks</h2>
          <FindingList findings={lineFindings} emptyText="No continuity problems: every camera is on the same side of the line." />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ActionButton label="Save plan (new version)" busyLabel="Saving…" doneLabel={`Saved as v${savedVersion}`} disabled={!dirty} resetKey={plan}
            onAction={async () => { const r = await savePlanAction(props.sceneId, plan); if (r.error !== undefined) { setStatus(r.error); return false; } setSaved(plan); setSavedVersion(r.version); setStatus(`Saved as plan version ${r.version}. Earlier versions are kept.`); }} />
          <ActionButton variant="secondary" label="Save to library" busyLabel="Saving…" doneLabel="In your library" disabled={dirty} resetKey={plan}
            title={dirty ? "Save the plan first" : ""}
            onAction={async () => { await addPlanToLibraryAction(props.sceneId, "Venue and blocking plan"); setStatus("Plan saved to your library."); }} />
          <span className="text-sm text-neutral-600">Current: v{savedVersion}{dirty ? " (unsaved changes)" : ""}</span>
          {status && <span className="text-sm text-green-700">{status}</span>}
        </div>
      </div>
    </div>
  );
}
