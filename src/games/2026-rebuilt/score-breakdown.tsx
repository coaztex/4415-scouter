import { z } from "zod";
const number = z.number().finite().nullish();
const alliance = z.object({
  totalAutoPoints: number,
  totalTeleopPoints: number,
  autoTowerPoints: number,
  endGameTowerPoints: number,
  totalTowerPoints: number,
  foulPoints: number,
  adjustPoints: number,
  totalPoints: number,
  hubScore: z
    .object({
      autoCount: number,
      teleopCount: number,
      totalCount: number,
      autoPoints: number,
      teleopPoints: number,
      totalPoints: number,
    })
    .nullish(),
});
const schema = z.object({ red: alliance.nullish(), blue: alliance.nullish() });
export function rebuiltBreakdownRows(input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) return [];
  const { red, blue } = result.data;
  const rows = [
    {
      section: "Auto",
      label: "FUEL scored (count)",
      red: red?.hubScore?.autoCount,
      blue: blue?.hubScore?.autoCount,
    },
    {
      section: "Auto",
      label: "FUEL points",
      red: red?.hubScore?.autoPoints,
      blue: blue?.hubScore?.autoPoints,
    },
    {
      section: "Auto",
      label: "Tower points",
      red: red?.autoTowerPoints,
      blue: blue?.autoTowerPoints,
    },
    {
      section: "Auto",
      label: "Total auto points",
      red: red?.totalAutoPoints,
      blue: blue?.totalAutoPoints,
    },
    {
      section: "Teleop",
      label: "FUEL scored (count)",
      red: red?.hubScore?.teleopCount,
      blue: blue?.hubScore?.teleopCount,
    },
    {
      section: "Teleop",
      label: "FUEL points",
      red: red?.hubScore?.teleopPoints,
      blue: blue?.hubScore?.teleopPoints,
    },
    {
      section: "Teleop",
      label: "Endgame tower points",
      red: red?.endGameTowerPoints,
      blue: blue?.endGameTowerPoints,
    },
    {
      section: "Teleop",
      label: "Total teleop points",
      red: red?.totalTeleopPoints,
      blue: blue?.totalTeleopPoints,
    },
    {
      section: "Totals",
      label: "FUEL scored (count)",
      red: red?.hubScore?.totalCount,
      blue: blue?.hubScore?.totalCount,
    },
    {
      section: "Totals",
      label: "Tower points",
      red: red?.totalTowerPoints,
      blue: blue?.totalTowerPoints,
    },
    {
      section: "Totals",
      label: "Foul points credited",
      red: red?.foulPoints,
      blue: blue?.foulPoints,
    },
    {
      section: "Totals",
      label: "Adjustment points",
      red: red?.adjustPoints,
      blue: blue?.adjustPoints,
    },
    {
      section: "Totals",
      label: "Official total",
      red: red?.totalPoints,
      blue: blue?.totalPoints,
    },
  ];
  return rows.filter((row) => row.red != null || row.blue != null);
}
export function RebuiltScoreBreakdown({ payload }: { payload: unknown }) {
  const rows = rebuiltBreakdownRows(payload);
  if (!rows.length)
    return <p className="text-muted">Detailed score breakdown unavailable.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="pb-3 text-left text-muted">
          Official TBA alliance totals · counts and points are shown separately.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="p-2">
              Component
            </th>
            <th scope="col" className="p-2 text-right">
              Red
            </th>
            <th scope="col" className="p-2 text-right">
              Blue
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.section}-${row.label}`}
              className="border-t border-border"
            >
              <th scope="row" className="p-2 font-normal">
                <span className="text-xs text-muted">{row.section} · </span>
                {row.label}
              </th>
              <td className="p-2 text-right tabular-nums">{row.red ?? "—"}</td>
              <td className="p-2 text-right tabular-nums">{row.blue ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
