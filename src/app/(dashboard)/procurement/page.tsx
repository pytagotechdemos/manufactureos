"use client";

import Link from "next/link";
import Decimal from "decimal.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, SearchInput, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatMoney, formatQuantity, todayJakarta } from "@/lib/format";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Download, FileText, ShoppingBag, Truck, X } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { downloadCsv } from "@/lib/csv";

type PurchaseOrder = {
  id: string;
  number: string;
  warehouseId?: string;
  supplier: { code: string; name: string } | null;
  status: string;
  expectedDelivery: string | null;
  totalAmount: string;
  createdAt: string;
  lines: { id: string; item: { sku: string; name: string }; orderedQty: string; receivedQty: string; unitCost?: string }[];
  _count: { receipts: number };
};

type PurchaseRequestAllocation = {
  id: string;
  quantity: string;
  orderId: string;
  orderLineId: string;
};

type PurchaseRequestLine = {
  id: string;
  itemId: string;
  quantity: string;
  uomId: string;
  neededBy: string | null;
  notes: string | null;
  item: { sku: string; name: string; baseUom?: { code: string } | null };
  uom?: { id: string; code: string; name: string } | null;
  allocations?: PurchaseRequestAllocation[];
};

type PurchaseRequest = {
  id: string;
  number: string;
  supplierId: string | null;
  supplier: { code: string; name: string } | null;
  status: "DRAFT" | "APPROVED" | "CANCELLED";
  requestedById: string;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  lines: PurchaseRequestLine[];
};

type GoodsReceipt = {
  id: string;
  number: string;
  order?: { number: string; supplier: { code: string; name: string } | null } | null;
  purchaseOrder?: { number: string; supplier: { code: string; name: string } | null } | null;
  status: string;
  postedAt: string | null;
  createdAt: string;
};

type Supplier = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string; isWip: boolean };
type Item = { id: string; sku: string; name: string; baseUom: { code: string } | null };
type Uom = { id: string; code: string; name: string };
type PoLine = {
  id: string;
  sequence: number;
  orderId?: string;
  orderedQty: string;
  receivedQty: string;
  item: { sku: string; name: string };
  order?: { id: string; number: string; supplier: { code: string } | null };
  purchaseOrder?: { id: string; number: string; supplier: { code: string } | null };
};

type AllocatedPrInfo = {
  prNumber: string;
  lineId: string;
  itemSku: string;
  remainingQty: string;
  uomCode: string;
};

export default function ProcurementPage() {
  const [activeTab, setActiveTab] = useState<"orders" | "requests" | "receipts">("orders");
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [poLines, setPoLines] = useState<PoLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<React.ReactNode | null>(null);
  const [search, setSearch] = useState("");
  const [requestSearch, setRequestSearch] = useState("");
  const [expandedPrs, setExpandedPrs] = useState<Record<string, boolean>>({});

  const [poPage, setPoPage] = useState(1);
  const [poPageSize, setPoPageSize] = useState(15);
  const [prPage, setPrPage] = useState(1);
  const [prPageSize, setPrPageSize] = useState(15);
  const [grPage, setGrPage] = useState(1);
  const [grPageSize, setGrPageSize] = useState(15);

  useEffect(() => {
    setPoPage(1);
  }, [search]);

  useEffect(() => {
    setPrPage(1);
  }, [requestSearch]);

  // Form states for PO
  const [poSupplierId, setPoSupplierId] = useState("");
  const [poWarehouseId, setPoWarehouseId] = useState("");
  const [poItemId, setPoItemId] = useState("");
  const [poUomId, setPoUomId] = useState("");
  const [poQuantity, setPoQuantity] = useState("");
  const [poUnitCost, setPoUnitCost] = useState("");
  const [poAllocatedPrLine, setPoAllocatedPrLine] = useState<AllocatedPrInfo | null>(null);

  // Form states for PR
  const [prSupplierId, setPrSupplierId] = useState("");
  const [prItemId, setPrItemId] = useState("");
  const [prUomId, setPrUomId] = useState("");

  // Form states for GR
  const [grPurchaseOrderId, setGrPurchaseOrderId] = useState("");
  const [grWarehouseId, setGrWarehouseId] = useState("");
  const [selectedGrLineId, setSelectedGrLineId] = useState("");
  const [grQuantity, setGrQuantity] = useState("");

  const handleSelectPoItem = useCallback((itemId: string) => {
    setPoItemId(itemId);
    const it = items.find((candidate) => candidate.id === itemId);
    if (it?.baseUom?.code) {
      const matchingUom = uoms.find((u) => u.code === it.baseUom?.code);
      if (matchingUom) {
        setPoUomId(matchingUom.id);
      }
    }
  }, [items, uoms]);

  const handleSelectPrItem = useCallback((itemId: string) => {
    setPrItemId(itemId);
    const it = items.find((candidate) => candidate.id === itemId);
    if (it?.baseUom?.code) {
      const matchingUom = uoms.find((u) => u.code === it.baseUom?.code);
      if (matchingUom) {
        setPrUomId(matchingUom.id);
      }
    }
  }, [items, uoms]);

  function suggestPoNumber() {
    const stamp = todayJakarta().replace(/-/g, "");
    return `PO-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function suggestPrNumber() {
    const stamp = todayJakarta().replace(/-/g, "");
    return `PR-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function suggestGrNumber() {
    const stamp = todayJakarta().replace(/-/g, "");
    return `GR-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [poRes, prRes, grRes, supRes, whRes, itemRes, uomRes, lineRes] = await Promise.all([
        fetch("/api/v1/procurement/purchase-orders?limit=100&offset=0"),
        fetch("/api/v1/procurement/purchase-requests?limit=100&offset=0"),
        fetch("/api/v1/procurement/goods-receipts?limit=100&offset=0"),
        fetch("/api/v1/suppliers"),
        fetch("/api/v1/warehouses"),
        fetch("/api/v1/items?limit=100"),
        fetch("/api/v1/uoms"),
        fetch("/api/v1/purchase-order-lines?limit=100"),
      ]);
      if (!poRes.ok || !grRes.ok || !supRes.ok || !whRes.ok || !itemRes.ok || !uomRes.ok || !lineRes.ok) {
        throw new Error("Gagal memuat data pembelian");
      }
      const [poJson, grJson, supJson, whJson, itemJson, uomJson, lineJson] = await Promise.all([
        poRes.json(), grRes.json(), supRes.json(), whRes.json(), itemRes.json(), uomRes.json(), lineRes.json(),
      ]);

      const allOrders = [...(poJson.data ?? [])];
      const orderOffsets = Array.from({ length: Math.max(0, Math.ceil(Number(poJson.page?.total ?? allOrders.length) / 100) - 1) }, (_, index) => (index + 1) * 100);
      for (let index = 0; index < orderOffsets.length; index += 10) {
        const pages = await Promise.all(orderOffsets.slice(index, index + 10).map(async (offset) => {
          const response = await fetch(`/api/v1/procurement/purchase-orders?limit=100&offset=${offset}`);
          if (!response.ok) throw new Error("Gagal memuat seluruh pesanan pembelian");
          return response.json();
        }));
        allOrders.push(...pages.flatMap((page) => page.data ?? []));
      }

      if (prRes.ok) {
        const prJson = await prRes.json();
        const allRequests = [...(prJson.data ?? [])];
        const requestOffsets = Array.from({ length: Math.max(0, Math.ceil(Number(prJson.page?.total ?? allRequests.length) / 100) - 1) }, (_, index) => (index + 1) * 100);
        for (let index = 0; index < requestOffsets.length; index += 10) {
          const pages = await Promise.all(requestOffsets.slice(index, index + 10).map(async (offset) => {
            const response = await fetch(`/api/v1/procurement/purchase-requests?limit=100&offset=${offset}`);
            if (!response.ok) return { data: [] };
            return response.json();
          }));
          allRequests.push(...pages.flatMap((page) => page.data ?? []));
        }
        setPurchaseRequests(allRequests);
      }

      const allReceipts = [...(grJson.data ?? [])];
      const receiptOffsets = Array.from({ length: Math.max(0, Math.ceil(Number(grJson.page?.total ?? allReceipts.length) / 100) - 1) }, (_, index) => (index + 1) * 100);
      for (let index = 0; index < receiptOffsets.length; index += 10) {
        const pages = await Promise.all(receiptOffsets.slice(index, index + 10).map(async (offset) => {
          const response = await fetch(`/api/v1/procurement/goods-receipts?limit=100&offset=${offset}`);
          if (!response.ok) throw new Error("Gagal memuat seluruh penerimaan barang");
          return response.json();
        }));
        allReceipts.push(...pages.flatMap((page) => page.data ?? []));
      }

      setPurchaseOrders(allOrders);
      setGoodsReceipts(allReceipts);
      setSuppliers(supJson.data ?? []);
      setWarehouses((whJson.data ?? []).filter((warehouse: Warehouse) => !warehouse.isWip));
      setItems(itemJson.data ?? []);
      setUoms(uomJson.data ?? []);

      const lineTotal = Number(lineJson.page?.total ?? lineJson.data?.length ?? 0);
      const lineOffsets = Array.from({ length: Math.max(0, Math.ceil(lineTotal / 100) - 1) }, (_, index) => (index + 1) * 100);
      const linePages: Array<{ data?: PoLine[] }> = [];
      for (let index = 0; index < lineOffsets.length; index += 10) {
        linePages.push(...await Promise.all(lineOffsets.slice(index, index + 10).map(async (offset) => {
          const response = await fetch(`/api/v1/purchase-order-lines?limit=100&offset=${offset}`);
          if (!response.ok) throw new Error("Gagal memuat seluruh baris pesanan pembelian");
          return response.json();
        })));
      }
      setPoLines([...(lineJson.data ?? []), ...linePages.flatMap((page) => page.data ?? [])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data pembelian");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof window !== "undefined" && items.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      const itemIdParam = params.get("itemId");
      const qtyParam = params.get("quantity");
      if (tabParam === "requests" || tabParam === "receipts" || tabParam === "orders") {
        setActiveTab(tabParam);
      }
      if (itemIdParam) {
        if (tabParam === "requests") {
          handleSelectPrItem(itemIdParam);
        } else {
          handleSelectPoItem(itemIdParam);
          if (qtyParam) setPoQuantity(qtyParam);
        }
      }
    }
  }, [items, handleSelectPoItem, handleSelectPrItem]);

  const filteredOrders = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return purchaseOrders;
    return purchaseOrders.filter(
      (order) =>
        order.number.toLowerCase().includes(needle) ||
        (order.supplier?.name ?? "").toLowerCase().includes(needle) ||
        (order.supplier?.code ?? "").toLowerCase().includes(needle),
    );
  }, [purchaseOrders, search]);

  const filteredRequests = useMemo(() => {
    const needle = requestSearch.trim().toLowerCase();
    if (!needle) return purchaseRequests;
    return purchaseRequests.filter(
      (req) =>
        req.number.toLowerCase().includes(needle) ||
        (req.supplier?.name ?? "").toLowerCase().includes(needle) ||
        (req.supplier?.code ?? "").toLowerCase().includes(needle) ||
        req.lines.some(
          (l) =>
            l.item.sku.toLowerCase().includes(needle) ||
            l.item.name.toLowerCase().includes(needle),
        ),
    );
  }, [purchaseRequests, requestSearch]);

  const paginatedOrders = useMemo(() => {
    const start = (poPage - 1) * poPageSize;
    return filteredOrders.slice(start, start + poPageSize);
  }, [filteredOrders, poPage, poPageSize]);

  const paginatedRequests = useMemo(() => {
    const start = (prPage - 1) * prPageSize;
    return filteredRequests.slice(start, start + prPageSize);
  }, [filteredRequests, prPage, prPageSize]);

  const paginatedReceipts = useMemo(() => {
    const start = (grPage - 1) * grPageSize;
    return goodsReceipts.slice(start, start + grPageSize);
  }, [goodsReceipts, grPage, grPageSize]);

  function exportPoCsv() {
    downloadCsv(
      `pesanan-pembelian-${todayJakarta()}.csv`,
      ["Nomor PO", "Kode Supplier", "Nama Supplier", "Status", "Jumlah Baris", "Total Nilai", "Estimasi Pengiriman", "Waktu Dibuat"],
      filteredOrders.map((order) => [
        order.number,
        order.supplier?.code ?? "",
        order.supplier?.name ?? "",
        order.status,
        order.lines?.length ?? 0,
        order.totalAmount,
        order.expectedDelivery ? formatDate(order.expectedDelivery) : "",
        formatDateTime(order.createdAt),
      ]),
    );
  }

  function exportPrCsv() {
    downloadCsv(
      `permintaan-pembelian-${todayJakarta()}.csv`,
      ["Nomor PR", "Kode Supplier", "Nama Supplier", "Status", "SKU Barang", "Nama Barang", "Kuantitas", "Satuan", "Dibutuhkan", "Waktu Dibuat"],
      filteredRequests.flatMap((req) =>
        req.lines.map((l) => [
          req.number,
          req.supplier?.code ?? "",
          req.supplier?.name ?? "",
          req.status,
          l.item.sku,
          l.item.name,
          l.quantity,
          l.uom?.code ?? l.item.baseUom?.code ?? "",
          l.neededBy ? formatDate(l.neededBy) : "",
          formatDateTime(req.createdAt),
        ]),
      ),
    );
  }

  function exportGrCsv() {
    downloadCsv(
      `penerimaan-barang-${todayJakarta()}.csv`,
      ["Nomor GR", "Nomor PO", "Kode Supplier", "Status", "Waktu Diposting", "Waktu Dibuat"],
      goodsReceipts.map((gr) => [
        gr.number,
        (gr.order ?? gr.purchaseOrder)?.number ?? "",
        (gr.order ?? gr.purchaseOrder)?.supplier?.code ?? "",
        gr.status,
        gr.postedAt ? formatDateTime(gr.postedAt) : "",
        formatDateTime(gr.createdAt),
      ]),
    );
  }

  const grLines = useMemo(
    () =>
      poLines.filter(
        (line) =>
          ((line.order ?? line.purchaseOrder)?.id === grPurchaseOrderId || line.orderId === grPurchaseOrderId) &&
          new Decimal(line.orderedQty).greaterThan(line.receivedQty),
      ),
    [poLines, grPurchaseOrderId],
  );

  function handleSelectGrPo(poId: string) {
    setActiveTab("receipts");
    setGrPurchaseOrderId(poId);
    setSelectedGrLineId("");
    setGrQuantity("");
    const selected = purchaseOrders.find((order) => order.id === poId);
    if (selected?.warehouseId) {
      setGrWarehouseId(selected.warehouseId);
    }
  }

  function handleSelectGrLine(lineId: string) {
    setSelectedGrLineId(lineId);
    const line = grLines.find((candidate) => candidate.id === lineId);
    if (line) {
      const remaining = new Decimal(line.orderedQty).minus(line.receivedQty).toString();
      setGrQuantity(remaining);
    } else {
      setGrQuantity("");
    }
  }

  function handleConvertPrLineToPo(pr: PurchaseRequest, line: PurchaseRequestLine, remainingQty: string) {
    setActiveTab("orders");
    if (pr.supplierId) {
      setPoSupplierId(pr.supplierId);
    }
    setPoItemId(line.itemId);
    setPoUomId(line.uomId);
    setPoQuantity(remainingQty);
    setPoAllocatedPrLine({
      prNumber: pr.number,
      lineId: line.id,
      itemSku: line.item.sku,
      remainingQty,
      uomCode: line.uom?.code ?? line.item.baseUom?.code ?? "",
    });
    setNotice(`Form PO disiapkan untuk mengalokasikan ${remainingQty} ${line.uom?.code ?? ""} dari ${pr.number}.`);
  }

  function toggleExpandPr(prId: string) {
    setExpandedPrs((prev) => ({ ...prev, [prId]: !prev[prId] }));
  }

  const selectedGrLine = grLines.find((candidate) => candidate.id === selectedGrLineId);
  const selectedGrLineRemaining = selectedGrLine
    ? new Decimal(selectedGrLine.orderedQty).minus(selectedGrLine.receivedQty).toString()
    : undefined;

  async function handleCreatePO(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(null);
    setSaving(true);
    const form = new FormData(formElement);
    const rawNumber = String(form.get("number") ?? "").trim();
    const qty = String(form.get("quantity") ?? "").trim();
    const body = {
      number: rawNumber || suggestPoNumber(),
      supplierId: form.get("supplierId"),
      warehouseId: form.get("warehouseId"),
      expectedDelivery: form.get("expectedDelivery") || undefined,
      lines: [
        {
          itemId: form.get("itemId"),
          quantity: qty,
          unitCost: form.get("unitCost"),
          uomId: form.get("uomId"),
          ...(poAllocatedPrLine
            ? {
                requestLineId: poAllocatedPrLine.lineId,
                requestQuantity: qty,
              }
            : {}),
        },
      ],
    };
    try {
      const res = await fetch("/api/v1/procurement/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal membuat pesanan pembelian");
      setNotice(
        poAllocatedPrLine
          ? `Pesanan pembelian ${body.number} dibuat dan dialokasikan dari ${poAllocatedPrLine.prNumber}. Setujui untuk mengizinkan penerimaan.`
          : "Pesanan pembelian dibuat sebagai draf. Setujui untuk mengizinkan penerimaan.",
      );
      formElement.reset();
      setPoItemId("");
      setPoUomId("");
      setPoQuantity("");
      setPoUnitCost("");
      setPoAllocatedPrLine(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat pesanan pembelian");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePR(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(null);
    setSaving(true);
    const form = new FormData(formElement);
    const rawNumber = String(form.get("number") ?? "").trim();
    const rawSupplierId = String(form.get("supplierId") ?? "").trim();
    const rawNeededBy = String(form.get("neededBy") ?? "").trim();
    const rawNotes = String(form.get("notes") ?? "").trim();

    const body = {
      number: rawNumber || suggestPrNumber(),
      supplierId: rawSupplierId || undefined,
      lines: [
        {
          itemId: String(form.get("itemId") ?? ""),
          quantity: String(form.get("quantity") ?? ""),
          uomId: String(form.get("uomId") ?? ""),
          neededBy: rawNeededBy || undefined,
          notes: rawNotes || undefined,
        },
      ],
    };

    try {
      const res = await fetch("/api/v1/procurement/purchase-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal membuat permintaan pembelian");
      setNotice(`Permintaan pembelian ${body.number} berhasil dibuat sebagai draf. Setujui untuk mengizinkan konversi ke PO.`);
      formElement.reset();
      setPrItemId("");
      setPrUomId("");
      setPrSupplierId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat permintaan pembelian");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateReceipt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(null);
    setSaving(true);
    const form = new FormData(formElement);
    const rawNumber = String(form.get("number") ?? "").trim();
    const body = {
      number: rawNumber || suggestGrNumber(),
      purchaseOrderId: form.get("purchaseOrderId"),
      warehouseId: form.get("warehouseId"),
      idempotencyKey: crypto.randomUUID(),
      lines: [
        {
          purchaseOrderLineId: form.get("purchaseOrderLineId"),
          quantity: form.get("quantity"),
        },
      ],
    };
    try {
      const res = await fetch("/api/v1/procurement/goods-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal mencatat penerimaan barang");
      setNotice("Penerimaan barang dicatat sebagai draf. Posting untuk menambah stok.");
      formElement.reset();
      setGrPurchaseOrderId("");
      setGrWarehouseId("");
      setSelectedGrLineId("");
      setGrQuantity("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencatat penerimaan barang");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprovePO(order: PurchaseOrder) {
    setActingId(order.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/procurement/purchase-orders/${order.id}/approve`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal menyetujui pesanan pembelian");
      setNotice(
        <span>
          {order.number} disetujui.{" "}
          <button
            type="button"
            className="ml-1 font-semibold underline underline-offset-2 hover:text-emerald-950"
            onClick={() => {
              setActiveTab("receipts");
              setGrPurchaseOrderId(order.id);
            }}
          >
            Catat Penerimaan Barang (GR) &rarr;
          </button>
        </span>
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyetujui pesanan pembelian");
    } finally {
      setActingId(null);
    }
  }

  async function handleApprovePR(req: PurchaseRequest) {
    setActingId(req.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/procurement/purchase-requests/${req.id}/approve`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal menyetujui permintaan pembelian");
      setNotice(
        <span>
          {req.number} disetujui dan siap dialokasikan ke PO.{" "}
          <button
            type="button"
            className="ml-1 font-semibold underline underline-offset-2 hover:text-emerald-950"
            onClick={() => setActiveTab("orders")}
          >
            Buka Form Pesanan Pembelian &rarr;
          </button>
        </span>
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyetujui permintaan pembelian");
    } finally {
      setActingId(null);
    }
  }

  async function handlePostReceipt(receipt: GoodsReceipt) {
    setActingId(receipt.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/procurement/goods-receipts/${receipt.id}/post`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memposting penerimaan barang");
      setNotice(
        <span>
          {receipt.number} diposting ke stok gudang.{" "}
          <Link
            href="/inventory"
            className="ml-1 font-semibold underline underline-offset-2 hover:text-emerald-950"
          >
            Lihat di Persediaan &rarr;
          </Link>
        </span>
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memposting penerimaan barang");
    } finally {
      setActingId(null);
    }
  }

  async function handleCancelPO(order: PurchaseOrder) {
    if (!window.confirm(`Batalkan pesanan pembelian ${order.number}? Alokasi dari PR akan dikembalikan.`)) return;
    setActingId(order.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/procurement/purchase-orders/${order.id}/cancel`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal membatalkan pesanan pembelian");
      setNotice(`Pesanan pembelian ${order.number} dibatalkan.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membatalkan pesanan pembelian");
    } finally {
      setActingId(null);
    }
  }

  async function handleClosePO(order: PurchaseOrder) {
    if (!window.confirm(`Tutup pesanan pembelian ${order.number}? Penerimaan barang tidak dapat dilakukan lagi untuk PO ini.`)) return;
    setActingId(order.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/procurement/purchase-orders/${order.id}/close`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal menutup pesanan pembelian");
      setNotice(`Pesanan pembelian ${order.number} ditutup.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menutup pesanan pembelian");
    } finally {
      setActingId(null);
    }
  }

  async function handleCancelPR(req: PurchaseRequest) {
    if (!window.confirm(`Batalkan permintaan pembelian ${req.number}?`)) return;
    setActingId(req.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/procurement/purchase-requests/${req.id}/cancel`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal membatalkan permintaan pembelian");
      setNotice(`Permintaan pembelian ${req.number} dibatalkan.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membatalkan permintaan pembelian");
    } finally {
      setActingId(null);
    }
  }

  async function handleCancelReceipt(receipt: GoodsReceipt) {
    if (!window.confirm(`Batalkan draf penerimaan ${receipt.number}?`)) return;
    setActingId(receipt.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/procurement/goods-receipts/${receipt.id}/cancel`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal membatalkan penerimaan barang");
      setNotice(`Draf penerimaan ${receipt.number} dibatalkan.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membatalkan penerimaan barang");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Supply Chain"
        title="Procurement & Pembelian"
        description="Kelola siklus pengadaan terpadu: Purchase Requests (PR), Purchase Orders (PO), Approval, dan Goods Receipt (GRN) ke stok gudang."
        actions={
          <Button variant="secondary" onClick={() => { void load(); }} loading={loading}>
            Muat ulang
          </Button>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-6">
        <button
          type="button"
          onClick={() => setActiveTab("orders")}
          className={`flex items-center gap-2 pb-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === "orders"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ShoppingBag className="size-4" />
          Purchase Orders (PO) ({purchaseOrders.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={`flex items-center gap-2 pb-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === "requests"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileText className="size-4" />
          Purchase Requests (PR) ({purchaseRequests.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("receipts")}
          className={`flex items-center gap-2 pb-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === "receipts"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Truck className="size-4" />
          Goods Receipts (GRN) ({goodsReceipts.length})
        </button>
      </div>

      {/* TAB 1: PURCHASE ORDERS */}
      {activeTab === "orders" && (
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Daftar pesanan pembelian (PO)"
              description={`${filteredOrders.length} dari ${purchaseOrders.length} pesanan.`}
              actions={
                <div className="flex items-center gap-2">
                  <SearchInput value={search} onChange={setSearch} placeholder="Cari nomor atau supplier…" />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={exportPoCsv}
                    disabled={filteredOrders.length === 0}
                    title="Unduh daftar PO sebagai file CSV"
                  >
                    <Download aria-hidden className="size-3.5" />
                    Ekspor CSV
                  </Button>
                </div>
              }
            />
            <CardBody className="p-0">
              {loading ? (
                <div className="p-8 text-center text-slate-500">Memuat pesanan pembelian…</div>
              ) : filteredOrders.length === 0 ? (
                <EmptyState title="Belum ada pesanan pembelian" description="Buat pesanan pembelian baru di formulir di bawah." />
              ) : (
                <>
                  <Table>
                    <TableHead>
                      <Tr>
                        <Th>Nomor PO</Th>
                        <Th>Supplier</Th>
                        <Th>Status</Th>
                        <Th align="right">Baris</Th>
                        <Th align="right">Total</Th>
                        <Th align="right">Diharapkan</Th>
                        <Th align="right">Penerimaan</Th>
                        <Th align="right">Aksi</Th>
                      </Tr>
                    </TableHead>
                    <TableBody>
                      {paginatedOrders.map((order) => (
                      <Tr key={order.id}>
                        <Td className="tnum font-medium">{order.number}</Td>
                        <Td className="text-slate-600 tnum">
                          {order.supplier ? `${order.supplier.code} · ${order.supplier.name}` : "—"}
                        </Td>
                        <Td>{<StatusBadge status={order.status} />}</Td>
                        <Td align="right" className="tnum text-slate-600">{order.lines?.length ?? 0}</Td>
                        <Td align="right" className="tnum text-slate-600">{formatMoney(order.totalAmount)}</Td>
                        <Td align="right" className="tnum text-slate-600">{formatDate(order.expectedDelivery)}</Td>
                        <Td align="right" className="tnum text-slate-600">{order._count.receipts}</Td>
                        <Td align="right">
                          {order.status === "DRAFT" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="primary"
                                loading={actingId === order.id}
                                onClick={() => { void handleApprovePO(order); }}
                              >
                                Setujui
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="text-red-600 hover:text-red-700"
                                loading={actingId === order.id}
                                onClick={() => { void handleCancelPO(order); }}
                              >
                                Batal
                              </Button>
                            </div>
                          ) : order.status === "APPROVED" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleSelectGrPo(order.id)}
                              >
                                Terima
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-red-600 hover:text-red-700 px-2 py-1 h-auto"
                                loading={actingId === order.id}
                                onClick={() => { void handleCancelPO(order); }}
                              >
                                Batal
                              </Button>
                            </div>
                          ) : order.status === "PARTIALLY_RECEIVED" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleSelectGrPo(order.id)}
                              >
                                Terima
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-slate-600 hover:text-slate-800 px-2 py-1 h-auto"
                                loading={actingId === order.id}
                                onClick={() => { void handleClosePO(order); }}
                              >
                                Tutup
                              </Button>
                            </div>
                          ) : order.status === "FULLY_RECEIVED" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs text-slate-600 hover:text-slate-800 px-2 py-1 h-auto"
                              loading={actingId === order.id}
                              onClick={() => { void handleClosePO(order); }}
                            >
                              Tutup
                            </Button>
                          ) : (
                            <span className="text-[12px] text-slate-400">—</span>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </TableBody>
                </Table>
                <Pagination
                  currentPage={poPage}
                  pageSize={poPageSize}
                  totalItems={filteredOrders.length}
                  onPageChange={setPoPage}
                  onPageSizeChange={setPoPageSize}
                  pageSizeOptions={[10, 15, 25, 50]}
                />
              </>
            )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Buat pesanan pembelian (PO)"
              description="Pesanan dibuat sebagai draf dan harus disetujui sebelum dapat diterima gudang."
            />
            <CardBody>
              {poAllocatedPrLine && (
                <div className="mb-4 flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50/80 p-3 text-sm text-brand-900">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-brand-600 shrink-0" />
                    <span>
                      Mengalokasikan dari Permintaan: <strong>{poAllocatedPrLine.prNumber}</strong> · Item:{" "}
                      <strong>{poAllocatedPrLine.itemSku}</strong> (Sisa belum dipesan: {formatQuantity(poAllocatedPrLine.remainingQty)}{" "}
                      {poAllocatedPrLine.uomCode})
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPoAllocatedPrLine(null)}
                    className="text-slate-600 hover:text-red-600"
                  >
                    <X className="size-4 mr-1" /> Batal alokasi
                  </Button>
                </div>
              )}
              <form className="space-y-4" onSubmit={handleCreatePO}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Nomor PO" required hint="Kosongkan untuk penomoran otomatis.">
                    <Input name="number" placeholder={suggestPoNumber()} />
                  </Field>
                  <Field label="Supplier" required>
                    <Select
                      name="supplierId"
                      required
                      value={poSupplierId}
                      onChange={(e) => setPoSupplierId(e.target.value)}
                    >
                      <option value="">Pilih supplier</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.code} — {supplier.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Gudang tujuan" required>
                    <Select
                      name="warehouseId"
                      required
                      value={poWarehouseId}
                      onChange={(e) => setPoWarehouseId(e.target.value)}
                    >
                      <option value="">Pilih gudang</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.code} — {warehouse.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Pengiriman diharapkan">
                    <Input name="expectedDelivery" type="date" />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2 border-t border-slate-100">
                  <Field label="Barang" required>
                    <Select name="itemId" required value={poItemId} onChange={(e) => handleSelectPoItem(e.target.value)}>
                      <option value="">Pilih barang</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.sku} — {item.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Satuan"
                    required
                    hint={poItemId ? `Satuan dasar: ${items.find((it) => it.id === poItemId)?.baseUom?.code ?? "—"}` : undefined}
                  >
                    <Select name="uomId" required value={poUomId} onChange={(e) => setPoUomId(e.target.value)}>
                      <option value="">Pilih satuan</option>
                      {uoms.map((uom) => (
                        <option key={uom.id} value={uom.id}>
                          {uom.code} — {uom.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Kuantitas" required>
                    <Input
                      name="quantity"
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      required
                      value={poQuantity}
                      onChange={(e) => setPoQuantity(e.target.value)}
                    />
                  </Field>
                  <Field label="Biaya satuan (IDR)" required>
                    <Input
                      name="unitCost"
                      type="number"
                      min="0"
                      step="0.0001"
                      required
                      value={poUnitCost}
                      onChange={(e) => setPoUnitCost(e.target.value)}
                      placeholder="0.00"
                    />
                  </Field>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button type="submit" variant="primary" loading={saving}>
                    {saving ? "Menyimpan…" : "Buat pesanan pembelian"}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      )}

      {/* TAB 2: PURCHASE REQUESTS */}
      {activeTab === "requests" && (
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Daftar permintaan pembelian (PR)"
              description={`${filteredRequests.length} dari ${purchaseRequests.length} permintaan pembelian.`}
              actions={
                <div className="flex items-center gap-2">
                  <SearchInput value={requestSearch} onChange={setRequestSearch} placeholder="Cari nomor, supplier, atau SKU…" />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={exportPrCsv}
                    disabled={filteredRequests.length === 0}
                    title="Unduh daftar PR sebagai file CSV"
                  >
                    <Download aria-hidden className="size-3.5" />
                    Ekspor CSV
                  </Button>
                </div>
              }
            />
            <CardBody className="p-0">
              {loading ? (
                <div className="p-8 text-center text-slate-500">Memuat permintaan pembelian…</div>
              ) : filteredRequests.length === 0 ? (
                <EmptyState title="Belum ada permintaan pembelian" description="Buat permintaan pembelian baru di panel sebelah bawah." />
              ) : (
                <>
                  <div className="divide-y divide-slate-100">
                    {paginatedRequests.map((req) => {
                    const isExpanded = expandedPrs[req.id] ?? true;
                    return (
                      <div key={req.id} className="p-4 transition hover:bg-slate-50/50">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => toggleExpandPr(req.id)}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                            </button>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900 tnum">{req.number}</span>
                                <StatusBadge status={req.status} />
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Supplier: {req.supplier ? `${req.supplier.code} · ${req.supplier.name}` : "— (Belum ditentukan)"} ·{" "}
                                Dibuat {formatDateTime(req.createdAt)}
                                {req.approvedAt ? ` · Disetujui ${formatDateTime(req.approvedAt)}` : ""}
                              </p>
                            </div>
                          </div>
                          <div>
                            {req.status === "DRAFT" ? (
                              <div className="flex items-center gap-1.5">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  loading={actingId === req.id}
                                  onClick={() => { void handleApprovePR(req); }}
                                >
                                  Setujui PR
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="text-red-600 hover:text-red-700"
                                  loading={actingId === req.id}
                                  onClick={() => { void handleCancelPR(req); }}
                                >
                                  Batal
                                </Button>
                              </div>
                            ) : req.status === "APPROVED" ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                  Disetujui
                                </span>
                                {req.lines.every((l) => (l.allocations?.length ?? 0) === 0) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-xs text-red-600 hover:text-red-700 px-2 py-1 h-auto"
                                    loading={actingId === req.id}
                                    onClick={() => { void handleCancelPR(req); }}
                                  >
                                    Batal
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </div>
                        </div>

                        {/* Line breakdown */}
                        {isExpanded && (
                          <div className="mt-3 pl-7 overflow-x-auto">
                            <table className="min-w-full text-xs">
                              <thead>
                                <tr className="border-b border-slate-200 text-slate-500">
                                  <th className="py-2 text-left font-medium">Barang</th>
                                  <th className="py-2 text-right font-medium">Kuantitas</th>
                                  <th className="py-2 text-right font-medium">Teralokasi ke PO</th>
                                  <th className="py-2 text-right font-medium">Sisa Kebutuhan</th>
                                  <th className="py-2 text-left font-medium pl-4">Dibutuhkan</th>
                                  <th className="py-2 text-left font-medium">Catatan</th>
                                  <th className="py-2 text-right font-medium">Aksi</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {req.lines.map((line) => {
                                  const totalAllocated = (line.allocations ?? []).reduce(
                                    (sum, a) => sum.plus(new Decimal(a.quantity)),
                                    new Decimal(0),
                                  );
                                  const reqQty = new Decimal(line.quantity);
                                  const remaining = Decimal.max(0, reqQty.minus(totalAllocated));
                                  const uomCode = line.uom?.code ?? line.item.baseUom?.code ?? "PCS";

                                  return (
                                    <tr key={line.id} className="text-slate-700">
                                      <td className="py-2 font-medium tnum">
                                        {line.item.sku}
                                        <span className="block text-[11px] font-normal text-slate-500">{line.item.name}</span>
                                      </td>
                                      <td className="py-2 text-right tnum">
                                        {formatQuantity(line.quantity)} {uomCode}
                                      </td>
                                      <td className="py-2 text-right tnum text-slate-500">
                                        {formatQuantity(totalAllocated.toString())} {uomCode}
                                      </td>
                                      <td className="py-2 text-right tnum font-semibold">
                                        <span className={remaining.greaterThan(0) ? "text-amber-600" : "text-emerald-600"}>
                                          {formatQuantity(remaining.toString())} {uomCode}
                                        </span>
                                      </td>
                                      <td className="py-2 text-left tnum text-slate-500 pl-4">
                                        {formatDate(line.neededBy)}
                                      </td>
                                      <td className="py-2 text-left text-slate-500 italic max-w-xs truncate">
                                        {line.notes || "—"}
                                      </td>
                                      <td className="py-2 text-right">
                                        {req.status === "APPROVED" && remaining.greaterThan(0) ? (
                                          <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => handleConvertPrLineToPo(req, line, remaining.toString())}
                                          >
                                            Buat PO <ArrowRight className="size-3.5 ml-1" />
                                          </Button>
                                        ) : remaining.isZero() ? (
                                          <span className="text-[11px] text-emerald-600 font-medium">Terpenuhi</span>
                                        ) : (
                                          <span className="text-[11px] text-slate-400">Menunggu ACC</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <Pagination
                  currentPage={prPage}
                  pageSize={prPageSize}
                  totalItems={filteredRequests.length}
                  onPageChange={setPrPage}
                  onPageSizeChange={setPrPageSize}
                  pageSizeOptions={[10, 15, 25, 50]}
                />
              </>
            )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Buat permintaan pembelian (PR)"
              description="Buat permintaan pengadaan bahan atau komponen. Setelah disetujui, PR dapat dialokasikan langsung ke pesanan pembelian (PO)."
            />
            <CardBody>
              <form className="space-y-4" onSubmit={handleCreatePR}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Nomor PR" required hint="Kosongkan untuk penomoran otomatis PR-YYYYMMDD-XXXX.">
                    <Input name="number" placeholder={suggestPrNumber()} />
                  </Field>
                  <Field label="Supplier preferensi" hint="Opsional. Dapat dikosongkan jika belum ditentukan.">
                    <Select
                      name="supplierId"
                      value={prSupplierId}
                      onChange={(e) => setPrSupplierId(e.target.value)}
                    >
                      <option value="">Pilih supplier (opsional)</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.code} — {supplier.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Tanggal dibutuhkan (Needed By)">
                    <Input name="neededBy" type="date" />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2 border-t border-slate-100">
                  <Field label="Barang yang diminta" required>
                    <Select name="itemId" required value={prItemId} onChange={(e) => handleSelectPrItem(e.target.value)}>
                      <option value="">Pilih barang</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.sku} — {item.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Satuan (UOM)"
                    required
                    hint={prItemId ? `Satuan dasar: ${items.find((it) => it.id === prItemId)?.baseUom?.code ?? "—"}` : undefined}
                  >
                    <Select name="uomId" required value={prUomId} onChange={(e) => setPrUomId(e.target.value)}>
                      <option value="">Pilih satuan</option>
                      {uoms.map((uom) => (
                        <option key={uom.id} value={uom.id}>
                          {uom.code} — {uom.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Kuantitas" required>
                    <Input name="quantity" type="number" min="0.000001" step="0.000001" required placeholder="0.00" />
                  </Field>
                  <Field label="Catatan / Keperluan" hint="Alasan permintaan atau instruksi khusus">
                    <Input name="notes" placeholder="e.g. Tambahan stok produksi batch 4" />
                  </Field>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button type="submit" variant="primary" loading={saving}>
                    {saving ? "Menyimpan…" : "Buat permintaan pembelian"}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      )}

      {/* TAB 3: GOODS RECEIPTS */}
      {activeTab === "receipts" && (
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Catat penerimaan barang (GR)"
              description="Pilih PO yang telah disetujui, pilih baris barang yang diterima, lalu catat draf penerimaan."
            />
            <CardBody>
              <form className="space-y-4" onSubmit={handleCreateReceipt}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Nomor penerimaan" required hint="Kosongkan untuk penomoran otomatis.">
                    <Input name="number" placeholder={suggestGrNumber()} />
                  </Field>
                  <Field label="Pesanan pembelian (PO)" required>
                    <Select
                      name="purchaseOrderId"
                      required
                      value={grPurchaseOrderId}
                      onChange={(event) => handleSelectGrPo(event.target.value)}
                    >
                      <option value="">Pilih pesanan pembelian</option>
                      {purchaseOrders
                        .filter((order) => ["APPROVED", "PARTIALLY_RECEIVED"].includes(order.status))
                        .map((order) => (
                          <option key={order.id} value={order.id}>
                            {order.number} · {order.supplier?.name ?? "—"} · {order.status}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field
                    label="Gudang penerimaan"
                    required
                    hint={grWarehouseId ? "Otomatis diselaraskan dengan gudang tujuan PO." : undefined}
                  >
                    <Select
                      name="warehouseId"
                      required
                      value={grWarehouseId}
                      onChange={(event) => setGrWarehouseId(event.target.value)}
                    >
                      <option value="">Pilih gudang</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.code} — {warehouse.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-slate-100">
                  <Field
                    label="Baris PO"
                    required
                    hint={
                      grPurchaseOrderId
                        ? grLines.length === 0
                          ? "Semua baris PO ini sudah diterima penuh."
                          : `${grLines.length} baris belum terpenuhi.`
                        : "Pilih pesanan pembelian terlebih dahulu."
                    }
                  >
                    <Select
                      name="purchaseOrderLineId"
                      required
                      disabled={grLines.length === 0}
                      value={selectedGrLineId}
                      onChange={(e) => handleSelectGrLine(e.target.value)}
                    >
                      <option value="">Pilih baris PO</option>
                      {grLines.map((line) => (
                        <option key={line.id} value={line.id}>
                          Baris {line.sequence} · {line.item.sku} · sisa{" "}
                          {formatQuantity(new Decimal(line.orderedQty).minus(line.receivedQty).toString())}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Kuantitas terima"
                    required
                    hint={selectedGrLineRemaining ? `Maksimal dapat diterima: ${formatQuantity(selectedGrLineRemaining)}.` : undefined}
                  >
                    <Input
                      name="quantity"
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      max={selectedGrLineRemaining}
                      required
                      value={grQuantity}
                      onChange={(e) => setGrQuantity(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button type="submit" variant="primary" loading={saving} disabled={grLines.length === 0}>
                    {saving ? "Menyimpan…" : "Catat penerimaan"}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Daftar penerimaan barang"
              description="Draf penerimaan harus diposting agar kuantitas stok bertambah pada kartu stok gudang."
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={exportGrCsv}
                  disabled={goodsReceipts.length === 0}
                  title="Unduh daftar penerimaan barang sebagai file CSV"
                >
                  <Download aria-hidden className="size-3.5" />
                  Ekspor CSV
                </Button>
              }
            />
            <CardBody className="p-0">
              {loading ? (
                <div className="p-8 text-center text-slate-500">Memuat penerimaan…</div>
              ) : goodsReceipts.length === 0 ? (
                <EmptyState compact title="Belum ada penerimaan barang" />
              ) : (
                <>
                  <Table>
                    <TableHead>
                      <Tr>
                        <Th>Nomor GR</Th>
                        <Th>Pesanan pembelian</Th>
                        <Th>Supplier</Th>
                        <Th>Status</Th>
                        <Th align="right">Diposting</Th>
                        <Th align="right">Dibuat</Th>
                        <Th align="right">Aksi</Th>
                      </Tr>
                    </TableHead>
                    <TableBody>
                      {paginatedReceipts.map((receipt) => (
                        <Tr key={receipt.id}>
                          <Td className="tnum font-medium">{receipt.number}</Td>
                          <Td className="tnum text-slate-600">{(receipt.order ?? receipt.purchaseOrder)?.number ?? "—"}</Td>
                          <Td className="tnum text-slate-600">{(receipt.order ?? receipt.purchaseOrder)?.supplier?.code ?? "—"}</Td>
                          <Td>{<StatusBadge status={receipt.status} />}</Td>
                          <Td align="right" className="tnum text-slate-600">{receipt.postedAt ? formatDateTime(receipt.postedAt) : "—"}</Td>
                          <Td align="right" className="tnum text-slate-500">{formatDateTime(receipt.createdAt)}</Td>
                          <Td align="right">
                            {receipt.status === "DRAFT" ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  loading={actingId === receipt.id}
                                  onClick={() => { void handlePostReceipt(receipt); }}
                                >
                                  Posting
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="text-red-600 hover:text-red-700"
                                  loading={actingId === receipt.id}
                                  onClick={() => { void handleCancelReceipt(receipt); }}
                                >
                                  Batal
                                </Button>
                              </div>
                            ) : (
                              <span className="text-[12px] text-slate-400">—</span>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination
                    currentPage={grPage}
                    pageSize={grPageSize}
                    totalItems={goodsReceipts.length}
                    onPageChange={setGrPage}
                    onPageSizeChange={setGrPageSize}
                    pageSizeOptions={[10, 15, 25, 50]}
                  />
                </>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
