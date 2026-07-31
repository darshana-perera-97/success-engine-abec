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

function wrapLines(pdf, text, maxWidth) {
  return pdf.splitTextToSize(String(text || ""), maxWidth);
}

function truncate(text, maxLen) {
  const value = String(text || "").trim();
  if (value.length <= maxLen) return value || "—";
  return `${value.slice(0, Math.max(0, maxLen - 1))}…`;
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

function drawReportHeader(pdf, { title, filters, scopeLabel, filteredStudentsCount, filteredReqStudentsCount, marginX, lineHeight }) {
  let y = 16;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(title, marginX, y);
  y += lineHeight + 2;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Period: ${formatPeriodLabel(filters.dateFrom, filters.dateTo)}`, marginX, y);
  y += lineHeight;
  if (scopeLabel) {
    pdf.text(`Scope: ${scopeLabel}`, marginX, y);
    y += lineHeight;
  }
  pdf.text(`Generated: ${new Date().toLocaleString()}`, marginX, y);
  y += lineHeight;
  if (typeof filteredStudentsCount === "number") {
    pdf.text(
      `Students: ${filteredStudentsCount}${filteredReqStudentsCount > 0 ? ` · Requested leads: ${filteredReqStudentsCount}` : ""}`,
      marginX,
      y
    );
    y += lineHeight;
  }
  pdf.text(
    `Filters — Counselor: ${formatFilterValue(filters.counselor === "All" ? "All" : filters.counselorLabel || filters.counselor)} · Branch: ${formatFilterValue(filters.branch)} · Country: ${formatFilterValue(filters.country)}`,
    marginX,
    y
  );
  y += lineHeight + 3;
  return y;
}

function drawMetricTable(pdf, {
  metricLabel,
  rows = [],
  marginX,
  pageWidth,
  pageHeight,
  contentWidth,
  lineHeight,
  startY,
}) {
  let y = startY;
  const ensureSpace = (needed = lineHeight) => {
    if (y + needed > pageHeight - 16) {
      pdf.addPage();
      y = 16;
    }
  };

  ensureSpace(lineHeight * 2);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(`${metricLabel} (${rows.length})`, marginX, y);
  y += lineHeight + 1;

  const columns = [
    { label: "Student", width: 52 },
    { label: "Country", width: 34 },
    { label: "Branch", width: 34 },
    { label: "Stage", width: 36 },
    { label: "Counselor", width: 42 },
  ];

  ensureSpace(lineHeight + 2);
  pdf.setFillColor(241, 245, 249);
  pdf.rect(marginX, y - 3, contentWidth, 6, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  let x = marginX + 1;
  for (const col of columns) {
    pdf.text(col.label, x, y);
    x += col.width;
  }
  y += lineHeight;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  if (!rows.length) {
    ensureSpace(lineHeight);
    pdf.text("No students match this metric.", marginX + 2, y);
    y += lineHeight + 2;
    return y;
  }

  for (const row of rows) {
    ensureSpace(lineHeight + 1);
    x = marginX + 1;
    const cells = [
      truncate(row.name, 44),
      truncate(row.country, 28),
      truncate(row.branch, 28),
      truncate(resolveRowStatus(row), 30),
      truncate(row.counselor, 36),
    ];
    for (let i = 0; i < columns.length; i += 1) {
      pdf.text(String(cells[i] || "—"), x, y);
      x += columns[i].width;
    }
    y += lineHeight + 1;
  }

  y += 2;
  return y;
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
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;
  const lineHeight = 5;

  let y = drawReportHeader(pdf, {
    title,
    filters,
    scopeLabel,
    filteredStudentsCount,
    filteredReqStudentsCount,
    marginX,
    lineHeight,
  });

  const ensureSpace = (needed = lineHeight) => {
    if (y + needed > pageHeight - 16) {
      pdf.addPage();
      y = 16;
    }
  };

  for (const section of sections) {
    ensureSpace(lineHeight * 3);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text(section.title, marginX, y);
    y += lineHeight + 1;

    pdf.setFillColor(241, 245, 249);
    pdf.rect(marginX, y - 3, contentWidth, 6, "F");
    pdf.setFontSize(8);
    pdf.text("Metric", marginX + 2, y);
    pdf.text("Count", pageWidth - marginX - 12, y);
    y += lineHeight;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    for (const metric of section.metrics) {
      const count = counts[metric.id] ?? 0;
      const labelLines = wrapLines(pdf, metric.label, contentWidth - 24);
      const rowHeight = Math.max(lineHeight, labelLines.length * lineHeight);
      ensureSpace(rowHeight + 1);
      labelLines.forEach((line, idx) => {
        pdf.text(line, marginX + 2, y + idx * lineHeight);
      });
      pdf.text(String(count), pageWidth - marginX - 2, y, { align: "right" });
      y += rowHeight + 1;
    }
    y += 2;

    for (const metric of section.metrics) {
      y = drawMetricTable(pdf, {
        metricLabel: metric.label,
        rows: lists[metric.id] || [],
        marginX,
        pageWidth,
        pageHeight,
        contentWidth,
        lineHeight,
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
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;
  const lineHeight = 5;

  const y = drawReportHeader(pdf, {
    title: String(metricLabel || "Report").trim(),
    filters,
    scopeLabel,
    filteredStudentsCount,
    filteredReqStudentsCount,
    marginX,
    lineHeight,
  });

  drawMetricTable(pdf, {
    metricLabel,
    rows,
    marginX,
    pageWidth,
    pageHeight,
    contentWidth,
    lineHeight,
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
