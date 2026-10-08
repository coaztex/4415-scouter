"use client";
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { PitMapToolbar } from "./pit-map-toolbar";
import {
  fitMapBounds,
  panMap,
  pinchMap,
  zoomMap,
  type MapView,
  type Point,
  type MapBounds,
  type PitMapViewMode,
  type MapViewportMemory,
} from "../viewport";

/** Gesture updates touch one SVG transform via rAF; no React pointer state. */
export function PitMapViewport({
  bounds,
  mode,
  onModeChange,
  hasPits,
  memory,
  expanded = false,
  children,
}: {
  bounds: MapBounds;
  mode: PitMapViewMode;
  onModeChange: (mode: PitMapViewMode) => void;
  hasPits: boolean;
  memory: RefObject<MapViewportMemory>;
  expanded?: boolean;
  children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    layer = useRef<SVGGElement>(null);
  const actions = useRef<{ fit: () => void; zoom: (factor: number) => void }>({
    fit: () => {},
    zoom: () => {},
  });
  const instructions = useId();
  const { x: boundsX, y: boundsY, width, height } = bounds;
  useEffect(() => {
    const node = viewport.current,
      group = layer.current;
    if (!node || !group) return;
    const savedViews = memory.current;
    let view: MapView = { x: 0, y: 0, scale: 1 },
      baseline = 1,
      frame = 0,
      moved = false,
      suppressClick = false;
    const pointers = new Map<number, Point>();
    const starts = new Map<number, Point>();
    const size = () => ({
      width: node.clientWidth || 320,
      height: node.clientHeight || 300,
    });
    const point = (e: { clientX: number; clientY: number }) => {
      const bounds = node.getBoundingClientRect();
      return { x: e.clientX - bounds.left, y: e.clientY - bounds.top };
    };
    const paint = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        group.setAttribute(
          "transform",
          `translate(${view.x} ${view.y}) scale(${view.scale})`,
        );
      });
    };
    const boundsKey = `${boundsX},${boundsY},${width},${height}`;
    const fit = () => {
      const s = size();
      view = fitMapBounds(
        { x: boundsX, y: boundsY, width, height },
        s.width,
        s.height,
      );
      baseline = view.scale;
      paint();
    };
    const zoom = (factor: number) => {
      const s = size();
      view = zoomMap(
        view,
        factor,
        { x: s.width / 2, y: s.height / 2 },
        baseline,
      );
      paint();
    };
    actions.current = { fit, zoom };
    fit();
    const remembered = savedViews[mode],
      currentSize = size();
    if (
      remembered &&
      remembered.boundsKey === boundsKey &&
      remembered.viewportWidth === currentSize.width &&
      remembered.viewportHeight === currentSize.height
    ) {
      view = { ...remembered.view };
      paint();
    }
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            const next = size();
            if (
              next.width !== currentSize.width ||
              next.height !== currentSize.height
            ) {
              currentSize.width = next.width;
              currentSize.height = next.height;
              fit();
            }
          })
        : null;
    observer?.observe(node);
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (!pointers.size) {
        moved = false;
        suppressClick = false;
      }
      const p = point(e);
      pointers.set(e.pointerId, p);
      starts.set(e.pointerId, p);
      if (pointers.size > 1) moved = true;
      // Capture on the original SVG target so a stationary tap remains a link click.
      const target = e.target as Element;
      target.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const old = pointers.get(e.pointerId);
      if (!old) return;
      const before = [...pointers.values()],
        p = point(e),
        start = starts.get(e.pointerId)!;
      pointers.set(e.pointerId, p);
      if (Math.hypot(p.x - start.x, p.y - start.y) > 6) moved = true;
      if (!moved) return;
      view =
        pointers.size >= 2
          ? pinchMap(
              view,
              before.slice(0, 2) as [Point, Point],
              [...pointers.values()].slice(0, 2) as [Point, Point],
              baseline,
            )
          : panMap(view, { x: p.x - old.x, y: p.y - old.y });
      paint();
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      starts.delete(e.pointerId);
      if (!pointers.size) suppressClick = moved;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      view = zoomMap(
        view,
        Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.008),
        point(e),
        baseline,
      );
      paint();
    };
    const click = (e: MouseEvent) => {
      if (suppressClick && e.detail !== 0) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.target !== node) return; // Link Enter and ordinary Tab keep native behavior.
      const deltas: Record<string, Point> = {
        ArrowLeft: { x: 40, y: 0 },
        ArrowRight: { x: -40, y: 0 },
        ArrowUp: { x: 0, y: 40 },
        ArrowDown: { x: 0, y: -40 },
      };
      if (deltas[e.key]) {
        e.preventDefault();
        view = panMap(view, deltas[e.key]);
        paint();
      } else if (["+", "=", "-", "0", "Home"].includes(e.key)) {
        e.preventDefault();
        if (e.key === "0" || e.key === "Home") fit();
        else zoom(e.key === "-" ? 0.8 : 1.25);
      }
    };
    const focus = (e: FocusEvent) => {
      const link = (e.target as Element).closest?.("[data-pit-rect]");
      const rect = link?.getAttribute("data-pit-rect")?.split(",").map(Number);
      if (!rect || rect.length !== 4 || !rect.every(Number.isFinite)) return;
      const [x, y, w, h] = rect,
        s = size();
      if (
        x * view.scale + view.x < 0 ||
        y * view.scale + view.y < 0 ||
        (x + w) * view.scale + view.x > s.width ||
        (y + h) * view.scale + view.y > s.height
      ) {
        view = {
          ...view,
          x: s.width / 2 - (x + w / 2) * view.scale,
          y: s.height / 2 - (y + h / 2) * view.scale,
        };
        paint();
      }
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
    node.addEventListener("wheel", wheel, { passive: false });
    node.addEventListener("click", click, true);
    node.addEventListener("keydown", key);
    node.addEventListener("focusin", focus);
    window.addEventListener("resize", fit);
    return () => {
      const s = size();
      savedViews[mode] = {
        view: { ...view },
        viewportWidth: s.width,
        viewportHeight: s.height,
        boundsKey,
      };
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
      node.removeEventListener("wheel", wheel);
      node.removeEventListener("click", click, true);
      node.removeEventListener("keydown", key);
      node.removeEventListener("focusin", focus);
      window.removeEventListener("resize", fit);
    };
  }, [boundsX, boundsY, width, height, mode, memory]);
  return (
    <div
      className={expanded ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-2"}
    >
      <PitMapToolbar
        mode={mode}
        onModeChange={onModeChange}
        hasPits={hasPits}
        onFit={() => actions.current.fit()}
        onZoom={(factor) => actions.current.zoom(factor)}
        instructionsId={instructions}
      />
      <div
        ref={viewport}
        role="region"
        aria-label="Interactive pit map"
        aria-describedby={instructions}
        tabIndex={0}
        className={`pit-map-viewport relative select-none overflow-hidden rounded-control border border-border bg-surface-subtle outline-offset-2 ${expanded ? "min-h-0 flex-1" : "h-[300px] md:h-[400px]"}`}
        style={{ touchAction: "none", overscrollBehavior: "contain" }}
      >
        <svg width="100%" height="100%" aria-label="Event pit layout">
          <g ref={layer}>{children}</g>
        </svg>
      </div>
    </div>
  );
}
