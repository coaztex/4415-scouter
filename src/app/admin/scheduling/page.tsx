import { SchedulingWorkspace } from "@/features/scheduling/components/workspace";
export const metadata = { title: "Scout Scheduling" };
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; page?: string }>;
}) {
  return (
    <SchedulingWorkspace
      searchParams={searchParams}
      basePath="/admin/scheduling"
    />
  );
}
