import type { Metadata } from "next";
import { Factory } from "lucide-react";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Masuk",
};

const highlights = [
  ["Workspace tertutup", "Akun disediakan oleh administrator Anda — tidak ada pendaftaran publik."],
  ["Teracak dengan baik", "Setiap pencatatannya divalidasi, transaksional, dan ditulis ke jejak audit."],
  ["Satu alur, dari ujung ke ujung", "Permintaan → MRP → pembelian → produksi → kualitas → biaya."],
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
          <p className="text-[11px] font-semibold tracking-widest text-brand-300 uppercase">ERP Manufaktur</p>
          <h1 className="mt-3 max-w-md text-3xl font-semibold tracking-tight text-balance text-white">
            Dari permintaan hingga biaya tercapai, dalam satu sistem yang dapat dicek.
          </h1>
          <dl className="mt-8 space-y-4">
            {highlights.map(([term, description]) => (
              <div className="border-l border-white/20 pl-4" key={term}>
                <dt className="text-[13px] font-medium text-white">{term}</dt>
                <dd className="mt-0.5 max-w-sm text-[13px] text-slate-300">{description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-[12px] text-slate-300/80">Manufaktur diskret · Asia/Jakarta</p>
      </section>

      <section className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-md bg-brand-600">
              <Factory aria-hidden className="size-5 text-white" />
            </span>
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">Masuk ke ManufactureOS</h1>
            <p className="mt-1 text-[13px] text-slate-600">Akses disediakan oleh administrator sistem Anda.</p>
          </div>

          <div className="hidden lg:block">
            <p className="text-[11px] font-semibold tracking-wider text-brand-600 uppercase">Selamat datang kembali</p>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900">Masuk ke workspace Anda</h1>
            <p className="mt-1 text-[13px] text-slate-600">Gunakan email kerja yang terdaftar oleh administrator.</p>
          </div>

          <div className="mt-7">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
