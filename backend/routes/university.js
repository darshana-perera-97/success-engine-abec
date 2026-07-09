const crypto = require("crypto");
const { parseBody, sendJson } = require("../lib/httpUtils");
const { logEvent } = require("../lib/logger");
const {
  readBranches,
  writeBranches,
  resolveCountriesForBranchLocation,
  normalizeCountryNames,
  getStoredBranchCountries,
  officesMatch,
  resolveCountriesForOfficeLoose,
  countryIsInList,
} = require("../models/branches");
const { readCountries, writeCountries } = require("../models/countries");
const {
  readReqStudents,
  appendReqStudent,
  appendReqStudentsBulk,
  removeReqStudentById,
  updateReqStudentById,
} = require("../models/reqStudents");
const { readPaymentAccounts, writePaymentAccounts, normalizePaymentAccount } = require("../models/paymentAccounts");
const { readUniversityPrograms, writeUniversityPrograms } = require("../models/universityPrograms");
const { getWebFormById } = require("../models/webForms");
const { readSystemData } = require("../models/systemData");
const { validateIntakeFields } = require("../lib/intakeUtils");
const { normalizeStudentPhone, normalizeWhatsappNumber } = require("../services/whatsapp");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function filterReqStudentEntries(entries, { branchParam = "", branchCountriesEnabled = false, branches = [], globalCountries = [] } = {}) {
  let rows = Array.isArray(entries) ? entries : [];
  const scopeBranch = String(branchParam || "").trim();

  if (!scopeBranch) return rows;

  if (branchCountriesEnabled) {
    const allowedCountries = resolveCountriesForOfficeLoose(branches, scopeBranch, globalCountries, true);
    return rows.filter((entry) => {
      const country = String(entry.countryToVisit || "").trim();
      if (!country) return true;
      return countryIsInList(country, allowedCountries);
    });
  }

  return rows.filter((entry) => {
    const office = String(entry.nearestOffice || "").trim();
    if (!office) return true;
    return officesMatch(scopeBranch, office);
  });
}

async function handle(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/branches") {
    try {
      const branches = await readBranches();
      sendJson(res, 200, { ok: true, data: branches });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load branches." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/countries") {
    try {
      const systemData = await readSystemData();
      const branchCountriesEnabled = systemData.branchCountriesEnabled === true;
      const branchParam = String(url.searchParams.get("branch") || "").trim();
      const globalCountries = await readCountries();
      if (branchParam) {
        const countries = await resolveCountriesForBranchLocation(
          branchParam,
          globalCountries,
          branchCountriesEnabled
        );
        sendJson(res, 200, { ok: true, data: countries, branchCountriesEnabled });
        return true;
      }
      sendJson(res, 200, { ok: true, data: globalCountries, branchCountriesEnabled });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load countries." });
    }
    return true;
  }

  if (
    req.method === "POST" &&
    (url.pathname === "/api/student-registration" || url.pathname === "/api/student-reg-form")
  ) {
    try {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      const phoneInput = String(body.phone || body.contactNumber || "").trim();
      const whatsappInput = String(body.whatsappNumber || phoneInput || "").trim();
      const phone = normalizeStudentPhone(phoneInput);
      const whatsappNumber = normalizeWhatsappNumber(whatsappInput) || phone;
      const countryToVisitRaw = String(body.countryToVisit || "").trim();
      const city = String(body.city || "").trim();
      const nearestOfficeRaw = String(body.nearestOffice || "").trim();
      const currentEducationLevel = String(body.currentEducationLevel || "").trim();
      const intendedProgram = String(body.intendedProgram || "").trim();
      const intakeValidation = validateIntakeFields(body.intakeMonth, body.intakeYear, { required: false });
      if (!intakeValidation.ok) {
        sendJson(res, 400, intakeValidation);
        return true;
      }
      let message = String(body.message || "").trim();
      const webFormId = String(body.webFormId || "").trim();
      const livingStatus = String(body.livingStatus || "").trim();
      const visaRejectionAnyCountry = String(body.visaRejectionAnyCountry || "").trim();

      let webFormName = null;
      if (webFormId) {
        const webForm = await getWebFormById(webFormId);
        if (webForm?.name) {
          webFormName = String(webForm.name).trim();
          const formTag = `Form: ${webFormName}`;
          message = message ? `${formTag}\n\n${message}` : formTag;
        }
      }

      if (!name || !phoneInput || !countryToVisitRaw) {
        sendJson(res, 400, {
          ok: false,
          error: "Name, contact number, and country to visit are required.",
        });
        return true;
      }
      if (!phone) {
        sendJson(res, 400, {
          ok: false,
          error: "Enter a valid phone number (e.g. +94771234567, 0771234567, 771234567, or +14155552671).",
        });
        return true;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(res, 400, { ok: false, error: "Please enter a valid email address." });
        return true;
      }
      const systemData = await readSystemData();
      const branchCountriesEnabled = systemData.branchCountriesEnabled === true;
      const globalCountries = await readCountries();
      const countriesList = nearestOfficeRaw
        ? await resolveCountriesForBranchLocation(nearestOfficeRaw, globalCountries, branchCountriesEnabled)
        : globalCountries;
      const matchedCountry = countriesList.find(
        (c) => String(c).trim().toLowerCase() === countryToVisitRaw.toLowerCase()
      );
      if (!matchedCountry) {
        sendJson(res, 400, {
          ok: false,
          error: nearestOfficeRaw
            ? "Please choose a valid country to visit for the selected office."
            : "Please choose a valid country to visit from the list.",
        });
        return true;
      }

      const branchesList = await readBranches();
      const branchLocations = branchesList
        .map((b) => String(b?.location || "").trim())
        .filter(Boolean);
      let nearestOffice = null;
      if (branchLocations.length > 0) {
        if (!nearestOfficeRaw) {
          sendJson(res, 400, {
            ok: false,
            error: "Please choose your preferred branch from the list.",
          });
          return true;
        }
        const matchedOffice = branchLocations.find(
          (loc) => loc.toLowerCase() === nearestOfficeRaw.toLowerCase()
        );
        if (!matchedOffice) {
          sendJson(res, 400, {
            ok: false,
            error: "Please choose a valid preferred branch from the list.",
          });
          return true;
        }
        nearestOffice = matchedOffice;
      }

      const allowedLivingStatuses = new Set(["Married", "Single"]);
      if (!livingStatus || !allowedLivingStatuses.has(livingStatus)) {
        sendJson(res, 400, {
          ok: false,
          error: "Please choose a valid living status (Married or Single).",
        });
        return true;
      }
      const allowedYesNo = new Set(["Yes", "No"]);
      const visaRejection = visaRejectionAnyCountry || "No";
      if (!allowedYesNo.has(visaRejection)) {
        sendJson(res, 400, {
          ok: false,
          error: "Please choose Yes or No for visa rejection history.",
        });
        return true;
      }

      const entry = {
        id: `REQ-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        submittedAt: new Date().toISOString(),
        name,
        email,
        phone,
        whatsappNumber,
        countryToVisit: String(matchedCountry).trim(),
        city: city || null,
        nearestOffice,
        livingStatus,
        visaRejectionAnyCountry: visaRejection,
        currentEducationLevel: currentEducationLevel || null,
        intendedProgram: intendedProgram || null,
        intakeMonth: intakeValidation.intakeMonth,
        intakeYear: intakeValidation.intakeYear,
        message: message || null,
        webFormId: webFormId || null,
        webFormName: webFormName || null,
        source: webFormId ? "web-form" : "walking",
      };

      await appendReqStudent(entry);
      sendJson(res, 201, {
        ok: true,
        data: { id: entry.id, submittedAt: entry.submittedAt },
      });
    } catch (e) {
      if (e && e.message === "Invalid JSON") {
        sendJson(res, 400, { ok: false, error: "Invalid request body." });
        return true;
      }
      sendJson(res, 500, { ok: false, error: "Could not save your registration. Please try again later." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/req-students/bulk") {
    try {
      const body = await parseBody(req);
      const rows = Array.isArray(body.entries) ? body.entries : Array.isArray(body.data) ? body.data : [];
      if (!rows.length) {
        sendJson(res, 400, { ok: false, error: "At least one lead entry is required." });
        return true;
      }

      const branchesList = await readBranches();
      const branchLocations = branchesList
        .map((b) => String(b?.location || "").trim())
        .filter(Boolean);

      const normalized = rows
        .map((row) => {
          const name = String(row.name || "").trim();
          const phone = String(row.phone || "").trim();
          const metaLeadId = String(row.metaLeadId || "").trim();
          let nearestOffice = String(row.nearestOffice || "").trim() || null;
          if (nearestOffice && branchLocations.length) {
            const matched = branchLocations.find(
              (loc) => loc.toLowerCase() === nearestOffice.toLowerCase()
            ) || branchLocations.find((loc) => {
              const key = nearestOffice.toLowerCase();
              const normalizedLoc = loc.toLowerCase();
              return normalizedLoc.includes(key) || key.includes(normalizedLoc);
            });
            if (matched) nearestOffice = matched;
          }
          return {
            ...row,
            name,
            phone,
            metaLeadId,
            email: normalizeEmail(row.email),
            countryToVisit: String(row.countryToVisit || "").trim() || "UAE",
            nearestOffice,
            source: String(row.source || "marketing-team").trim() || "marketing-team",
          };
        })
        .filter((row) => row.name || row.phone);

      if (!normalized.length) {
        sendJson(res, 400, { ok: false, error: "No valid leads to import." });
        return true;
      }

      const result = await appendReqStudentsBulk(normalized);
      if (!result.ok) {
        sendJson(res, 400, { ok: false, error: result.error || "Import failed.", skipped: result.skipped || [] });
        return true;
      }
      sendJson(res, 201, {
        ok: true,
        data: result.data || [],
        skipped: result.skipped || [],
      });
    } catch (e) {
      if (e && e.message === "Invalid JSON") {
        sendJson(res, 400, { ok: false, error: "Invalid request body." });
        return true;
      }
      sendJson(res, 500, { ok: false, error: "Failed to import leads." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/req-students") {
    try {
      const branchParam = String(url.searchParams.get("branch") || "").trim();
      const [all, systemData, branches, globalCountries] = await Promise.all([
        readReqStudents(),
        readSystemData(),
        readBranches(),
        readCountries(),
      ]);
      const branchCountriesEnabled = systemData.branchCountriesEnabled === true;
      const filtered = filterReqStudentEntries(all, {
        branchParam,
        branchCountriesEnabled,
        branches,
        globalCountries,
      });
      sendJson(res, 200, { ok: true, data: filtered, branchCountriesEnabled });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load requested students." });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/req-students/")) {
    try {
      const requestId = decodeURIComponent(url.pathname.replace("/api/req-students/", "").trim()).replace(/\/+$/, "");
      if (!requestId || requestId === "bulk") {
        sendJson(res, 400, { ok: false, error: "Request id is required." });
        return true;
      }
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      const phoneInput = String(body.phone || "").trim();
      const whatsappInput = String(body.whatsappNumber || phoneInput || "").trim();
      const phone = normalizeStudentPhone(phoneInput);
      const whatsappNumber = normalizeWhatsappNumber(whatsappInput) || phone;
      const countryToVisitRaw = String(body.countryToVisit || "").trim();
      const city = String(body.city || "").trim();
      const nearestOfficeRaw = String(body.nearestOffice || "").trim();
      const livingStatus = String(body.livingStatus || "").trim();
      const visaRejectionAnyCountry = String(body.visaRejectionAnyCountry || "").trim() || "No";
      const currentEducationLevel = String(body.currentEducationLevel || "").trim();
      const intendedProgram = String(body.intendedProgram || "").trim();
      const message = String(body.message || "").trim();
      const intakeValidation = validateIntakeFields(body.intakeMonth, body.intakeYear, { required: false });
      if (!intakeValidation.ok) {
        sendJson(res, 400, intakeValidation);
        return true;
      }

      if (!name || !phoneInput) {
        sendJson(res, 400, { ok: false, error: "Name and phone are required." });
        return true;
      }
      if (!phone) {
        sendJson(res, 400, {
          ok: false,
          error: "Enter a valid phone number (e.g. +94771234567, 0771234567, 771234567, or +14155552671).",
        });
        return true;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(res, 400, { ok: false, error: "Please enter a valid email address." });
        return true;
      }

      const allowedLivingStatuses = new Set(["Married", "Single", ""]);
      if (livingStatus && !allowedLivingStatuses.has(livingStatus)) {
        sendJson(res, 400, {
          ok: false,
          error: "Please choose a valid living status (Married or Single).",
        });
        return true;
      }
      const allowedYesNo = new Set(["Yes", "No"]);
      if (!allowedYesNo.has(visaRejectionAnyCountry)) {
        sendJson(res, 400, {
          ok: false,
          error: "Please choose Yes or No for visa rejection history.",
        });
        return true;
      }

      let nearestOffice = nearestOfficeRaw || null;
      const branchesList = await readBranches();
      const branchLocations = branchesList
        .map((b) => String(b?.location || "").trim())
        .filter(Boolean);
      if (nearestOffice && branchLocations.length) {
        const matched =
          branchLocations.find((loc) => loc.toLowerCase() === nearestOffice.toLowerCase()) ||
          branchLocations.find((loc) => {
            const key = nearestOffice.toLowerCase();
            const normalizedLoc = loc.toLowerCase();
            return normalizedLoc.includes(key) || key.includes(normalizedLoc);
          });
        if (matched) nearestOffice = matched;
      }

      let countryToVisit = countryToVisitRaw || null;
      if (countryToVisitRaw) {
        const systemData = await readSystemData();
        const branchCountriesEnabled = systemData.branchCountriesEnabled === true;
        const globalCountries = await readCountries();
        const countriesList = nearestOfficeRaw
          ? await resolveCountriesForBranchLocation(nearestOfficeRaw, globalCountries, branchCountriesEnabled)
          : globalCountries;
        const matchedCountry = countriesList.find(
          (c) => String(c).trim().toLowerCase() === countryToVisitRaw.toLowerCase()
        );
        if (!matchedCountry) {
          sendJson(res, 400, {
            ok: false,
            error: nearestOfficeRaw
              ? "Please choose a valid country to visit for the selected office."
              : "Please choose a valid country to visit from the list.",
          });
          return true;
        }
        countryToVisit = String(matchedCountry).trim();
      }

      const result = await updateReqStudentById(requestId, {
        name,
        email,
        phone,
        whatsappNumber,
        countryToVisit,
        city: city || null,
        nearestOffice,
        livingStatus: livingStatus || null,
        visaRejectionAnyCountry,
        currentEducationLevel: currentEducationLevel || null,
        intendedProgram: intendedProgram || null,
        intakeMonth: intakeValidation.intakeMonth,
        intakeYear: intakeValidation.intakeYear,
        message: message || null,
      });
      if (!result.ok) {
        sendJson(res, 404, { ok: false, error: result.error || "Request not found." });
        return true;
      }
      sendJson(res, 200, { ok: true, data: result.data });
    } catch (e) {
      if (e && e.message === "Invalid JSON") {
        sendJson(res, 400, { ok: false, error: "Invalid request body." });
        return true;
      }
      sendJson(res, 500, { ok: false, error: "Failed to update request." });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/req-students/")) {
    try {
      const requestId = decodeURIComponent(url.pathname.replace("/api/req-students/", "").trim()).replace(/\/+$/, "");
      if (!requestId) {
        sendJson(res, 400, { ok: false, error: "Request id is required." });
        return true;
      }
      const removed = await removeReqStudentById(requestId);
      if (!removed.ok) {
        sendJson(res, 404, { ok: false, error: removed.error || "Request not found." });
        return true;
      }
      sendJson(res, 200, { ok: true, data: { id: requestId } });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to remove request." });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/branches/") && url.pathname.endsWith("/countries")) {
    try {
      const branchId = decodeURIComponent(
        url.pathname.replace("/api/branches/", "").replace(/\/countries\/?$/, "").trim()
      );
      if (!branchId) {
        sendJson(res, 400, { ok: false, error: "Branch id is required." });
        return true;
      }
      const body = await parseBody(req);
      const rawList = Array.isArray(body.countries) ? body.countries : [];
      const globalCountries = await readCountries();
      const globalKeys = new Map(globalCountries.map((c) => [String(c).trim().toLowerCase(), String(c).trim()]));
      const nextCountries = normalizeCountryNames(
        rawList
          .map((name) => {
            const key = String(name || "").trim().toLowerCase();
            return globalKeys.get(key) || "";
          })
          .filter(Boolean)
      );
      const branches = await readBranches();
      const index = branches.findIndex((b) => String(b?.id || "") === branchId);
      if (index < 0) {
        sendJson(res, 404, { ok: false, error: "Branch not found." });
        return true;
      }
      branches[index] = { ...branches[index], countries: nextCountries };
      await writeBranches(branches);
      sendJson(res, 200, {
        ok: true,
        data: { branchId, location: branches[index].location, countries: nextCountries },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/branches/") && url.pathname.endsWith("/countries")) {
    try {
      const branchId = decodeURIComponent(
        url.pathname.replace("/api/branches/", "").replace(/\/countries\/?$/, "").trim()
      );
      if (!branchId) {
        sendJson(res, 400, { ok: false, error: "Branch id is required." });
        return true;
      }
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      if (!name) {
        sendJson(res, 400, { ok: false, error: "Country name is required." });
        return true;
      }
      const branches = await readBranches();
      const index = branches.findIndex((b) => String(b?.id || "") === branchId);
      if (index < 0) {
        sendJson(res, 404, { ok: false, error: "Branch not found." });
        return true;
      }
      const existing = getStoredBranchCountries(branches[index]);
      if (existing.some((c) => c.toLowerCase() === name.toLowerCase())) {
        sendJson(res, 409, { ok: false, error: "This country is already in the branch list." });
        return true;
      }
      const nextCountries = normalizeCountryNames([...existing, name]);
      branches[index] = { ...branches[index], countries: nextCountries };
      await writeBranches(branches);
      sendJson(res, 201, {
        ok: true,
        data: { branchId, location: branches[index].location, countries: nextCountries },
      });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/branches/") && url.pathname.includes("/countries/")) {
    try {
      const suffix = url.pathname.replace("/api/branches/", "").replace(/\/+$/, "");
      const slashIdx = suffix.indexOf("/countries/");
      if (slashIdx < 0) {
        sendJson(res, 400, { ok: false, error: "Invalid branch country path." });
        return true;
      }
      const branchId = decodeURIComponent(suffix.slice(0, slashIdx).trim());
      const countryName = decodeURIComponent(suffix.slice(slashIdx + "/countries/".length).trim());
      if (!branchId || !countryName) {
        sendJson(res, 400, { ok: false, error: "Branch id and country name are required." });
        return true;
      }
      const branches = await readBranches();
      const index = branches.findIndex((b) => String(b?.id || "") === branchId);
      if (index < 0) {
        sendJson(res, 404, { ok: false, error: "Branch not found." });
        return true;
      }
      const existing = getStoredBranchCountries(branches[index]);
      const key = countryName.toLowerCase();
      const nextCountries = existing.filter((c) => c.toLowerCase() !== key);
      if (nextCountries.length === existing.length) {
        sendJson(res, 404, { ok: false, error: "Country not found for this branch." });
        return true;
      }
      branches[index] = { ...branches[index], countries: nextCountries };
      await writeBranches(branches);
      sendJson(res, 200, {
        ok: true,
        data: { branchId, location: branches[index].location, countries: nextCountries },
      });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to remove branch country." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/countries") {
    try {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      if (!name) {
        sendJson(res, 400, { ok: false, error: "Country name is required." });
        return true;
      }
      const existing = await readCountries();
      if (existing.some((c) => String(c).toLowerCase() === name.toLowerCase())) {
        sendJson(res, 409, { ok: false, error: "This country is already in the list." });
        return true;
      }
      const next = [...existing, name].sort((a, b) => a.localeCompare(b));
      await writeCountries(next);
      sendJson(res, 201, { ok: true, data: next });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/countries/")) {
    try {
      const countryName = decodeURIComponent(url.pathname.replace("/api/countries/", "").trim()).replace(/\/+$/, "");
      if (!countryName) {
        sendJson(res, 400, { ok: false, error: "Country name is required." });
        return true;
      }
      const existing = await readCountries();
      const key = countryName.toLowerCase();
      const next = existing.filter((c) => String(c).trim().toLowerCase() !== key);
      if (next.length === existing.length) {
        sendJson(res, 404, { ok: false, error: "Country not found." });
        return true;
      }
      await writeCountries(next);
      sendJson(res, 200, { ok: true, data: next });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to remove country." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/payment-accounts") {
    try {
      const accounts = await readPaymentAccounts();
      sendJson(res, 200, { ok: true, data: accounts });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load payment accounts." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/payment-accounts") {
    try {
      const body = await parseBody(req);
      const normalized = normalizePaymentAccount({
        id: `PAY-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        label: body.label,
        bankName: body.bankName,
        accountName: body.accountName,
        accountNumber: body.accountNumber,
        branch: body.branch,
        currency: body.currency,
        notes: body.notes,
      });
      if (!normalized) {
        sendJson(res, 400, {
          ok: false,
          error: "Label, bank name, account name, and account number are required.",
        });
        return true;
      }
      const existing = await readPaymentAccounts();
      if (existing.some((a) => a.label.toLowerCase() === normalized.label.toLowerCase())) {
        sendJson(res, 409, { ok: false, error: "An account with this label already exists." });
        return true;
      }
      const next = [...existing, normalized];
      await writePaymentAccounts(next);
      sendJson(res, 201, { ok: true, data: next });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/payment-accounts/")) {
    try {
      const accountId = decodeURIComponent(url.pathname.replace("/api/payment-accounts/", "").trim()).replace(/\/+$/, "");
      if (!accountId) {
        sendJson(res, 400, { ok: false, error: "Account ID is required." });
        return true;
      }
      const existing = await readPaymentAccounts();
      const next = existing.filter((a) => String(a.id || "") !== accountId);
      if (next.length === existing.length) {
        sendJson(res, 404, { ok: false, error: "Payment account not found." });
        return true;
      }
      await writePaymentAccounts(next);
      sendJson(res, 200, { ok: true, data: next });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to remove payment account." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/university-programs") {
    try {
      const programs = await readUniversityPrograms();
      const includeHidden = url.searchParams.get("includeHidden") === "1";
      const visiblePrograms = includeHidden ? programs : programs.filter((program) => !program.isHidden);
      sendJson(res, 200, { ok: true, data: visiblePrograms });
    } catch {
      sendJson(res, 500, { ok: false, error: "Failed to load university programs." });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/university-programs") {
    try {
      const body = await parseBody(req);
      const university = String(body.university || "").trim();
      const programName = String(body.programName || "").trim();
      const country = String(body.country || "").trim();
      const tuition = Number(body.tuition);
      const currency = String(body.currency || "").trim().toUpperCase();
      const duration = String(body.duration || "").trim();
      const intake = String(body.intake || "").trim();
      const minGPA = Number(body.minGPA);
      const minIELTS = Number(body.minIELTS);
      const qualificationName = String(body.qualificationName || "").trim();
      const qualificationMinValue = Number(body.qualificationMinValue);
      const ranking = Number(body.ranking);
      const tags = Array.isArray(body.tags) ? body.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
      const logoColor = String(body.logoColor || "").trim() || "bg-slate-700";

      if (!university || !programName || !country || !currency || !duration || !intake) {
        sendJson(res, 400, { ok: false, error: "University, program, country, currency, duration, and intake are required." });
        return true;
      }
      if (!Number.isFinite(tuition) || tuition <= 0) {
        sendJson(res, 400, { ok: false, error: "Tuition must be a positive number." });
        return true;
      }
      const hasQualification = !!qualificationName;
      if (hasQualification && (!Number.isFinite(qualificationMinValue) || qualificationMinValue < 0)) {
        sendJson(res, 400, { ok: false, error: "Qualification minimum value must be 0 or higher." });
        return true;
      }
      if (!hasQualification) {
        if (!Number.isFinite(minGPA) || minGPA < 0) {
          sendJson(res, 400, { ok: false, error: "Minimum GPA must be 0 or higher." });
          return true;
        }
        if (!Number.isFinite(minIELTS) || minIELTS < 0) {
          sendJson(res, 400, { ok: false, error: "Minimum IELTS must be 0 or higher." });
          return true;
        }
      }
      if (!Number.isFinite(ranking) || ranking <= 0) {
        sendJson(res, 400, { ok: false, error: "Ranking must be a positive number." });
        return true;
      }

      const programs = await readUniversityPrograms();
      const program = {
        id: `UP-${crypto.randomUUID().slice(0, 8)}`,
        university,
        programName,
        country,
        tuition,
        currency,
        duration,
        intake,
        minGPA: hasQualification ? 0 : minGPA,
        minIELTS: hasQualification ? 0 : minIELTS,
        qualificationName: hasQualification ? qualificationName : "",
        qualificationMinValue: hasQualification ? qualificationMinValue : 0,
        ranking: Math.floor(ranking),
        tags,
        logoColor,
        isHidden: false,
        createdAt: new Date().toISOString(),
      };
      await writeUniversityPrograms([program, ...programs]);
      sendJson(res, 201, { ok: true, data: program });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/university-programs/") && url.pathname.endsWith("/visibility")) {
    try {
      const programId = decodeURIComponent(url.pathname.replace("/api/university-programs/", "").replace("/visibility", "").trim()).replace(/\/+$/, "");
      if (!programId) {
        sendJson(res, 400, { ok: false, error: "Program ID is required." });
        return true;
      }
      const body = await parseBody(req);
      const isHidden = Boolean(body.isHidden);
      const programs = await readUniversityPrograms();
      const index = programs.findIndex((program) => String(program.id || "") === programId);
      if (index === -1) {
        sendJson(res, 404, { ok: false, error: "University program not found." });
        return true;
      }
      const updatedProgram = {
        ...programs[index],
        isHidden,
        updatedAt: new Date().toISOString(),
      };
      const updatedPrograms = [...programs];
      updatedPrograms[index] = updatedProgram;
      await writeUniversityPrograms(updatedPrograms);
      sendJson(res, 200, { ok: true, data: updatedProgram });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request body." });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/university-programs/")) {
    try {
      const programId = decodeURIComponent(url.pathname.replace("/api/university-programs/", "").trim()).replace(/\/+$/, "");
      if (!programId) {
        sendJson(res, 400, { ok: false, error: "Program ID is required." });
        return true;
      }
      const programs = await readUniversityPrograms();
      const index = programs.findIndex((program) => String(program.id || "") === programId);
      if (index === -1) {
        sendJson(res, 404, { ok: false, error: "University program not found." });
        return true;
      }
      const removedProgram = programs[index];
      const updatedPrograms = programs.filter((program) => String(program.id || "") !== programId);
      await writeUniversityPrograms(updatedPrograms);
      sendJson(res, 200, { ok: true, data: removedProgram });
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid request." });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
