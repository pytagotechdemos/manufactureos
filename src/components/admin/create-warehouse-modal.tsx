"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";

export function CreateWarehouseModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isWip, setIsWip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

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
      const res = await fetch("/api/v1/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || undefined,
          isWip,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Gagal membuat gudang");
      setNotice(`Gudang ${json.data.name} (${json.data.code}) berhasil ditambahkan.`);
      setCode("");
      setName("");
      setDescription("");
      setIsWip(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat gudang");
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
        <Plus aria-hidden className="size-4" />
        Tambah gudang
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            aria-hidden="true"
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={handleClose}
          />
          <div className="relative z-10 w-full max-w-lg my-auto">
            <Card className="shadow-2xl max-h-[90vh] flex flex-col">
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
                description="Gudang dapat berupa gudang inventory umum atau gudang khusus WIP (Work in Progress)."
                title="Tambah Gudang Baru"
              />
              <CardBody className="space-y-4 overflow-y-auto">
                {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
                {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}
                <form className="space-y-3" onSubmit={handleSubmit}>
                  <div className="grid grid-cols-2 gap-3">
                    <Field htmlFor="create-wh-code" label="Kode gudang" required>
                      <Input
                        id="create-wh-code"
                        name="code"
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Contoh: WH-RAW"
                        required
                        value={code}
                      />
                    </Field>
                    <Field htmlFor="create-wh-name" label="Nama gudang" required>
                      <Input
                        id="create-wh-name"
                        name="name"
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Gudang Bahan Baku Utama"
                        required
                        value={name}
                      />
                    </Field>
                  </div>
                  <Field htmlFor="create-wh-desc" label="Keterangan / Lokasi">
                    <Textarea
                      id="create-wh-desc"
                      name="description"
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Gedung B Lantai 1, area rak A1-A20"
                      rows={2}
                      value={description}
                    />
                  </Field>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isWip}
                        onChange={(e) => setIsWip(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <div>
                        <span className="text-[13px] font-medium text-slate-900">Tandai sebagai Gudang WIP</span>
                        <p className="text-[12px] text-slate-500">
                          Gudang WIP digunakan untuk menampung komponen yang sudah dikeluarkan ke lantai produksi selama proses perakitan.
                        </p>
                      </div>
                    </label>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button onClick={handleClose} type="button" variant="secondary">
                      Batal
                    </Button>
                    <Button disabled={submitting || !code.trim() || !name.trim()} loading={submitting} type="submit" variant="primary">
                      <Plus aria-hidden className="size-4" />
                      Simpan gudang
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
