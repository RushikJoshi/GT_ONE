import {
  HRMS_MODULE_KEYS,
  normalizeHrmsModuleSettings
} from "./hrmsModules.js";

const HRMS_MODULE_META = {
  hr: "HR Management",
  attendance: "Attendance",
  leave: "Leave Management",
  payroll: "Payroll System",
  recruitment: "Recruitment",
  backgroundVerification: "Background Verification",
  documentManagement: "Document Management",
  employeePortal: "Employee Portal",
  socialMediaIntegration: "Social Media Integration",
  reports: "Reports"
};

export const PRODUCT_MODULE_DEFINITIONS = {
  HRMS: HRMS_MODULE_KEYS.map((key) => ({
    key,
    label: HRMS_MODULE_META[key] || key
  })),
  TMS: [
    { key: "projects", label: "Projects" },
    { key: "tasks", label: "Tasks" },
    { key: "timesheets", label: "Timesheets" },
    { key: "milestones", label: "Milestones" },
    { key: "reports", label: "Reports" }
  ],
  CRM: [
    { key: "leads", label: "Leads" },
    { key: "contacts", label: "Contacts" },
    { key: "deals", label: "Deals" },
    { key: "pipeline", label: "Pipeline" },
    { key: "activities", label: "Activities" },
    { key: "reports", label: "Reports" }
  ],
  PMS: [
    { key: "projects", label: "Projects" },
    { key: "tasks", label: "Tasks" },
    { key: "milestones", label: "Milestones" },
    { key: "files", label: "Files" },
    { key: "reports", label: "Reports" }
  ],
  PSA: [
    { key: "proposals", label: "Proposals" },
    { key: "resourcePlanning", label: "Resource Planning" },
    { key: "billing", label: "Billing" },
    { key: "projectAccounting", label: "Project Accounting" },
    { key: "reports", label: "Reports" }
  ],
  DMS: [
    { key: "documents", label: "Documents" },
    { key: "folders", label: "Folders" },
    { key: "sharing", label: "Sharing" },
    { key: "approvals", label: "Approvals" },
    { key: "auditTrail", label: "Audit Trail" }
  ]
};

export const normalizeProductName = (productName) =>
  String(productName || "").trim().toUpperCase();

export const getProductModuleDefinitions = (productName) => {
  const normalizedProduct = normalizeProductName(productName);
  return PRODUCT_MODULE_DEFINITIONS[normalizedProduct] || [];
};

export const getProductModuleKeys = (productName) =>
  getProductModuleDefinitions(productName).map((module) => module.key);

export const createDefaultProductEnabledModules = (productName) =>
  getProductModuleKeys(productName).reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});

export const normalizeProductModuleSettings = (
  productName,
  enabledModules,
  modules
) => {
  const normalizedProduct = normalizeProductName(productName);

  if (normalizedProduct === "HRMS") {
    const normalizedHrms = normalizeHrmsModuleSettings(enabledModules, modules);
    return {
      productName: normalizedProduct,
      moduleDefinitions: getProductModuleDefinitions(normalizedProduct),
      moduleKeys: HRMS_MODULE_KEYS,
      enabledModules: normalizedHrms.hrmsEnabledModules,
      modules: normalizedHrms.hrmsModules
    };
  }

  const moduleDefinitions = getProductModuleDefinitions(normalizedProduct);
  const moduleKeys = moduleDefinitions.map((module) => module.key);
  const normalized = createDefaultProductEnabledModules(normalizedProduct);

  if (Array.isArray(modules) && modules.length > 0) {
    for (const key of moduleKeys) {
      normalized[key] = modules.includes(key);
    }
  }

  if (enabledModules && typeof enabledModules === "object") {
    for (const key of moduleKeys) {
      if (Object.prototype.hasOwnProperty.call(enabledModules, key)) {
        normalized[key] = Boolean(enabledModules[key]);
      }
    }
  }

  return {
    productName: normalizedProduct,
    moduleDefinitions,
    moduleKeys,
    enabledModules: normalized,
    modules: moduleKeys.filter((key) => Boolean(normalized[key]))
  };
};

export const toSparseProductEnabledModules = (productName, enabledModules) => {
  const moduleKeys = getProductModuleKeys(productName);
  if (!enabledModules || typeof enabledModules !== "object") return {};

  return moduleKeys.reduce((acc, key) => {
    if (Boolean(enabledModules[key])) acc[key] = true;
    return acc;
  }, {});
};
