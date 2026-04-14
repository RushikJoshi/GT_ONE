export const HRMS_MODULE_KEYS = [
  "hr",
  "attendance",
  "leave",
  "payroll",
  "recruitment",
  "backgroundVerification",
  "documentManagement",
  "employeePortal",
  "socialMediaIntegration",
  "reports"
];

export const createDefaultHrmsEnabledModules = () => {
  return HRMS_MODULE_KEYS.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
};

export const normalizeHrmsModuleSettings = (hrmsEnabledModules, hrmsModules) => {
  const normalized = createDefaultHrmsEnabledModules();

  if (Array.isArray(hrmsModules) && hrmsModules.length > 0) {
    for (const key of HRMS_MODULE_KEYS) {
      normalized[key] = hrmsModules.includes(key);
    }
  }

  if (hrmsEnabledModules && typeof hrmsEnabledModules === "object") {
    for (const key of HRMS_MODULE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(hrmsEnabledModules, key)) {
        normalized[key] = Boolean(hrmsEnabledModules[key]);
      }
    }
  }

  const modules = HRMS_MODULE_KEYS.filter((key) => normalized[key]);

  return {
    hrmsEnabledModules: normalized,
    hrmsModules: modules
  };
};
