import companyIcon from "./assets/companyIcon.png";
import companyFullLogo from "./assets/company-full-logo.png";
import { resolveApiBase } from "../../resolveApiBase";

// Be a Canadian company branding and API configuration.
export const COMPANY_NAME = "Be a Canadian";
export const COMPANY_SHORT_NAME = "Be a Canadian";
export const PRODUCT_TAGLINE = "The Success Engine";
export const APP_TITLE = `${COMPANY_NAME} | ${PRODUCT_TAGLINE}`;
export const COMPANY_AI_BRAND = `${COMPANY_NAME} AI`;
export const COMPANY_LOGO_ALT = `${COMPANY_NAME} Logo`;
export const RESUME_BUILDER_TITLE = "Be a Canadian AI Resume Builder";

export const API_BASE = resolveApiBase("https://beacanadian-dev.nexgenai.asia");
// export const API_BASE = resolveApiBase("https://dev-beacanadian.nexgenai.asia");
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
