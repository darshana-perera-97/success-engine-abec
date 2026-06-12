const abec = require("./profile/abec/companyConfig");
const beacanadian = require("./profile/beacanadian/companyConfig");
const ds = require("./profile/ds/companyConfig");
const hsenid = require("./profile/hsenid/companyConfig");
const nexgenai = require("./profile/nexgenai/companyConfig");

// Change this single value to switch backend branding between company profiles.
// Keep in sync with frontend/src/profileConfig.js ACTIVE_PROFILE.
// Supported values: "abec" | "beacanadian" | "ds" | "hsenid" | "nexgenai"
const ACTIVE_PROFILE = "hsenid";

const profiles = { abec, beacanadian, ds, hsenid, nexgenai };
const config = profiles[ACTIVE_PROFILE];

if (!config) {
  throw new Error(
    `Unknown ACTIVE_PROFILE: "${ACTIVE_PROFILE}". Use "abec", "beacanadian", "ds", "hsenid", or "nexgenai".`
  );
}

const COMPANY_NAME_NBSP = String(config.COMPANY_NAME).replace(/ /g, "\u00a0");

module.exports = {
  ACTIVE_PROFILE,
  COMPANY_NAME: config.COMPANY_NAME,
  COMPANY_NAME_NBSP,
  COMPANY_SHORT_NAME: config.COMPANY_SHORT_NAME,
  PRODUCT_TAGLINE: config.PRODUCT_TAGLINE,
  COMPANY_AI_BRAND: config.COMPANY_AI_BRAND,
  DEFAULT_SMTP_FROM_NAME: config.DEFAULT_SMTP_FROM_NAME,
};
