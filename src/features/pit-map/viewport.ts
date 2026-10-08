import type { PitMapLayout } from "./model";
export type Point = { x: number; y: number };
export type MapView = Point & { scale: number };
export type PitMapViewMode = "pits" | "venue";
export type MapBounds = Point & { width: number; height: number };
export type MapViewportMemory = Partial<
  Record<
    PitMapViewMode,
    {
      view: MapView;
      viewportWidth: number;
      viewportHeight: number;
      boundsKey: string;
    }
  >
>;

/** A framing decision only: normalized map coordinates stay unchanged. */
export function pitBounds(pits: PitMapLayout["pits"]): MapBounds | null {
  if (!pits.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const pit of pits) {
    if (
      ![pit.x, pit.y, pit.width, pit.height].every(Number.isFinite) ||
      pit.width <= 0 ||
      pit.height <= 0
    )
      continue;
    minX = Math.min(minX, pit.x);
    minY = Math.min(minY, pit.y);
    maxX = Math.max(maxX, pit.x + pit.width);
    maxY = Math.max(maxY, pit.y + pit.height);
  }
  if (!Number.isFinite(minX)) return null;
  const width = maxX - minX,
    height = maxY - minY;
  return {
    x: minX - width * 0.075,
    y: minY - height * 0.075,
    width: width * 1.15,
    height: height * 1.15,
  };
}
export function mapViewBounds(
  map: PitMapLayout,
  mode: PitMapViewMode,
): MapBounds | null {
  if (mode === "pits") {
    const bounds = pitBounds(map.pits);
    if (bounds) return bounds;
  }
  return map.width !== null && map.height !== null
    ? { x: 0, y: 0, width: map.width, height: map.height }
    : null;
}
export function fitMapBounds(
  bounds: MapBounds,
  viewportWidth: number,
  viewportHeight: number,
): MapView {
  const view = fitMap(
    bounds.width,
    bounds.height,
    viewportWidth,
    viewportHeight,
  );
  return {
    ...view,
    x: view.x - bounds.x * view.scale,
    y: view.y - bounds.y * view.scale,
  };
}
export function fitMap(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): MapView {
  const scale = Math.max(
    0.0001,
    Math.min(
      Math.max(1, viewportWidth - 32) / width,
      Math.max(1, viewportHeight - 32) / height,
    ),
  );
  return {
    scale,
    x: (viewportWidth - width * scale) / 2,
    y: (viewportHeight - height * scale) / 2,
  };
}
export function zoomMap(
  view: MapView,
  factor: number,
  anchor: Point,
  fitScale: number,
): MapView {
  const scale = Math.max(
    fitScale * 0.75,
    Math.min(fitScale * 20, view.scale * factor),
  );
  const ratio = scale / view.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
  };
}
export function panMap(view: MapView, delta: Point): MapView {
  return { ...view, x: view.x + delta.x, y: view.y + delta.y };
}
export function pinchMap(
  view: MapView,
  before: [Point, Point],
  after: [Point, Point],
  fitScale: number,
): MapView {
  const center = (points: [Point, Point]) => ({
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2,
  });
  const distance = (points: [Point, Point]) =>
    Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  const oldCenter = center(before),
    newCenter = center(after);
  return panMap(
    zoomMap(
      view,
      distance(after) / Math.max(1, distance(before)),
      oldCenter,
      fitScale,
    ),
    { x: newCenter.x - oldCenter.x, y: newCenter.y - oldCenter.y },
  );
}
