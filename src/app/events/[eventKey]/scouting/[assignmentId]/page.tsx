import { redirect } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ eventKey: string; assignmentId: string }>;
}) {
  const { eventKey, assignmentId } = await params;
  redirect(`/events/${eventKey}/scout/match/${assignmentId}`);
}
