"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";

interface ExportCsvButtonProps {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  disabled?: boolean;
}

export function ExportCsvButton({ filename, headers, rows, disabled }: ExportCsvButtonProps) {
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={disabled || rows.length === 0}
      onClick={() => downloadCsv(filename, headers, rows)}
    >
      <Download aria-hidden className="size-3.5" />
      Ekspor CSV
    </Button>
  );
}
