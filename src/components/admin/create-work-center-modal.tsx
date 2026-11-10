"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";

export function CreateWorkCenterModal({
  onCreated,
  buttonLabel = "Tambah work center",
  variant = "primary",
}: {
  onCreated?: (workCenter: { id: string; code: string; name: string }) => void;
  buttonLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [hourlyRate, setHourlyRate] = useState("0");
  const [standardMinutes, setStandardMinutes] = useState("0");
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
      const res = await fetch("/api/v1/manufacturing/work-centers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          hourlyRate: hourlyRate.trim() || "0",
          standardMinutes: standardMinutes.trim() || "0",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Gagal membuat work center");
      setNotice(`Work center ${json.data.name} (${json.data.code}) berhasil ditambahkan.`);
      setCode("");
      setName("");
      setHourlyRate("0");
      setStandardMinutes("0");
      if (onCreated) {
        onCreated(json.data);
      }
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setNotice(null);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat work center");
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
        variant={variant}
      >
        <Plus aria-hidden className="size-4" />
        {buttonLabel}
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
                description="Work Center mewakili stasiun kerja atau mesin produksi untuk penjadwalan dan pembebanan biaya konversi/tenaga kerja."
                title="Tambah Work Center Baru"
              />
              <CardBody className="space-y-4 overflow-y-auto">
                {error ? (
                  <Alert onClose={() => setError(null)} tone="danger">
                    {error}
                  </Alert>
                ) : null}
                {notice ? (
                  <Alert onClose={() => setNotice(null)} tone="success">
                    {notice}
                  </Alert>
                ) : null}

                <form className="space-y-4" onSubmit={handleSubmit}>
                  <Field hint="Kode stasiun kerja/mesin unik (kapital), mis: WC-CNC-01, WC-ASSY-02" label="Kode Work Center" required>
                    <Input
                      autoFocus
                      maxLength={40}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="contoh: WC-CNC-01"
                      required
                      value={code}
                    />
                  </Field>

                  <Field hint="Nama stasiun atau pusat kerja produksi" label="Nama Work Center" required>
                    <Input
                      maxLength={120}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="contoh: Stasiun CNC Milling Utama"
                      required
                      value={name}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field hint="Tarif per jam (Rp) untuk alokasi biaya tenaga kerja/overhead" label="Tarif / Jam (IDR)">
                      <Input
                        min="0"
                        onChange={(e) => setHourlyRate(e.target.value)}
                        placeholder="0"
                        step="100"
                        type="number"
                        value={hourlyRate}
                      />
                    </Field>

                    <Field hint="Kapasitas atau durasi pengerjaan standar" label="Menit Standar">
                      <Input
                        min="0"
                        onChange={(e) => setStandardMinutes(e.target.value)}
                        placeholder="0"
                        step="1"
                        type="number"
                        value={standardMinutes}
                      />
                    </Field>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button onClick={handleClose} type="button" variant="secondary">
                      Batal
                    </Button>
                    <Button loading={submitting} type="submit" variant="primary">
                      Simpan Work Center
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
