"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
        rememberMe: true,
        callbackURL: "/overview",
      });

      if (result.error) {
        setError("Gagal masuk. Periksa kembali email dan kata sandi Anda.");
        return;
      }

      router.push("/overview");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Periksa koneksi jaringan Anda lalu coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form aria-busy={isSubmitting} className="space-y-4" onSubmit={handleSubmit}>
      {error ? (
        <Alert tone="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Field htmlFor="email" label="Email kerja" required>
        <Input
          autoComplete="email"
          autoFocus
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nama@perusahaan.com"
          required
          type="email"
          value={email}
        />
      </Field>

      <Field htmlFor="password" label="Kata sandi" required>
        <div className="relative">
          <Input
            autoComplete="current-password"
            className="pr-10"
            id="password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            aria-pressed={showPassword}
            className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none"
            onClick={() => setShowPassword((visible) => !visible)}
            type="button"
          >
            {showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        </div>
      </Field>

      <Button className="w-full" loading={isSubmitting} type="submit" variant="primary">
        {isSubmitting ? "Memproses…" : "Masuk"}
        {isSubmitting ? null : <ArrowRight aria-hidden className="size-4" />}
      </Button>

      {process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === "true" ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800">Akun Super Admin (demo)</span>
            <button
              className="rounded font-medium text-brand-600 hover:text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none"
              onClick={() => {
                setEmail("admin@manufactureos.local");
                setPassword("ManufactureOS2026!");
              }}
              type="button"
            >
              Gunakan Akun Ini
            </button>
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-600">
            <p>Email: <span className="font-semibold text-slate-900 select-all">admin@manufactureos.local</span></p>
            <p>Password: <span className="font-semibold text-slate-900 select-all">ManufactureOS2026!</span></p>
          </div>
        </div>
      ) : null}

      <p className="text-center text-[12px] text-slate-600">
        Kesulitan masuk? Hubungi administrator sistem Anda.
      </p>
    </form>
  );
}
