"use client";

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

type TabsContextValue = {
  active: string;
  setActive: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({
  defaultValue,
  children,
  className = "",
}: {
  defaultValue: string;
  children: ReactNode;
  className?: string;
}) {
  const [active, setActive] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div aria-label={label} className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto scroll-area -mx-1 px-1" role="tablist">
      {children}
    </div>
  );
}

export function Tab({ value, children, count }: { value: string; children: ReactNode; count?: number }) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tab must be used inside <Tabs>");
  const isActive = context.active === value;

  return (
    <button
      aria-selected={isActive}
      className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
        isActive
          ? "border-brand-600 text-brand-700"
          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
      }`}
      onClick={() => context.setActive(value)}
      role="tab"
      type="button"
    >
      {children}
      {typeof count === "number" ? (
        <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] ${isActive ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("TabPanel must be used inside <Tabs>");
  if (context.active !== value) return null;
  return <div role="tabpanel">{children}</div>;
}

export function useActiveTab() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("useActiveTab must be used inside <Tabs>");
  return context.active;
}
