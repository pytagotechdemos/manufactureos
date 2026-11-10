"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";

type Role = { id: string; code: string; name: string; permissions: { permission: { code: string } }[] };

export function CreateUserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/v1/roles")
      .then((res) => res.json())
      .then((json) => {
        setRoles(json.data ?? []);
        setLoadingRoles(false);
      })
      .catch(() => setLoadingRoles(false));
  }, []);

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
      const res = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, roleId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Gagal membuat akun");
      setNotice(`Akun berhasil dibuat untuk ${json.data.email}.`);
      setName("");
      setEmail("");
      setPassword("");
      setRoleId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat akun");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        className="w-auto"
        disabled={loadingRoles}
        onClick={() => setOpen(true)}
        type="button"
        variant="primary"
      >
        <Plus aria-hidden className="size-4 mr-2" />
        Tambah pengguna
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
                description="Pendaftaran publik dinonaktifkan — akun baru dibuat oleh administrator."
                title="Tambah Pengguna"
              />
              <CardBody className="space-y-4">
                {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
                {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}
                <form className="space-y-3" onSubmit={handleSubmit}>
                  <Field htmlFor="create-user-name" label="Nama lengkap" required>
                    <Input
                      id="create-user-name"
                      name="name"
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Contoh: Budi Santoso"
                      required
                      value={name}
                    />
                  </Field>
                  <Field htmlFor="create-user-email" label="Email kerja" required>
                    <Input
                      id="create-user-email"
                      name="email"
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="budi@perusahaan.co.id"
                      required
                      type="email"
                      value={email}
                    />
                  </Field>
                  <Field htmlFor="create-user-password" hint="Minimal 12 karakter" label="Kata sandi" required>
                    <Input
                      id="create-user-password"
                      name="password"
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      type="password"
                      value={password}
                    />
                  </Field>
                  <Field htmlFor="create-user-role" label="Peran" required>
                    <Select id="create-user-role" name="roleId" onChange={(e) => setRoleId(e.target.value)} required value={roleId}>
                      <option value="">Pilih peran</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name} ({role.code})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button onClick={handleClose} type="button" variant="secondary">
                      Batal
                    </Button>
                    <Button disabled={submitting || !roleId} loading={submitting} type="submit" variant="primary">
                      <Plus aria-hidden className="size-4 mr-2" />
                      Buat akun
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
