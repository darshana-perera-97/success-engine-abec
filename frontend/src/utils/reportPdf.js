import { REPORT_SECTIONS } from "./reportMetrics";

function formatPeriodLabel(dateFrom, dateTo) {
  const from = String(dateFrom || "").trim();
  const to = String(dateTo || "").trim();
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Through ${to}`;
  return "All dates";
}

function formatFilterValue(value, fallback = "All") {
  const v = String(value || "").trim();
  return v && v !== "All" ? v : fallback;
}

const CELL_PAD_X = 2.4;
const ROW_PAD_Y = 1.7;
const TABLE_LINE = 4.5;

function wrapLines(pdf, text, maxWidth) {
  const value = text == null ? "—" : String(text).trim();
  if (!value) return [""];
  const safeWidth = Math.max(4, maxWidth);
  if (pdf.getTextWidth(value) <= safeWidth + 0.4) return [value];
  const lines = pdf.splitTextToSize(value, safeWidth);
  return lines.map((line) => {
    if (pdf.getTextWidth(line) <= safeWidth + 0.25) return line;
    let cut = line;
    while (cut.length > 1 && pdf.getTextWidth(`${cut}…`) > safeWidth) {
      cut = cut.slice(0, -1);
    }
    return cut.length < line.length ? `${cut}…` : cut;
  });
}

function layoutColumns(specs, contentWidth) {
  const weights = specs.map((col) => col.weight);
  let mins = specs.map((col) => col.min);
  let minTotal = mins.reduce((sum, min) => sum + min, 0);
  if (minTotal > contentWidth) {
    const scale = contentWidth / minTotal;
    mins = mins.map((min) => min * scale);
    minTotal = contentWidth;
  }
  const extra = contentWidth - minTotal;
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const widths = mins.map((min, index) => min + (weights[index] / weightSum) * extra);
  widths[widths.length - 1] += contentWidth - widths.reduce((sum, width) => sum + width, 0);
  return specs.map((col, index) => ({ ...col, width: widths[index] }));
}

function slugify(value) {
  return String(value || "report")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveRowStatus(row) {
  if (row?.kind === "lead") return "Requested Lead";
  return String(row?.student?.status || "—").trim() || "—";
}

function drawReportHeader(pdf, { title, filters, scopeLabel, filteredStudentsCount, filteredReqStudentsCount, marginX, contentWidth, lineHeight }) {
  let y = 14;
  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  const titleLines = wrapLines(pdf, title, contentWidth);
  titleLines.forEach((line) => {
    pdf.text(line, marginX, y);
    y += lineHeight + 1;
  });
  y += 1;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(51, 65, 85);
  const metaLines = [
    `Period: ${formatPeriodLabel(filters.dateFrom, filters.dateTo)}`,
    scopeLabel ? `Scope: ${scopeLabel}` : "",
    `Generated: ${new Date().toLocaleString()}`,
    typeof filteredStudentsCount === "number"
      ? `Students: ${filteredStudentsCount}${filteredReqStudentsCount > 0 ? ` · Requested leads: ${filteredReqStudentsCount}` : ""}`
      : "",
    `Filters — Counselor: ${formatFilterValue(filters.counselor === "All" ? "All" : filters.counselorLabel || filters.counselor)} · Branch: ${formatFilterValue(filters.branch)} · Country: ${formatFilterValue(filters.country)}`,
  ].filter(Boolean);

  metaLines.forEach((line) => {
    wrapLines(pdf, line, contentWidth).forEach((wrapped) => {
      pdf.text(wrapped, marginX, y);
      y += lineHeight;
    });
  });
  pdf.setTextColor(15, 23, 42);
  y += 3;
  return y;
}

function resolveRowReceived(row) {
  const raw = String(row?.receivedAt || row?.completedAt || "").trim();
  if (!raw) return "—";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString();
}

function isOfferTableRow(row) {
  return row?.tableVariant === "offer";
}

function isInterviewTableRow(row) {
  return row?.tableVariant === "interview";
}

function columnSpecsForRows(rows) {
  if (rows.some(isOfferTableRow)) {
    return [
      { label: "Student", min: 88, weight: 6, padX: 4 },
      { label: "Country", min: 28, weight: 1 },
      { label: "Branch", min: 28, weight: 1 },
      { label: "Offer letter", min: 42, weight: 1.4 },
      { label: "Status", min: 26, weight: 0.8 },
      { label: "Received", min: 28, weight: 0.8 },
      { label: "Counselor", min: 36, weight: 1.2 },
    ];
  }
  if (rows.some(isInterviewTableRow)) {
    return [
      { label: "Student", min: 88, weight: 6, padX: 4 },
      { label: "Country", min: 28, weight: 1 },
      { label: "Branch", min: 28, weight: 1 },
      { label: "Interview", min: 42, weight: 1.4 },
      { label: "Outcome", min: 28, weight: 1 },
      { label: "Completed", min: 28, weight: 0.8 },
      { label: "Counselor", min: 36, weight: 1.2 },
    ];
  }
  return [
    { label: "Student", min: 96, weight: 5, padX: 4 },
    { label: "Country", min: 36, weight: 1 },
    { label: "Branch", min: 36, weight: 1 },
    { label: "Stage", min: 40, weight: 1 },
    { label: "Counselor", min: 44, weight: 1.2 },
  ];
}

function cellsForRow(row, columns) {
  const offer = columns.some((col) => col.label === "Offer letter");
  const interview = columns.some((col) => col.label === "Interview");
  const values = offer
    ? [row.name, row.country, row.branch, row.offerName, row.offerStatus, resolveRowReceived(row), row.counselor]
    : interview
      ? [row.name, row.country, row.branch, row.interviewType, row.interviewOutcome, resolveRowReceived(row), row.counselor]
      : [row.name, row.country, row.branch, resolveRowStatus(row), row.counselor];
  return values.map((value) => {
    const text = String(value ?? "").trim();
    return text || null;
  });
}

function drawFullWidthTable(pdf, {
  columns,
  bodyRows,
  marginX,
  pageHeight,
  contentWidth,
  startY,
  emptyLabel = "No rows.",
}) {
  let y = startY;
  const bottom = pageHeight - 10;

  const paintHeader = () => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(51, 65, 85);
    const wrapped = columns.map((col) => wrapLines(pdf, col.label, col.width - (col.padX ?? CELL_PAD_X) * 2));
    const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
    const rowHeight = lineCount * TABLE_LINE + ROW_PAD_Y * 2;
    pdf.setFillColor(241, 245, 249);
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.25);
    pdf.rect(marginX, y, contentWidth, rowHeight, "FD");
    const baseline = y + ROW_PAD_Y + TABLE_LINE - 1.15;
    let x = marginX;
    wrapped.forEach((lines, index) => {
      const col = columns[index];
      const padX = col.padX ?? CELL_PAD_X;
      if (index > 0) {
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.2);
        pdf.line(x, y, x, y + rowHeight);
      }
      lines.forEach((line, lineIndex) => {
        const textX = col.align === "right" ? x + col.width - padX : x + padX;
        pdf.text(line, textX, baseline + lineIndex * TABLE_LINE, {
          align: col.align === "right" ? "right" : "left",
        });
      });
      x += col.width;
    });
    y += rowHeight;
  };

  const paintBodyRow = (cells, rowIndex) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(30, 41, 59);
    const wrapped = columns.map((col, index) => wrapLines(pdf, cells[index], col.width - (col.padX ?? CELL_PAD_X) * 2));
    const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
    const rowHeight = lineCount * TABLE_LINE + ROW_PAD_Y * 2;
    if (y + rowHeight > bottom) {
      pdf.addPage();
      y = 14;
      paintHeader();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(30, 41, 59);
    }
    if (rowIndex % 2 === 1) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(marginX, y, contentWidth, rowHeight, "F");
    }
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.15);
    pdf.rect(marginX, y, contentWidth, rowHeight, "S");
    const baseline = y + ROW_PAD_Y + TABLE_LINE - 1.15;
    let x = marginX;
    wrapped.forEach((lines, index) => {
      const col = columns[index];
      const padX = col.padX ?? CELL_PAD_X;
      if (index > 0) {
        pdf.setDrawColor(203, 213, 225);
        pdf.setLineWidth(0.2);
        pdf.line(x, y, x, y + rowHeight);
      }
      lines.forEach((line, lineIndex) => {
        const textX = col.align === "right" ? x + col.width - padX : x + padX;
        pdf.text(line, textX, baseline + lineIndex * TABLE_LINE, {
          align: col.align === "right" ? "right" : "left",
        });
      });
      x += col.width;
    });
    y += rowHeight;
  };

  if (y + TABLE_LINE * 3 > bottom) {
    pdf.addPage();
    y = 14;
  }
  paintHeader();

  if (!bodyRows.length) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    const lines = wrapLines(pdf, emptyLabel, contentWidth - CELL_PAD_X * 2);
    const rowHeight = lines.length * TABLE_LINE + ROW_PAD_Y * 2;
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.15);
    pdf.rect(marginX, y, contentWidth, rowHeight, "S");
    const baseline = y + ROW_PAD_Y + TABLE_LINE - 1.15;
    lines.forEach((line, index) => {
      pdf.text(line, marginX + CELL_PAD_X, baseline + index * TABLE_LINE);
    });
    y += rowHeight + 5;
    return y;
  }

  bodyRows.forEach((cells, index) => paintBodyRow(cells, index));
  y += 5;
  return y;
}

function drawMetricTable(pdf, {
  metricLabel,
  rows = [],
  marginX,
  pageHeight,
  contentWidth,
  startY,
}) {
  let y = startY;
  if (y + 18 > pageHeight - 10) {
    pdf.addPage();
    y = 14;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(15, 23, 42);
  const title = `${metricLabel} (${rows.length})`;
  wrapLines(pdf, title, contentWidth).forEach((line) => {
    pdf.text(line, marginX, y);
    y += 5;
  });
  y += 1.5;

  const columns = layoutColumns(columnSpecsForRows(rows), contentWidth);

  return drawFullWidthTable(pdf, {
    columns,
    bodyRows: rows.map((row) => cellsForRow(row, columns)),
    marginX,
    pageHeight,
    contentWidth,
    startY: y,
    emptyLabel: "No students match this metric.",
  });
}

async function createReportPdf({
  counts = {},
  lists = {},
  filters = {},
  scopeLabel,
  filteredStudentsCount = 0,
  filteredReqStudentsCount = 0,
  sections = REPORT_SECTIONS,
  title = "Allocated Students Report",
}) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF("l", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 8;
  const contentWidth = pageWidth - marginX * 2;
  const lineHeight = 5;
  const countWidth = 36;

  let y = drawReportHeader(pdf, {
    title,
    filters,
    scopeLabel,
    filteredStudentsCount,
    filteredReqStudentsCount,
    marginX,
    contentWidth,
    lineHeight,
  });

  for (const section of sections) {
    if (y + 20 > pageHeight - 10) {
      pdf.addPage();
      y = 14;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(15, 23, 42);
    pdf.text(section.title, marginX, y);
    y += 7;

    y = drawFullWidthTable(pdf, {
      columns: [
        { label: "Metric", width: contentWidth - countWidth },
        { label: "Count", width: countWidth, align: "right" },
      ],
      bodyRows: section.metrics.map((metric) => [metric.label, String(counts[metric.id] ?? 0)]),
      marginX,
      pageHeight,
      contentWidth,
      startY: y,
      emptyLabel: "No metrics in this section.",
    });

    for (const metric of section.metrics) {
      y = drawMetricTable(pdf, {
        metricLabel: metric.label,
        rows: lists[metric.id] || [],
        marginX,
        pageHeight,
        contentWidth,
        startY: y,
      });
    }
    y += 2;
  }

  return pdf;
}

export async function downloadReportPdf(options) {
  const pdf = await createReportPdf(options);
  pdf.save(`allocated-students-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function downloadReportSectionPdf({ sectionId, sectionTitle, ...options }) {
  const section =
    REPORT_SECTIONS.find((entry) => entry.id === sectionId) ||
    (sectionTitle ? { id: sectionId, title: sectionTitle, metrics: [] } : null);
  if (!section) return;
  const pdf = await createReportPdf({
    ...options,
    sections: [section],
    title: `${section.title} Report`,
  });
  pdf.save(`${slugify(section.title)}-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function downloadReportMetricPdf({
  metricLabel,
  rows = [],
  filters = {},
  scopeLabel,
  filteredStudentsCount = 0,
  filteredReqStudentsCount = 0,
}) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF("l", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 8;
  const contentWidth = pageWidth - marginX * 2;
  const lineHeight = 5;

  const y = drawReportHeader(pdf, {
    title: String(metricLabel || "Report").trim(),
    filters,
    scopeLabel,
    filteredStudentsCount,
    filteredReqStudentsCount,
    marginX,
    contentWidth,
    lineHeight,
  });

  drawMetricTable(pdf, {
    metricLabel,
    rows,
    marginX,
    pageHeight,
    contentWidth,
    startY: y,
  });

  pdf.save(`${slugify(metricLabel)}-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function openReportPdfPreview(options) {
  const pdf = await createReportPdf(options);
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function openReportSectionPdfPreview({ sectionId, sectionTitle, ...options }) {
  const section =
    REPORT_SECTIONS.find((entry) => entry.id === sectionId) ||
    (sectionTitle ? { id: sectionId, title: sectionTitle, metrics: [] } : null);
  if (!section) return;
  const pdf = await createReportPdf({
    ...options,
    sections: [section],
    title: `${section.title} Report`,
  });
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
