export default function DashboardLoading() {
  return (
    <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Memuat modul…">
      {/* Header Skeleton */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="h-3 w-28 rounded bg-slate-200" />
          <div className="h-7 w-56 rounded-md bg-slate-200" />
          <div className="h-4 w-96 max-w-full rounded bg-slate-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded-md bg-slate-200" />
          <div className="h-9 w-32 rounded-md bg-slate-200" />
        </div>
      </div>

      {/* Stat Grid Skeleton */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-2">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="h-8 w-16 rounded bg-slate-200" />
            <div className="h-3 w-32 rounded bg-slate-100" />
          </div>
        ))}
      </div>

      {/* Main Content / Table Skeleton */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="border-b border-slate-200 p-4 flex justify-between items-center">
          <div className="space-y-1.5">
            <div className="h-4 w-40 rounded bg-slate-200" />
            <div className="h-3 w-64 rounded bg-slate-100" />
          </div>
          <div className="h-8 w-28 rounded-md bg-slate-200" />
        </div>
        <div className="divide-y divide-slate-100 p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex justify-between items-center py-2">
              <div className="space-y-1">
                <div className="h-3.5 w-32 rounded bg-slate-200" />
                <div className="h-3 w-48 rounded bg-slate-100" />
              </div>
              <div className="h-4 w-16 rounded bg-slate-200" />
              <div className="h-5 w-20 rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
