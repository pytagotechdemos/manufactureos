import type { Metadata } from "next";
import { BomExplorer } from "@/components/engineering/bom-explorer";
import { requireCurrentUser } from "@/lib/auth-session";
import { userHasPermission } from "@/lib/authorize";

export const metadata: Metadata = {
  title: "Bill of Materials (BOM)",
};

export default async function EngineeringPage() {
  const user = await requireCurrentUser();
  const [canCreate, canApprove] = await Promise.all([
    userHasPermission(user.id, "bom.create"),
    userHasPermission(user.id, "bom.approve"),
  ]);
  return <BomExplorer canApprove={canApprove} canCreate={canCreate} />;
}
