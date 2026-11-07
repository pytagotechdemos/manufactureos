import type { Metadata } from "next";
import { Factory } from "lucide-react";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

const highlights = [
  ["Closed workspace", "Accounts are provisioned by your administrator — no public sign-up."],
  ["Traceable by design", "Every posting is validated, transactional and written to an audit trail."],
  ["One flow, end to end", "Demand → MRP → purchasing → production → quality → costing."],
] as const;

export default function LoginPage() {
  return (
    <main className="flex min-h-screen bg-canvas">
      <section className="relative hidden w-[46%] shrink-0 flex-col justify-between bg-slate-900 p-10 text-white lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 10%, rgba(37,99,235,0.45), transparent 45%), radial-gradient(circle at 80% 80%, rgba(14,165,233,0.25), transparent 50%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-brand-600">
              <Factory aria-hidden className="size-4.5 text-white" />
            </span>
            <span className="text-sm font-semibold tracking-tight">ManufactureOS</span>
          </div>
        </div>

        <div className="relative">
          <p className="text-[11px] font-semibold tracking-widest text-brand-200 uppercase">Manufacturing ERP</p>
          <h1 className="mt-3 max-w-md text-3xl font-semibold tracking-tight text-balance">
            From demand to delivered cost, in one auditable system.
          </h1>
          <dl className="mt-8 space-y-4">
            {highlights.map(([term, description]) => (
              <div className="border-l border-white/15 pl-4" key={term}>
                <dt className="text-[13px] font-medium text-white">{term}</dt>
                <dd className="mt-0.5 max-w-sm text-[13px] text-slate-400">{description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-[12px] text-slate-500">Discrete manufacturing · Asia/Jakarta</p>
      </section>

      <section className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-md bg-brand-600">
              <Factory aria-hidden className="size-5 text-white" />
            </span>
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">Sign in to ManufactureOS</h1>
            <p className="mt-1 text-[13px] text-slate-500">Access is provisioned by your system administrator.</p>
          </div>

          <div className="hidden lg:block">
            <p className="text-[11px] font-semibold tracking-wider text-brand-700 uppercase">Welcome back</p>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900">Sign in to your workspace</h1>
            <p className="mt-1 text-[13px] text-slate-500">Use the work email your administrator registered.</p>
          </div>

          <div className="mt-7">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
