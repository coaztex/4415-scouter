import { getMatchPrep } from "@/features/match-prep/server/queries";
import { MatchPrep } from "@/features/match-prep/components/prep";

export default async function MatchPrepPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventKey: string }>;
  searchParams: Promise<{ match?: string | string[] }>;
}) {
  const [{ eventKey }, query] = await Promise.all([params, searchParams]);
  const selectedKey = typeof query.match === "string" ? query.match : undefined;
  const prep = await getMatchPrep(eventKey, selectedKey);
  return <MatchPrep prep={prep} eventKey={eventKey} />;
}
