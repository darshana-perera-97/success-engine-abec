import { toAbsoluteAssetUrl } from "../apiConfig";

export function buildAiCvPdfFileName(name) {
  const raw = String(name || "CV")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${raw.slice(0, 80) || "Generated-CV"}-AI-CV.pdf`;
}

export async function captureElementToPdfBlob(htmlElement) {
  if (!htmlElement) {
    throw new Error("Nothing to export.");
  }
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const canvas = await html2canvas(htmlElement, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgHeight = (canvas.height * pdfWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
  heightLeft -= pdfHeight;
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;
  }
  return pdf.output("blob");
}

export function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || "resume.pdf";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

export async function downloadFileFromUrl(url, fileName) {
  const resolvedUrl = toAbsoluteAssetUrl(String(url || "").trim());
  if (!resolvedUrl) throw new Error("Missing file URL.");
  const res = await fetch(resolvedUrl);
  if (!res.ok) throw new Error(`Failed to download file (${res.status}).`);
  const blob = await res.blob();
  triggerBlobDownload(blob, fileName || "resume.pdf");
}

function isPdfDocument(doc) {
  const name = String(doc?.name || "").toLowerCase();
  const mime = String(doc?.mime || "").toLowerCase();
  return name.endsWith(".pdf") || mime.includes("pdf");
}

/** Resolve a stored PDF URL for an AI-generated resume, if one was uploaded. */
export function resolveGeneratedCvPdfDownload(student) {
  if (!student || typeof student !== "object") return null;
  const docs = Array.isArray(student.documents) ? student.documents : [];
  const professionalCv = [...docs]
    .reverse()
    .find((doc) => String(doc?.type || "").trim() === "Professional CV" && doc?.url && isPdfDocument(doc));
  if (professionalCv?.url) {
    return {
      url: professionalCv.url,
      fileName: professionalCv.name || buildAiCvPdfFileName(student.generatedCV?.name),
    };
  }
  const cvFile = student.cvFile;
  if (cvFile?.url && isPdfDocument(cvFile)) {
    return {
      url: cvFile.url,
      fileName: cvFile.name || buildAiCvPdfFileName(student.generatedCV?.name),
    };
  }
  return null;
}
