import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlanningScreen } from "@/components/planning/planning-screen";
import { requireCurrentUser } from "@/lib/auth-session";
import { userHasPermission } from "@/lib/authorize";

export const metadata: Metadata = { title: "Planning | ManufactureOS" };

export default async function PlanningPage() {
  const user = await requireCurrentUser();
  const [canReadDemands, canCreateDemand, canReleaseDemand, canRunMrp] = await Promise.all([
    userHasPermission(user.id, "production_demand.read"),
    userHasPermission(user.id, "production_demand.create"),
    userHasPermission(user.id, "production_demand.release"),
    userHasPermission(user.id, "mrp.run"),
  ]);
  if (!canReadDemands && !canRunMrp) redirect("/overview");
  return <PlanningScreen permissions={{ canReadDemands, canCreateDemand, canReleaseDemand, canRunMrp }} />;
}
