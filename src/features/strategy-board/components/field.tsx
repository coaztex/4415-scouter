"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { moveDrawing } from "../model";
import {
  drawingColor,
  stationSlots,
  stationAlliance,
  STRATEGY_INK,
  STATION_PALETTE,
  STATION_ORDER,
  UNOWNED_COLOR,
} from "../station-palette";
import type {
  BoardConfig,
  DrawingObject,
  PhaseState,
  Point,
  RobotMarker,
} from "../model";
export type Tool =
  "select" | "pen" | "line" | "arrow" | "circle" | "text" | "eraser" | "pan";
type View = { zoom: number; x: number; y: number };
type Gesture = {
  drawingId: string;
  owner: RobotMarker | null;
  id: number;
  start: Point;
  last: Point;
  points: Point[];
  marker: string | null;
  object: DrawingObject | null;
  tool: Tool;
  screenStart: Point;
  moved: boolean;
};
const initialView: View = { zoom: 1, x: 0, y: 0 };
export function FieldBoard({
  config,
  phaseId,
  state,
  tool: drawingTool,
  editable,
  owner,
  onChange,
  text,
}: {
  config: BoardConfig;
  phaseId: string;
  state: PhaseState;
  tool: Tool;
  editable: boolean;
  owner: RobotMarker | null;
  onChange: (next: PhaseState) => void;
  text: string;
}) {
  const container = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    gesture = useRef<Gesture | null>(null);
  const viewRef = useRef(initialView),
    frame = useRef<number | null>(null),
    pointers = useRef(new Map<number, Point>()),
    holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expanded, setExpanded] = useState(false),
    [navigating, setNavigating] = useState(false);
  const tool = navigating ? "pan" : drawingTool;
  const [textMenu, setTextMenu] = useState<{
    id: string;
    x: number;
    y: number;
    editing: boolean;
    value: string;
  } | null>(null);
  const [view, setView] = useState(initialView),
    [preview, setPreview] = useState<DrawingObject | null>(null),
    [drag, setDrag] = useState<{ station: string; position: Point } | null>(
      null,
    );
  const { width, height } = config.field;
  const [markerScale, setMarkerScale] = useState(1);
  useEffect(() => {
    if (!expanded) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    container.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [expanded]);
  useEffect(() => {
    const update = () => {
      const pixels = svg.current?.getBoundingClientRect().width ?? 0;
      if (pixels > 0) setMarkerScale(Math.max(1, (50 * width) / (60 * pixels)));
    };
    const frame = requestAnimationFrame(update);
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (svg.current) observer?.observe(svg.current);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [width]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );
  function clearHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }
  // Pointer/wheel events accumulate against this ref immediately. React paints
  // at most once per animation frame, never from a mutable event delta closure.
  function updateView(next: View, immediate = false) {
    viewRef.current = next;
    if (immediate) {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      setView(next);
    } else if (frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setView(viewRef.current);
      });
    }
  }
  function zoomAt(factor: number, anchor: Point, immediate = false) {
    const v = viewRef.current;
    const next = Math.max(1, Math.min(4, v.zoom * factor)),
      ratio = next / v.zoom;
    updateView(
      {
        zoom: next,
        x: anchor.x - (anchor.x - v.x) * ratio,
        y: anchor.y - (anchor.y - v.y) * ratio,
      },
      immediate,
    );
  }
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      cancel();
      setTextMenu(null);
      zoomAt(
        Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.008),
        rawPoint(event),
      );
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  });
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  function rawPoint(event: { clientX: number; clientY: number }): Point {
    // SVG owns the image and overlays; its screen matrix includes centering,
    // borders and responsive scaling before the shared pan/zoom transform.
    const matrix = svg.current?.getScreenCTM?.();
    if (matrix) {
      const screenPoint = svg.current!.createSVGPoint();
      screenPoint.x = event.clientX;
      screenPoint.y = event.clientY;
      const local = screenPoint.matrixTransform(matrix.inverse());
      return { x: local.x, y: local.y };
    }
    const rect = svg.current!.getBoundingClientRect(),
      fit = Math.min(rect.width / width, rect.height / height);
    return {
      x: (event.clientX - rect.left - (rect.width - width * fit) / 2) / fit,
      y: (event.clientY - rect.top - (rect.height - height * fit) / 2) / fit,
    };
  }
  function point(raw: Point): Point {
    const view = viewRef.current;
    return {
      x: Math.max(0, Math.min(1, (raw.x - view.x) / view.zoom / width)),
      y: Math.max(0, Math.min(1, (raw.y - view.y) / view.zoom / height)),
    };
  }
  function makeObject(g: Gesture, end: Point): DrawingObject | null {
    if (!g.owner) return null;
    const base = {
      id: g.drawingId,
      phaseId,
      ownerStation: g.owner?.station ?? null,
      ownerTeamNumber: g.owner?.teamNumber ?? null,
    };
    if (g.tool === "pen")
      return {
        ...base,
        type: "freehand",
        points: g.points.length > 1 ? g.points : [g.start, end],
      };
    if (g.tool === "line" || g.tool === "arrow")
      return { ...base, type: g.tool, start: g.start, end };
    if (g.tool === "circle")
      return {
        ...base,
        type: "circle",
        center: g.start,
        radius: Math.min(
          1,
          Math.hypot(end.x - g.start.x, ((end.y - g.start.y) * height) / width),
        ),
      };
    if (g.tool === "text" && text.trim())
      return {
        ...base,
        type: "text",
        position: end,
        text: text.trim().slice(0, 200),
      };
    return null;
  }
  function openTextMenu(object: DrawingObject, client: Point) {
    if (object.type !== "text" || !editable) return;
    setSelectedObject(object.id);
    setTextMenu({
      id: object.id,
      x: Math.max(8, Math.min(client.x, window.innerWidth - 232)),
      y: Math.max(8, Math.min(client.y, window.innerHeight - 260)),
      editing: false,
      value: object.text,
    });
  }
  function down(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const raw = rawPoint(event);
    pointers.current.set(event.pointerId, raw);
    svg.current?.setPointerCapture(event.pointerId);
    if (pointers.current.size > 1) {
      cancel(); // A second finger navigates; discard any pending object edit.
      setTextMenu(null);
      return;
    }
    if (gesture.current || (!editable && tool !== "pan")) return;
    setTextMenu(null);
    const target = event.target as Element,
      start = point(raw);
    const objectId = target
      .closest("[data-object]")
      ?.getAttribute("data-object");
    const hit = state.objects.find((o) => o.id === objectId) ?? null;
    if (tool === "eraser" && objectId) {
      onChange({
        ...state,
        objects: state.objects.filter((o) => o.id !== objectId),
      });
      return;
    }
    // Text tool places on empty field, but drags existing text by its original ID.
    const object =
      tool === "select" || (tool === "text" && hit?.type === "text")
        ? hit
        : null;
    const marker =
      tool === "select"
        ? (target.closest("[data-marker]")?.getAttribute("data-marker") ?? null)
        : null;
    const effectiveTool =
      tool === "pan" || (tool === "select" && !object && !marker)
        ? "pan"
        : tool;
    setSelectedObject(object?.id ?? null);
    const g: Gesture = {
      drawingId: crypto.randomUUID(),
      owner: owner ? { ...owner } : null,
      id: event.pointerId,
      start: effectiveTool === "pan" ? raw : start,
      last: raw,
      points: [start],
      marker,
      object,
      tool: effectiveTool,
      screenStart: { x: event.clientX, y: event.clientY },
      moved: false,
    };
    gesture.current = g;
    if (
      editable &&
      hit?.type === "text" &&
      tool !== "pan" &&
      tool !== "eraser"
    ) {
      // Holding any text opens its actions, even when a different drawing tool is active.
      g.object = hit;
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        if (gesture.current !== g || g.moved) return;
        gesture.current = null;
        setPreview(null);
        openTextMenu(hit, g.screenStart);
      }, 550);
    }
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const old = pointers.current.get(event.pointerId);
    if (!old) return;
    const raw = rawPoint(event),
      before = [...pointers.current.values()];
    pointers.current.set(event.pointerId, raw);
    if (pointers.current.size >= 2) {
      const after = [...pointers.current.values()];
      const center = (p: Point[]) => ({
        x: (p[0].x + p[1].x) / 2,
        y: (p[0].y + p[1].y) / 2,
      });
      const distance = (p: Point[]) =>
        Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const a = center(before),
        b = center(after);
      zoomAt(distance(after) / Math.max(1, distance(before)), a);
      const v = viewRef.current;
      updateView({ ...v, x: v.x + b.x - a.x, y: v.y + b.y - a.y });
      return;
    }
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    if (
      Math.hypot(
        event.clientX - g.screenStart.x,
        event.clientY - g.screenStart.y,
      ) > 6
    ) {
      g.moved = true;
      clearHold();
    }
    const end = point(raw);
    if (g.tool === "pan") {
      const v = viewRef.current;
      updateView({ ...v, x: v.x + raw.x - old.x, y: v.y + raw.y - old.y });
    } else if (g.marker) setDrag({ station: g.marker, position: end });
    else if (g.object && g.moved)
      setPreview(moveDrawing(g.object, end.x - g.start.x, end.y - g.start.y));
    else if (editable && !g.object) {
      if (g.points.length < 2000) g.points.push(end);
      setPreview(makeObject(g, end));
    }
    g.last = raw;
  }
  function up(event: PointerEvent<SVGSVGElement>) {
    clearHold();
    const wasPinching = pointers.current.size >= 2;
    pointers.current.delete(event.pointerId);
    if (wasPinching) {
      // Continue one-finger navigation after a pinch without creating a drawing.
      const remaining = [...pointers.current.entries()][0];
      gesture.current = remaining
        ? {
            id: remaining[0],
            drawingId: crypto.randomUUID(),
            owner: null,
            start: remaining[1],
            last: remaining[1],
            points: [],
            marker: null,
            object: null,
            tool: "pan",
            screenStart: { x: event.clientX, y: event.clientY },
            moved: true,
          }
        : null;
      updateView(viewRef.current, true);
      return;
    }
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const end = point(rawPoint(event));
    if (editable && g.marker && g.moved)
      onChange({
        ...state,
        markers: state.markers.map((m) =>
          m.station === g.marker ? { ...m, position: end } : m,
        ),
      });
    else if (editable && g.object) {
      if (g.moved)
        onChange({
          ...state,
          objects: state.objects.map((o) =>
            o.id === g.object!.id
              ? moveDrawing(o, end.x - g.start.x, end.y - g.start.y)
              : o,
          ),
        });
    } else if (editable && g.tool !== "pan" && !g.marker) {
      if (
        g.tool === "pen" &&
        g.points.length < 2000 &&
        (g.points.at(-1)?.x !== end.x || g.points.at(-1)?.y !== end.y)
      )
        g.points.push(end);
      const object = makeObject(g, end);
      if (object && state.objects.length < 300)
        onChange({ ...state, objects: [...state.objects, object] });
    }
    cancel();
    updateView(viewRef.current, true);
    if (svg.current?.hasPointerCapture(event.pointerId))
      svg.current.releasePointerCapture(event.pointerId);
  }
  function cancel() {
    clearHold();
    gesture.current = null;
    setPreview(null);
    setDrag(null);
  }
  function cancelPointer(event: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    cancel();
    updateView(viewRef.current, true);
  }
  function zoom(factor: number) {
    cancel();
    zoomAt(factor, { x: width / 2, y: height / 2 }, true);
  }
  function objectNode(o: DrawingObject) {
    const pos = (p: Point) => ({ x: p.x * width, y: p.y * height });
    const start = o.type === "line" || o.type === "arrow" ? pos(o.start) : null,
      end = o.type === "line" || o.type === "arrow" ? pos(o.end) : null;
    return (
      <g
        key={o.id}
        data-object={o.id}
        aria-label={`${o.type} drawing · ${o.ownerStation ? `${o.ownerStation} team ${o.ownerTeamNumber}` : "Unassigned"}`}
        data-owner-station={o.ownerStation ?? "unassigned"}
        data-owner-team={o.ownerTeamNumber ?? "unknown"}
        className={tool === "eraser" ? "cursor-pointer" : ""}
        fill="none"
        stroke="currentColor"
        strokeWidth={selectedObject === o.id ? 6 : 4}
        color={drawingColor(o.ownerStation)}
      >
        {o.type === "freehand" && (
          <polyline
            points={o.points
              .map((p) => `${p.x * width},${p.y * height}`)
              .join(" ")}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {start && end && (
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            markerEnd={
              o.type === "arrow"
                ? `url(#arrow-${phaseId}-${o.ownerStation ?? "unassigned"})`
                : undefined
            }
          />
        )}
        {o.type === "circle" && (
          <circle
            cx={o.center.x * width}
            cy={o.center.y * height}
            r={o.radius * width}
            fill="currentColor"
            fillOpacity={0.12}
          />
        )}
        {o.type === "text" && (
          <text
            x={o.position.x * width}
            y={o.position.y * height}
            fontSize={24}
            pointerEvents="bounding-box"
            fill="currentColor"
            stroke="none"
          >
            {o.text}
          </text>
        )}
      </g>
    );
  }
  return (
    <div
      ref={container}
      role={expanded ? "dialog" : undefined}
      aria-label={expanded ? "Expanded strategy field" : undefined}
      aria-modal={expanded ? true : undefined}
      onKeyDown={(event) => {
        if (!expanded) return;
        if (event.key === "Escape") {
          event.preventDefault();
          if (textMenu) setTextMenu(null);
          else {
            cancel();
            setExpanded(false);
          }
        } else if (event.key === "Tab") {
          const controls = container.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled]), input:not([disabled]), textarea:not([disabled])",
          );
          if (!controls?.length) return;
          const first = controls[0],
            last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
      className={
        expanded
          ? "fixed inset-2 z-50 flex min-w-0 flex-col gap-2 overflow-auto overscroll-contain rounded-card bg-surface p-3 shadow-xl"
          : "min-w-0 space-y-2"
      }
    >
      <div
        className="flex flex-wrap items-center gap-2"
        aria-label="Field viewport controls"
      >
        <button
          type="button"
          className="min-h-11 rounded-control border border-border px-3"
          onClick={() => zoom(1.25)}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="min-h-11 rounded-control border border-border px-3"
          onClick={() => zoom(0.8)}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="min-h-11 rounded-control border border-border px-3"
          onClick={() => {
            cancel();
            updateView(initialView, true);
          }}
        >
          Fit field
        </button>
        <button
          type="button"
          aria-pressed={navigating}
          className="min-h-11 rounded-control border border-border px-3"
          onClick={() => {
            cancel();
            setNavigating(!navigating);
          }}
        >
          Navigate field
        </button>
        <span className="text-xs text-muted">
          {Math.round(view.zoom * 100)}% ·{" "}
          {tool === "pan" ? "Drag to pan" : "Drag empty field or use Pan"}
        </span>
        {editable &&
          selectedObject &&
          state.objects.some((o) => o.id === selectedObject) && (
            <button
              type="button"
              className="min-h-11 rounded-control border border-border px-3"
              onClick={() => {
                onChange({
                  ...state,
                  objects: state.objects.filter((o) => o.id !== selectedObject),
                });
                setSelectedObject(null);
              }}
            >
              Delete selected drawing
            </button>
          )}
      </div>
      {editable &&
        state.objects.find((o) => o.id === selectedObject)?.type === "text" && (
          <button
            type="button"
            className="min-h-11 rounded-control border border-border px-3"
            onClick={() => {
              const object = state.objects.find(
                (o) => o.id === selectedObject,
              )!;
              const rect = svg.current!.getBoundingClientRect();
              openTextMenu(object, { x: rect.left + 12, y: rect.top + 12 });
            }}
          >
            Text options
          </button>
        )}
      <button
        type="button"
        className="min-h-11 self-start rounded-control border border-border px-3"
        onClick={() => {
          cancel();
          setExpanded(!expanded);
        }}
      >
        {expanded ? "Close expanded field" : "Expand field"}
      </button>
      <style>{`@keyframes strategy-text-menu-enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      {textMenu &&
        editable &&
        state.objects.some((o) => o.id === textMenu.id) && (
          <div
            role="dialog"
            aria-label="Text item options"
            className="fixed z-[60] w-56 rounded-control border border-border bg-white p-3 text-gray-900 shadow-xl motion-safe:animate-[strategy-text-menu-enter_120ms_ease-out]"
            style={{ left: textMenu.x, top: textMenu.y }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setTextMenu(null);
            }}
          >
            {textMenu.editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = textMenu.value.trim();
                  if (!value) return;
                  onChange({
                    ...state,
                    objects: state.objects.map((o) =>
                      o.id === textMenu.id && o.type === "text"
                        ? { ...o, text: value }
                        : o,
                    ),
                  });
                  setTextMenu(null);
                }}
              >
                <label className="grid gap-1 text-sm">
                  Edit text
                  <input
                    autoFocus
                    maxLength={200}
                    value={textMenu.value}
                    className="min-h-11 w-full rounded border border-gray-300 px-2"
                    onChange={(e) =>
                      setTextMenu({ ...textMenu, value: e.target.value })
                    }
                  />
                </label>
                <button
                  type="submit"
                  disabled={!textMenu.value.trim()}
                  className="min-h-11 px-3 font-semibold"
                >
                  Apply text
                </button>
              </form>
            ) : (
              <div className="grid">
                <button
                  autoFocus
                  type="button"
                  className="min-h-11 rounded px-3 text-left hover:bg-gray-100"
                  onClick={() => setTextMenu({ ...textMenu, editing: true })}
                >
                  Edit text
                </button>
                <button
                  type="button"
                  disabled={state.objects.length >= 300}
                  className="min-h-11 rounded px-3 text-left hover:bg-gray-100 disabled:opacity-40"
                  onClick={() => {
                    const object = state.objects.find(
                      (o) => o.id === textMenu.id,
                    );
                    if (!object || object.type !== "text") return;
                    const copy = moveDrawing(
                      { ...object, id: crypto.randomUUID() },
                      0.025,
                      0.025,
                    );
                    onChange({ ...state, objects: [...state.objects, copy] });
                    setSelectedObject(copy.id);
                    setTextMenu(null);
                  }}
                >
                  Duplicate text
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded px-3 text-left font-semibold hover:bg-red-50"
                  style={{ color: "#991b1b" }}
                  onClick={() => {
                    onChange({
                      ...state,
                      objects: state.objects.filter(
                        (o) => o.id !== textMenu.id,
                      ),
                    });
                    setSelectedObject(null);
                    setTextMenu(null);
                  }}
                >
                  Delete text
                </button>
              </div>
            )}
            <button
              type="button"
              className="min-h-11 px-3 text-sm"
              onClick={() => setTextMenu(null)}
            >
              Cancel
            </button>
          </div>
        )}
      <div
        className={
          expanded ? "min-h-0 flex-1 overflow-hidden" : "overflow-hidden"
        }
      >
        <svg
          ref={svg}
          role="img"
          aria-label="Match strategy field"
          viewBox={`0 0 ${width} ${height}`}
          style={{
            aspectRatio: expanded ? undefined : `${width}/${height}`,
            touchAction: "none",
            overscrollBehavior: "contain",
          }}
          className={`w-full rounded-card border border-border bg-surface select-none ${expanded ? "h-full" : ""} ${tool === "pan" ? "cursor-grab active:cursor-grabbing" : ""}`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancelPointer}
          onLostPointerCapture={(e) => {
            if (pointers.current.has(e.pointerId)) cancelPointer(e);
          }}
          onContextMenu={(e) => {
            if (editable) e.preventDefault();
          }}
        >
          <defs>
            {[...STATION_ORDER, "unassigned" as const].map((station) => (
              <marker
                key={station}
                id={`arrow-${phaseId}-${station}`}
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path
                  d="M0,0 L6,3 L0,6"
                  fill={
                    station === "unassigned"
                      ? UNOWNED_COLOR
                      : STATION_PALETTE[station]
                  }
                />
              </marker>
            ))}
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            {config.field.backgroundAsset && (
              <image
                href={config.field.backgroundAsset}
                width={width}
                height={height}
                preserveAspectRatio="xMidYMid meet"
                pointerEvents="none"
                aria-hidden="true"
              />
            )}
            {stationSlots(state.markers).map(({ station, team, color }) => {
              const anchor = config.field.stationLabels?.[station];
              if (!anchor) return null;
              return (
                <g
                  key={station}
                  data-station-label={station}
                  aria-label={`${station} team ${team?.teamNumber ?? "Unknown"}`}
                  pointerEvents="none"
                  transform={`translate(${anchor.x * width} ${anchor.y * height})`}
                >
                  <rect
                    x="-34"
                    y="-15"
                    width="68"
                    height="30"
                    rx="5"
                    fill={STRATEGY_INK}
                    stroke={color}
                  />
                  <text
                    textAnchor="middle"
                    y="5"
                    fontSize="16"
                    fontWeight="bold"
                    fill={color}
                  >
                    {team?.teamNumber ?? "Unknown"}
                  </text>
                </g>
              );
            })}
            {state.objects.map((o) =>
              objectNode(preview?.id === o.id ? preview : o),
            )}
            {preview &&
              !state.objects.some((o) => o.id === preview.id) &&
              objectNode(preview)}
            {state.markers.map((marker) => {
              const p =
                drag?.station === marker.station
                  ? drag.position
                  : marker.position;
              return (
                <g
                  key={marker.station}
                  data-marker={marker.station}
                  aria-label={`${marker.station} team ${marker.teamNumber} · ${stationAlliance(marker.station)} alliance`}
                  transform={`translate(${p.x * width} ${p.y * height})`}
                  className={tool === "select" && editable ? "cursor-grab" : ""}
                >
                  <g transform={`scale(${markerScale / view.zoom})`}>
                    <circle r="34" fill="transparent" stroke="none" />
                    <circle
                      r="30"
                      fill={STATION_PALETTE[marker.station]}
                      stroke={STRATEGY_INK}
                      strokeWidth={owner?.station === marker.station ? 4 : 1}
                    />
                    <text
                      textAnchor="middle"
                      y="-3"
                      fill={STRATEGY_INK}
                      fontSize="13"
                      pointerEvents="none"
                    >
                      {marker.station}
                    </text>
                    <text
                      textAnchor="middle"
                      y="16"
                      fill={STRATEGY_INK}
                      fontSize="18"
                      fontWeight="bold"
                      pointerEvents="none"
                    >
                      {marker.teamNumber}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="text-xs text-muted">
        {config.field.label} · Scroll or pinch to zoom.
        {editable && " Hold text for options."}
      </p>
    </div>
  );
}
