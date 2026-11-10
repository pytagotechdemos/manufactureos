"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";

export function CreateCategoryModal({
  onCreated,
  buttonLabel = "Tambah kategori",
  variant = "primary",
}: {
  onCreated?: (category: { id: string; code: string; name: string }) => void;
  buttonLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
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
      const res = await fetch("/api/v1/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Gagal membuat kategori");
      setNotice(`Kategori ${json.data.name} (${json.data.code}) berhasil ditambahkan.`);
      setCode("");
      setName("");
      if (onCreated) {
        onCreated(json.data);
      }
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setNotice(null);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat kategori");
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
        <Plus aria-hidden className="size-4 mr-2" />
        {buttonLabel}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            aria-hidden="true"
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={handleClose}
          />
          <div className="relative z-10 w-full max-w-md">
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
                description="Kategori digunakan untuk klasifikasi master item dan struktur taksonomi produk."
                title="Tambah Kategori Baru"
              />
              <CardBody className="space-y-4">
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
                  <Field hint="Kode singkat kapital, mis: RAW, PKG, ELEC, ASM" label="Kode Kategori" required>
                    <Input
                      autoFocus
                      maxLength={20}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="contoh: PKG"
                      required
                      value={code}
                    />
                  </Field>

                  <Field hint="Nama kategori deskriptif" label="Nama Kategori" required>
                    <Input
                      maxLength={80}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="contoh: Packaging Materials"
                      required
                      value={name}
                    />
                  </Field>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button onClick={handleClose} type="button" variant="secondary">
                      Batal
                    </Button>
                    <Button loading={submitting} type="submit" variant="primary">
                      Simpan Kategori
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
