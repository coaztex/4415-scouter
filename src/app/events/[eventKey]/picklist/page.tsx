import { PageHeading } from "@/components/layout/page-heading";
import { getPicklist } from "@/features/picklist/server/queries";
import { PicklistWorkspace } from "@/features/picklist/components/workspace";
export default async function PicklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventKey: string }>;
  searchParams: Promise<{ snapshot?: string }>;
}) {
  const { eventKey } = await params;
  const { snapshot } = await searchParams;
  const workspace = await getPicklist(eventKey, snapshot);
  return (
    <>
      <PageHeading
        title="Picklist"
        description="Rank teams using role-specific evidence and your own selection order."
      />
      <PicklistWorkspace key={snapshot ?? "live"} data={workspace} />
    </>
  );
}
