import { redirect } from "next/navigation";
import { adminContext } from "@/features/admin/server/queries";
export default async function AdminPage() {
  await adminContext();
  redirect("/admin/events");
}
