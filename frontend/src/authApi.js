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
      error: "Cannot reach login server. Is the backend running on port 3334?"
    };
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
    return { ok: false, error: "Cannot reach login server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach login server. Is the backend running on port 3334?" };
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
      error: "Cannot reach account server. Is the backend running on port 3334?"
    };
  }
}

export async function createAccount(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to create account." };
    }
    return { ok: true, data: data.data };
  } catch {
    return {
      ok: false,
      error: "Cannot reach account server. Is the backend running on port 3334?"
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
      error: "Cannot reach account server. Is the backend running on port 3334?"
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
      error: "Cannot reach account server. Is the backend running on port 3334?"
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
      error: "Cannot reach account server. Is the backend running on port 3334?"
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
      error: "Cannot reach account server. Is the backend running on port 3334?"
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
    return { ok: false, error: "Cannot reach student server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach student server. Is the backend running on port 3334?" };
  }
}

export async function uploadStudentDocument(studentId, { dataUrl, fileName, docType, phase = 1, tier = "Global" }) {
  try {
    const res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(studentId)}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, fileName, docType, phase, tier })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to upload document." };
    }
    return { ok: true, data: data.data, document: data.document || null };
  } catch {
    return { ok: false, error: "Cannot reach student server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach branch server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach branch server. Is the backend running on port 3334?" };
  }
}

export async function getCountries() {
  try {
    const res = await fetch(`${API_BASE}/api/countries`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load countries." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach country server. Is the backend running on port 3334?" };
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
    return { ok: true, data: data.data };
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
    return { ok: false, error: "Cannot reach country server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach meeting settings server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach meeting settings server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach bookings server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach bookings server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach bookings server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach appointments server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach appointments server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach activity server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach activity server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach appointments server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach invoice server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach task server. Is the backend running on port 3334?" };
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
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach task server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach task server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach invoice server. Is the backend running on port 3334?" };
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
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach invoice server. Is the backend running on port 3334?" };
  }
}

export async function uploadInvoicePaymentProof(invoiceId, dataUrl, fileName) {
  try {
    const res = await fetch(`${API_BASE}/api/invoices/${encodeURIComponent(invoiceId)}/payment-proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, fileName })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.data) {
      return { ok: false, error: data.error || "Failed to upload payment proof." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach invoice server. Is the backend running on port 3334?" };
  }
}

export async function getStudents() {
  try {
    const res = await fetch(`${API_BASE}/api/students`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return { ok: false, error: data.error || "Failed to load students." };
    }
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach student server. Is the backend running on port 3334?" };
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
    return { ok: false, error: "Cannot reach student server. Is the backend running on port 3334?" };
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
    return { ok: true, data: data.data };
  } catch {
    return { ok: false, error: "Cannot reach student server. Is the backend running on port 3334?" };
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
      error: "Cannot reach university data server. Is the backend running on port 3334?"
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
      error: "Cannot reach university data server. Is the backend running on port 3334?"
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
      error: "Cannot reach university data server. Is the backend running on port 3334?"
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
      error: "Cannot reach university data server. Is the backend running on port 3334?"
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
      error: "Cannot reach chat server. Is the backend running on port 3334?"
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
      error: "Cannot reach chat server. Is the backend running on port 3334?"
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
      error: "Cannot reach WhatsApp server. Is the backend running on port 3334?"
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
      error: "Cannot reach WhatsApp server. Is the backend running on port 3334?"
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
      error: "Cannot reach WhatsApp server. Is the backend running on port 3334?"
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
      error: "Cannot reach WhatsApp server. Is the backend running on port 3334?"
    };
  }
}
