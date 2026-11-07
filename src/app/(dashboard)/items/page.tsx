"use client";

import { useState } from "react";

interface Item {
  id: string;
  sku: string;
  name: string;
  category: string;
  itemType: string;
  supplyType: string;
  status: string;
}

export default function ItemsPage() {
  const [search, setSearch] = useState("");
  const items: Item[] = [
    { id: "1", sku: "RM-001", name: "Oak Board", category: "Raw Material", itemType: "RAW_MATERIAL", supplyType: "BUY", status: "ACTIVE" },
    { id: "2", sku: "PC-001", name: "Steel Brackets", category: "Purchased Component", itemType: "PURCHASED_COMPONENT", supplyType: "BUY", status: "ACTIVE" },
    { id: "3", sku: "FG-001", name: "Wooden Office Desk", category: "Finished Goods", itemType: "FINISHED_GOODS", supplyType: "MAKE", status: "ACTIVE" },
  ];

  const filteredItems = items.filter((item) =>
    item.sku.toLowerCase().includes(search.toLowerCase()) ||
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Master Data</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Item Master</h1>
        <p className="mt-2 text-sm text-slate-600">Manage item master data - raw materials, purchased components, sub-assemblies, and finished goods.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Item Master</h2>
            <p className="mt-1 text-sm text-slate-500">Manage items, raw materials, purchased components, sub-assemblies, and finished goods.</p>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Search items..."
                onChange={(event) => setSearch(event.target.value)}
                value={search}
              />
              <button className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 mt-2">
                Create New Item
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">SKU</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Type</th>
                    <th className="px-4 py-3 text-right">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-3 font-medium">{item.sku}</td>
                      <td className="px-4 py-3">{item.name}</td>
                      <td className="px-4 py-3 text-slate-600">{item.category}</td>
                      <td className="px-4 py-3 text-slate-600">{item.itemType}</td>
                      <td className="px-4 py-3"><span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">{item.status}</span></td>
                      <td className="px-5 py-3 text-right">
                        <button className="text-sm text-blue-600 hover:underline mr-2">View</button>
                        <button className="text-sm text-slate-600 hover:underline">Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
