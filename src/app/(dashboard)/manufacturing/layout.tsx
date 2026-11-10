import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manufacturing Orders",
};

export default function ManufacturingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
