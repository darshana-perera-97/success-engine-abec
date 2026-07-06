import {
  buildPlaceholderEmail,
  cellText,
  matchBranchLocation,
  normalizeHeader,
  normalizePhone,
  parseCreatedTime,
  titleCaseWords
} from "./importShared";

const BRANCH_ALIASES = {
  cmb: "Colombo",
  jf: "JF"
};

const COUNTRY_ALIASES = {
  uk: "UK",
  uae: "UAE",
  usa: "USA"
};

function normalizeRawRow(rawRow) {
  const row = {};
  for (const [key, value] of Object.entries(rawRow || {})) {
    row[normalizeHeader(key)] = value;
  }
  return row;
}

function readGroupId(rawRow, row) {
  const fromSpace = cellText(rawRow?.[" "]);
  if (fromSpace) return fromSpace;
  return cellText(row[""]);
}

function formatCountry(raw) {
  const key = cellText(raw).toLowerCase();
  if (!key || key === "-") return "";
  if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key];
  return titleCaseWords(key);
}

function resolveBranch(rawBranch, branchLocations) {
  const key = cellText(rawBranch).toLowerCase();
  if (!key || key === "-") return "";
  const alias = BRANCH_ALIASES[key] || rawBranch;
  return matchBranchLocation(alias, branchLocations) || matchBranchLocation(rawBranch, branchLocations);
}

function formatIndId(value) {
  const text = cellText(value);
  if (!text || text === "-") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    try {
      return BigInt(Math.trunc(value)).toString();
    } catch {
      return text;
    }
  }
  return text;
}

function formatLivingStatus(raw) {
  const key = cellText(raw).toLowerCase();
  if (!key || key === "-") return null;
  if (key === "family") return "Family";
  if (key === "single") return "Single";
  return titleCaseWords(key);
}

function formatMessageParts(row, rawRow) {
  const parts = [];
  const groupName = cellText(row.group_name);
  const team = cellText(row.team_allocated);
  const field = cellText(row.field);
  const gpa = cellText(row.gpa);
  const status = cellText(rawRow?.__EMPTY ?? row.__empty);
  const allocatedPerson = cellText(row.allocated_person);
  const specialStatus = cellText(rawRow?.__EMPTY_2 ?? row.__empty_2);
  const specialComments = cellText(row.special_comments);
  const indId = formatIndId(row.ind_id);
  const type = cellText(row.type);
  const bTeam = cellText(row.b_team);

  if (groupName) parts.push(`Group: ${groupName}`);
  if (team) parts.push(`Team: ${team}`);
  if (field) parts.push(`Field: ${titleCaseWords(field)}`);
  if (gpa && gpa !== "-") parts.push(`GPA: ${gpa}`);
  if (type) parts.push(`Type: ${type}`);
  if (bTeam) parts.push(`B team: ${bTeam}`);
  if (status) parts.push(`Progress: ${status}`);
  if (allocatedPerson) parts.push(`Allocated: ${allocatedPerson}`);
  if (specialStatus) parts.push(`Status: ${specialStatus}`);
  if (specialComments) parts.push(`Notes: ${specialComments}`);
  if (indId) parts.push(`IND ID: ${indId}`);

  return parts.length ? parts.join(" · ") : null;
}

export function isNexGenTeamProgressHeaders(headers) {
  const normalized = (headers || []).map(normalizeHeader);
  return normalized.includes("student_name") && normalized.includes("wa_number");
}

export function mapNexGenTeamProgressRow(rawRow, { branchLocations = [], submittedAt = null } = {}) {
  const row = normalizeRawRow(rawRow);
  const groupId = readGroupId(rawRow, row);
  const name = cellText(row.student_name);
  const phone = normalizePhone(row.wa_number);
  const countryToVisit = formatCountry(row.country) || "UAE";
  const nearestOffice = resolveBranch(row.branch, branchLocations) || null;
  const currentEducationLevel = cellText(row.principle);
  const intendedProgram = cellText(row.field) ? titleCaseWords(row.field) : null;
  const livingStatus = formatLivingStatus(row.flying_as);
  const dateText = cellText(row.date);

  const messageParts = [];
  const age = cellText(row.age);
  if (age && age !== "-") messageParts.push(`Age: ${age}`);
  const extra = formatMessageParts(row, rawRow);
  if (extra) messageParts.push(extra);

  return {
    importKey: groupId || `${name}-${phone}`,
    metaLeadId: groupId || null,
    submittedAt: dateText ? parseCreatedTime(dateText) : submittedAt || new Date().toISOString(),
    name,
    email: buildPlaceholderEmail(groupId, name),
    phone,
    countryToVisit,
    city: null,
    nearestOffice,
    livingStatus,
    visaRejectionAnyCountry: "No",
    currentEducationLevel: currentEducationLevel && currentEducationLevel !== "-" ? currentEducationLevel : null,
    intendedProgram,
    message: messageParts.length ? messageParts.join(" · ") : null,
    source: "team-progress",
    platform: cellText(row.type) || null,
    campaignName: cellText(row.team_allocated) || null,
    formName: cellText(row.group_name) || null
  };
}

export function mapNexGenTeamProgressRows(rawRows, { branchLocations = [] } = {}) {
  let lastSubmittedAt = new Date().toISOString();
  return (rawRows || [])
    .map((rawRow) => {
      const row = normalizeRawRow(rawRow);
      const dateText = cellText(row.date);
      if (dateText) {
        const parsed = parseCreatedTime(dateText);
        if (parsed) lastSubmittedAt = parsed;
      }
      return mapNexGenTeamProgressRow(rawRow, { branchLocations, submittedAt: lastSubmittedAt });
    })
    .filter((row) => row.name || row.phone);
}
