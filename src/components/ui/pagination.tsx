"use client";

import { useId } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";

export interface PaginationProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function Pagination({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className = "",
}: PaginationProps) {
  const pageSizeId = useId();

  if (totalItems <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startItem = (safePage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, safePage * pageSize);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600 sm:px-6 ${className}`}
    >
      <div className="flex items-center gap-2">
        <span>
          Menampilkan <strong className="font-semibold text-slate-900">{startItem}</strong>–
          <strong className="font-semibold text-slate-900">{endItem}</strong> dari{" "}
          <strong className="font-semibold text-slate-900">{totalItems}</strong> baris
        </span>
        {onPageSizeChange ? (
          <div className="ml-3 flex items-center gap-1.5">
            <label htmlFor={pageSizeId} className="text-slate-500">
              Per hal:
            </label>
            <select
              id={pageSizeId}
              aria-label="Pilih jumlah baris per halaman"
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-2xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-slate-500">
          Hal. <strong className="font-semibold text-slate-900">{safePage}</strong> / {totalPages}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Halaman sebelumnya"
            className="h-7 px-2"
          >
            <ChevronLeft aria-hidden className="size-3.5" />
            <span className="sr-only sm:not-sr-only">Sebelumnya</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Halaman berikutnya"
            className="h-7 px-2"
          >
            <span className="sr-only sm:not-sr-only">Berikutnya</span>
            <ChevronRight aria-hidden className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
