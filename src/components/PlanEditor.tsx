"use client";

// Top-down Scene Geometry and Camera Studio (Stage 5).
// Drag characters, furniture, cameras and camera aim points. The rules engine reads each
// camera live: who is frame-left/centre/right, the soft foreground, the background view,
// and 180° line warnings. Characters are only ever moved by the user.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text, Wedge } from "react-konva";
import { savePlanAction, addPlanToLibraryAction } from "@/app/actions";
import { savePanelBlockingAction } from "@/app/studioActions";
import { aimToInclude, checkLineOfAction, describeFrame, facingOf, planForShot, PRESET_FOV, readCamera } from "@/lib/domain/geometry";
import { blockSource, carryBlocking, withEdits, type BlockEntry } from "@/lib/domain/blocking";
import { posturesFromWords } from "@/lib/domain/panelWords";
import { changeFromWords, changeSuggestions } from "@/lib/domain/changeWords";
import { designScene } from "@/lib/domain/director";
import type { Genre } from "@/lib/domain/genre";
import { planImpact, type ShotRef } from "@/lib/domain/impact";
import type { CameraPreset, CastMember, GeometryPlanData, PlanCamera, PlanLevel, Point, Pose, ShotSpec } from "@/lib/domain/types";
import { CameraView, type RingInfo } from "./CameraView";
import { fovForSize, lensText, SHOT_SIZES, type ShotSize } from "@/lib/domain/shotLanguage";
import { propKind } from "@/lib/domain/story";
import { FindingList } from "./FindingList";
import { ActionButton } from "./ActionButton";
import { WordsHelp } from "./WordsHelp";

const MAX_SCALE = 66; // pixels per metre in an ordinary room; larger rooms are drawn smaller (D29)
const PAD = 30;
const CONE_M = 7;
const COLOURS = ["#e11d48", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

/** One step of the panel stepper (D35): a panel of the storyboard and its shot. */
export interface PanelStep { shotId: string; code: string; description: string }

export function PlanEditor(props: {
  sceneId: string; initial: GeometryPlanData; version: number; cast: CastMember[]; shots: ShotRef[]; ring?: RingInfo;
  /** The venue page, where the room size is set (D29). */ roomHref?: string;
  /** The storyboard's panels, in order, for stepping through each panel's positions (D35). */ panels?: PanelStep[];
  /** 0 is the scene plan, 1 the first panel… */ initialStep?: number;
  locks?: { positions: boolean; cameras: boolean };
  /** The posture the scene setting starts everyone in (D37). */ scenePose?: { pose: Pose; on?: string };
  /**
   * Opened from a storyboard panel's "Need to change something?" (D39): just that panel, with
   * the user's words applied, and Save hands back to redraw the picture.
   */
  focus?: { words?: string; onDone: (saved: boolean) => void };
  /** The project's genre, for the app's camera choice on a panel (D44). */ genre?: Genre;
}) {
  const { cast } = props;
  const router = useRouter();
  const panels = useMemo(() => props.panels ?? [], [props.panels]);
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
  // Changes in words (D39): "move Jade closer to Nina and have Marcus walk off to the right".
  const [words, setWords] = useState(props.focus?.words ?? "");
  const [read, setRead] = useState<{ understood: string[]; unclear: string[]; suggest: string[] } | null>(null);
  const [camNote, setCamNote] = useState("");
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
  // Postures (D37), worked out here too so a change shows at once on every later panel.
  const poses = useMemo(
    () => posturesFromWords(plan, panels.map((pn, k) => {
      const sp = effSpecs[k];
      return { action: pn.description, subjectId: sp?.subjectId ?? sp?.speakerId ?? sp?.visibleIds?.[0], visibleIds: sp?.visibleIds ?? [], at: sp?.at, blocking: sp?.blocking };
    }), cast.map((c) => ({ id: c.id, name: c.name })), props.scenePose),
    [plan, panels, effSpecs, cast, props.scenePose],
  );
  const shown0 = pspec ? planForShot(plan, { ...pspec, posture: poses[pk] }) : plan;
  // This panel's camera, as moved here if it has been (D43): the "@camera" edit.
  const camMoved = panel ? edits[panel.shotId]?.["@camera"] : undefined;
  const camSaved = pspec?.cameraId ? shown0.cameras.find((c) => c.id === pspec.cameraId) : undefined;
  const cam0 = camSaved && camMoved ? { ...camSaved, ...(camMoved.camera ?? {}), id: camSaved.id, name: camSaved.name, position: camMoved.at, lookAt: camMoved.to ?? camSaved.lookAt } : camSaved;
  // Anyone who must be in the picture but is out of the camera's view: the camera turns to
  // take them in (D42), shown here as it will be saved.
  const mustSee = cam0 && pspec ? (pspec.visibleIds ?? []).filter((id) => id !== cam0.povId && shown0.actors.some((a) => a.characterId === id)) : [];
  const aimed = cam0 ? aimToInclude(shown0, cam0, mustSee) : undefined;
  const outOfView = cam0 && aimed !== cam0 ? mustSee.filter((id) => !readCamera(shown0, cam0).actors.find((a) => a.characterId === id)?.inView) : [];
  const shown = cam0 && aimed && aimed !== camSaved ? { ...shown0, cameras: shown0.cameras.map((c) => (c.id === cam0.id ? aimed : c)) } : shown0;
  /** Move or aim this panel's camera (D43): kept as an edit until saved. */
  const moveThisCam = (patch: { position?: Point; lookAt?: Point }) => {
    if (!panel || !cam0) return;
    const cur = shown.cameras.find((c) => c.id === cam0.id) ?? cam0;
    setEdits((e) => ({ ...e, [panel.shotId]: { ...(e[panel.shotId] ?? {}), "@camera": { ...(e[panel.shotId]?.["@camera"] ?? {}), at: patch.position ?? cur.position, to: patch.lookAt ?? cur.lookAt } } }));
  };
  /**
   * The app places this panel's camera (D44), with the same film rules it uses for the whole
   * scene, from where everyone is now: e.g. behind someone arriving, so we see where they go.
   */
  const appCamera = () => {
    if (!panel) return;
    const design = designScene(plan, panels.map((pn, k) => ({ id: pn.shotId, code: pn.code, spec: { ...effSpecs[k], posture: poses[k] } as ShotSpec, description: pn.description })), name, props.genre ?? "neutral");
    const opt = design.shots.find((d) => d.shotId === panel.shotId)?.options[0];
    if (!opt) { setCamNote("The app couldn't find a camera that sees everyone in this panel from here. Move people closer together, or drag the camera yourself."); return; }
    pushEdit();
    const { id: _id, name: _n, ...cam } = opt.camera;
    void _id; void _n;
    setEdits((e) => ({ ...e, [panel.shotId]: { ...(e[panel.shotId] ?? {}), "@camera": { at: cam.position, to: cam.lookAt, camera: cam } } }));
    setCamNote(`Placed by the app: ${opt.kind}.${opt.reasons[0] ? ` ${opt.reasons[0].replace(/^R-[A-Z-]+:\s*/, "")}.` : ""} Not saved yet.`);
  };
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
  /** Where someone was at the end of the panel before (or on the scene plan): for "keep them where they were". */
  const prevPos = (id: string): Point => {
    const before = pk > 0 ? planForShot(plan, effSpecs[pk - 1]).actors.find((a) => a.characterId === id) : undefined;
    return before ? (before.to ?? before.position) : (plan.actors.find((a) => a.characterId === id)?.position ?? { x: 0, y: 0 });
  };
  const SRC_RING: Record<string, string> = { here: "#111827", app: "#0d9488", mark: "#d97706" };
  const applyWords = (text: string) => {
    if (!panel || !text.trim()) return;
    const people = cast.map((c) => ({ id: c.id, name: c.name }));
    const r = changeFromWords(text, shown0, cam0, people);
    setRead({ understood: r.understood, unclear: r.unclear, suggest: r.unclear.length ? changeSuggestions(r.unclear, people) : [] });
    if (!Object.keys(r.entries).length) return;
    pushEdit();
    setEdits((e) => {
      const mine = { ...(e[panel.shotId] ?? {}) };
      for (const [k, v] of Object.entries(r.entries)) {
        const only = v.only || (pspec?.blocking?.[k]?.by === "you" && pspec.blocking[k].only);
        mine[k] = { ...v, ...(only ? { only: true } : {}) };
      }
      return { ...e, [panel.shotId]: mine };
    });
  };
  // Opened with words from the storyboard: apply them once, straight away.
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || !props.focus?.words?.trim() || !panel) return;
    applied.current = true;
    applyWords(props.focus.words);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

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
        {props.focus && panel && <p className="mb-2 px-1 font-semibold" data-testid="plan-step-label">Panel {step}: {panel.description}</p>}
        {panels.length > 0 && !props.focus && (
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
              const sf = panelMode ? shown.furniture?.find((x) => x.id === f0.id) : f0;
              const gone = !sf;
              const f = sf ?? (pb ? { ...f0, position: pb.at } : f0);
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
                  <Text text={gone ? `${f.name} (taken away)` : sf?.heldBy ? `${f.name} (${name(sf.heldBy).split(" ")[0]} has it)` : f.name} fontSize={10} fill="#525252" x={-50} y={-5} width={100} align="center" />
                </Group>
              );
            })}

            {/* Cameras: body + aim handle. On a panel, only that panel's camera, moved for it alone (D43). */}
            {(panelMode ? (panelCam ? [panelCam] : []) : plan.cameras).map((c) => {
              const p = toPx(c.position);
              const t = toPx(c.lookAt);
              const sel = panelMode || c.id === selectedCam;
              return (
                <Group key={c.id}>
                  <Arrow points={[p.x, p.y, t.x, t.y]} stroke={sel ? "#2563eb" : "#a3a3a3"} fill={sel ? "#2563eb" : "#a3a3a3"} strokeWidth={1} pointerLength={6} pointerWidth={6} listening={false} />
                  <Group x={p.x} y={p.y} draggable onDragStart={panelMode ? pushEdit : pushHistory} onMouseDown={() => setSelectedCam(c.id)} onTouchStart={() => setSelectedCam(c.id)} data-testid="plan-camera"
                    onDragMove={(e) => (panelMode ? moveThisCam({ position: toM(e.target.x(), e.target.y()) }) : moveCam(c.id, { position: toM(e.target.x(), e.target.y()) }))}
                    onDragEnd={(e) => (panelMode ? moveThisCam({ position: toM(e.target.x(), e.target.y()) }) : moveCam(c.id, { position: toM(e.target.x(), e.target.y()) }))}>
                    <Rect x={-9} y={-7} width={18} height={14} cornerRadius={3} fill={sel ? "#1d4ed8" : "#404040"} />
                    <Text text={c.name} fontSize={11} fontStyle="bold" fill={sel ? "#1d4ed8" : "#404040"} x={-50} y={10} width={100} align="center" />
                  </Group>
                  {sel && (
                    <Circle x={t.x} y={t.y} radius={7} fill="#fff" stroke="#2563eb" strokeWidth={2} draggable onDragStart={panelMode ? pushEdit : pushHistory}
                      onDragMove={(e) => (panelMode ? moveThisCam({ lookAt: toM(e.target.x(), e.target.y()) }) : moveCam(c.id, { lookAt: toM(e.target.x(), e.target.y()) }))}
                      onDragEnd={(e) => (panelMode ? moveThisCam({ lookAt: toM(e.target.x(), e.target.y()) }) : moveCam(c.id, { lookAt: toM(e.target.x(), e.target.y()) }))} />
                  )}
                </Group>
              );
            })}

            {/* Someone arriving (D44): their path from where they start to their place with the others. */}
            {panelMode && pspec && shown.actors.filter((a) => !a.to && ["arriving", "crossing", "approaching"].includes(pspec.at?.[a.characterId] ?? "")).map((a) => {
              const home = plan.actors.find((x) => x.characterId === a.characterId)?.position;
              if (!home || Math.hypot(home.x - a.position.x, home.y - a.position.y) < 0.3) return null;
              const s0 = toPx(a.position), e0 = toPx(home);
              return (
                <Group key={`arrive-${a.characterId}`} listening={false}>
                  <Arrow points={[s0.x, s0.y, e0.x, e0.y]} stroke="#ea580c" fill="#ea580c" strokeWidth={2} dash={[7, 5]} pointerLength={9} pointerWidth={9} />
                  <Text text={`${name(a.characterId).split(" ")[0]} walks to the group`} fontSize={10} fill="#9a3412" x={(s0.x + e0.x) / 2 + 6} y={(s0.y + e0.y) / 2 - 12} />
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

            {/* People who have left by this panel (D36): a faint outline where they went. */}
            {panelMode && plan.actors.filter((a) => pspec?.blocking?.[a.characterId]?.gone).map((a) => {
              const g = toPx(pspec!.blocking![a.characterId].at);
              return (
                <Group key={`gone-${a.characterId}`} x={g.x} y={g.y} opacity={0.4} listening={false}>
                  <Circle radius={11} stroke={colour(a.characterId)} strokeWidth={2} dash={[3, 3]} />
                  <Text text={`${name(a.characterId)} (has left)`} fontSize={10} fill="#525252" x={13} y={-5} />
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
                    <Circle radius={11} fill={colour(id)} stroke={src ? SRC_RING[src.kind] ?? (src.kind === "carried" ? (src.fromApp ? "#0d9488" : "#111827") : "#fff") : "#fff"} strokeWidth={src && src.kind !== "plan" ? 3 : 2} dash={src?.kind === "carried" ? [4, 3] : undefined} />
                    {sel && <Circle radius={16} stroke="#2563eb" strokeWidth={2} dash={[3, 3]} />}
                    <Text text={name(id).charAt(0)} fontSize={12} fontStyle="bold" fill="#fff" x={-5} y={-6} />
                    <Text text={`${name(id)}${a.pose ? ` (${a.pose})` : ""}`} fontSize={11} fill="#171717" x={13} y={-6} />
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
            ? <>Panel {step}: drag anyone to where they are in this panel; click someone to turn them with the blue handle. Teal ring: placed by the app from this panel&apos;s words. Black ring: set by you. Dashed ring: carried on from an earlier panel. Amber ring: arriving, from the words. Faded: in the room but not in this picture. Drag a prop to move it for this panel. Scale: {SCALE}px = 1 m.</>
            : <>Drag people, furniture and cameras. Select a camera, then drag its white handle to aim it. Dashed amber line: the 180° line of action. Scale: {SCALE}px = 1 m.</>}
        </p>
      </div>

      <div className="space-y-4">
        {panelMode && panel && pspec ? (
          <>
            <div className="rounded-xl border border-blue-200 bg-white p-5 text-sm" data-testid="panel-positions">
              <h2 className="text-lg font-semibold">Positions in panel {step}</h2>
              {!props.focus && <p className="mt-1 text-neutral-700">{panel.description}</p>}
              <p className="mt-1 text-xs text-neutral-500">{pspec.shot ? `Shot: ${pspec.shot}. ` : ""}{panelCam ? `Camera: ${panelCam.name}. Drag the camera to move it, or its white handle to aim it: for this panel only, other panels keep theirs.` : "No camera chosen for this panel yet: approve the positions on the storyboard and the app chooses one."}{camMoved ? " (moved, not saved yet)" : ""}</p>
              {panelCam && <p className="mt-1 text-xs"><button type="button" className="rounded border border-blue-300 bg-white px-2 py-0.5 text-blue-800 hover:bg-blue-50" data-testid="panel-app-camera" onClick={appCamera}>Let the app place the camera</button>
                <span className="ml-2 text-neutral-600">{camNote || "after moving people, for the best camera for this panel"}</span></p>}
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3" data-testid="panel-words">
                <label className="block font-medium">What should change in this panel?<WordsHelp guide="change" />
                  <textarea className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1" rows={2} value={words} data-testid="panel-words-input"
                    placeholder="e.g. move Jade closer to Nina and have Marcus walk off to the right" onChange={(e) => setWords(e.target.value)} />
                </label>
                <button type="button" className="mt-1 rounded-md bg-blue-700 px-3 py-1 text-white hover:bg-blue-800 disabled:opacity-40" disabled={!words.trim()} data-testid="panel-words-apply"
                  onClick={() => applyWords(words)}>Show it on the plan</button>
                {read && (
                  <div className="mt-2 text-xs" data-testid="panel-words-read">
                    {read.understood.length > 0 && <p className="text-green-800">Done: {read.understood.join("; ")}.</p>}
                    {read.unclear.length > 0 && (
                      <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900" data-testid="panel-words-unclear">
                        <p><strong>{read.understood.length ? "Partly done." : "Nothing changed."}</strong> The app couldn&apos;t tell who should go where from {read.unclear.map((x) => `“${x}”`).join(", ")}. Say who, and where to: for example</p>
                        <p className="mt-1 flex flex-wrap gap-1">{read.suggest.map((x) => (
                          <button key={x} type="button" className="rounded border border-amber-400 bg-white px-2 py-0.5 hover:bg-amber-100" data-testid="panel-words-suggest"
                            onClick={() => { setWords(x); applyWords(x); }}>{x}</button>
                        ))}</p>
                        <p className="mt-1">Or drag them on the plan.</p>
                      </div>
                    )}
                  </div>
                )}
                <p className="mt-1 text-xs text-neutral-500">Left and right are as the picture shows them. Or drag people on the plan; click someone to turn them.</p>
              </div>
              {cam0 && aimed && aimed !== cam0 && (
                <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900" data-testid="panel-camera-turned">
                  {outOfView.length ? `${outOfView.map(name).map((n) => n.split(" ")[0]).join(" and ")} ${outOfView.length === 1 ? "is" : "are"} outside the camera's view here, so this panel's camera turns` : "Not everyone fits the frame here, so this panel's camera turns"}{aimed && aimed.fovDeg !== cam0.fovDeg ? " and widens" : ""} to keep everyone in the picture. Other panels&apos; cameras stay as they are. To keep the camera, move them back into the blue area instead.
                </p>
              )}
              {panelCam && (
                <div className="mt-3">
                  <p className="mb-1 font-medium">This panel&apos;s camera view{props.ring ? ", with the venue's 360° view behind" : ""}</p>
                  <CameraView plan={shown} cameraId={panelCam.id} cast={cast} ring={props.ring} />
                  <p className="mt-2 rounded-md bg-neutral-100 px-3 py-2" data-testid="panel-frame-words">{describeFrame(readCamera(shown, panelCam), cast) || "Nobody in view."}</p>
                </div>
              )}

              <h3 className="mt-4 font-semibold">People</h3>
              <ul className="mt-1 space-y-2">
                {plan.actors.filter((a) => pspec.blocking?.[a.characterId]?.gone).map((a) => {
                  const id = a.characterId;
                  const e = pspec.blocking![id];
                  return (
                    <li key={id} className="rounded-lg border border-dashed border-neutral-300 p-2 text-xs" data-testid={`panel-person-${id}`}>
                      <span className="font-semibold" style={{ color: colour(id) }}>{name(id)}</span>{" "}
                      <span className="text-neutral-600" data-testid={`panel-person-${id}-source`}>has left{e.by === "app" ? " (from the words)" : e.by === "carried" ? " (earlier)" : ""}: not in this panel.</span>{" "}
                      <button type="button" className="underline" data-testid={`panel-person-${id}-keep`} onClick={() => { pushEdit(); setEntry(id, { at: prevPos(id), gone: undefined, to: undefined, facingDeg: undefined }); }}>Keep them here</button>
                    </li>
                  );
                })}
                {shown.actors.map((a) => {
                  const id = a.characterId;
                  const src = blockSource(effSpecs, pk, id);
                  const own = pspec.blocking?.[id]?.by === "you" ? pspec.blocking[id] : undefined;
                  const inPic = !!pspec.visibleIds?.includes(id);
                  return (
                    <li key={id} className={`rounded-lg border p-2 ${selActor === id ? "border-blue-500" : "border-neutral-200"}`} data-testid={`panel-person-${id}`} onClick={() => setSelActor(id)}>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-semibold" style={{ color: colour(id) }}>{name(id)}</span>
                        <span className="text-xs text-neutral-600" data-testid={`panel-person-${id}-source`}>
                          {src.kind === "here" ? (own?.only ? "set on this panel only" : "set on this panel, carries on to later panels")
                            : src.kind === "app" ? `from the words: ${pspec.blocking?.[id]?.why ?? "placed by the app"}`
                            : src.kind === "carried" ? `carried on from panel ${(src.from ?? 0) + 1}${src.fromApp ? ` (${effSpecs[src.from ?? 0]?.blocking?.[id]?.why ?? "from the words"})` : ""}`
                            : src.kind === "mark" ? "moved by this panel's words"
                            : "where the scene plan puts them"}
                          {inPic ? " · in the picture" : " · in the room, not in the picture"}
                        </span>
                      </div>
                      {(() => {
                        // Posture (D37): carried on from the panel before unless the words or you change it.
                        const pe = poses[pk]?.[id];
                        const mineP = pspec.blocking?.[`pose:${id}`];
                        const now: Pose = pe?.pose ?? "standing";
                        return (
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs" data-testid={`panel-person-${id}-posture`}>
                            <label>Posture <select className="rounded border border-neutral-300 px-1 py-0.5" value={now} aria-label={`${name(id)} posture`} data-testid={`panel-person-${id}-pose`}
                              onChange={(e) => { pushEdit(); setEntry(`pose:${id}`, { at: { x: 0, y: 0 }, pose: e.target.value as Pose }); }}>
                              {(["standing", "sitting", "lying", "kneeling", "crouching"] as Pose[]).map((x) => <option key={x} value={x}>{x}</option>)}
                            </select></label>
                            <span className="text-neutral-600" data-testid={`panel-person-${id}-pose-source`}>
                              {mineP ? "set by you" : !pe ? "standing (nothing says otherwise)"
                                : pe.by === "carried" ? `${pe.pose}${pe.on ? ` on ${pe.on}` : ""}, carried on from before`
                                : pe.end ? `walking, then ${pe.end}${pe.on ? ` on ${pe.on}` : ""}`
                                : `from the words: ${pe.why ?? pe.pose}${pe.from ? ` (was ${pe.from})` : ""}`}
                            </span>
                            {mineP && <button type="button" className="underline" onClick={() => { pushEdit(); clearEntry(`pose:${id}`); }}>back to the words</button>}
                          </div>
                        );
                      })()}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {own && <label><input type="checkbox" checked={!!own.only} data-testid={`panel-person-${id}-only`} onChange={(e) => { pushEdit(); setEntry(id, { only: e.target.checked || undefined }); }} /> This panel only</label>}
                        {own && <button type="button" className="text-red-700 underline" data-testid={`panel-person-${id}-clear`} onClick={() => { pushEdit(); clearEntry(id); }}>Undo this change</button>}
                        {src.kind === "app" && <button type="button" className="underline" data-testid={`panel-person-${id}-undo-app`} title="Keeps them where they were in the panel before" onClick={() => { pushEdit(); setEntry(id, { at: prevPos(id), to: undefined, facingDeg: undefined }); }}>Not this: keep them where they were</button>}
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
                          <span className="text-neutral-600">{pb?.gone ? "taken away" : pb?.with ? `in ${name(pb.with).split(" ")[0]}'s hands` : pb ? "moved" : "in its place on the scene plan"}{pb?.by === "app" ? ` (from the words: ${pb.why ?? ""})` : ""}{pb?.by === "carried" ? ` (from panel ${(from ?? 0) + 1})` : own ? (own.only ? " on this panel only" : " from this panel on") : ""}</span>
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
              <ActionButton label={props.focus ? "Save and redraw the picture" : changedPanels.length > 1 ? `Save positions (${changedPanels.length} panels)` : "Save positions"} busyLabel="Saving…" doneLabel="Saved" testId="panel-save"
                disabled={!changedPanels.length || dirty} resetKey={edits}
                title={dirty ? "Save the scene plan first" : ""}
                onAction={async () => {
                  const r = await savePanelBlockingAction(changedPanels.map(([shotId, entries]) => {
                    const { "@camera": cam, ...rest } = entries;
                    return { shotId, entries: rest, ...(cam ? { camera: { ...(cam.camera ?? {}), position: cam.at, lookAt: cam.to ?? cam.at } } : {}) };
                  }));
                  if (!r.ok) { setPanelStatus(r.error); return false; }
                  setEdits({}); setEditHistory([]);
                  if (props.focus) { props.focus.onDone(true); return; }
                  setPanelStatus("Saved. Redraw the pictures of the panels that changed.");
                  router.refresh();
                }} />
              {props.focus && <button type="button" className="text-neutral-600 underline" data-testid="panel-cancel" onClick={() => props.focus!.onDone(false)}>Cancel</button>}
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
