function collectDocumentVerificationTransitions(previousDocs, nextDocs) {
  const prevById = new Map(
    (Array.isArray(previousDocs) ? previousDocs : []).map((d) => [String(d.id || "").trim(), d])
  );
  const out = [];
  for (const doc of Array.isArray(nextDocs) ? nextDocs : []) {
    const id = String(doc.id || "").trim();
    if (!id) continue;
    const prev = prevById.get(id);
    const nextStatus = String(doc.status || "").trim().toLowerCase();
    const prevStatus = prev ? String(prev.status || "").trim().toLowerCase() : "";
    if (nextStatus === "verified" && prevStatus !== "verified") {
      out.push({
        docId: id,
        docName: String(doc.name || doc.type || "Document"),
        docType: String(doc.type || ""),
        decision: "verified",
        rejectionReason: "",
      });
    }
    if (nextStatus === "rejected" && prevStatus !== "rejected") {
      out.push({
        docId: id,
        docName: String(doc.name || doc.type || "Document"),
        docType: String(doc.type || ""),
        decision: "rejected",
        rejectionReason: String(doc.rejectionReason || "").trim(),
      });
    }
  }
  return out;
}

module.exports = {
  collectDocumentVerificationTransitions,
};
