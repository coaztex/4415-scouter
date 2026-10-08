export function PitMapHelp({ instructionsId }: { instructionsId: string }) {
  return (
    <details className="relative ml-auto text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-control border border-border px-3 font-semibold">
        ? Help
      </summary>
      <p
        id={instructionsId}
        className="absolute right-0 z-10 mt-2 w-[min(18rem,calc(100vw-4rem))] rounded-control border border-border bg-surface p-3 text-xs leading-relaxed shadow-lg"
      >
        Drag to pan · pinch or scroll to zoom. Keyboard: arrows to pan, + / − to
        zoom, 0 or Home to fit the selected view. Tab to a pit, then Enter to
        open.
      </p>
    </details>
  );
}
