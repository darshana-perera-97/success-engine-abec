import { formatMilestoneDisplayDate } from "./studentMilestoneRecords";

function truncate(text, maxLen) {
  const value = String(text || "").trim();
  if (value.length <= maxLen) return value;
  return `${value.slice(0, Math.max(0, maxLen - 1))}…`;
}

function formatPeriodLabel(dateFrom, dateTo) {
  const from = String(dateFrom || "").trim();
  const to = String(dateTo || "").trim();
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Through ${to}`;
  return "All dates";
}

export async function downloadMilestoneReportPdf({ rows, dateFrom, dateTo, scopeLabel }) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF("l", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 12;
  const marginTop = 14;
  const lineHeight = 5;
  const headerHeight = 7;

  const columns = [
    { label: "Date", width: 24 },
    { label: "Student", width: 38 },
    { label: "Milestone", width: 28 },
    { label: "Status", width: 28 },
    { label: "Branch", width: 30 },
    { label: "Country", width: 28 },
    { label: "Counselor", width: 38 },
  ];

  let y = marginTop;

  const addPageHeader = () => {
    y = marginTop;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("Student Milestones Report", marginX, y);
    y += lineHeight + 1;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(`Period: ${formatPeriodLabel(dateFrom, dateTo)}`, marginX, y);
    y += lineHeight;
    if (scopeLabel) {
      pdf.text(`Scope: ${scopeLabel}`, marginX, y);
      y += lineHeight;
    }
    pdf.text(`Generated: ${new Date().toLocaleString()}`, marginX, y);
    y += lineHeight;
    pdf.text(`Records: ${rows.length}`, marginX, y);
    y += lineHeight + 2;

    pdf.setFillColor(241, 245, 249);
    pdf.rect(marginX, y - headerHeight + 2, pageWidth - marginX * 2, headerHeight, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    let x = marginX + 1;
    for (const col of columns) {
      pdf.text(col.label, x, y);
      x += col.width;
    }
    y += 2;
    pdf.setFont("helvetica", "normal");
  };

  const ensureSpace = (needed = lineHeight) => {
    if (y + needed > pageHeight - marginTop) {
      pdf.addPage();
      addPageHeader();
    }
  };

  addPageHeader();

  if (!rows.length) {
    ensureSpace();
    pdf.setFontSize(9);
    pdf.text("No milestone records match the selected filters.", marginX, y + lineHeight);
    pdf.save(`student-milestones-${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  for (const row of rows) {
    ensureSpace(lineHeight + 1);
    let x = marginX + 1;
    const cells = [
      formatMilestoneDisplayDate(row.eventDateMs),
      truncate(row.studentName, 34),
      truncate(row.milestoneType, 24),
      truncate(row.status, 24),
      truncate(row.branch, 26),
      truncate(row.country, 24),
      truncate(row.counselorLabel, 34),
    ];
    for (let i = 0; i < columns.length; i += 1) {
      pdf.text(String(cells[i] || "—"), x, y + lineHeight);
      x += columns[i].width;
    }
    y += lineHeight + 1;
  }

  pdf.save(`student-milestones-${new Date().toISOString().slice(0, 10)}.pdf`);
}
