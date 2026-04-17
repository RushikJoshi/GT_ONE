import Company from "../models/Company.js";
import User from "../models/User.js";
import { ROLES } from "../constants/roles.js";
import { normalizeHrmsModuleSettings, toSparseHrmsEnabledModules } from "../constants/hrmsModules.js";

const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const getHrmsProvisionUrl = () =>
  process.env.HRMS_PROVISION_URL || "http://localhost:5003/api/sso/provision-tenant";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hasHrmsProduct = (products) =>
  Array.isArray(products) &&
  products.map((item) => String(item || "").toUpperCase()).includes("HRMS");

const sanitizeCode = (value) => {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
  return normalized || null;
};

const resolveCompanyAdmin = async (companyId) => {
  if (!companyId) return null;
  return User.findOne({ companyId, role: ROLES.COMPANY_ADMIN }).select("name email").lean();
};

const postProvisionRequest = async (payload) => {
  const secret = String(process.env.SSO_SYNC_SECRET || "").trim();
  if (!secret) {
    return {
      success: false,
      status: 500,
      message: "SSO_SYNC_SECRET is not configured"
    };
  }

  const url = getHrmsProvisionUrl();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sso-sync-secret": secret
    },
    body: JSON.stringify(payload)
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_error) {
    data = null;
  }

  return {
    success: response.ok,
    status: response.status,
    data,
    message: data?.message || `HRMS provision failed with status ${response.status}`
  };
};

export const syncCompanyToHrms = async ({
  company,
  products,
  adminName,
  adminEmail,
  source = "unknown"
}) => {
  const companyId = String(company?._id || "");
  const normalizedProducts = Array.isArray(products)
    ? [...new Set(products.map((item) => String(item || "").toUpperCase()).filter(Boolean))]
    : [];

  console.log(`[SSO->HRMS] provisioning start company=${companyId} source=${source}`);

  if (!companyId) {
    return {
      success: false,
      skipped: false,
      message: "Company id missing for provisioning"
    };
  }

  if (!hasHrmsProduct(normalizedProducts)) {
    return {
      success: true,
      skipped: true,
      message: "HRMS product not assigned"
    };
  }

  const companyAdmin =
    adminEmail || adminName ? { email: adminEmail, name: adminName } : await resolveCompanyAdmin(company._id);
  const normalizedModules = normalizeHrmsModuleSettings(
    company.hrmsEnabledModules,
    company.hrmsModules
  );
  const companyCode = sanitizeCode(company.code || company.companyCode);

  const payload = {
    externalCompanyId: companyId,
    companyName: company.name,
    companyEmail: company.email,
    adminName: String(companyAdmin?.name || adminName || "Company Admin").trim(),
    adminEmail: String(companyAdmin?.email || adminEmail || company.email || "")
      .trim()
      .toLowerCase(),
    products: normalizedProducts,
    // Sparse map + explicit list so HRMS shows only these modules (missing keys = disabled).
    enabledModules: toSparseHrmsEnabledModules(normalizedModules.hrmsEnabledModules),
    hrmsModuleKeys: normalizedModules.hrmsModules
  };

  let attempt = 0;
  let response = null;
  let lastError = null;

  while (attempt < 2) {
    try {
      response = await postProvisionRequest(payload);
      const shouldRetry = !response.success && TRANSIENT_STATUS_CODES.has(response.status);
      if (!shouldRetry) {
        break;
      }

      attempt += 1;
      await sleep(300);
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt < 2) {
        await sleep(300);
      }
    }
  }

  if (!response && lastError) {
    console.error(`[SSO->HRMS] provisioning failed ${lastError.message}`);
    return {
      success: false,
      skipped: false,
      message: lastError.message
    };
  }

  if (!response?.success) {
    console.error(`[SSO->HRMS] provisioning failed ${response?.message || "Unknown error"}`);
    return {
      success: false,
      skipped: false,
      status: response?.status,
      message: response?.message || "Provisioning failed",
      data: response?.data || null
    };
  }

  const tenantId = String(response.data?.tenantId || "").trim();
  const resolvedCompanyCode = sanitizeCode(
    response.data?.companyCode || companyCode || company.companyCode || company.code
  );
  const adminUserId = String(response.data?.adminUserId || "").trim() || null;

  if (tenantId) {
    const updates = {
      hrmsTenantId: tenantId,
      companyCode: resolvedCompanyCode,
      code: resolvedCompanyCode
    };
    if (adminUserId) {
      updates.hrmsAdminUserId = adminUserId;
    }

    await Company.updateOne({ _id: company._id }, { $set: updates });
    company.hrmsTenantId = tenantId;
    company.companyCode = resolvedCompanyCode;
    company.code = resolvedCompanyCode;
    company.hrmsAdminUserId = adminUserId;
  }

  console.log(
    `[SSO->HRMS] provisioning success tenantId=${tenantId || "N/A"} code=${resolvedCompanyCode || "N/A"}`
  );

  return {
    success: true,
    skipped: Boolean(response.data?.skipped),
    tenantId: tenantId || null,
    companyCode: resolvedCompanyCode || null,
    adminUserId,
    created: Boolean(response.data?.created),
    updated: Boolean(response.data?.updated),
    data: response.data || null
  };
};
