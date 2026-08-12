import { useCallback, useEffect, useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_PAGE_SIZE = 10;
const STORAGE_KEY = "successEngine.tablePageSize";

export function loadStoredPageSize() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = parseInt(raw, 10);
    if (PAGE_SIZE_OPTIONS.includes(parsed)) return parsed;
  } catch {
    /* ignore */
  }
  return DEFAULT_PAGE_SIZE;
}

export function saveStoredPageSize(size) {
  try {
    localStorage.setItem(STORAGE_KEY, String(size));
  } catch {
    /* ignore */
  }
}

export function computePagination(totalRows, page, pageSize) {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalRows / safePageSize) || 1);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = totalRows ? (currentPage - 1) * safePageSize : 0;
  const endIndex = totalRows ? Math.min(startIndex + safePageSize, totalRows) : 0;
  return { totalPages, currentPage, startIndex, endIndex };
}

/** Stable pagination reset key — order of rows must not affect the key. */
export function buildReportRowsResetKey(rows = []) {
  return rows
    .map((row) => String(row?.key ?? "").trim())
    .filter(Boolean)
    .sort()
    .join("|");
}

/**
 * Client-side pagination for in-memory table rows.
 * Resets to page 1 when resetKey changes (e.g. filter state).
 */
export function useClientPagination(items, resetKey, options = {}) {
  const {
    initialPageSize,
    persistPageSize = true,
  } = options;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(() => {
    if (initialPageSize != null) return initialPageSize;
    return persistPageSize ? loadStoredPageSize() : DEFAULT_PAGE_SIZE;
  });

  const stableResetKey = useMemo(() => {
    const external = resetKey != null ? String(resetKey).trim() : "";
    if (external) return external;
    return buildReportRowsResetKey(items);
  }, [resetKey, items]);

  useEffect(() => {
    setPage(1);
  }, [stableResetKey]);

  const totalRows = items.length;
  const { totalPages, currentPage, startIndex, endIndex } = useMemo(
    () => computePagination(totalRows, page, pageSize),
    [totalRows, page, pageSize]
  );

  const pageItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );

  const setPageSize = useCallback((size) => {
    const next = Number(size);
    if (!PAGE_SIZE_OPTIONS.includes(next)) return;
    if (persistPageSize) saveStoredPageSize(next);
    setPageSizeState(next);
    setPage(1);
  }, [persistPageSize]);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    pageItems,
    totalRows,
    totalPages,
    startIndex,
    endIndex,
    currentPage,
  };
}

/**
 * Server-side pagination state (limit/offset passed to API separately).
 */
export function useServerPagination(resetKey) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(() => loadStoredPageSize());

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const setPageSize = useCallback((size) => {
    const next = Number(size);
    if (!PAGE_SIZE_OPTIONS.includes(next)) return;
    saveStoredPageSize(next);
    setPageSizeState(next);
    setPage(1);
  }, []);

  const offset = (page - 1) * pageSize;

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    limit: pageSize,
    offset,
  };
}
