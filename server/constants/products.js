export const PRODUCTS = ["HRMS", "TMS", "CRM", "PMS"];

export const getHrmsBaseUrl = () => process.env.HRMS_BASE_URL || "http://localhost:5176";
export const getTmsBaseUrl = () =>
  process.env.TMS_BASE_URL ||
  process.env.PMS_BASE_URL ||
  process.env.CRM_BASE_URL ||
  "http://localhost:5173";

export const PRODUCT_URLS = {
  get HRMS() {
    return getHrmsBaseUrl();
  },
  get TMS() {
    return getTmsBaseUrl();
  },
  get CRM() {
    return getTmsBaseUrl();
  },
  get PMS() {
    return getTmsBaseUrl();
  }
};
