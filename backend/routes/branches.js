const crypto = require("crypto");
const { parseBody, sendJson } = require("../lib/httpUtils");
const {
  FALLBACK_EXCHANGE_RATES_LKR,
  ADMIN_EMAIL,
  ADMIN_DISPLAY_NAME,
  BRANCH_ANALYTICS_CACHE_MS,
} = require("../config");
const { readBranches, writeBranches } = require("../models/branches");
const { readInvoices } = require("../models/invoices");
const { readStudemts } = require("../models/students");
const { readUsers, splitAdminRecord } = require("../models/users");
const { loadExchangeRatesFromApi } = require("../services/exchangeRates");

const financeSummaryCache = new Map();

async function handle(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/branches") {
    try {
      const body = await parseBody(req);
      const location = String(body.location || "").trim();
      const totalInquiries = Number.isFinite(Number(body.totalInquiries)) ? Number(body.totalInquiries) : 0;
      const successes = Number.isFinite(Number(body.successes)) ? Number(body.successes) : 0;
      const revenue = Number.isFinite(Number(body.revenue)) ? Number(body.revenue) : 0;
      if (!location) {
        sendJson(res, 400, { ok: false, error: "Branch location is required." });
        return true;
      }

      const branches = await readBranches();
      if (branches.some((b) => String(b.location || "").toLowerCase() === location.toLowerCase())) {
        sendJson(res, 409, { ok: false, error: "Branch location already exists." });
        return true;
      }

      const branch = {
        id: `BR-${crypto.randomUUID().slice(0, 8)}`,
        location,
        totalInquiries: Math.max(0, Math.floor(totalInquiries)),
        successes: Math.max(0, Math.floor(successes)),
        revenue: Math.max(0, revenue),
        createdAt: new Date().toISOString(),
      };
      const updated = [...branches, branch];
      await writeBranches(updated);
      sendJson(res, 201, { ok: true, data: branch });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/branch-analytics/finance-summary") {
    try {
      const scopeBranch = String(url.searchParams.get("branch") || "").trim();
      const scopeKey = scopeBranch ? scopeBranch.toLowerCase() : "";
      const cacheKey = scopeKey || "__all__";
      const cached = financeSummaryCache.get(cacheKey);
      if (cached && Date.now() - cached.at < BRANCH_ANALYTICS_CACHE_MS) {
        sendJson(res, 200, { ok: true, data: cached.data });
        return true;
      }

      const [branches, studemts, invoices, users, ratesData] = await Promise.all([
        readBranches(),
        readStudemts(),
        readInvoices(),
        readUsers(),
        loadExchangeRatesFromApi().catch(() => ({ rates: FALLBACK_EXCHANGE_RATES_LKR, updatedAt: "Static rates", live: false }))
      ]);

      const rates = ratesData.rates || FALLBACK_EXCHANGE_RATES_LKR;
      const employees = users;
      const normKey = (v) => String(v || "").trim().toLowerCase();
      const branchMatch = (a, b) => {
        const x = normKey(a), y = normKey(b);
        if (!x || !y) return false;
        return x === y || x.includes(y) || y.includes(x);
      };

      const PIPELINE_STEPS = ["Inquiry", "Registration", "Application", "Interview training", "Documentation", "Visa", "Enrolled"];
      const LEGACY_STATUS_TO_CANONICAL = {
        "New Inquiry": "Inquiry", Inquiry: "Inquiry", Registration: "Registration",
        Counseling: "Registration", "Uni Application": "Application", Application: "Application",
        "Offer Received": "Interview training", "Interview training": "Interview training",
        Documentation: "Documentation", "Visa Pilot": "Visa", Visa: "Visa", Enrolled: "Enrolled"
      };
      const BRANCH_CONVERSION_STAGES = ["Registration", "Application", "Interview training", "Documentation", "Visa", "Enrolled"];

      const normalizeStatus = (status) => {
        const raw = String(status || "").trim();
        return LEGACY_STATUS_TO_CANONICAL[raw] || (PIPELINE_STEPS.includes(raw) ? raw : raw);
      };
      const isVisaGranted = (status) => {
        const stage = normalizeStatus(status);
        return stage === "Visa" || stage === "Enrolled" || String(status || "").trim() === "Visa Pilot";
      };
      const isConversion = (status) => BRANCH_CONVERSION_STAGES.includes(normalizeStatus(status));
      const isPaid = (inv) => String(inv?.status || "").trim().toLowerCase() === "paid";
      const invoiceAmountLkr = (inv) => {
        const amount = Number(inv?.amount);
        if (!Number.isFinite(amount)) return 0;
        const currency = String(inv?.currency || "LKR").trim().toUpperCase();
        return amount * (rates[currency] ?? rates.USD ?? 1);
      };

      const locationByKey = new Map();
      const registerLocation = (location) => {
        const label = String(location || "").trim();
        if (!label) return;
        const key = normKey(label);
        if (scopeKey && key !== scopeKey) return;
        if (!locationByKey.has(key)) locationByKey.set(key, label);
      };
      branches.forEach((b) => registerLocation(b?.location));
      const registeredKeys = new Set(branches.map((b) => normKey(b?.location)).filter(Boolean));

      const getStudentBranchLabel = (student) => String(student?.branch || student?.nearestOffice || "").trim();
      const buildCounselorSet = (branchName) => {
        const set = new Set();
        const n = (v) => normKey(v);
        for (const emp of employees) {
          const role = String(emp?.role || "").trim().toLowerCase();
          if (!role.includes("counsel") && role !== "consultor" && role !== "visa officer" && role !== "visa officer & counselor" && role !== "visa officer & counsellor") continue;
          if (!branchMatch(emp?.branch, branchName)) continue;
          if (emp?.id) set.add(n(emp.id));
          if (emp?.username) set.add(n(emp.username));
          if (emp?.email) set.add(n(emp.email));
        }
        return set;
      };
      const studentMatchesCounselorSet = (student, identitySet) => {
        if (!student || !identitySet || identitySet.size === 0) return false;
        const n = (v) => normKey(v);
        if (student.counselor && identitySet.has(n(student.counselor))) return true;
        if (student.inquiryCounselorId && identitySet.has(n(student.inquiryCounselorId))) return true;
        const history = Array.isArray(student.counselorHistory) ? student.counselorHistory : [];
        return history.some((id) => identitySet.has(n(id)));
      };
      const resolveStudentBranch = (student) => {
        const label = getStudentBranchLabel(student);
        const labelKey = normKey(label);
        if (labelKey && locationByKey.has(labelKey)) return labelKey;
        for (const [key, name] of locationByKey) {
          const counselorSet = buildCounselorSet(name);
          if (counselorSet.size && studentMatchesCounselorSet(student, counselorSet)) return key;
        }
        if (scopeKey) return scopeKey;
        return "";
      };

      const studentById = new Map(studemts.map((s) => [String(s?.id || "").trim(), s]).filter(([id]) => Boolean(id)));

      const branchData = Array.from(locationByKey.entries()).map(([key, name]) => {
        const branchStudents = studemts.filter((s) => resolveStudentBranch(s) === key);
        const studentsCount = branchStudents.length;
        const conversionsCount = branchStudents.filter((s) => isConversion(s?.status)).length;
        const visaGrantedCount = branchStudents.filter((s) => isVisaGranted(s?.status)).length;
        const revenue = invoices.reduce((sum, inv) => {
          if (!isPaid(inv)) return sum;
          const sid = String(inv?.studentId || inv?.student_id || "").trim();
          if (!sid) return sum;
          const student = studentById.get(sid);
          if (!student) return sum;
          if (resolveStudentBranch(student) !== key) return sum;
          return sum + invoiceAmountLkr(inv);
        }, 0);
        const paidInvoiceCount = invoices.filter((inv) => {
          if (!isPaid(inv)) return false;
          const sid = String(inv?.studentId || inv?.student_id || "").trim();
          const student = studentById.get(sid);
          if (!student) return false;
          return resolveStudentBranch(student) === key;
        }).length;

        return { name, students: studentsCount, revenue, conversions: conversionsCount, visaGranted: visaGrantedCount, visaSuccessRate: studentsCount ? Math.round((visaGrantedCount / studentsCount) * 100) : 0, pastInquiryRate: studentsCount ? Math.round((conversionsCount / studentsCount) * 100) : 0, paidInvoiceCount };
      }).filter((row) => registeredKeys.has(normKey(row.name))).sort((a, b) => b.revenue - a.revenue || b.students - a.students || a.name.localeCompare(b.name));

      const totalRevenue = branchData.reduce((sum, b) => sum + b.revenue, 0);

      const responseData = {
        branches: branchData,
        totalRevenue,
        exchangeRates: { rates, updatedAt: ratesData.updatedAt, live: ratesData.live !== false },
      };
      financeSummaryCache.set(cacheKey, { at: Date.now(), data: responseData });

      sendJson(res, 200, {
        ok: true,
        data: responseData,
      });
    } catch (err) {
      console.error("branch-analytics/finance-summary error:", err);
      sendJson(res, 500, { ok: false, error: "Failed to compute branch finance summary." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/branch-analytics/revenue-breakdown") {
    try {
      const scopeBranch = String(url.searchParams.get("branch") || "").trim();
      const scopeKey = scopeBranch ? scopeBranch.toLowerCase() : "";

      const [branches, studemts, invoices, users, ratesData] = await Promise.all([
        readBranches(),
        readStudemts(),
        readInvoices(),
        readUsers(),
        loadExchangeRatesFromApi().catch(() => ({ rates: FALLBACK_EXCHANGE_RATES_LKR, updatedAt: "Static rates", live: false }))
      ]);

      const rates = ratesData.rates || FALLBACK_EXCHANGE_RATES_LKR;
      const employees = users;
      const normKey = (v) => String(v || "").trim().toLowerCase();
      const branchMatchFn = (a, b) => {
        const x = normKey(a), y = normKey(b);
        if (!x || !y) return false;
        return x === y || x.includes(y) || y.includes(x);
      };
      const isPaid = (inv) => String(inv?.status || "").trim().toLowerCase() === "paid";
      const invoiceAmountLkr = (inv) => {
        const amount = Number(inv?.amount);
        if (!Number.isFinite(amount)) return 0;
        const currency = String(inv?.currency || "LKR").trim().toUpperCase();
        return amount * (rates[currency] ?? rates.USD ?? 1);
      };

      const locationByKey = new Map();
      branches.forEach((b) => {
        const label = String(b?.location || "").trim();
        if (!label) return;
        const key = normKey(label);
        if (scopeKey && key !== scopeKey) return;
        if (!locationByKey.has(key)) locationByKey.set(key, label);
      });

      const getStudentBranchLabel = (student) => String(student?.branch || student?.nearestOffice || "").trim();
      const buildCounselorSet = (branchName) => {
        const set = new Set();
        for (const emp of employees) {
          const role = String(emp?.role || "").trim().toLowerCase();
          if (!role.includes("counsel") && role !== "consultor" && role !== "visa officer" && role !== "visa officer & counselor" && role !== "visa officer & counsellor") continue;
          if (!branchMatchFn(emp?.branch, branchName)) continue;
          if (emp?.id) set.add(normKey(emp.id));
          if (emp?.username) set.add(normKey(emp.username));
          if (emp?.email) set.add(normKey(emp.email));
        }
        return set;
      };
      const studentMatchesCounselorSet = (student, identitySet) => {
        if (!student || !identitySet || identitySet.size === 0) return false;
        if (student.counselor && identitySet.has(normKey(student.counselor))) return true;
        if (student.inquiryCounselorId && identitySet.has(normKey(student.inquiryCounselorId))) return true;
        const history = Array.isArray(student.counselorHistory) ? student.counselorHistory : [];
        return history.some((id) => identitySet.has(normKey(id)));
      };
      const resolveStudentBranch = (student) => {
        const label = getStudentBranchLabel(student);
        const labelKey = normKey(label);
        if (labelKey && locationByKey.has(labelKey)) return labelKey;
        for (const [key, name] of locationByKey) {
          const counselorSet = buildCounselorSet(name);
          if (counselorSet.size && studentMatchesCounselorSet(student, counselorSet)) return key;
        }
        if (scopeKey) return scopeKey;
        return "";
      };

      const studentById = new Map(studemts.map((s) => [String(s?.id || "").trim(), s]).filter(([id]) => Boolean(id)));

      const branchInvoiceData = Array.from(locationByKey.entries()).map(([key, name]) => {
        const paidInvoices = invoices.filter((inv) => {
          if (!isPaid(inv)) return false;
          const sid = String(inv?.studentId || inv?.student_id || "").trim();
          const student = studentById.get(sid);
          if (!student) return false;
          return resolveStudentBranch(student) === key;
        });
        const revenue = paidInvoices.reduce((sum, inv) => sum + invoiceAmountLkr(inv), 0);
        const currencyBreakdown = {};
        paidInvoices.forEach((inv) => {
          const cur = String(inv?.currency || "LKR").trim().toUpperCase();
          if (!currencyBreakdown[cur]) currencyBreakdown[cur] = { count: 0, total: 0, totalLkr: 0 };
          currencyBreakdown[cur].count += 1;
          currencyBreakdown[cur].total += Number(inv?.amount) || 0;
          currencyBreakdown[cur].totalLkr += invoiceAmountLkr(inv);
        });
        return { name, revenue, paidInvoiceCount: paidInvoices.length, currencyBreakdown };
      }).sort((a, b) => b.revenue - a.revenue);

      const totalRevenue = branchInvoiceData.reduce((sum, b) => sum + b.revenue, 0);
      const breakdown = branchInvoiceData.map((b) => ({
        ...b,
        revenueShare: totalRevenue > 0 ? Math.round((b.revenue / totalRevenue) * 1000) / 10 : 0
      }));

      sendJson(res, 200, { ok: true, data: { breakdown, totalRevenue } });
    } catch (err) {
      console.error("branch-analytics/revenue-breakdown error:", err);
      sendJson(res, 500, { ok: false, error: "Failed to compute revenue breakdown." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/branch-analytics/managers") {
    try {
      const scopeBranch = String(url.searchParams.get("branch") || "").trim();
      const scopeKey = scopeBranch ? scopeBranch.toLowerCase() : "";

      const users = await readUsers();
      const { adminRecord, others } = splitAdminRecord(users);
      const allAccounts = [];
      if (adminRecord) {
        allAccounts.push({ id: "ADM001", username: adminRecord.username || "Admin", email: adminRecord.email || "", role: "Admin", branch: adminRecord.branch || "" });
      }
      for (const u of others) {
        allAccounts.push({ id: u.id, username: u.username || "", email: u.email || "", role: u.role || "", branch: u.branch || "" });
      }

      let managers = allAccounts.filter((acc) => acc.role === "Manager" && acc.branch);
      if (scopeKey) {
        managers = managers.filter((acc) => String(acc.branch || "").trim().toLowerCase() === scopeKey);
      }

      sendJson(res, 200, { ok: true, data: managers });
    } catch (err) {
      console.error("branch-analytics/managers error:", err);
      sendJson(res, 500, { ok: false, error: "Failed to load branch managers." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
