"use client";

import { useState } from "react";

interface BomLine {
  id: string;
  componentSku: string;
  quantity: string;
  uom: string;
  scrapRate: string;
}

interface BomItem {
  id: string;
  sku: string;
  name: string;
}

export default function BomCreatePage() {
  const [bomNumber, setBomNumber] = useState("");
  const [outputItemId, setOutputItemId] = useState("");
  const [outputItemSku, setOutputItemSku] = useState("");
  const [revision, setRevision] = useState("1.0");
  const [outputQuantity, setOutputQuantity] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [lines, setLines] = useState<BomLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const availableItems: BomItem[] = [
    { id: "1", sku: "RM-001", name: "Oak Board" },
    { id: "2", sku: "PC-001", name: "Steel Brackets" },
    { id: "3", sku: "PC-002", name: "Wood Screws" },
    { id: "4", sku: "FG-001", name: "Wooden Office Desk" },
  ];

  function addLine() {
    setLines([...lines, { id: crypto.randomUUID(), componentSku: "", quantity: "", uom: "", scrapRate: "0" }]);
  }

  function removeLine(id: string) {
    setLines(lines.filter((l) => l.id !== id));
  }

  function updateLine(index: number, field: keyof BomLine, value: string) {
    const next = [...lines];
    next[index] = { ...next[index], [field]: value };
    setLines(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body = {
        number: bomNumber,
        outputItemId,
        revision,
        outputQuantity,
        effectiveDate: effectiveDate || undefined,
        lines: lines.map((l) => ({
          componentItemId: l.componentSku, // In production this would be resolved to a UUID
          quantity: l.quantity,
          uomId: l.uom,
          scrapRate: l.scrapRate,
          notes: "",
        })),
      };
      const res = await fetch("/api/v1/boms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to create BOM");
      setNotice(`BOM ${bomNumber} created successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create BOM");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Engineering</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Create BOM</h1>
        <p className="mt-2 text-sm text-slate-600">Create a new Bill of Materials draft. Define the output item, components, quantities, and scrap rates.</p>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">BOM Header</h2>
        </div>
        <div className="p-4 space-y-4">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium">BOM Number</label>
                <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(e) => setBomNumber(e.target.value)} value={bomNumber} placeholder="BOM-DESK-001" required />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Revision</label>
                <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(e) => setRevision(e.target.value)} value={revision} required />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Output Item SKU</label>
                <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(e) => { const item = availableItems.find(i => i.sku === e.target.value); setOutputItemSku(e.target.value); setOutputItemId(item?.id || ""); }} value={outputItemSku} required>
                  <option value="">Select output item</option>
                  {availableItems.map((item) => (
                    <option key={item.id} value={item.sku}>{item.sku} · {item.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Output Quantity</label>
                <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(e) => setOutputQuantity(e.target.value)} value={outputQuantity} type="number" step="0.000001" required />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="block text-sm font-medium">Effective Date</label>
                <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(e) => setEffectiveDate(e.target.value)} value={effectiveDate} type="date" />
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 mt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">BOM Lines (Components)</h3>
              <div className="space-y-2">
                {lines.map((line, index) => (
                  <div key={line.id} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <div className="grid gap-2 md:grid-cols-4">
                        <div>
                          <label className="text-xs font-medium text-slate-500 uppercase">Component SKU</label>
                          <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs" onChange={(e) => updateLine(index, "componentSku", e.target.value)} value={line.componentSku}>
                            <option value="">Select component</option>
                            {availableItems.map((item) => (
                              <option key={item.id} value={item.sku}>{item.sku} · {item.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 uppercase">Quantity</label>
                          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs" onChange={(e) => updateLine(index, "quantity", e.target.value)} value={line.quantity} type="number" step="0.000001" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 uppercase">UOM</label>
                          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs" onChange={(e) => updateLine(index, "uom", e.target.value)} value={line.uom} placeholder="PCS" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 uppercase">Scrap Rate</label>
                          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs" onChange={(e) => updateLine(index, "scrapRate", e.target.value)} value={line.scrapRate} type="number" step="0.0001" />
                        </div>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeLine(line.id)} className="rounded-md bg-red-600 px-3 py-2 text-xs text-white hover:bg-red-700">Remove</button>
                  </div>
                ))}
                <button type="button" onClick={addLine} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  + Add Component Line
                </button>
              </div>
            </div>

            <button className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
              {loading ? "Creating..." : "Create BOM Draft"}
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">Next Steps</h2>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-slate-600">After creating the BOM draft, you can:</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-600">
            <li>Submit the BOM for review</li>
            <li>Approve the BOM (makes it immutable)</li>
            <li>View the BOM explosion (multi-level component requirements)</li>
            <li>Use the BOM in MRP runs and manufacturing orders</li>
          </ul>
          <button className="w-full rounded-md border border-blue-700 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50">
            View BOM Explorer
          </button>
        </div>
      </section>
    </div>
  );
}
