import { Loader2 } from "lucide-react";

/**
 * Non-blocking dashboard-style placeholder (pulse only, no overlay).
 */
export function QuietPageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading content">
      <div className="h-8 max-w-md rounded-lg bg-slate-200/90" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-slate-100 bg-slate-200/70" />
        ))}
      </div>
      <div className="h-72 rounded-xl border border-slate-100 bg-slate-200/60" />
    </div>
  );
}

/**
 * Skeleton rows inside an existing table (thead stays visible).
 */
export function TableSkeletonRows({ rows = 8, cols = 6, compact = false }) {
  const cellPad = compact ? "px-3 py-2.5" : "px-4 py-3";
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-slate-100 last:border-0">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className={cellPad}>
              <div
                className="h-3.5 max-w-full rounded-md bg-slate-200/80 animate-pulse"
                style={{ width: `${42 + ((i + j * 5) % 45)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Small inline status — does not block layout or interaction elsewhere.
 */
export function InlineLoading({ label = "Loading…", className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center py-10 text-slate-400 ${className}`}>
      <Loader2 className="mb-2 h-6 w-6 animate-spin text-indigo-500/70" aria-hidden />
      {label ? <span className="text-xs font-medium text-slate-400">{label}</span> : null}
    </div>
  );
}
