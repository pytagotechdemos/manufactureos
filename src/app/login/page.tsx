import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Sign in | ManufactureOS",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-700">ManufactureOS</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Sign in to your workspace</h1>
          <p className="mt-2 text-sm text-slate-600">Access is provisioned by your system administrator.</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
