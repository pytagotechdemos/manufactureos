import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Item Master",
};

export default function ItemsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
