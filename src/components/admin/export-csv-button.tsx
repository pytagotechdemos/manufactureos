"use client";

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
      Ekspor CSV
    </Button>
  );
}
