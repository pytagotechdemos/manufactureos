import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quality Control (QC)",
};

export default function QualityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
