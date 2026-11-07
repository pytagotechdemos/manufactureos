"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await authClient.signIn.email({
      email,
      password,
      rememberMe: true,
      callbackURL: "/overview",
    });

    if (result.error) {
      setError("Gagal masuk dengan kredensial tersebut.");
      setIsSubmitting(false);
      return;
    }

    router.push("/overview");
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {error ? (
        <Alert tone="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Field htmlFor="email" label="Email kerja" required>
        <Input
          autoComplete="email"
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
        <Input
          autoComplete="current-password"
          id="password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </Field>

      <Button className="w-full" loading={isSubmitting} type="submit" variant="primary">
        {isSubmitting ? "Memproses…" : "Masuk"}
        {isSubmitting ? null : <ArrowRight aria-hidden className="size-4" />}
      </Button>

      <p className="text-center text-[12px] text-slate-600">
        Kesulitan masuk? Hubungi administrator sistem Anda.
      </p>
    </form>
  );
}
