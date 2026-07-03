import { API_BASE } from "./apiConfig";

export async function loginAdmin(email, password) {
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || "Invalid email or password."
      };
    }
    return { ok: true, user: data.user || null };
  } catch {
    return {
      ok: false,
      error: "Cannot reach login server. Please contact the Support team."
    };
  }
}

export async function changeStudentDefaultPassword(email, currentPassword, newPassword) {
  try {
    const res = await fetch(`${API_BASE}/api/auth/student/change-default-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, currentPassword, newPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to update password." };
    }
    return { ok: true, message: data.message || "Password updated successfully." };
  } catch {
    return { ok: false, error: "Cannot reach login server. Please contact the Support team." };
  }
}

export async function requestPasswordOtp(email) {
  try {
    const res = await fetch(`${API_BASE}/api/auth/forgot-password/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to send OTP." };
    }
    return { ok: true, message: data.message || "OTP sent." };
  } catch {
    return { ok: false, error: "Cannot reach login server. Please contact the Support team." };
  }
}

export async function resetPasswordWithOtp(email, otp, newPassword) {
  try {
    const res = await fetch(`${API_BASE}/api/auth/forgot-password/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp, newPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to reset password." };
    }
    return { ok: true, message: data.message || "Password reset successful." };
  } catch {
    return { ok: false, error: "Cannot reach login server. Please contact the Support team." };
  }
}

export async function getAccounts() {
  try {
    const res = await fetch(`${API_BASE}/api/accounts`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load accounts." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach account server. Please contact the Support team."
    };
  }
}

export async function createAccount(payload) {
  try {
    const portalOrigin = typeof window !== "undefined" ? window.location.origin : "";
    const res = await fetch(`${API_BASE}/api/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, portalOrigin })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to create account." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach account server. Please contact the Support team."
    };
  }
}

export async function updateAccountRole(accountId, { role, branch = "", country = "" }) {
  try {
    const res = await fetch(`${API_BASE}/api/accounts/${encodeURIComponent(accountId)}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, branch, country })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to update access level." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach account server. Please contact the Support team."
    };
  }
}

export async function updateCounselorTeamLead(accountId, teamLeadId) {
  try {
    const res = await fetch(`${API_BASE}/api/accounts/${encodeURIComponent(accountId)}/team-lead`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamLeadId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to update Team Lead assignment." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach account server. Please contact the Support team."
    };
  }
}

export async function resetAccountPassword(accountId, newPassword) {
  try {
    const res = await fetch(`${API_BASE}/api/accounts/${encodeURIComponent(accountId)}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to reset password." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach account server. Please contact the Support team."
    };
  }
}

export async function updateAdminAvatar(avatar) {
  try {
    const res = await fetch(`${API_BASE}/api/accounts/admin/avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to update admin avatar." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach account server. Please contact the Support team."
    };
  }
}

export async function updateAccountAvatar(email, avatar) {
  try {
    const res = await fetch(`${API_BASE}/api/accounts/avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, avatar })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to update account avatar." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach account server. Please contact the Support team."
    };
  }
}

export async function updateAccountProfileContact(currentEmail, email, phone) {
  try {
    const res = await fetch(`${API_BASE}/api/accounts/profile-contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentEmail, email, phone })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to update profile contact." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach account server. Please contact the Support team."
    };
  }
}

export async function updateStudentAvatar(studentId, avatar) {
  try {
    const res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(studentId)}/avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to update student avatar." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach student server. Please contact the Support team." };
  }
}

export async function uploadStudentCv(studentId, dataUrl, fileName) {
  try {
    const res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(studentId)}/cv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, fileName })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to upload CV." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach student server. Please contact the Support team." };
  }
}

export async function uploadStudentDocument(studentId, { dataUrl, fileName, docType, phase = 1, tier = "Global", taskDocumentLink }) {
  try {
    const body = { dataUrl, fileName, docType, phase, tier };
    if (taskDocumentLink && typeof taskDocumentLink === "object") {
      body.taskDocumentLink = taskDocumentLink;
    }
    const res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(studentId)}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to upload document." };
    }
    return { ok: true, data: data.data, document: data.document || null, documentUploadWhatsapp: data.documentUploadWhatsapp || null };
  } catch {
    return { ok: false, error: "Cannot reach student server. Please contact the Support team." };
  }
}

export async function uploadStudentProfileOtherDocument(studentId, { dataUrl, fileName, label, slot, append }) {
  try {
    const res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(studentId)}/profile-other-documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUrl,
        fileName,
        label,
        ...(append === true ? { append: true } : { slot })
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to upload document." };
    }
    return { ok: true, data: data.data, profileOtherDocument: data.profileOtherDocument || null };
  } catch {
    return { ok: false, error: "Cannot reach student server. Please contact the Support team." };
  }
}

export async function uploadStudentUniversityOfferLetters(studentId, { offerStatus, files }) {
  try {
    const normalizedFiles = Array.isArray(files)
      ? files
          .map((f) => ({
            dataUrl: typeof f?.dataUrl === "string" ? f.dataUrl : typeof f?.dataURL === "string" ? f.dataURL : "",
            fileName: typeof f?.fileName === "string" ? f.fileName : "offer-letter"
          }))
          .filter((f) => f.dataUrl)
      : [];
    const firstFile = normalizedFiles[0] || null;
    const primaryBody = {
      offerStatus,
      files: normalizedFiles
    };
    let res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(studentId)}/university-offer-letters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(primaryBody)
    });
    let data = await res.json().catch(() => ({}));
    // Backward-compatible retry for servers that only accept single-file fields.
    if (
      !res.ok &&
      firstFile &&
      (String(data?.error || "").toLowerCase().includes("invalid request body") ||
        String(data?.error || "").toLowerCase().includes("at least one offer letter"))
    ) {
      const fallbackBody = {
        offerStatus,
        dataUrl: firstFile.dataUrl,
        fileName: firstFile.fileName
      };
      res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(studentId)}/university-offer-letters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fallbackBody)
      });
      data = await res.json().catch(() => ({}));
    }
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to upload offer letters." };
    }
    return {
      ok: true,
      data: data.data,
      universityOfferLetters: data.universityOfferLetters || [],
      offerLetterWhatsappNotifications: Array.isArray(data.offerLetterWhatsappNotifications)
        ? data.offerLetterWhatsappNotifications
        : []
    };
  } catch {
    return { ok: false, error: "Cannot reach student server. Please contact the Support team." };
  }
}

export async function getBranches() {
  try {
    const res = await fetch(`${API_BASE}/api/branches`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load branches." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach branch server. Please contact the Support team." };
  }
}

export async function createBranch(location) {
  try {
    const res = await fetch(`${API_BASE}/api/branches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to add branch." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach branch server. Please contact the Support team." };
  }
}

export async function getCountries(branch) {
  try {
    const branchName = String(branch || "").trim();
    const query = branchName ? `?branch=${encodeURIComponent(branchName)}` : "";
    const res = await fetch(`${API_BASE}/api/countries${query}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load countries." };
    }
    return { ok: true, data: data.data, branchCountriesEnabled: data.branchCountriesEnabled === true };
  } catch {
    return { ok: false, error: "Cannot reach country server. Please contact the Support team." };
  }
}

/** Admin / Manager: interest-form submissions (optional branch filter for managers). */
export async function getReqStudents(params = {}) {
  try {
    const branch = String(params.branch || "").trim();
    const query = branch ? `?branch=${encodeURIComponent(branch)}` : "";
    const res = await fetch(`${API_BASE}/api/req-students${query}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load requested students." };
    }
    return { ok: true, data: data.data, branchCountriesEnabled: data.branchCountriesEnabled === true };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

/** Admin/Manager: bulk import Meta leads (or similar) into req-students.json */
export async function bulkImportReqStudents(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  if (!rows.length) {
    return { ok: false, error: "At least one lead is required." };
  }
  try {
    const res = await fetch(`${API_BASE}/api/req-students/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: rows })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || "Failed to import leads.",
        skipped: Array.isArray(data.skipped) ? data.skipped : []
      };
    }
    return {
      ok: true,
      data: Array.isArray(data.data) ? data.data : [],
      skipped: Array.isArray(data.skipped) ? data.skipped : []
    };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

/** Remove one interest-form row from backend/data/req-students.json (e.g. after onboarding to pipeline). */
export async function deleteReqStudent(requestId) {
  const id = String(requestId || "").trim();
  if (!id) {
    return { ok: false, error: "Request id is required." };
  }
  try {
    const res = await fetch(`${API_BASE}/api/req-students/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to remove request." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

/** Public inquiry form — no login. Appends to backend/data/req-students.json */
export async function submitStudentRegistrationRequest(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/student-registration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Submission failed." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return {
      ok: false,
      error: "Cannot reach the server. Check your connection or try again later."
    };
  }
}

/** Public student-reg-form API alias. Same payload and behavior as student-registration. */
export async function submitStudentRegFormRequest(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/student-reg-form`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Submission failed." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return {
      ok: false,
      error: "Cannot reach the server. Check your connection or try again later."
    };
  }
}

export async function createCountry(name) {
  try {
    const res = await fetch(`${API_BASE}/api/countries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to add country." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach country server. Please contact the Support team." };
  }
}

export async function deleteCountry(name) {
  const countryName = String(name || "").trim();
  if (!countryName) {
    return { ok: false, error: "Country name is required." };
  }
  try {
    const res = await fetch(`${API_BASE}/api/countries/${encodeURIComponent(countryName)}`, {
      method: "DELETE"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to remove country." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach country server. Please contact the Support team." };
  }
}

export async function updateBranchCountries(branchId, countries) {
  const id = String(branchId || "").trim();
  if (!id) return { ok: false, error: "Branch id is required." };
  const list = Array.isArray(countries) ? countries : [];
  try {
    const res = await fetch(`${API_BASE}/api/branches/${encodeURIComponent(id)}/countries`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countries: list })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to save branch countries." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach branch server. Please contact the Support team." };
  }
}

export async function createBranchCountry(branchId, name) {
  const id = String(branchId || "").trim();
  const countryName = String(name || "").trim();
  if (!id) return { ok: false, error: "Branch id is required." };
  if (!countryName) return { ok: false, error: "Country name is required." };
  try {
    const res = await fetch(`${API_BASE}/api/branches/${encodeURIComponent(id)}/countries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: countryName })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to add country to branch." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach branch server. Please contact the Support team." };
  }
}

export async function deleteBranchCountry(branchId, name) {
  const id = String(branchId || "").trim();
  const countryName = String(name || "").trim();
  if (!id) return { ok: false, error: "Branch id is required." };
  if (!countryName) return { ok: false, error: "Country name is required." };
  try {
    const res = await fetch(
      `${API_BASE}/api/branches/${encodeURIComponent(id)}/countries/${encodeURIComponent(countryName)}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to remove country from branch." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach branch server. Please contact the Support team." };
  }
}

export async function getDocMapping(country) {
  try {
    const res = await fetch(`${API_BASE}/api/doc-mapping?country=${encodeURIComponent(country)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "Failed to load doc mapping." };
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach server." };
  }
}

export async function getAllDocMapping() {
  try {
    const res = await fetch(`${API_BASE}/api/doc-mapping/all`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "Failed to load doc mapping." };
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach server." };
  }
}

export async function getDocMappingIntakeOptions(country) {
  const key = String(country || "").trim();
  if (!key) return { ok: false, error: "Country is required." };
  try {
    const res = await fetch(`${API_BASE}/api/doc-mapping/intake-options?country=${encodeURIComponent(key)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to load intake options." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach server." };
  }
}

export async function saveDocMappingIntakeOptions(country, intakeOptions, role = "Admin") {
  try {
    const res = await fetch(`${API_BASE}/api/doc-mapping/intake-options`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country, intakeOptions, role }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to save intake options." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach server." };
  }
}

export async function saveDocMappingStages(country, stages) {
  try {
    const res = await fetch(`${API_BASE}/api/doc-mapping/stages`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country, stages })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "Failed to save stages." };
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach server." };
  }
}

export async function saveDocMappingPipelineDocs(country, docs) {
  try {
    const res = await fetch(`${API_BASE}/api/doc-mapping/pipeline-docs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country, docs })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "Failed to save pipeline docs." };
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach server." };
  }
}

export async function saveDocMappingVisaDocs(country, docs) {
  try {
    const res = await fetch(`${API_BASE}/api/doc-mapping/visa-docs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country, docs })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "Failed to save visa docs." };
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach server." };
  }
}

export async function saveDocMappingStageTasks(country, stageTasks) {
  try {
    const res = await fetch(`${API_BASE}/api/doc-mapping/stage-tasks`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country, stageTasks })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "Failed to save stage tasks." };
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach server." };
  }
}

export async function saveDocMappingAccountDetailsStage(country, accountDetailsStageId) {
  try {
    const res = await fetch(`${API_BASE}/api/doc-mapping/account-details-stage`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country, accountDetailsStageId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to save account details stage." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach server." };
  }
}

export async function saveDocMappingDocumentNotify(country, documentNotifyDocs) {
  try {
    const res = await fetch(`${API_BASE}/api/doc-mapping/document-notify`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country, documentNotifyDocs })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to save document notify settings." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach server." };
  }
}

export async function saveDocMappingStageDeadlines(country, stageDeadlines) {
  try {
    const res = await fetch(`${API_BASE}/api/doc-mapping/stage-deadlines`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country, stageDeadlines })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to save stage deadlines." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach server." };
  }
}

export async function getPaymentAccounts() {
  try {
    const res = await fetch(`${API_BASE}/api/payment-accounts`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load payment accounts." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach payment accounts server. Please contact the Support team." };
  }
}

export async function createPaymentAccount(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/payment-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to add payment account." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach payment accounts server. Please contact the Support team." };
  }
}

export async function deletePaymentAccount(accountId) {
  const id = String(accountId || "").trim();
  if (!id) return { ok: false, error: "Account ID is required." };
  try {
    const res = await fetch(`${API_BASE}/api/payment-accounts/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to remove payment account." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach payment accounts server. Please contact the Support team." };
  }
}

export async function getMeetingSettings() {
  try {
    const res = await fetch(`${API_BASE}/api/meeting-settings`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to load meeting settings." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach meeting settings server. Please contact the Support team." };
  }
}

export async function updateMeetingSettings(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/meeting-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to save meeting settings." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach meeting settings server. Please contact the Support team." };
  }
}

export async function getSystemData() {
  try {
    const res = await fetch(`${API_BASE}/api/system-data`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to load system settings." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach system settings server. Please contact the Support team." };
  }
}

export async function updateSystemData(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/system-data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to save system settings." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach system settings server. Please contact the Support team." };
  }
}

export async function getBookings(params = {}) {
  try {
    const query = new URLSearchParams();
    if (params.counselorId) query.set("counselorId", params.counselorId);
    if (params.date) query.set("date", params.date);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const res = await fetch(`${API_BASE}/api/bookings${suffix}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load bookings." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach bookings server. Please contact the Support team." };
  }
}

export async function createBooking(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to create booking block." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach bookings server. Please contact the Support team." };
  }
}

export async function deleteBooking(bookingId) {
  try {
    const res = await fetch(`${API_BASE}/api/bookings/${encodeURIComponent(bookingId)}`, {
      method: "DELETE"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to remove booking block." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return { ok: false, error: "Cannot reach bookings server. Please contact the Support team." };
  }
}

export async function getAppointments() {
  try {
    const res = await fetch(`${API_BASE}/api/appointments`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load appointments." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach appointments server. Please contact the Support team." };
  }
}

export async function createAppointment(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to create appointment." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach appointments server. Please contact the Support team." };
  }
}

export async function getActivities() {
  try {
    const res = await fetch(`${API_BASE}/api/activities`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load activities." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach activity server. Please contact the Support team." };
  }
}

export async function createActivity(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to save activity." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach activity server. Please contact the Support team." };
  }
}

export async function updateAppointment(appointmentId, payload) {
  try {
    const res = await fetch(`${API_BASE}/api/appointments/${encodeURIComponent(appointmentId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to update appointment." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach appointments server. Please contact the Support team." };
  }
}

export async function getInvoices() {
  try {
    const res = await fetch(`${API_BASE}/api/invoices`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load invoices." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach invoice server. Please contact the Support team." };
  }
}

export async function getStudentInvoices() {
  try {
    const res = await fetch(`${API_BASE}/api/st-invoices`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load invoices." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach invoice server. Please contact the Support team." };
  }
}

export async function getFilteredInvoices(status = "all", query = "") {
  try {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/api/st-invoices/${encodeURIComponent(status)}${qs ? `?${qs}` : ""}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load invoices." };
    }
    return { ok: true, data: data.data, counts: data.counts || null };
  } catch {
    return { ok: false, error: "Cannot reach invoice server. Please contact the Support team." };
  }
}

export async function getInvoicesByStudentId(studentId) {
  try {
    const res = await fetch(`${API_BASE}/api/st-invoices/student/${encodeURIComponent(studentId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load student invoices." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach invoice server. Please contact the Support team." };
  }
}

export async function getTasks() {
  try {
    const res = await fetch(`${API_BASE}/api/tasks`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load tasks." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach task server. Please contact the Support team." };
  }
}

export async function createTask(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to create task." };
    }
    return { ok: true, data: data.data, taskAssignmentWhatsapp: data.taskAssignmentWhatsapp };
  } catch {
    return { ok: false, error: "Cannot reach task server. Please contact the Support team." };
  }
}

export async function updateTask(taskId, payload) {
  try {
    const res = await fetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to update task." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach task server. Please contact the Support team." };
  }
}

export async function createInvoice(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to create invoice." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach invoice server. Please contact the Support team." };
  }
}

export async function updateInvoice(appointmentId, payload) {
  try {
    const res = await fetch(`${API_BASE}/api/invoices/${encodeURIComponent(appointmentId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to update invoice." };
    }
    return {
      ok: true,
      data: data.data,
      invoiceWhatsappNotification: data.invoiceWhatsappNotification || null,
    };
  } catch {
    return { ok: false, error: "Cannot reach invoice server. Please contact the Support team." };
  }
}

export async function uploadInvoicePaymentProof(invoiceId, dataUrl, fileName, options = {}) {
  try {
    const payload = {};
    if (dataUrl) {
      payload.dataUrl = dataUrl;
      payload.fileName = fileName || "payment-proof";
    }
    const claimedAmount = Number(options.claimedAmount);
    if (Number.isFinite(claimedAmount) && claimedAmount > 0) {
      payload.claimedAmount = claimedAmount;
    }
    if (options.paymentMethod) {
      payload.paymentMethod = String(options.paymentMethod);
    }
    const res = await fetch(`${API_BASE}/api/invoices/${encodeURIComponent(invoiceId)}/payment-proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to upload payment proof." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach invoice server. Please contact the Support team." };
  }
}

export async function resendInvoiceWhatsapp(invoiceId, payload = {}) {
  try {
    const res = await fetch(`${API_BASE}/api/invoices/${encodeURIComponent(invoiceId)}/resend-whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to resend invoice WhatsApp." };
    }
    return { ok: true, data: data.data, whatsappDelivery: data.whatsappDelivery || null };
  } catch {
    return { ok: false, error: "Cannot reach invoice server. Please contact the Support team." };
  }
}

export async function getStudents(params = {}) {
  try {
    const query = new URLSearchParams();
    if (params.role) query.set("role", params.role);
    if (params.userId) query.set("userId", params.userId);
    if (params.branch) query.set("branch", params.branch);
    if (params.country) query.set("country", params.country);
    if (params.summary) query.set("summary", "1");
    const qs = query.toString();
    const res = await fetch(`${API_BASE}/api/students${qs ? `?${qs}` : ""}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load students." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach student server. Please contact the Support team." };
  }
}

export async function sendStudentLoginDetails(studentId, payload = {}) {
  try {
    const id = String(studentId || "").trim();
    if (!id) return { ok: false, error: "Student ID is required." };
    const res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(id)}/send-login-details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to send login details." };
    }
    return { ok: true, data: data.data || null, delivery: data.delivery || data.data?.delivery || null };
  } catch {
    return { ok: false, error: "Cannot reach student server. Please contact the Support team." };
  }
}

export async function getStudentById(studentId) {
  try {
    const id = String(studentId || "").trim();
    if (!id) return { ok: false, error: "Student ID is required." };
    const res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(id)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to load student." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach student server. Please contact the Support team." };
  }
}

export async function searchStudents(params = {}) {
  try {
    const query = new URLSearchParams();
    if (params.role) query.set("role", params.role);
    if (params.userId) query.set("userId", params.userId);
    if (params.branch) query.set("branch", params.branch);
    if (params.userCountry) query.set("userCountry", params.userCountry);
    if (params.q) query.set("q", params.q);
    if (params.counselor) query.set("counselor", params.counselor);
    if (params.country) query.set("country", params.country);
    if (params.status) query.set("status", params.status);
    if (params.sortBy) query.set("sortBy", params.sortBy);
    if (params.sortDirection) query.set("sortDirection", params.sortDirection);
    if (params.summary) query.set("summary", "1");
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    const res = await fetch(`${API_BASE}/api/students/search${qs ? `?${qs}` : ""}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to search students." };
    }
    return { ok: true, data: data.data, total: data.total || 0, countries: data.countries || [] };
  } catch {
    return { ok: false, error: "Cannot reach student server. Please contact the Support team." };
  }
}

export async function getPipelineCounts(params = {}) {
  try {
    const query = new URLSearchParams();
    if (params.role) query.set("role", params.role);
    if (params.userId) query.set("userId", params.userId);
    if (params.branch) query.set("branch", params.branch);
    if (params.country) query.set("country", params.country);
    const qs = query.toString();
    const res = await fetch(`${API_BASE}/api/students/pipeline-counts${qs ? `?${qs}` : ""}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to load pipeline counts." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach student server. Please contact the Support team." };
  }
}

export async function createStudent(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to create student." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach student server. Please contact the Support team." };
  }
}

export async function updateStudent(studentId, payload) {
  try {
    const res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(studentId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to update student." };
    }
    return {
      ok: true,
      data: data.data,
      documentWhatsappNotifications: Array.isArray(data.documentWhatsappNotifications)
        ? data.documentWhatsappNotifications
        : [],
      inquiryScheduledCallWhatsapp: data.inquiryScheduledCallWhatsapp || null,
    };
  } catch {
    return { ok: false, error: "Cannot reach student server. Please contact the Support team." };
  }
}

export async function moveStudentToRequests(studentId, nearestOffice) {
  try {
    const res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(studentId)}/move-to-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nearestOffice })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to move student to requested list." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return { ok: false, error: "Cannot reach student server. Please contact the Support team." };
  }
}

export async function getUniversityPrograms(options = {}) {
  try {
    const includeHidden = options.includeHidden ? "?includeHidden=1" : "";
    const res = await fetch(`${API_BASE}/api/university-programs${includeHidden}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load university programs." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach university data server. Please contact the Support team."
    };
  }
}

export async function createUniversityProgram(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/university-programs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to add university program." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach university data server. Please contact the Support team."
    };
  }
}

export async function updateUniversityProgramVisibility(programId, isHidden) {
  try {
    const res = await fetch(`${API_BASE}/api/university-programs/${encodeURIComponent(programId)}/visibility`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isHidden })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to update university visibility." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach university data server. Please contact the Support team."
    };
  }
}

export async function deleteUniversityProgram(programId) {
  try {
    const res = await fetch(`${API_BASE}/api/university-programs/${encodeURIComponent(programId)}`, {
      method: "DELETE"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to remove university program." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return {
      ok: false,
      error: "Cannot reach university data server. Please contact the Support team."
    };
  }
}

export async function getChats(userId, options = {}) {
  try {
    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    if (options.markRead === false) params.set("markRead", "0");
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${API_BASE}/api/chats${query}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load chats." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach chat server. Please contact the Support team."
    };
  }
}

export async function sendChatMessage(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to send message." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach chat server. Please contact the Support team."
    };
  }
}

export async function getWhatsappStatus(userId) {
  try {
    const query = new URLSearchParams({ userId: String(userId || "").trim() });
    const res = await fetch(`${API_BASE}/api/whatsapp/status?${query.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to load WhatsApp status." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach WhatsApp server. Please contact the Support team."
    };
  }
}

export async function connectWhatsapp(userId) {
  try {
    const res = await fetch(`${API_BASE}/api/whatsapp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to start WhatsApp connection." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach WhatsApp server. Please contact the Support team."
    };
  }
}

export async function disconnectWhatsapp(userId) {
  try {
    const res = await fetch(`${API_BASE}/api/whatsapp/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to disconnect WhatsApp." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach WhatsApp server. Please contact the Support team."
    };
  }
}

export async function getWhatsappIncoming(userId) {
  try {
    const query = new URLSearchParams({ userId: String(userId || "").trim() });
    const res = await fetch(`${API_BASE}/api/whatsapp/incoming?${query.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load incoming WhatsApp messages." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach WhatsApp server. Please contact the Support team."
    };
  }
}

export async function getAdminAiStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/ai/chat/status`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, enabled: false, error: data.error || "Failed to load AI status." };
    }
    return { ok: true, enabled: Boolean(data.enabled), model: data.model || "" };
  } catch {
    return {
      ok: false,
      enabled: false,
      error: "Cannot reach AI assistant. Please contact the Support team."
    };
  }
}

export async function askAdminAi(message, history = []) {
  try {
    const res = await fetch(`${API_BASE}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.reply) {
      return { ok: false, error: data.error || "AI assistant could not answer." };
    }
    return { ok: true, reply: String(data.reply), model: data.model || "", usage: data.usage || null };
  } catch {
    return {
      ok: false,
      error: "Cannot reach AI assistant. Please contact the Support team."
    };
  }
}

export async function getAdminAiChats(email) {
  try {
    const query = new URLSearchParams({ email: String(email || "").trim().toLowerCase() });
    const res = await fetch(`${API_BASE}/api/admin-ai-chats?${query.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load chat history.", data: [] };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach server. Please contact the Support team.",
      data: []
    };
  }
}

export async function saveAdminAiChats(email, messages) {
  try {
    const res = await fetch(`${API_BASE}/api/admin-ai-chats`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(email || "").trim().toLowerCase(), messages: messages || [] })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to save chat history." };
    }
    return { ok: true, data: data.data || [] };
  } catch {
    return {
      ok: false,
      error: "Cannot reach server. Please contact the Support team."
    };
  }
}

export async function clearAdminAiChats(email) {
  try {
    const query = new URLSearchParams({ email: String(email || "").trim().toLowerCase() });
    const res = await fetch(`${API_BASE}/api/admin-ai-chats?${query.toString()}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to clear chat history." };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Cannot reach server. Please contact the Support team."
    };
  }
}

export async function getBranchFinanceSummary(branch = "") {
  try {
    const params = new URLSearchParams();
    if (branch) params.set("branch", branch);
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/api/branch-analytics/finance-summary${qs ? `?${qs}` : ""}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to load branch finance summary." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach server. Please contact the Support team." };
  }
}

export async function getBranchRevenueBreakdown(branch = "") {
  try {
    const params = new URLSearchParams();
    if (branch) params.set("branch", branch);
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/api/branch-analytics/revenue-breakdown${qs ? `?${qs}` : ""}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to load revenue breakdown." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach server. Please contact the Support team." };
  }
}

export async function getBranchManagers(branch = "") {
  try {
    const params = new URLSearchParams();
    if (branch) params.set("branch", branch);
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/api/branch-analytics/managers${qs ? `?${qs}` : ""}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load branch managers." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach server. Please contact the Support team." };
  }
}

export async function getWebForms() {
  try {
    const res = await fetch(`${API_BASE}/api/web-forms`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to load web forms." };
    }
    return { ok: true, data: data.data || [] };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function getWebForm(id) {
  const formId = String(id || "").trim();
  if (!formId) return { ok: false, error: "Form id is required." };
  try {
    const res = await fetch(`${API_BASE}/api/web-forms/${encodeURIComponent(formId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to load form." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function createWebForm(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/web-forms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to create form." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function updateWebForm(id, payload) {
  const formId = String(id || "").trim();
  if (!formId) return { ok: false, error: "Form id is required." };
  try {
    const res = await fetch(`${API_BASE}/api/web-forms/${encodeURIComponent(formId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to save form." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function deleteWebForm(id) {
  const formId = String(id || "").trim();
  if (!formId) return { ok: false, error: "Form id is required." };
  try {
    const res = await fetch(`${API_BASE}/api/web-forms/${encodeURIComponent(formId)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to delete form." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function getCompanyProfile() {
  try {
    const res = await fetch(`${API_BASE}/api/company-profile`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || "Could not load company profile.",
      };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return {
      ok: false,
      error: "Cannot reach server. Please contact the Support team.",
    };
  }
}

export async function getCountryChangeRequests(params = {}) {
  try {
    const search = new URLSearchParams();
    const requestedBy = String(params.requestedBy || "").trim();
    const status = String(params.status || "").trim();
    const studentId = String(params.studentId || "").trim();
    if (requestedBy) search.set("requestedBy", requestedBy);
    if (status) search.set("status", status);
    if (studentId) search.set("studentId", studentId);
    if (params.pendingOnly) search.set("pendingOnly", "1");
    const query = search.toString() ? `?${search.toString()}` : "";
    const res = await fetch(`${API_BASE}/api/country-change-requests${query}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load country change requests." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function createCountryChangeRequest(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/country-change-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to submit country change request." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function decideCountryChangeRequest(requestId, payload) {
  const id = String(requestId || "").trim();
  if (!id) return { ok: false, error: "Request id is required." };
  try {
    const res = await fetch(`${API_BASE}/api/country-change-requests/${encodeURIComponent(id)}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to review country change request." };
    }
    return { ok: true, data: data.data || null, student: data.student || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function getIntakeChangeRequests(params = {}) {
  try {
    const search = new URLSearchParams();
    const requestedBy = String(params.requestedBy || "").trim();
    const status = String(params.status || "").trim();
    const studentId = String(params.studentId || "").trim();
    if (requestedBy) search.set("requestedBy", requestedBy);
    if (status) search.set("status", status);
    if (studentId) search.set("studentId", studentId);
    if (params.pendingOnly) search.set("pendingOnly", "1");
    const query = search.toString() ? `?${search.toString()}` : "";
    const res = await fetch(`${API_BASE}/api/intake-change-requests${query}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load intake change requests." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function createIntakeChangeRequest(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/intake-change-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to submit intake change request." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function decideIntakeChangeRequest(requestId, payload) {
  const id = String(requestId || "").trim();
  if (!id) return { ok: false, error: "Request id is required." };
  try {
    const res = await fetch(`${API_BASE}/api/intake-change-requests/${encodeURIComponent(id)}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to review intake change request." };
    }
    return { ok: true, data: data.data || null, student: data.student || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function getStudentDetailChangeRequests(params = {}) {
  try {
    const search = new URLSearchParams();
    const requestedBy = String(params.requestedBy || "").trim();
    const status = String(params.status || "").trim();
    const studentId = String(params.studentId || "").trim();
    if (requestedBy) search.set("requestedBy", requestedBy);
    if (status) search.set("status", status);
    if (studentId) search.set("studentId", studentId);
    if (params.pendingOnly) search.set("pendingOnly", "1");
    const query = search.toString() ? `?${search.toString()}` : "";
    const res = await fetch(`${API_BASE}/api/student-detail-change-requests${query}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load student detail change requests." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function createStudentDetailChangeRequest(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/student-detail-change-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to submit student detail change request." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function decideStudentDetailChangeRequest(requestId, payload) {
  const id = String(requestId || "").trim();
  if (!id) return { ok: false, error: "Request id is required." };
  try {
    const res = await fetch(`${API_BASE}/api/student-detail-change-requests/${encodeURIComponent(id)}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to review student detail change request." };
    }
    return { ok: true, data: data.data || null, student: data.student || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function getInvoiceWaveOffRequests(params = {}) {
  try {
    const search = new URLSearchParams();
    const requestedBy = String(params.requestedBy || "").trim();
    const status = String(params.status || "").trim();
    const studentId = String(params.studentId || "").trim();
    if (requestedBy) search.set("requestedBy", requestedBy);
    if (status) search.set("status", status);
    if (studentId) search.set("studentId", studentId);
    if (params.pendingOnly) search.set("pendingOnly", "1");
    const query = search.toString() ? `?${search.toString()}` : "";
    const res = await fetch(`${API_BASE}/api/invoice-wave-off-requests${query}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load invoice wave-off requests." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function decideInvoiceWaveOff(invoiceId, payload) {
  const id = String(invoiceId || "").trim();
  if (!id) return { ok: false, error: "Invoice id is required." };
  try {
    const res = await fetch(`${API_BASE}/api/invoices/${encodeURIComponent(id)}/decide-wave-off`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to review wave-off invoice." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function getStudentRemovalRequests(params = {}) {
  try {
    const search = new URLSearchParams();
    const requestedBy = String(params.requestedBy || "").trim();
    const status = String(params.status || "").trim();
    const studentId = String(params.studentId || "").trim();
    if (requestedBy) search.set("requestedBy", requestedBy);
    if (status) search.set("status", status);
    if (studentId) search.set("studentId", studentId);
    if (params.pendingOnly) search.set("pendingOnly", "1");
    const query = search.toString() ? `?${search.toString()}` : "";
    const res = await fetch(`${API_BASE}/api/student-removal-requests${query}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load student removal requests." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function createStudentRemovalRequest(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/student-removal-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to submit student removal request." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function decideStudentRemovalRequest(requestId, payload) {
  const id = String(requestId || "").trim();
  if (!id) return { ok: false, error: "Request id is required." };
  try {
    const res = await fetch(`${API_BASE}/api/student-removal-requests/${encodeURIComponent(id)}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to review student removal request." };
    }
    return { ok: true, data: data.data || null, removedStudent: data.removedStudent || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function getRefundRequests(params = {}) {
  try {
    const search = new URLSearchParams();
    const requestedBy = String(params.requestedBy || "").trim();
    const status = String(params.status || "").trim();
    const studentId = String(params.studentId || "").trim();
    if (requestedBy) search.set("requestedBy", requestedBy);
    if (status) search.set("status", status);
    if (studentId) search.set("studentId", studentId);
    if (params.pendingOnly) search.set("pendingOnly", "1");
    if (params.approvedOnly) search.set("approvedOnly", "1");
    if (params.accountantQueue) search.set("accountantQueue", "1");
    const query = search.toString() ? `?${search.toString()}` : "";
    const res = await fetch(`${API_BASE}/api/refund-requests${query}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load refund requests." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function createRefundRequest(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/refund-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to submit refund request." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function decideRefundRequest(requestId, payload) {
  const id = String(requestId || "").trim();
  if (!id) return { ok: false, error: "Request id is required." };
  try {
    const res = await fetch(`${API_BASE}/api/refund-requests/${encodeURIComponent(id)}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to review refund request." };
    }
    return { ok: true, data: data.data || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}

export async function markRefundRequestRefunded(requestId, payload) {
  const id = String(requestId || "").trim();
  if (!id) return { ok: false, error: "Request id is required." };
  try {
    const res = await fetch(`${API_BASE}/api/refund-requests/${encodeURIComponent(id)}/mark-refunded`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to mark refund as paid." };
    }
    return { ok: true, data: data.data || null, invoice: data.invoice || null };
  } catch {
    return { ok: false, error: "Cannot reach the server." };
  }
}
