const fs = require("fs/promises");
const { withFileLock, atomicWriteFile, safeJsonParse } = require("../lib/fileUtils");
const { MEETING_DATA_FILE, DEFAULT_MEETING_SETTINGS, DEFAULT_DAY_SCHEDULE } = require("../config");

function normalizeMeetingSettings(input) {
  const src = input && typeof input === "object" ? input : {};
  const meetingDurationMinutes = Number(src.meetingDurationMinutes);
  const incomingDaySchedules = src.daySchedules && typeof src.daySchedules === "object" ? src.daySchedules : {};
  const daySchedules = {};
  for (let day = 0; day <= 6; day++) {
    const incomingDay = incomingDaySchedules[day] && typeof incomingDaySchedules[day] === "object" ? incomingDaySchedules[day] : {};
    const isOpen = incomingDay.isOpen !== false;
    const startHour = Number(incomingDay.startHour);
    const endHour = Number(incomingDay.endHour);
    daySchedules[day] = {
      isOpen,
      startHour:
        Number.isFinite(startHour) && startHour >= 0 && startHour <= 23
          ? Math.floor(startHour)
          : DEFAULT_DAY_SCHEDULE.startHour,
      endHour:
        Number.isFinite(endHour) && endHour >= 1 && endHour <= 24
          ? Math.floor(endHour)
          : DEFAULT_DAY_SCHEDULE.endHour,
    };
  }
  return {
    meetingDurationMinutes:
      Number.isFinite(meetingDurationMinutes) && meetingDurationMinutes > 0
        ? Math.floor(meetingDurationMinutes)
        : DEFAULT_MEETING_SETTINGS.meetingDurationMinutes,
    daySchedules,
  };
}

async function readMeetingSettings() {
  try {
    const raw = await fs.readFile(MEETING_DATA_FILE, "utf8");
    const parsed = safeJsonParse(raw, MEETING_DATA_FILE);
    if (!parsed) return { ...DEFAULT_MEETING_SETTINGS };
    return normalizeMeetingSettings(parsed);
  } catch (error) {
    if (error && error.code === "ENOENT") return { ...DEFAULT_MEETING_SETTINGS };
    throw error;
  }
}

async function writeMeetingSettings(settings) {
  return withFileLock(MEETING_DATA_FILE, () =>
    atomicWriteFile(MEETING_DATA_FILE, JSON.stringify(normalizeMeetingSettings(settings), null, 2))
  );
}

module.exports = {
  normalizeMeetingSettings,
  readMeetingSettings,
  writeMeetingSettings,
};
