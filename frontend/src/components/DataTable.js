import { cn } from "../utils";
import {
  PAGE_SIZE_OPTIONS,
  computePagination,
  loadStoredPageSize,
  saveStoredPageSize,
} from "../hooks/usePagination";

export { PAGE_SIZE_OPTIONS, loadStoredPageSize, saveStoredPageSize };

/**
 * Shared table design tokens. Use in jsx()-style files for consistent styling
 * without restructuring markup.
 */
export const dt = {
  card: "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm",
  embedded: "overflow-hidden rounded-lg border border-slate-200 bg-white",
  scroll: "overflow-x-auto data-table-scroll",
  scrollY: "overflow-x-auto overflow-y-auto data-table-scroll",
  table: "min-w-full w-full border-collapse text-left text-sm",
  tableCompact: "min-w-full w-full border-collapse text-left text-xs",
  head: "border-b border-slate-200 bg-slate-50/95 text-xs font-semibold uppercase tracking-wide text-slate-500",
  headSticky:
    "sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur-sm text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226,232,240)]",
  body: "divide-y divide-slate-100 text-slate-800",
  row: "transition-colors duration-150 hover:bg-slate-50/70",
  rowInteractive:
    "transition-colors duration-150 cursor-pointer hover:bg-slate-50/80 active:bg-slate-100/50",
  th: "whitespace-nowrap px-4 py-3 font-semibold text-left",
  thRight: "whitespace-nowrap px-4 py-3 font-semibold text-right",
  thCompact: "whitespace-nowrap px-3 py-2.5 font-semibold text-left",
  thCompactRight: "whitespace-nowrap px-3 py-2.5 font-semibold text-right",
  td: "px-4 py-3 align-middle text-slate-600",
  tdPrimary: "px-4 py-3 align-middle font-medium text-slate-900",
  tdCompact: "px-3 py-2.5 align-middle text-slate-600",
  tdActions: "px-4 py-3 align-middle text-right whitespace-nowrap",
  toolbar:
    "flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3",
  emptyWrap: "px-6 py-16 text-center",
  emptyText: "text-sm text-slate-400",
  emptyRow: "px-4 py-14 text-center text-sm text-slate-400",
  loadingWrap: "px-6 py-12",
};

export function DataTable({ className, variant = "card", children, ...props }) {
  const variantClass =
    variant === "embedded" ? dt.embedded : variant === "plain" ? "" : dt.card;
  return (
    <div className={cn(variantClass, className)} {...props}>
      {children}
    </div>
  );
}

export function DataTableToolbar({ className, children }) {
  return <div className={cn(dt.toolbar, className)}>{children}</div>;
}

export function DataTableScroll({ className, maxHeight, children }) {
  return (
    <div
      className={cn(dt.scroll, maxHeight != null && dt.scrollY, className)}
      style={maxHeight != null ? { maxHeight } : undefined}
    >
      {children}
    </div>
  );
}

export function DataTableTable({ className, compact, children, ...props }) {
  return (
    <table
      className={cn(compact ? dt.tableCompact : dt.table, className)}
      {...props}
    >
      {children}
    </table>
  );
}

export function DataTableHead({ className, sticky, children }) {
  return (
    <thead className={cn(sticky ? dt.headSticky : dt.head, className)}>
      {children}
    </thead>
  );
}

export function DataTableBody({ className, children }) {
  return <tbody className={cn(dt.body, className)}>{children}</tbody>;
}

export function DataTableRow({ className, interactive, children, ...props }) {
  return (
    <tr
      className={cn(interactive ? dt.rowInteractive : dt.row, className)}
      {...props}
    >
      {children}
    </tr>
  );
}

export function DataTableTh({
  className,
  align = "left",
  compact,
  children,
  ...props
}) {
  const base =
    compact && align === "right"
      ? dt.thCompactRight
      : compact
        ? dt.thCompact
        : align === "right"
          ? dt.thRight
          : dt.th;
  return (
    <th
      scope="col"
      className={cn(base, align === "center" && "text-center", className)}
      {...props}
    >
      {children}
    </th>
  );
}

export function DataTableTd({
  className,
  align,
  variant,
  compact,
  children,
  ...props
}) {
  const base =
    variant === "primary"
      ? dt.tdPrimary
      : variant === "actions"
        ? dt.tdActions
        : compact
          ? dt.tdCompact
          : dt.td;
  return (
    <td
      className={cn(
        base,
        align === "right" && "text-right",
        align === "top" && "align-top",
        align === "center" && "text-center",
        className
      )}
      {...props}
    >
      {children}
    </td>
  );
}

export function DataTableEmpty({ colSpan, children, className }) {
  return (
    <tr>
      <td colSpan={colSpan} className={cn(dt.emptyRow, className)}>
        {children}
      </td>
    </tr>
  );
}

export function DataTablePagination({
  page,
  pageSize,
  totalRows,
  onPageChange,
  onPageSizeChange,
  rowLabel = "rows",
  suffix = "",
  loading = false,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  className,
}) {
  const { totalPages, currentPage, startIndex, endIndex } = computePagination(
    totalRows,
    page,
    pageSize
  );

  const rangeText =
    loading || totalRows == null
      ? "—"
      : totalRows
        ? `${startIndex + 1}–${endIndex}`
        : "0";

  const totalText =
    loading || totalRows == null ? "—" : String(totalRows);

  const label = totalRows === 1 ? rowLabel.replace(/s$/, "") : rowLabel;

  return (
    <div
      className={cn(
        "px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          {loading
            ? `Loading ${rowLabel}…`
            : totalRows
              ? `Showing ${rangeText} of ${totalText} ${label}`
              : `Showing 0 ${label}`}
          {suffix ? ` · ${suffix}` : ""}
        </span>
        <label className="inline-flex items-center gap-1.5 text-slate-500">
          <span className="text-slate-400">Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={loading}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <span className="text-slate-400 tabular-nums">
          {loading || totalRows == null
            ? "—"
            : totalRows
              ? `Page ${currentPage} of ${totalPages}`
              : "Page 1 of 1"}
        </span>
        <button
          type="button"
          className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading || currentPage <= 1 || !totalRows}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        >
          Previous
        </button>
        <button
          type="button"
          className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading || currentPage >= totalPages || !totalRows}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
