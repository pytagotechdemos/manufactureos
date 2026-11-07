import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";

export default async function ManufacturingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  await requirePermission(user.id, "manufacturing_order.release");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Manufacturing</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Manufacturing Orders</h1>
        <p className="mt-2 text-sm text-slate-600">Create, release, and track manufacturing orders.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">Create Manufacturing Order</h2>
          <form className="mt-4 space-y-4">
            <label className="block text-sm font-medium">MO Number</label>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="text" placeholder="MO-2026-001" />
            <label className="block text-sm font-medium">Product SKU</label>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="text" placeholder="Item SKU" />
            <label className="block text-sm font-medium">Target Quantity</label>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="number" step="0.000001" />
            <label className="block text-sm font-medium">Source Demand</label>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="text" placeholder="Demand ref (optional)" />
            <button className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
              Create MO
            </button>
          </form>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">Active Orders</h2>
          <div className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">MO Number</th>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Target Qty</th>
                    <th className="px-4 py-3 text-right">Completed</th>
                    <th className="px-5 py-3">Status</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-5 py-3">No orders</td>
                      <td className="px-4 py-3">-</td>
                      <td className="px-4 py-3">-</td>
                      <td className="px-4 py-3 text-right">-</td>
                      <td className="px-5 py-3">-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
        </section>
      </div>
    </div>
  );
}
