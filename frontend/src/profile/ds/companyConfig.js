import companyIcon from "./assets/companyIcon.png";
import companyFullLogo from "./assets/company-full-logo.png";
import { resolveApiBase, toAbsoluteBackendUrl } from "../../resolveApiBase";

// DS company branding and API configuration.
export const ROLE_DISPLAY_NAMES = {
  Manager: "Team Lead",
};

export const COMPANY_NAME = "DS";
export const COMPANY_SHORT_NAME = "DS";
export const PRODUCT_TAGLINE = "The Success Engine";
export const APP_TITLE = `${COMPANY_NAME} | ${PRODUCT_TAGLINE}`;
export const COMPANY_AI_BRAND = `${COMPANY_NAME} AI`;
export const COMPANY_LOGO_ALT = `${COMPANY_NAME} Logo`;
export const RESUME_BUILDER_TITLE = "DS AI Resume Builder";

export const API_BASE = resolveApiBase("http://localhost:3334");
export const DEFAULT_USER_AVATAR = companyIcon;
export const COMPANY_FULL_LOGO = companyFullLogo;

export function applyCompanyBrandingToDocument() {
  document.title = APP_TITLE;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) {
    meta.setAttribute("content", APP_TITLE);
  }
}

export function toAbsoluteAssetUrl(path) {
  return toAbsoluteBackendUrl(path, API_BASE);
}
