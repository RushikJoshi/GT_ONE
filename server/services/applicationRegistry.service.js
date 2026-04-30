import crypto from "crypto";
import Application from "../models/Application.js";
import CompanyApplication from "../models/CompanyApplication.js";
import CompanyProduct from "../models/CompanyProduct.js";
import { PRODUCT_URLS } from "../constants/products.js";

const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");
const normalizeAppKey = (value) => String(value || "").trim().toLowerCase();
const normalizeProductName = (value) => String(value || "").trim().toUpperCase();
const CLIENT_AUTH_METHODS = new Set(["none", "client_secret_post"]);
const notDeletedApplicationQuery = (filter = {}) => ({
  $and: [
    filter,
    {
      $or: [
        { deletedAt: { $exists: false } },
        { deletedAt: null }
      ]
    }
  ]
});
const normalizeAbsoluteUrl = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(String(value).trim());
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
};

const buildDefaultRedirectUris = (baseUrl) => {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  if (!normalizedBaseUrl) return [];
  return [normalizedBaseUrl];
};

const hashClientSecret = (clientSecret) =>
  crypto.createHash("sha256").update(String(clientSecret || "")).digest("hex");

const generateClientSecret = (appKey) => {
  const secretPrefix = String(process.env.SSO_CLIENT_SECRET_PREFIX || "gtone").trim() || "gtone";
  const normalizedKey = normalizeAppKey(appKey) || "app";
  return `${secretPrefix}_${normalizedKey}_${crypto.randomBytes(32).toString("base64url")}`;
};

export const resolveApplicationClientAuthMethod = (application) => {
  const normalized = String(application?.clientAuthMethod || "").trim().toLowerCase();
  return CLIENT_AUTH_METHODS.has(normalized) ? normalized : "client_secret_post";
};

export const applicationRequiresClientSecret = (application) =>
  resolveApplicationClientAuthMethod(application) === "client_secret_post";

export const issueApplicationClientSecret = async (application) => {
  if (!application) return null;

  const clientSecret = generateClientSecret(application.key);
  application.clientSecretHash = hashClientSecret(clientSecret);
  application.clientSecretLastRotatedAt = new Date();
  await application.save();

  return {
    clientSecret,
    rotatedAt: application.clientSecretLastRotatedAt
  };
};

export const verifyApplicationClientSecret = ({ application, clientSecret }) => {
  if (!applicationRequiresClientSecret(application)) {
    return { valid: true };
  }

  if (!application?.clientSecretHash) {
    return {
      valid: false,
      reason: "client_not_configured",
      message: "Application client secret is not configured"
    };
  }

  if (!clientSecret) {
    return {
      valid: false,
      reason: "invalid_client",
      message: "clientSecret is required for this application"
    };
  }

  const expectedHash = Buffer.from(String(application.clientSecretHash), "hex");
  const providedHash = Buffer.from(hashClientSecret(clientSecret), "hex");
  if (expectedHash.length !== providedHash.length) {
    return {
      valid: false,
      reason: "invalid_client",
      message: "Invalid application client secret"
    };
  }

  const isValid = crypto.timingSafeEqual(expectedHash, providedHash);
  if (!isValid) {
    return {
      valid: false,
      reason: "invalid_client",
      message: "Invalid application client secret"
    };
  }

  return { valid: true };
};

export const resolveApplicationKeyFromProductName = (productName) => {
  const normalized = normalizeProductName(productName);
  if (!normalized) return null;
  return normalized.toLowerCase();
};

export const getDefaultApplicationDefinitions = () => {
  const hrmsBaseUrl = trimTrailingSlash(PRODUCT_URLS.HRMS);
  const tmsBaseUrl = trimTrailingSlash(PRODUCT_URLS.TMS);
  const psaBaseUrl = trimTrailingSlash(PRODUCT_URLS.PSA);
  const dmsBaseUrl = trimTrailingSlash(PRODUCT_URLS.DMS);

  return [
    {
      key: "hrms",
      name: "HRMS",
      description: "Human resource management system",
      baseUrl: hrmsBaseUrl,
      loginUrl: hrmsBaseUrl ? `${hrmsBaseUrl}/login` : null,
      logoutUrl: hrmsBaseUrl ? `${hrmsBaseUrl}/logout` : null,
      redirectUris: buildDefaultRedirectUris(hrmsBaseUrl),
      audience: "hrms",
      clientAuthMethod: "client_secret_post",
      type: "first_party",
      category: "business",
      supportsProvisioning: true,
      provisioningAdapter: "hrms",
      legacyProductName: "HRMS",
      claimMapping: {
        tenantId: "tenantId",
        companyId: "companyId",
        companyCode: "companyCode"
      }
    },
    {
      key: "tms",
      name: "TMS",
      description: "Task and workflow management system",
      baseUrl: tmsBaseUrl,
      loginUrl: tmsBaseUrl ? `${tmsBaseUrl}/login` : null,
      logoutUrl: tmsBaseUrl ? `${tmsBaseUrl}/logout` : null,
      redirectUris: buildDefaultRedirectUris(tmsBaseUrl),
      audience: "tms",
      clientAuthMethod: "client_secret_post",
      type: "first_party",
      category: "operations",
      supportsProvisioning: false,
      provisioningAdapter: null,
      legacyProductName: "TMS",
      claimMapping: {
        orgId: "orgId",
        workspaceId: "workspaceId",
        companyId: "companyId"
      }
    },
    {
      key: "crm",
      name: "CRM",
      description: "Customer relationship management system",
      baseUrl: tmsBaseUrl,
      loginUrl: tmsBaseUrl ? `${tmsBaseUrl}/login` : null,
      logoutUrl: tmsBaseUrl ? `${tmsBaseUrl}/logout` : null,
      redirectUris: buildDefaultRedirectUris(tmsBaseUrl),
      audience: "crm",
      clientAuthMethod: "client_secret_post",
      type: "first_party",
      category: "sales",
      supportsProvisioning: false,
      provisioningAdapter: null,
      legacyProductName: "CRM",
      claimMapping: {
        orgId: "orgId",
        workspaceId: "workspaceId",
        companyId: "companyId"
      }
    },
    {
      key: "pms",
      name: "PMS",
      description: "Project management system",
      baseUrl: tmsBaseUrl,
      loginUrl: tmsBaseUrl ? `${tmsBaseUrl}/login` : null,
      logoutUrl: tmsBaseUrl ? `${tmsBaseUrl}/logout` : null,
      redirectUris: buildDefaultRedirectUris(tmsBaseUrl),
      audience: "pms",
      clientAuthMethod: "client_secret_post",
      type: "first_party",
      category: "projects",
      supportsProvisioning: false,
      provisioningAdapter: null,
      legacyProductName: "PMS",
      claimMapping: {
        orgId: "orgId",
        workspaceId: "workspaceId",
        companyId: "companyId"
      }
    },
    {
      key: "psa",
      name: "PSA",
      description: "Professional services automation",
      baseUrl: psaBaseUrl,
      loginUrl: psaBaseUrl ? `${psaBaseUrl}/login` : null,
      logoutUrl: psaBaseUrl ? `${psaBaseUrl}/logout` : null,
      redirectUris: buildDefaultRedirectUris(psaBaseUrl),
      audience: "psa",
      clientAuthMethod: "client_secret_post",
      type: "first_party",
      category: "services",
      supportsProvisioning: false,
      provisioningAdapter: null,
      legacyProductName: "PSA",
      claimMapping: {}
    },
    {
      key: "dms",
      name: "DMS",
      description: "Document management system",
      baseUrl: dmsBaseUrl,
      loginUrl: dmsBaseUrl ? `${dmsBaseUrl}/login` : null,
      logoutUrl: dmsBaseUrl ? `${dmsBaseUrl}/logout` : null,
      redirectUris: buildDefaultRedirectUris(dmsBaseUrl),
      audience: "dms",
      clientAuthMethod: "client_secret_post",
      type: "first_party",
      category: "documents",
      supportsProvisioning: false,
      provisioningAdapter: null,
      legacyProductName: "DMS",
      claimMapping: {}
    }
  ];
};

export const findApplicationByIdentifier = async (value) => {
  const normalizedKey = normalizeAppKey(value);
  const normalizedName = normalizeProductName(value);

  if (!normalizedKey && !normalizedName) {
    return null;
  }

  return Application.findOne(notDeletedApplicationQuery({
    $or: [
      { key: normalizedKey },
      { audience: normalizedKey },
      { name: normalizedName },
      { legacyProductName: normalizedName }
    ]
  }));
};

export const validateApplicationRedirectUri = async ({ app, redirectUri }) => {
  const application = await findApplicationByIdentifier(app);
  if (!application) {
    return {
      valid: false,
      reason: "invalid_app",
      message: "Unknown application key"
    };
  }

  if (application.status !== "active") {
    return {
      valid: false,
      reason: "application_inactive",
      message: "Application is inactive",
      application
    };
  }

  if (!redirectUri) {
    return {
      valid: false,
      reason: "missing_redirect_uri",
      message: "redirect_uri is required",
      application
    };
  }

  let parsedRedirectUri;
  try {
    parsedRedirectUri = new URL(String(redirectUri).trim());
  } catch {
    return {
      valid: false,
      reason: "invalid_redirect_uri",
      message: "redirect_uri must be an absolute URL",
      application
    };
  }

  const normalizedRedirectUri = normalizeAbsoluteUrl(parsedRedirectUri.toString());
  const allowlist = [...new Set([
    ...(Array.isArray(application.redirectUris) ? application.redirectUris : []),
    application.baseUrl
  ]
    .map((item) => normalizeAbsoluteUrl(item))
    .filter(Boolean))];

  if (!allowlist.length) {
    return {
      valid: false,
      reason: "redirect_not_configured",
      message: "No redirect URIs are configured for this application",
      application
    };
  }

  const isAllowed = allowlist.some((allowedBase) =>
    normalizedRedirectUri === allowedBase ||
    normalizedRedirectUri.startsWith(`${allowedBase}/`)
  );

  if (!isAllowed) {
    return {
      valid: false,
      reason: "redirect_not_allowed",
      message: "redirect_uri is not allowlisted for this application",
      application
    };
  }

  return {
    valid: true,
    application,
    normalizedRedirectUri
  };
};

export const hasCompanyAccessToApplication = async ({ companyId, applicationId }) => {
  if (!companyId || !applicationId) {
    return false;
  }

  const assignment = await CompanyApplication.findOne({
    companyId,
    applicationId,
    isActive: true
  })
    .select("_id")
    .lean();

  return Boolean(assignment?._id);
};

export const listCompanyApplications = async ({ companyId, includeInactive = false }) => {
  if (!companyId) return [];

  const assignments = await CompanyApplication.find({
    companyId,
    isActive: true
  })
    .populate({
      path: "applicationId",
      match: notDeletedApplicationQuery(includeInactive ? {} : { status: "active" })
    })
    .lean();

  return assignments
    .map((assignment) => assignment.applicationId)
    .filter(Boolean);
};

const backfillMissingApplicationFields = async (application, definition) => {
  let changed = false;
  const fields = [
    "key",
    "name",
    "description",
    "status",
    "type",
    "category",
    "baseUrl",
    "loginUrl",
    "logoutUrl",
    "audience",
    "clientAuthMethod",
    "icon",
    "supportsProvisioning",
    "provisioningAdapter",
    "legacyProductName"
  ];

  for (const field of fields) {
    const currentValue = application[field];
    const nextValue = definition[field];
    const shouldApply =
      currentValue === undefined ||
      currentValue === null ||
      currentValue === "" ||
      (Array.isArray(currentValue) && currentValue.length === 0);
    if (shouldApply && nextValue !== undefined) {
      application[field] = nextValue;
      changed = true;
    }
  }

  if ((!application.baseUrl || !String(application.baseUrl).trim()) && application.url) {
    application.baseUrl = String(application.url).trim();
    changed = true;
  }

  if (!Array.isArray(application.redirectUris) || application.redirectUris.length === 0) {
    application.redirectUris = definition.redirectUris || [];
    changed = true;
  }

  if (!application.claimMapping || Object.keys(application.claimMapping).length === 0) {
    application.claimMapping = definition.claimMapping || {};
    changed = true;
  }

  if (!application.metadata || Object.keys(application.metadata).length === 0) {
    application.metadata = definition.metadata || {};
    changed = true;
  }

  if (changed) {
    await application.save();
  }

  return application;
};

export const seedApplicationRegistry = async () => {
  const definitions = getDefaultApplicationDefinitions();
  const applications = [];

  for (const definition of definitions) {
    let application = await Application.findOne({
      $or: [
        { key: definition.key },
        { name: definition.name },
        { legacyProductName: definition.legacyProductName }
      ]
    });

    if (!application) {
      application = await Application.create(definition);
    } else {
      application = await backfillMissingApplicationFields(application, definition);
    }

    applications.push(application);
  }

  return applications;
};

export const getApplicationsForProductNames = async (productNames = []) => {
  const normalizedProductNames = [...new Set(
    (Array.isArray(productNames) ? productNames : [])
      .map((name) => normalizeProductName(name))
      .filter(Boolean)
  )];

  if (!normalizedProductNames.length) {
    return [];
  }

  const applicationKeys = normalizedProductNames
    .map((productName) => resolveApplicationKeyFromProductName(productName))
    .filter(Boolean);

  return Application.find(notDeletedApplicationQuery({
    $or: [
      { legacyProductName: { $in: normalizedProductNames } },
      { name: { $in: normalizedProductNames } },
      { key: { $in: applicationKeys } }
    ]
  }));
};

export const syncCompanyApplicationAssignments = async ({
  companyId,
  productNames = [],
  source = "legacy_product_sync"
}) => {
  if (!companyId) {
    return {
      synced: false,
      companyId: null,
      applications: [],
      missingProductNames: []
    };
  }

  await seedApplicationRegistry();
  const applications = await getApplicationsForProductNames(productNames);
  const normalizedProductNames = [...new Set(
    (Array.isArray(productNames) ? productNames : [])
      .map((name) => normalizeProductName(name))
      .filter(Boolean)
  )];
  const matchedProductNames = new Set(
    applications
      .map((application) => normalizeProductName(application.legacyProductName || application.name))
      .filter(Boolean)
  );

  await CompanyApplication.deleteMany({ companyId });

  if (applications.length > 0) {
    await CompanyApplication.insertMany(
      applications.map((application) => ({
        companyId,
        applicationId: application._id,
        isActive: true,
        source,
        legacyProductName: normalizeProductName(application.legacyProductName || application.name),
        settings: {},
        provisioningState: {}
      }))
    );
  }

  return {
    synced: true,
    companyId: String(companyId),
    applicationIds: applications.map((application) => String(application._id)),
    applications,
    missingProductNames: normalizedProductNames.filter((productName) => !matchedProductNames.has(productName))
  };
};

export const syncLegacyCompanyApplicationAssignments = async () => {
  await seedApplicationRegistry();

  const companyProducts = await CompanyProduct.find({ isActive: true })
    .populate("productId", "name")
    .lean();

  const productNamesByCompany = new Map();
  for (const link of companyProducts) {
    const companyKey = String(link.companyId || "").trim();
    const productName = normalizeProductName(link.productId?.name);
    if (!companyKey || !productName) continue;
    const current = productNamesByCompany.get(companyKey) || [];
    current.push(productName);
    productNamesByCompany.set(companyKey, current);
  }

  const results = [];
  for (const [companyId, productNames] of productNamesByCompany.entries()) {
    const result = await syncCompanyApplicationAssignments({
      companyId,
      productNames,
      source: "legacy_product_sync"
    });
    results.push(result);
  }

  return {
    syncedCompanies: results.length,
    results
  };
};

export const normalizeApplicationInput = (value) => normalizeAppKey(value);
