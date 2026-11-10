"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";

export function CreateSupplierModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
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
      const res = await fetch("/api/v1/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Gagal membuat data pemasok");
      setNotice(`Pemasok ${json.data.name} (${json.data.code}) berhasil ditambahkan.`);
      setCode("");
      setName("");
      setEmail("");
      setPhone("");
      setAddress("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat data pemasok");
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
        Tambah pemasok
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
                description="Pemasok digunakan dalam pembuatan pesanan pembelian (PO) dan permintaan pembelian (PR)."
                title="Tambah Pemasok Baru"
              />
              <CardBody className="space-y-4">
                {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
                {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}
                <form className="space-y-3" onSubmit={handleSubmit}>
                  <div className="grid grid-cols-2 gap-3">
                    <Field htmlFor="create-supplier-code" label="Kode pemasok" required>
                      <Input
                        id="create-supplier-code"
                        name="code"
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Contoh: SUPP-001"
                        required
                        value={code}
                      />
                    </Field>
                    <Field htmlFor="create-supplier-name" label="Nama pemasok / vendor" required>
                      <Input
                        id="create-supplier-name"
                        name="name"
                        onChange={(e) => setName(e.target.value)}
                        placeholder="PT Mitra Baja Utama"
                        required
                        value={name}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field htmlFor="create-supplier-email" label="Email kontak">
                      <Input
                        id="create-supplier-email"
                        name="email"
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="sales@mitrabaja.co.id"
                        type="email"
                        value={email}
                      />
                    </Field>
                    <Field htmlFor="create-supplier-phone" label="Nomor telepon">
                      <Input
                        id="create-supplier-phone"
                        name="phone"
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+62 21 555 1234"
                        value={phone}
                      />
                    </Field>
                  </div>
                  <Field htmlFor="create-supplier-address" label="Alamat">
                    <Textarea
                      id="create-supplier-address"
                      name="address"
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Jl. Industri Raya Blok A No. 12, Bekasi"
                      rows={2}
                      value={address}
                    />
                  </Field>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button onClick={handleClose} type="button" variant="secondary">
                      Batal
                    </Button>
                    <Button disabled={submitting || !code.trim() || !name.trim()} loading={submitting} type="submit" variant="primary">
                      <Plus aria-hidden className="size-4 mr-2" />
                      Simpan pemasok
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
