import { forwardRef } from "react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-xs hover:bg-brand-700 active:bg-brand-700 disabled:bg-brand-600",
  secondary:
    "border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 disabled:bg-white",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:bg-transparent",
  danger:
    "bg-red-600 text-white shadow-xs hover:bg-red-700 active:bg-red-700 disabled:bg-red-600",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
};

const baseClasses =
  "inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, disabled, className = "", children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
});

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: Variant;
  size?: Size;
}

/** A navigation link that matches the button visual language exactly. */
export function ButtonLink({ variant = "secondary", size = "md", className = "", ...props }: ButtonLinkProps) {
  return <Link className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} {...props} />;
}
