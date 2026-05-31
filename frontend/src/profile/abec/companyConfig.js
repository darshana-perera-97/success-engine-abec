import companyIcon from "./assets/companyIcon.png";
import companyFullLogo from "./assets/company-full-logo.png";
import { resolveApiBase } from "../../resolveApiBase";

// ABEC Premier company branding and API configuration.
export const COMPANY_NAME = "ABEC Premier";
export const COMPANY_SHORT_NAME = "ABEC";
export const PRODUCT_TAGLINE = "The Success Engine";
export const APP_TITLE = `${COMPANY_NAME} | ${PRODUCT_TAGLINE}`;
export const COMPANY_AI_BRAND = `${COMPANY_NAME} AI`;
export const COMPANY_LOGO_ALT = `${COMPANY_NAME} Logo`;
export const RESUME_BUILDER_TITLE = "Premier AI Resume Builder";

export const API_BASE = resolveApiBase("https://abec-dev.nexgenai.lk");
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
  if (!path) return path;
  if (String(path).startsWith("/assets/")) {
    return `${API_BASE}${path}`;
  }
  return path;
}
