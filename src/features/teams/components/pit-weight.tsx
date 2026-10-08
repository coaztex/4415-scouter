export function PitWeight({ weightLbs }: { weightLbs: number | null }) {
  return (
    <div>
      <dt className="text-sm text-muted">Weight</dt>
      <dd className="text-lg font-bold">
        {weightLbs === null ? "Unknown" : `${weightLbs} lb`}
      </dd>
      <p className="text-xs text-muted">
        Pit reported · excludes battery and bumpers.
      </p>
    </div>
  );
}
