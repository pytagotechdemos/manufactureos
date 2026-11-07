import type { Metadata } from "next";
import { requireCurrentUser } from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Overview | ManufactureOS",
};

export default async function OverviewPage() {
  const user = await requireCurrentUser();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Operations</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-2 text-sm text-slate-600">Welcome, {user.name}. Operational metrics will appear as verified modules are implemented.</p>
      </div>
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8">
        <h2 className="font-semibold text-slate-900">Workspace foundation</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          No production metrics are shown yet. ManufactureOS will display live manufacturing, inventory, purchasing, and quality data after those workflows are implemented and connected to the database.
        </p>
      </section>
    </div>
  );
}
