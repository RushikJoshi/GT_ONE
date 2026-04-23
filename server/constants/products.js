export const PRODUCTS = ["HRMS", "TMS", "CRM", "PMS", "PSA", "DMS"];

export const getHrmsBaseUrl = () => process.env.HRMS_BASE_URL || "https://hrms.dev.gitakshmi.com";
export const getTmsBaseUrl = () =>
  process.env.TMS_BASE_URL ||
  process.env.PMS_BASE_URL ||
  process.env.CRM_BASE_URL ||
  "https://devprojects.gitakshmi.com";
export const getPsaBaseUrl = () => process.env.PSA_BASE_URL || "https://devprojects.gitakshmi.com";
export const getDmsBaseUrl = () => process.env.DMS_BASE_URL || "https://devprojects.gitakshmi.com";

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
  },
  get PSA() {
    return getPsaBaseUrl();
  },
  get DMS() {
    return getDmsBaseUrl();
  }
};
