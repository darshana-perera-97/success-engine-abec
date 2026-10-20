import * as abec from "./profile/abec/companyConfig";
import * as beacanadian from "./profile/beacanadian/companyConfig";
import * as ds from "./profile/ds/companyConfig";
import * as hsenid from "./profile/hsenid/companyConfig";
import * as nexgenai from "./profile/nexgenai/companyConfig";

// Change this single value to switch the whole app between company profiles.
// Supported values: "abec" | "beacanadian" | "ds" | "hsenid" | "nexgenai"
export const ACTIVE_PROFILE = "abec";

const profiles = { abec, beacanadian, ds, hsenid, nexgenai };
const config = profiles[ACTIVE_PROFILE];

if (!config) {
  throw new Error(
    `Unknown ACTIVE_PROFILE: "${ACTIVE_PROFILE}". Use "abec", "beacanadian", "ds", "hsenid", or "nexgenai".`
  );
}

export const COMPANY_NAME = config.COMPANY_NAME;
export const COMPANY_SHORT_NAME = config.COMPANY_SHORT_NAME;
export const PRODUCT_TAGLINE = config.PRODUCT_TAGLINE;
export const APP_TITLE = config.APP_TITLE;
export const COMPANY_AI_BRAND = config.COMPANY_AI_BRAND;
export const COMPANY_LOGO_ALT = config.COMPANY_LOGO_ALT;
export const RESUME_BUILDER_TITLE = config.RESUME_BUILDER_TITLE;
export const ROLE_DISPLAY_NAMES = config.ROLE_DISPLAY_NAMES || {};
export const API_BASE = config.API_BASE;
export const DEFAULT_USER_AVATAR = config.DEFAULT_USER_AVATAR;
export const COMPANY_FULL_LOGO = config.COMPANY_FULL_LOGO;
export const applyCompanyBrandingToDocument = config.applyCompanyBrandingToDocument;
export const toAbsoluteAssetUrl = config.toAbsoluteAssetUrl;
