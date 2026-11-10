"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";

const DIMENSIONS = [
  { value: "COUNT", label: "Jumlah / Satuan (Unit, Pcs, Box, Pack)" },
  { value: "MASS", label: "Massa / Berat (Kg, Gram, Ton)" },
  { value: "LENGTH", label: "Panjang / Jarak (Meter, Cm, Mm)" },
  { value: "VOLUME", label: "Volume (Liter, Ml, M3)" },
  { value: "AREA", label: "Luas (M2, Cm2)" },
  { value: "TIME", label: "Waktu (Jam, Menit, Hari)" },
];

export function CreateUomModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [dimension, setDimension] = useState("COUNT");
  const [precision, setPrecision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    setOpen(false);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/uoms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          dimension,
          precision: Number(precision),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Gagal membuat satuan");
      setNotice(`Satuan ${json.data.name} (${json.data.code}) berhasil ditambahkan.`);
      setCode("");
      setName("");
      setDimension("COUNT");
      setPrecision(0);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat satuan");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        className="w-auto"
        onClick={() => setOpen(true)}
        type="button"
        variant="primary"
      >
        <Plus aria-hidden className="size-4 mr-2" />
        Tambah satuan
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            aria-hidden="true"
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={handleClose}
          />
          <div className="relative z-10 w-full max-w-lg">
            <Card className="shadow-2xl">
              <CardHeader
                actions={
                  <button
                    aria-label="Tutup form"
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    onClick={handleClose}
                    type="button"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                }
                description="Satuan ukuran (UOM) mendefinisikan unit kuantitas barang, BOM, dan konversi."
                title="Tambah Satuan Ukuran Baru"
              />
              <CardBody className="space-y-4">
                {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
                {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}
                <form className="space-y-3" onSubmit={handleSubmit}>
                  <div className="grid grid-cols-2 gap-3">
                    <Field htmlFor="create-uom-code" label="Kode simbol" required>
                      <Input
                        id="create-uom-code"
                        name="code"
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Contoh: PCS, KG, M"
                        required
                        value={code}
                      />
                    </Field>
                    <Field htmlFor="create-uom-name" label="Nama satuan" required>
                      <Input
                        id="create-uom-name"
                        name="name"
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Pieces, Kilogram, Meter"
                        required
                        value={name}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field htmlFor="create-uom-dim" label="Dimensi fisik" required>
                      <Select
                        id="create-uom-dim"
                        name="dimension"
                        onChange={(e) => setDimension(e.target.value)}
                        value={dimension}
                      >
                        {DIMENSIONS.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field htmlFor="create-uom-precision" hint="0 untuk diskret, 2-4 untuk fluida/berat" label="Presisi desimal" required>
                      <Input
                        id="create-uom-precision"
                        max={6}
                        min={0}
                        name="precision"
                        onChange={(e) => setPrecision(Math.max(0, Math.min(6, parseInt(e.target.value) || 0)))}
                        type="number"
                        value={precision}
                      />
                    </Field>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button onClick={handleClose} type="button" variant="secondary">
                      Batal
                    </Button>
                    <Button disabled={submitting || !code.trim() || !name.trim()} loading={submitting} type="submit" variant="primary">
                      <Plus aria-hidden className="size-4 mr-2" />
                      Simpan satuan
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
