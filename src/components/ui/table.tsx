import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="scroll-area overflow-x-auto">
      <table className={`w-full caption-bottom border-collapse text-sm ${className}`}>{children}</table>
    </div>
  );
}

export function TableHead({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <thead className={`bg-slate-50 border-b border-slate-200 ${className}`}>
      {children}
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function Th({ children, className = "", align = "left", ...props }: ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  const alignment = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase whitespace-nowrap ${alignment} ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export function Tr({ children, className = "", ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`h-11 transition-colors hover:bg-slate-50/70 ${className}`} {...props}>
      {children}
    </tr>
  );
}

export function Td({ children, className = "", align = "left", ...props }: TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  const alignment = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <td className={`px-4 py-2 align-middle text-[13px] text-slate-700 ${alignment} ${className}`} {...props}>
      {children}
    </td>
  );
}
