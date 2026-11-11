"use client";

// Top-down Scene Geometry and Camera Studio (Stage 5).
// Drag characters, furniture, cameras and camera aim points. The rules engine reads each
// camera live: who is frame-left/centre/right, the soft foreground, the background view,
// and 180° line warnings. Characters are only ever moved by the user.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text, Wedge } from "react-konva";
import { savePlanAction, addPlanToLibraryAction } from "@/app/actions";
import { savePanelBlockingAction } from "@/app/studioActions";
import { checkLineOfAction, describeFrame, facingOf, planForShot, PRESET_FOV, readCamera } from "@/lib/domain/geometry";
import { blockSource, carryBlocking, withEdits, type BlockEntry } from "@/lib/domain/blocking";
import { planImpact, type ShotRef } from "@/lib/domain/impact";
import type { CameraPreset, CastMember, GeometryPlanData, PlanCamera, PlanLevel, Point, ShotSpec } from "@/lib/domain/types";
import { CameraView, type RingInfo } from "./CameraView";
import { fovForSize, lensText, SHOT_SIZES, type ShotSize } from "@/lib/domain/shotLanguage";
import { propKind } from "@/lib/domain/story";
import { FindingList } from "./FindingList";
import { ActionButton } from "./ActionButton";

const MAX_SCALE = 66; // pixels per metre in an ordinary room; larger rooms are drawn smaller (D29)
const PAD = 30;
const CONE_M = 7;
const COLOURS = ["#e11d48", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

/** One step of the panel stepper (D35): a panel of the storyboard and its shot. */
export interface PanelStep { shotId: string; code: string; description: string }

const EXIT_RE = /\b(entrance|exit|door|doors|doorway|way out|lobby|foyer)\b/i;

export function PlanEditor(props: {
  sceneId: string; initial: GeometryPlanData; version: number; cast: CastMember[]; shots: ShotRef[]; ring?: RingInfo;
  /** The venue page, where the room size is set (D29). */ roomHref?: string;
  /** The storyboard's panels, in order, for stepping through each panel's positions (D35). */ panels?: PanelStep[];
  /** 0 is the scene plan, 1 the first panel… */ initialStep?: number;
  locks?: { positions: boolean; cameras: boolean };
}) {
  const { cast } = props;
  const router = useRouter();
  const panels = props.panels ?? [];
  const locks = props.locks ?? { positions: false, cameras: false };
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

  // ---- The panel stepper (D35): ‹ Scene plan › ‹ Panel 1 › … one floor plan, every panel. ----
  const [step, setStep] = useState(Math.max(0, Math.min(props.initialStep ?? 0, panels.length)));
  const [edits, setEdits] = useState<Record<string, Record<string, BlockEntry | null>>>({});
  const [editHistory, setEditHistory] = useState<Record<string, Record<string, BlockEntry | null>>[]>([]);
  const [selActor, setSelActor] = useState("");
  const [panelStatus, setPanelStatus] = useState("");
  const pushEdit = () => setEditHistory((h) => [...h.slice(-49), edits]);
  const undoEdit = () => {
    if (!editHistory.length) return;
    setEdits(editHistory[editHistory.length - 1]);
    setEditHistory((h) => h.slice(0, -1));
  };
  const go = (n: number) => {
    const k = Math.max(0, Math.min(panels.length, n));
    setStep(k);
    setSelActor("");
    try { window.history.replaceState(null, "", k ? `?panel=${k}` : window.location.pathname); } catch { /* not in a browser */ }
  };
  const specOf = (shotId: string): ShotSpec | undefined => props.shots.find((x) => x.id === shotId)?.spec;
  // Every panel's own placements with unsaved edits, then what carries on, in panel order.
  const effSpecs = useMemo(
    () => carryBlocking(panels.map((pn) => ({ spec: withEdits(specOf(pn.shotId) ?? ({ visibleIds: [] } as unknown as ShotSpec), edits[pn.shotId]) }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panels, props.shots, edits],
  );
  const panelMode = step > 0 && !!panels[step - 1];
  const pk = step - 1;
  const panel = panelMode ? panels[pk] : undefined;
  const pspec = panelMode ? effSpecs[pk] : undefined;
  const shown = pspec ? planForShot(plan, pspec) : plan;
  const panelCam = pspec?.cameraId ? shown.cameras.find((c) => c.id === pspec.cameraId) : undefined;
  const changedPanels = Object.entries(edits).filter(([, e]) => Object.keys(e).length);
  const curEntry = (key: string): BlockEntry => {
    const bl = pspec?.blocking?.[key];
    if (bl) return { at: bl.at, ...(bl.to ? { to: bl.to } : {}), ...(bl.facingDeg !== undefined ? { facingDeg: bl.facingDeg } : {}), ...(bl.only && bl.by === "you" ? { only: true } : {}), ...(bl.gone ? { gone: true } : {}) };
    if (key.startsWith("prop:")) return { at: plan.furniture?.find((f) => `prop:${f.id}` === key)?.position ?? { x: 0, y: 0 } };
    return { at: shown.actors.find((a) => a.characterId === key)?.position ?? { x: 0, y: 0 } };
  };
  const setEntry = (key: string, patch: Partial<BlockEntry>) => {
    if (!panel) return;
    const next = { ...curEntry(key), ...patch };
    for (const k of Object.keys(next) as (keyof BlockEntry)[]) if (next[k] === undefined) delete next[k];
    setEdits((e) => ({ ...e, [panel.shotId]: { ...(e[panel.shotId] ?? {}), [key]: next } }));
  };
  const clearEntry = (key: string) => {
    if (!panel) return;
    setEdits((e) => ({ ...e, [panel.shotId]: { ...(e[panel.shotId] ?? {}), [key]: null } }));
  };

  const b = plan.bounds ?? { minX: -5, maxX: 5, minY: 0, maxY: 10 };
  // A big room or open ground is drawn smaller so it fits on the screen (D29).
  const SCALE = Math.max(14, Math.min(MAX_SCALE, Math.round(660 / Math.max(b.maxX - b.minX, b.maxY - b.minY))));
  const width = (b.maxX - b.minX) * SCALE + PAD * 2;
  const height = (b.maxY - b.minY) * SCALE + PAD * 2;
  const toPx = (p: Point) => ({ x: PAD + (p.x - b.minX) * SCALE, y: PAD + (b.maxY - p.y) * SCALE });
  const toM = (x: number, y: number): Point => ({
    x: Math.round(((x - PAD) / SCALE + b.minX) * 100) / 100,
    y: Math.round((b.maxY - (y - PAD) / SCALE) * 100) / 100,
  });
  const name = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const colour = (id: string) => COLOURS[Math.max(0, cast.findIndex((c) => c.id === id)) % COLOURS.length];
  /** Somewhere to walk off to (D35): towards the way out if the venue has one, else out of the camera's sight, at most 6 m. */
  const walkOff = (from: Point): Point => {
    const exit = plan.views.find((v) => EXIT_RE.test(v.name));
    let deg = 0;
    if (exit) deg = exit.directionDeg;
    else if (panelCam) {
      const f = { x: panelCam.lookAt.x - panelCam.position.x, y: panelCam.lookAt.y - panelCam.position.y };
      const lateral = (from.x - panelCam.position.x) * f.y - (from.y - panelCam.position.y) * f.x; // > 0: on the camera's right
      deg = (Math.atan2(f.y, f.x) * 180) / Math.PI + (lateral > 0 ? -90 : 90);
    }
    const dx = Math.cos((deg * Math.PI) / 180), dy = Math.sin((deg * Math.PI) / 180);
    const m = 0.3;
    const tx = dx > 1e-6 ? (b.maxX - m - from.x) / dx : dx < -1e-6 ? (b.minX + m - from.x) / dx : Infinity;
    const ty = dy > 1e-6 ? (b.maxY - m - from.y) / dy : dy < -1e-6 ? (b.minY + m - from.y) / dy : Infinity;
    const t = Math.max(0.5, Math.min(6, tx, ty));
    return { x: +(from.x + dx * t).toFixed(2), y: +(from.y + dy * t).toFixed(2) };
  };

  const lineFindings = useMemo(() => checkLineOfAction(plan, cast), [plan, cast]);
  const impact = useMemo(() => planImpact(saved, plan, props.shots, cast), [saved, plan, props.shots, cast]);
  const cam = plan.cameras.find((c) => c.id === selectedCam);
  const reading = cam ? readCamera(plan, cam) : undefined;
  const dirty = JSON.stringify(plan) !== JSON.stringify(saved);

  const moveActor = (id: string, p: Point) =>
    setPlan((pl) => ({ ...pl, actors: pl.actors.map((a) => (a.characterId === id ? { ...a, position: p } : a)) }));
  const setLevel = (id: string, patch: Partial<PlanLevel>) =>
    setPlan((pl) => ({ ...pl, levels: (pl.levels ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const moveFurniture = (id: string, p: Point) =>
    setPlan((pl) => ({ ...pl, furniture: (pl.furniture ?? []).map((f) => (f.id === id ? { ...f, position: p } : f)) }));
  const moveCam = (id: string, patch: Partial<Omit<PlanCamera, "id" | "name">>) =>
    setPlan((pl) => ({ ...pl, cameras: pl.cameras.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  // Line of action endpoints.
  const loa = plan.lineOfAction?.map((id) => shown.actors.find((a) => a.characterId === id)?.position);

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
        {panels.length > 0 && (
          <div className="mb-2 px-1" data-testid="plan-stepper" style={{ maxWidth: Math.max(width, 420) }}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" aria-label="Previous panel" data-testid="plan-prev" disabled={step === 0} onClick={() => go(step - 1)}
                className="h-9 w-9 rounded-full border border-neutral-300 text-xl leading-none hover:bg-neutral-50 disabled:opacity-30">‹</button>
              <div className="min-w-44 text-center">
                <p className="font-semibold" data-testid="plan-step-label">{panelMode ? `Panel ${step} of ${panels.length}` : "Scene plan"}</p>
                <p className="text-xs text-neutral-500">{panelMode ? panel!.code : "where everyone starts"}</p>
              </div>
              <button type="button" aria-label="Next panel" data-testid="plan-next" disabled={step === panels.length} onClick={() => go(step + 1)}
                className="h-9 w-9 rounded-full border border-neutral-300 text-xl leading-none hover:bg-neutral-50 disabled:opacity-30">›</button>
              <div className="ml-1 flex flex-wrap gap-1">
                {[{ label: "Plan", n: 0 }, ...panels.map((_, i) => ({ label: String(i + 1), n: i + 1 }))].map(({ label, n }) => {
                  const own = n > 0 && Object.values(effSpecs[n - 1]?.blocking ?? {}).some((x) => x.by === "you");
                  const unsaved = n > 0 && Object.keys(edits[panels[n - 1].shotId] ?? {}).length > 0;
                  return (
                    <button key={n} type="button" onClick={() => go(n)} data-testid={`plan-step-${n}`} title={n ? panels[n - 1].description : "The scene plan"}
                      className={`min-w-8 rounded-md border px-2 py-0.5 text-xs ${n === step ? "border-blue-600 bg-blue-600 text-white" : own ? "border-neutral-700 font-semibold" : "border-neutral-300"}`}>
                      {label}{unsaved ? "*" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
            {panelMode && <p className="mt-1 text-sm text-neutral-700" data-testid="plan-step-words">{panel!.description}</p>}
          </div>
        )}
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
            {(panelMode ? (panelCam ? [panelCam] : []) : plan.cameras).map((c) => {
              const r = readCamera(shown, c);
              const p = toPx(c.position);
              const fov = c.fovDeg ?? PRESET_FOV[c.preset];
              const sel = panelMode || c.id === selectedCam;
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

            {/* Raised and lowered areas (D29): drag to move; size and height on the right. */}
            {(plan.levels ?? []).map((l) => {
              const tl = toPx({ x: l.x, y: l.y + l.d });
              const raised = l.heightM > 0;
              return (
                <Group key={`lvl-${l.id}`} x={tl.x} y={tl.y} draggable={!panelMode} listening={!panelMode} onDragStart={pushHistory}
                  onDragEnd={(e) => { const m = toM(e.target.x(), e.target.y()); setLevel(l.id, { x: m.x, y: +(m.y - l.d).toFixed(2) }); }}>
                  <Rect width={l.w * SCALE} height={l.d * SCALE} fill={raised ? "rgba(168,162,158,0.28)" : "rgba(100,116,139,0.30)"} stroke={raised ? "#78716c" : "#334155"} strokeWidth={2} dash={l.edge === "drop" ? [10, 6] : l.edge === "railing" ? [2, 3] : undefined} />
                  <Text text={`${l.name} ${l.heightM > 0 ? "+" : ""}${l.heightM} m`} fontSize={11} fill={raised ? "#44403c" : "#1e293b"} x={4} y={4} width={Math.max(60, l.w * SCALE - 8)} />
                </Group>
              );
            })}

            {(plan.furniture ?? []).map((f0) => {
              // On a panel (D35): where it is in this panel, or a faint outline if it's been taken away.
              const key = `prop:${f0.id}`;
              const pb = pspec?.blocking?.[key];
              const gone = !!pb?.gone;
              const f = pb && !gone ? { ...f0, position: pb.at } : f0;
              const p = toPx(f.position);
              // Drawn by kind (D21): a backdrop or screen is a long thin panel facing the group,
              // a long counter a long block, a table or stand a circle.
              const kind = propKind(`${f.name} ${f.detail ?? ""}`, f.name);
              const long = kind === "flat" || f.radiusM > 0.8;
              const people = shown.actors.map((a) => toPx(a.position));
              const g = people.length ? { x: people.reduce((t, q) => t + q.x, 0) / people.length, y: people.reduce((t, q) => t + q.y, 0) / people.length } : { x: p.x, y: p.y + 1 };
              const facingDeg = (Math.atan2(g.y - p.y, g.x - p.x) * 180) / Math.PI;
              const stroke = pb?.by === "you" ? "#111827" : "#737373";
              const dash = gone || pb?.by === "carried" ? [5, 4] : undefined;
              const sw = pb?.by === "you" ? 2.5 : 1;
              const onMove = (e: { target: { x(): number; y(): number } }) => (panelMode ? setEntry(key, { at: toM(e.target.x(), e.target.y()) }) : moveFurniture(f.id, toM(e.target.x(), e.target.y())));
              return (
                <Group key={f.id} x={p.x} y={p.y} opacity={gone ? 0.35 : 1} draggable={!gone} listening={!gone} onDragStart={panelMode ? pushEdit : pushHistory} onDragMove={onMove} onDragEnd={onMove}>
                  {long
                    ? <Rect rotation={facingDeg + 90} x={0} y={0} offsetX={f.radiusM * SCALE} offsetY={(kind === "flat" ? 0.12 : 0.5) * SCALE / 2} width={f.radiusM * 2 * SCALE} height={(kind === "flat" ? 0.12 : 0.5) * SCALE} fill={gone ? undefined : kind === "flat" ? "#ede9fe" : "#e5e5e5"} stroke={stroke} strokeWidth={sw} dash={dash} />
                    : <Circle radius={f.radiusM * SCALE} fill={gone ? undefined : "#e5e5e5"} stroke={stroke} strokeWidth={sw} dash={dash} />}
                  <Text text={gone ? `${f.name} (taken away)` : f.name} fontSize={10} fill="#525252" x={-50} y={-5} width={100} align="center" />
                </Group>
              );
            })}

            {/* Cameras: body + aim handle. On a panel, only that panel's camera, fixed (D35). */}
            {(panelMode ? (panelCam ? [panelCam] : []) : plan.cameras).map((c) => {
              const p = toPx(c.position);
              const t = toPx(c.lookAt);
              const sel = panelMode || c.id === selectedCam;
              return (
                <Group key={c.id}>
                  <Arrow points={[p.x, p.y, t.x, t.y]} stroke={sel ? "#2563eb" : "#a3a3a3"} fill={sel ? "#2563eb" : "#a3a3a3"} strokeWidth={1} pointerLength={6} pointerWidth={6} listening={false} />
                  <Group x={p.x} y={p.y} draggable={!panelMode} listening={!panelMode} onDragStart={pushHistory} onMouseDown={() => setSelectedCam(c.id)} onTouchStart={() => setSelectedCam(c.id)}
                    onDragMove={(e) => moveCam(c.id, { position: toM(e.target.x(), e.target.y()) })} onDragEnd={(e) => moveCam(c.id, { position: toM(e.target.x(), e.target.y()) })}>
                    <Rect x={-9} y={-7} width={18} height={14} cornerRadius={3} fill={sel ? "#1d4ed8" : "#404040"} />
                    <Text text={c.name} fontSize={11} fontStyle="bold" fill={sel ? "#1d4ed8" : "#404040"} x={-50} y={10} width={100} align="center" />
                  </Group>
                  {sel && !panelMode && (
                    <Circle x={t.x} y={t.y} radius={7} fill="#fff" stroke="#2563eb" strokeWidth={2} draggable onDragStart={pushHistory}
                      onDragMove={(e) => moveCam(c.id, { lookAt: toM(e.target.x(), e.target.y()) })} onDragEnd={(e) => moveCam(c.id, { lookAt: toM(e.target.x(), e.target.y()) })} />
                  )}
                </Group>
              );
            })}

            {/* Walks during a panel (D35): a dashed arrow to a ring you can drag. */}
            {panelMode && shown.actors.filter((a) => a.to).map((a) => {
              const s0 = toPx(a.position), e0 = toPx(a.to!);
              const onEnd = (e: { target: { x(): number; y(): number } }) => setEntry(a.characterId, { to: toM(e.target.x(), e.target.y()) });
              return (
                <Group key={`walk-${a.characterId}`}>
                  <Arrow points={[s0.x, s0.y, e0.x, e0.y]} stroke="#ea580c" fill="#ea580c" strokeWidth={2} dash={[7, 5]} pointerLength={9} pointerWidth={9} listening={false} />
                  <Circle x={e0.x} y={e0.y} radius={10} fill="rgba(255,255,255,0.85)" stroke={colour(a.characterId)} strokeWidth={3} draggable data-testid={`walk-end-${a.characterId}`}
                    onDragStart={pushEdit} onDragMove={onEnd} onDragEnd={onEnd} onMouseDown={() => setSelActor(a.characterId)} />
                  <Text text={`${name(a.characterId)} ends here`} fontSize={10} fill="#9a3412" x={e0.x + 12} y={e0.y - 5} listening={false} />
                </Group>
              );
            })}

            {/* Characters */}
            {shown.actors.map((a) => {
              const p = toPx(a.position);
              const id = a.characterId;
              // On a panel (D35): a black ring is set on this panel, dashed carried on from an
              // earlier one, amber moved by the panel's own words; faded is in the room but not in the picture.
              const src = panelMode ? blockSource(effSpecs, pk, id) : undefined;
              const inPic = !panelMode || !!pspec?.visibleIds?.includes(id);
              const fwd = panelMode ? facingOf(shown, id, shown.lineOfAction) : undefined;
              const sel = panelMode && selActor === id;
              const onMove = (e: { target: { x(): number; y(): number } }) => (panelMode ? setEntry(id, { at: toM(e.target.x(), e.target.y()) }) : moveActor(id, toM(e.target.x(), e.target.y())));
              const knobR = Math.max(26, 0.9 * SCALE);
              return (
                <Group key={id}>
                  <Group x={p.x} y={p.y} opacity={inPic ? 1 : 0.45} draggable onDragStart={panelMode ? pushEdit : pushHistory} onDragMove={onMove} onDragEnd={onMove}
                    onMouseDown={() => panelMode && setSelActor(id)} onTouchStart={() => panelMode && setSelActor(id)}>
                    {fwd && <Line points={[0, 0, fwd.x * 22, -fwd.y * 22]} stroke={colour(id)} strokeWidth={4} lineCap="round" />}
                    <Circle radius={11} fill={colour(id)} stroke={src?.kind === "here" ? "#111827" : src?.kind === "mark" ? "#d97706" : "#fff"} strokeWidth={src && src.kind !== "plan" ? 3 : 2} dash={src?.kind === "carried" ? [4, 3] : undefined} />
                    {sel && <Circle radius={16} stroke="#2563eb" strokeWidth={2} dash={[3, 3]} />}
                    <Text text={name(id).charAt(0)} fontSize={12} fontStyle="bold" fill="#fff" x={-5} y={-6} />
                    <Text text={name(id)} fontSize={11} fill="#171717" x={13} y={-6} />
                  </Group>
                  {/* Turn handle for the chosen person, unless they're walking (then they face the way they walk). */}
                  {sel && !a.to && (() => {
                    const dir = fwd ?? { x: 0, y: -1 };
                    return (
                      <>
                        <Line points={[p.x, p.y, p.x + dir.x * knobR, p.y - dir.y * knobR]} stroke="#2563eb" strokeWidth={1} dash={[3, 3]} listening={false} />
                        <Circle x={p.x + dir.x * knobR} y={p.y - dir.y * knobR} radius={7} fill="#fff" stroke="#2563eb" strokeWidth={2} draggable data-testid={`turn-${id}`}
                          onDragStart={pushEdit}
                          onDragMove={(e) => setEntry(id, { facingDeg: Math.round((Math.atan2(-(e.target.y() - p.y), e.target.x() - p.x) * 180) / Math.PI) })}
                          onDragEnd={(e) => { setEntry(id, { facingDeg: Math.round((Math.atan2(-(e.target.y() - p.y), e.target.x() - p.x) * 180) / Math.PI) }); }} />
                      </>
                    );
                  })()}
                </Group>
              );
            })}
          </Layer>
        </Stage>
        <p className="px-2 pb-1 text-xs text-neutral-500" style={{ maxWidth: Math.max(width, 420) }}>
          {panelMode
            ? <>Panel {step}: drag anyone to where they are in this panel; click someone to turn them with the blue handle. Black ring: set on this panel. Dashed ring: carried on from an earlier panel. Amber ring: moved by the panel&apos;s words. Faded: in the room but not in this picture. Drag a prop to move it for this panel. Scale: {SCALE}px = 1 m.</>
            : <>Drag people, furniture and cameras. Select a camera, then drag its white handle to aim it. Dashed amber line: the 180° line of action. Scale: {SCALE}px = 1 m.</>}
        </p>
      </div>

      <div className="space-y-4">
        {panelMode && panel && pspec ? (
          <>
            <div className="rounded-xl border border-blue-200 bg-white p-5 text-sm" data-testid="panel-positions">
              <h2 className="text-lg font-semibold">Positions in panel {step}</h2>
              <p className="mt-1 text-neutral-700">{panel.description}</p>
              <p className="mt-1 text-xs text-neutral-500">{pspec.shot ? `Shot: ${pspec.shot}. ` : ""}{panelCam ? `Camera: ${panelCam.name}.` : "No camera chosen for this panel yet: approve the positions on the storyboard and the app chooses one."}</p>
              {locks.cameras && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-amber-900" data-testid="panel-locked">The cameras are approved and locked, so moves here can&apos;t be saved. Use “Change cameras” on the storyboard first.</p>}
              {panelCam && (
                <div className="mt-3">
                  <p className="mb-1 font-medium">This panel&apos;s camera view{props.ring ? ", with the venue's 360° view behind" : ""}</p>
                  <CameraView plan={shown} cameraId={panelCam.id} cast={cast} ring={props.ring} />
                  <p className="mt-2 rounded-md bg-neutral-100 px-3 py-2" data-testid="panel-frame-words">{describeFrame(readCamera(shown, panelCam), cast) || "Nobody in view."}</p>
                </div>
              )}

              <h3 className="mt-4 font-semibold">People</h3>
              <ul className="mt-1 space-y-2">
                {shown.actors.map((a) => {
                  const id = a.characterId;
                  const src = blockSource(effSpecs, pk, id);
                  const own = pspec.blocking?.[id]?.by === "you" ? pspec.blocking[id] : undefined;
                  const inPic = !!pspec.visibleIds?.includes(id);
                  const fwd = facingOf(shown, id, shown.lineOfAction);
                  const deg = a.facingDeg ?? (fwd ? Math.round((Math.atan2(fwd.y, fwd.x) * 180) / Math.PI) : 90);
                  const base = plan.actors.find((x) => x.characterId === id)?.position;
                  return (
                    <li key={id} className={`rounded-lg border p-2 ${selActor === id ? "border-blue-500" : "border-neutral-200"}`} data-testid={`panel-person-${id}`} onClick={() => setSelActor(id)}>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-semibold" style={{ color: colour(id) }}>{name(id)}</span>
                        <span className="text-xs text-neutral-600" data-testid={`panel-person-${id}-source`}>
                          {src.kind === "here" ? (own?.only ? "set on this panel only" : "set on this panel, carries on to later panels")
                            : src.kind === "carried" ? `carried on from panel ${(src.from ?? 0) + 1}`
                            : src.kind === "mark" ? "moved by this panel's words"
                            : "where the scene plan puts them"}
                          {inPic ? " · in the picture" : " · in the room, not in the picture"}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {a.to
                          ? <span className="text-orange-800">Faces the way they walk.</span>
                          : <label>Facing <input type="range" min={-180} max={180} step={5} value={((deg + 540) % 360) - 180} aria-label={`${name(id)} facing`} className="align-middle" data-testid={`panel-person-${id}-facing`}
                              onMouseDown={pushEdit} onChange={(e) => setEntry(id, { facingDeg: Number(e.target.value) })} />
                              {a.facingDeg !== undefined
                                ? <button type="button" className="ml-1 underline" onClick={() => { pushEdit(); setEntry(id, { facingDeg: undefined }); }}>auto</button>
                                : <span className="ml-1 text-neutral-500">(auto: towards the others)</span>}
                            </label>}
                        <label><input type="checkbox" checked={!!a.to} data-testid={`panel-person-${id}-walks`} onChange={(e) => {
                          pushEdit();
                          if (!e.target.checked) { setEntry(id, { to: undefined }); return; }
                          const d = fwd ?? { x: 0, y: 1 };
                          const to = { x: +Math.min(b.maxX - 0.3, Math.max(b.minX + 0.3, a.position.x + d.x * 1.5)).toFixed(2), y: +Math.min(b.maxY - 0.3, Math.max(b.minY + 0.3, a.position.y + d.y * 1.5)).toFixed(2) };
                          setEntry(id, { to, facingDeg: undefined });
                        }} /> Walks during this panel</label>
                        <button type="button" className="rounded border border-neutral-300 px-2 py-0.5 hover:bg-neutral-50" data-testid={`panel-person-${id}-walkoff`}
                          onClick={() => { pushEdit(); setEntry(id, { to: walkOff(a.position), facingDeg: undefined }); }}>
                          Walks off{plan.views.find((v) => EXIT_RE.test(v.name)) ? ` (to the ${plan.views.find((v) => EXIT_RE.test(v.name))!.name})` : ""}
                        </button>
                        {own && <label><input type="checkbox" checked={!!own.only} data-testid={`panel-person-${id}-only`} onChange={(e) => { pushEdit(); setEntry(id, { only: e.target.checked || undefined }); }} /> This panel only</label>}
                        {own && <button type="button" className="text-red-700 underline" data-testid={`panel-person-${id}-clear`} onClick={() => { pushEdit(); clearEntry(id); }}>Clear this panel&apos;s change</button>}
                        {!own && src.kind !== "plan" && base && <button type="button" className="underline" onClick={() => { pushEdit(); setEntry(id, { at: base, to: undefined, facingDeg: undefined }); }}>Back to the scene plan from here</button>}
                      </div>
                      {a.to && <p className="mt-1 text-xs text-orange-800">Walks about {Math.round(Math.hypot(a.to.x - a.position.x, a.to.y - a.position.y) * 2) / 2} m: drag the ring at the end of the orange arrow to change where.</p>}
                    </li>
                  );
                })}
              </ul>

              {(plan.furniture ?? []).length > 0 && (
                <>
                  <h3 className="mt-4 font-semibold">Props</h3>
                  <ul className="mt-1 space-y-1 text-xs">
                    {(plan.furniture ?? []).map((f) => {
                      const key = `prop:${f.id}`;
                      const pb = pspec.blocking?.[key];
                      const own = pb?.by === "you" ? pb : undefined;
                      const from = pb?.by === "carried" ? blockSource(effSpecs, pk, key).from : undefined;
                      return (
                        <li key={f.id} className="flex flex-wrap items-center gap-2" data-testid={`panel-prop-${f.id}`}>
                          <span className="font-medium">{f.name}</span>
                          <span className="text-neutral-600">{pb?.gone ? "taken away" : pb ? "moved" : "in its place on the scene plan"}{pb?.by === "carried" ? ` (from panel ${(from ?? 0) + 1})` : own ? (own.only ? " on this panel only" : " from this panel on") : ""}</span>
                          {pb?.gone
                            ? <button type="button" className="underline" onClick={() => { pushEdit(); if (own) clearEntry(key); else setEntry(key, { at: f.position, gone: undefined }); }}>Bring back</button>
                            : <button type="button" className="underline" data-testid={`panel-prop-${f.id}-remove`} onClick={() => { pushEdit(); setEntry(key, { gone: true }); }}>Take away from here</button>}
                          {pb && !pb.gone && <button type="button" className="underline" onClick={() => { pushEdit(); if (own) clearEntry(key); else setEntry(key, { at: f.position, gone: undefined }); }}>{own ? "Undo this panel's move" : "Back to its place from here"}</button>}
                          {own && <label><input type="checkbox" checked={!!own.only} onChange={(e) => { pushEdit(); setEntry(key, { only: e.target.checked || undefined }); }} /> This panel only</label>}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-1 text-xs text-neutral-500">Drag a prop on the plan to move it for this panel. Something new for this scene (his phone, a laptop) is added in the scene setting on the storyboard; something a person always carries goes in their character description.</p>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <ActionButton label={changedPanels.length > 1 ? `Save positions (${changedPanels.length} panels)` : "Save positions"} busyLabel="Saving…" doneLabel="Saved" testId="panel-save"
                disabled={!changedPanels.length || locks.cameras || dirty} resetKey={edits}
                title={dirty ? "Save the scene plan first" : locks.cameras ? "The cameras are locked" : ""}
                onAction={async () => {
                  const r = await savePanelBlockingAction(changedPanels.map(([shotId, entries]) => ({ shotId, entries })));
                  if (!r.ok) { setPanelStatus(r.error); return false; }
                  setEdits({}); setEditHistory([]);
                  setPanelStatus(locks.positions ? "Saved. The cameras were chosen again for the new places; redraw the pictures of the panels that changed." : "Saved.");
                  router.refresh();
                }} />
              <button type="button" disabled={!editHistory.length} onClick={undoEdit} className="rounded-md border border-neutral-300 px-3 py-1 text-sm disabled:opacity-40">Undo last move</button>
              {changedPanels.length > 0 && <span className="text-sm text-neutral-600">Unsaved: panel {changedPanels.map(([sid]) => panels.findIndex((x) => x.shotId === sid) + 1).sort((x, y) => x - y).join(", ")}</span>}
              {dirty && <span className="text-sm text-amber-700">The scene plan has unsaved changes: save it first.</span>}
              {panelStatus && <span className="text-sm text-neutral-700" role="status">{panelStatus}</span>}
            </div>
          </>
        ) : (
          <>
        <div className="rounded-xl border border-neutral-200 bg-white p-5 text-sm" data-testid="plan-levels">
          <h2 className="text-lg font-semibold">Room and heights</h2>
          <p className="mt-1 text-neutral-700" data-testid="plan-room">Room: {(b.maxX - b.minX).toFixed(1)} × {(b.maxY - b.minY).toFixed(1)} m{props.roomHref ? <> · <a className="text-blue-700 underline" href={props.roomHref}>change it on the venue</a></> : null}</p>
          <p className="mt-2 text-neutral-600">Raised or lowered parts of the floor: a stage, a balcony, the top of some stairs, a pit, or the drop past a cliff or roof edge. Anyone, any prop and any camera standing in one is at its height.</p>
          {(plan.levels ?? []).map((l) => (
            <div key={l.id} className="mt-2 grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-neutral-200 p-2" data-testid={`level-${l.id}`}>
              <input className="rounded border border-neutral-300 px-2 py-1" value={l.name} aria-label="Area name" onChange={(e) => setLevel(l.id, { name: e.target.value })} />
              <button type="button" className="text-xs text-red-700 underline" onClick={() => { pushHistory(); setPlan((pl) => ({ ...pl, levels: (pl.levels ?? []).filter((x) => x.id !== l.id) })); }}>Remove</button>
              <div className="col-span-2 flex flex-wrap items-center gap-2 text-xs">
                <label>Height <input type="number" step={0.1} min={-100} max={50} className="w-16 rounded border border-neutral-300 px-1 py-0.5" value={l.heightM} aria-label="Area height" data-testid={`level-${l.id}-height`}
                  onFocus={pushHistory} onChange={(e) => setLevel(l.id, { heightM: Number(e.target.value) })} /> m {l.heightM < 0 ? "(below the floor)" : ""}</label>
                <label>Width <input type="number" step={0.5} min={0.5} className="w-14 rounded border border-neutral-300 px-1 py-0.5" value={l.w} aria-label="Area width" onFocus={pushHistory} onChange={(e) => setLevel(l.id, { w: Math.max(0.5, Number(e.target.value)) })} /> m</label>
                <label>Depth <input type="number" step={0.5} min={0.5} className="w-14 rounded border border-neutral-300 px-1 py-0.5" value={l.d} aria-label="Area depth" onFocus={pushHistory} onChange={(e) => setLevel(l.id, { d: Math.max(0.5, Number(e.target.value)) })} /> m</label>
                <label>Edge <select className="rounded border border-neutral-300 px-1 py-0.5" value={l.edge ?? "plain"} onChange={(e) => setLevel(l.id, { edge: e.target.value as PlanLevel["edge"] })}>
                  <option value="plain">plain</option><option value="railing">railing</option><option value="steps">steps</option><option value="drop">sheer drop</option>
                </select></label>
              </div>
            </div>
          ))}
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {([["Stage", 1, "plain"], ["Balcony", 4, "railing"], ["Top of stairs", 3, "steps"], ["Pit", -2.5, "plain"], ["Drop (cliff or roof edge)", -20, "drop"]] as const).map(([label, h, edge]) => (
              <button key={label} type="button" className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-50" data-testid={`add-level-${label.split(" ")[0].toLowerCase()}`}
                onClick={() => {
                  pushHistory();
                  const cx = plan.actors.length ? plan.actors.reduce((t, a) => t + a.position.x, 0) / plan.actors.length : (b.minX + b.maxX) / 2;
                  const cy = plan.actors.length ? plan.actors.reduce((t, a) => t + a.position.y, 0) / plan.actors.length : (b.minY + b.maxY) / 2;
                  // A drop goes beyond the group; anything else under it.
                  const lvl: PlanLevel = edge === "drop"
                    ? { id: `lvl-${Date.now()}`, name: "the drop", heightM: h, x: b.minX, y: +Math.min(b.maxY - 0.5, cy + 1.8).toFixed(2), w: +(b.maxX - b.minX).toFixed(2), d: +(b.maxY - Math.min(b.maxY - 0.5, cy + 1.8)).toFixed(2), edge }
                    : { id: `lvl-${Date.now()}`, name: `the ${label.toLowerCase()}`, heightM: h, x: +(cx - 2).toFixed(2), y: +(cy - 1.5).toFixed(2), w: 4, d: 3, edge };
                  setPlan((pl) => ({ ...pl, levels: [...(pl.levels ?? []), lvl] }));
                }}>+ {label}</button>
            ))}
          </div>
        </div>
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
          </>
        )}
      </div>
    </div>
  );
}
