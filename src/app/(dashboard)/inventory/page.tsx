import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";

export default async function InventoryPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  await requirePermission(user.id, "inventory.read");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Inventory</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="mt-2 text-sm text-slate-600">Stock balances, receipts, issues, transfers, and adjustments.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Stock Balances</h2>
          </div>
          <div className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-4 py-3 text-right">On Hand</th>
                    <th className="px-4 py-3 text-right">Reserved</th>
                    <th className="px-4 py-3 text-right">Blocked</th>
                    <th className="px-5 py-3 text-right">Available</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-3 py-2">No items</td>
                      <td className="px-4 py-3 text-right">0</td>
                      <td className="px-4 py-3 text-right">0</td>
                      <td className="px-4 py-3 text-right">0</td>
                      <td className="px-5 py-3 text-right">0</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">Post Goods Receipt</h2>
          <form className="mt-4 space-y-4">
            <label className="block text-sm font-medium">Item SKU</label>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="text" placeholder="Item SKU" />
            <label className="block text-sm font-medium">Quantity</label>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="number" step="0.000001" />
            <label className="block text-sm font-medium">Source Document</label>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="PO number" />
            <label className="block text-sm font-medium">Unit Cost</label>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="number" step="0.0001" />
            <button className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
              Post Receipt
            </button>
          </form>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">Issue Material</h2>
          <form className="mt-4 space-y-4">
            <label className="block text-sm font-medium">Manufacturing Order</label>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="text" placeholder="MO number" />
            <label className="block text-sm font-medium">Item</label>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="text" placeholder="Item SKU" />
            <label className="block text-sm font-medium">Quantity</label>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="number" step="0.000001" />
            <button className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
              Post Issue
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
