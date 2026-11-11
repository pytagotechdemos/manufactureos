"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";

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
      if (!res.ok) throw new Error(json.error?.message || "Gagal membuat data supplier");
      setNotice(`Supplier ${json.data.name} (${json.data.code}) berhasil ditambahkan.`);
      setCode("");
      setName("");
      setEmail("");
      setPhone("");
      setAddress("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat data supplier");
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
        Tambah supplier
      </Button>

      <Modal className="max-w-lg" label="Tambah Supplier Baru" onClose={handleClose} open={open}>
        <Card className="flex max-h-[90vh] flex-col shadow-2xl">
          <CardHeader
                actions={
                  <button
                    aria-label="Tutup form"
                    className="flex size-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none"
                    onClick={handleClose}
                    type="button"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                }
                description="Supplier / Vendor digunakan dalam penerbitan Purchase Order (PO) dan Purchase Request (PR)."
                title="Tambah Supplier Baru"
              />
              <CardBody className="space-y-4 overflow-y-auto">
                {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
                {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}
                <form className="space-y-3" onSubmit={handleSubmit}>
                  <div className="grid grid-cols-2 gap-3">
                    <Field htmlFor="create-supplier-code" label="Kode supplier" required>
                      <Input
                        id="create-supplier-code"
                        name="code"
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Contoh: SUPP-001"
                        required
                        value={code}
                      />
                    </Field>
                    <Field htmlFor="create-supplier-name" label="Nama supplier / vendor" required>
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
                      <Plus aria-hidden className="size-4" />
                      Simpan supplier
                    </Button>
                  </div>
                </form>
            </CardBody>
          </Card>
      </Modal>
    </>
  );
}
