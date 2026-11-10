import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inventory & Stock",
};

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
