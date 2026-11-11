"use client";

import { createContext, useContext, useId, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

type TabsContextValue = {
  active: string;
  setActive: (value: string) => void;
  baseId: string;
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
  const baseId = useId();
  return (
    <TabsContext.Provider value={{ active, setActive, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div
      aria-label={label}
      className="scroll-area -mx-1 flex items-center gap-1 overflow-x-auto border-b border-slate-200 px-1"
      role="tablist"
    >
      {children}
    </div>
  );
}

export function Tab({ value, children, count }: { value: string; children: ReactNode; count?: number }) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tab must be used inside <Tabs>");
  const isActive = context.active === value;

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!context) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    const tabs = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
    );
    if (tabs.length === 0) return;

    const currentIndex = tabs.indexOf(event.currentTarget);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    nextTab?.focus();
    nextTab?.click();
  }

  return (
    <button
      aria-controls={`${context.baseId}-panel-${value}`}
      aria-selected={isActive}
      className={`-mb-px shrink-0 whitespace-nowrap rounded-t border-b-2 px-3 py-2 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1 ${
        isActive
          ? "border-brand-600 text-brand-700"
          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
      }`}
      id={`${context.baseId}-tab-${value}`}
      onClick={() => context.setActive(value)}
      onKeyDown={handleKeyDown}
      role="tab"
      tabIndex={isActive ? 0 : -1}
      type="button"
    >
      {children}
      {typeof count === "number" ? (
        <span
          className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] ${
            isActive ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("TabPanel must be used inside <Tabs>");
  return (
    <div
      aria-labelledby={`${context.baseId}-tab-${value}`}
      hidden={context.active !== value}
      id={`${context.baseId}-panel-${value}`}
      role="tabpanel"
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export function useActiveTab() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("useActiveTab must be used inside <Tabs>");
  return context.active;
}
