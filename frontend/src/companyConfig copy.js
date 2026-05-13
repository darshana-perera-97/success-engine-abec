// Single place to configure company branding across the frontend.
export const COMPANY_NAME = "ABEC Premier";
export const COMPANY_SHORT_NAME = "ABEC";
export const PRODUCT_TAGLINE = "The Success Engine";
export const APP_TITLE = `${COMPANY_NAME} | ${PRODUCT_TAGLINE}`;
export const COMPANY_AI_BRAND = `${COMPANY_NAME} AI`;
export const COMPANY_LOGO_ALT = `${COMPANY_NAME} Logo`;
export const RESUME_BUILDER_TITLE = "Premier AI Resume Builder";

export function applyCompanyBrandingToDocument() {
  document.title = APP_TITLE;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) {
    meta.setAttribute("content", APP_TITLE);
  }
}
