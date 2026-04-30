import Application from "../models/Application.js";
import CompanyApplication from "../models/CompanyApplication.js";
import {
  applicationRequiresClientSecret,
  issueApplicationClientSecret,
  normalizeApplicationInput,
  resolveApplicationClientAuthMethod,
  seedApplicationRegistry,
  syncLegacyCompanyApplicationAssignments
} from "../services/applicationRegistry.service.js";

const ACTIVE_STATUSES = new Set(["active", "inactive"]);
const APPLICATION_TYPES = new Set(["first_party", "external"]);
const CLIENT_AUTH_METHODS = new Set(["none", "client_secret_post"]);
const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

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

const getRequestUserId = (req) => {
  const value = String(req.user?.id || req.user?.sub || "").trim();
  return /^[a-f\d]{24}$/i.test(value) ? value : null;
};

const isValidAbsoluteUrl = (value) => {
  if (!value) return false;
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const normalizeStringOrNull = (value) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const normalizeUrlArray = (values) =>
  [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];

const buildPublicOrigin = (req, configuredValue) => {
  const normalizedConfigured = trimTrailingSlash(configuredValue);
  if (normalizedConfigured) {
    return normalizedConfigured;
  }

  const protocol = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return host ? `${protocol}://${host}` : "";
};

const buildPublicApiBaseUrl = (req) => {
  const configuredApiUrl = trimTrailingSlash(process.env.SSO_PUBLIC_API_URL || process.env.SSO_API_URL);
  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  const origin = trimTrailingSlash(buildPublicOrigin(req));
  return origin ? `${origin}/api` : "";
};

const buildFrontendBaseUrl = (req) => {
  const configured = trimTrailingSlash(process.env.SSO_FRONTEND_URL || process.env.SSO_PUBLIC_URL);
  if (configured) {
    return configured;
  }

  const protocol = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const hostName = host.includes(":") ? host.split(":")[0] : host;
  const isLocal = ["localhost", "127.0.0.1", "0.0.0.0"].includes(String(hostName || "").toLowerCase());

  if (isLocal) {
    const port = String(process.env.SSO_FRONTEND_PORT || "5174").trim();
    return `${protocol}://${hostName}${port ? `:${port}` : ""}`;
  }

  return trimTrailingSlash(buildPublicOrigin(req));
};

const buildConnectorTemplateResponse = ({ req, application }) => {
  const apiBaseUrl = buildPublicApiBaseUrl(req);
  const publicOrigin = trimTrailingSlash(buildPublicOrigin(req));
  const frontendBaseUrl = trimTrailingSlash(buildFrontendBaseUrl(req));
  const appBaseUrl = trimTrailingSlash(String(application.baseUrl || ""));
  const callbackUrl =
    (Array.isArray(application.redirectUris) && application.redirectUris[0]) ||
    (appBaseUrl ? `${appBaseUrl}/auth/sso/callback` : "");
  const browserAuthorizeUrl =
    apiBaseUrl && callbackUrl
      ? `${apiBaseUrl}/sso/authorize?${new URLSearchParams({
        app: application.key,
        redirect_uri: callbackUrl
      }).toString()}`
      : null;

  return {
    application: mapApplicationForResponse(application),
    sso: {
      loginUrl: frontendBaseUrl ? `${frontendBaseUrl}/login` : null,
      authorizeUrl: apiBaseUrl ? `${apiBaseUrl}/sso/authorize` : null,
      exchangeUrl: apiBaseUrl ? `${apiBaseUrl}/sso/exchange` : null,
      browserAuthorizeUrl,
      callbackUrl,
      expectedQueryParams: ["code", "state"],
      exchangePayload: {
        app: application.key,
        code: "<code-from-query>",
        redirectUri: callbackUrl,
        ...(applicationRequiresClientSecret(application)
          ? { clientSecret: "<GT_ONE client secret>" }
          : {})
      },
      clientAuthentication: {
        method: resolveApplicationClientAuthMethod(application),
        clientSecretRequired: applicationRequiresClientSecret(application),
        clientSecretConfigured: Boolean(application.clientSecretHash),
        clientSecretEnvVar: `GTONE_${String(application.key || "").trim().toUpperCase()}_CLIENT_SECRET`
      },
      noCodeOidc: {
        whenToUse: "Use this when the product already supports OpenID Connect or generic OAuth2 login.",
        discoveryUrl: publicOrigin ? `${publicOrigin}/.well-known/openid-configuration` : null,
        issuer: process.env.SSO_OIDC_ISSUER || process.env.JWT_ISSUER || publicOrigin || null,
        clientId: application.key,
        clientSecretEnvVar: `GTONE_${String(application.key || "").trim().toUpperCase()}_CLIENT_SECRET`,
        scopes: ["openid", "profile", "email"],
        authorizationEndpoint: apiBaseUrl ? `${apiBaseUrl}/sso/authorize` : null,
        tokenEndpoint: apiBaseUrl ? `${apiBaseUrl}/sso/token` : null,
        userInfoEndpoint: apiBaseUrl ? `${apiBaseUrl}/sso/userinfo` : null,
        jwksUri: publicOrigin ? `${publicOrigin}/.well-known/jwks.json` : null,
        redirectUris: Array.isArray(application.redirectUris) ? application.redirectUris : [],
        setupSteps: [
          "Register the product as an application in GT_ONE.",
          "Add the product callback URL to redirectUris.",
          "Rotate and copy the client secret once.",
          "Paste the discovery URL, client id, client secret, scopes, and redirect URI into the product's OIDC settings.",
          "Assign the application to the company or users who should see it in the GT_ONE launcher."
        ]
      },
      expectedClaims: {
        core: [
          "sub",
          "email",
          "name",
          "role",
          "products",
          "appKey",
          "applicationId"
        ],
        appSpecific: Object.keys(application.claimMapping || {})
      }
    },
    productDatabase: {
      localUser: [
        { field: "email", source: "email", required: true },
        { field: "name", source: "name", required: true },
        { field: "role", source: "role", required: true },
        { field: "companyId", source: "companyId", required: false },
        { field: "tenantId", source: "tenantId", required: false },
        { field: "companyCode", source: "companyCode", required: false }
      ],
      identityLink: [
        { field: "appKey", source: "appKey", required: true },
        { field: "gtOneUserId", source: "sub", required: true },
        { field: "gtOneCompanyId", source: "companyId", required: false },
        { field: "localUserId", source: "product-db", required: true },
        { field: "email", source: "email", required: true },
        { field: "lastLoginAt", source: "generated", required: true }
      ],
      syncSteps: [
        "Generate a cryptographically random state value in the product backend before redirecting to GT_ONE.",
        "Store the state in the product session and validate it on the callback before code exchange.",
        "Exchange the authorization code with GT_ONE from the product backend.",
        "Verify the returned GT_ONE app token in the product backend.",
        "Find an identity link by appKey + gtOneUserId; if missing, fallback by email.",
        "Create or update the local product user row with GT_ONE claims.",
        "Upsert the identity link and then create the local product session."
      ]
    },
    implementationFiles: [
      {
        path: "server/templates/product-connector/README.md",
        description: "Integration steps for a product backend"
      },
      {
        path: "server/templates/product-connector/gtOneProductConnector.example.js",
        description: "Reusable exchange and local-user sync helper"
      },
      {
        path: "server/templates/product-connector/GtOneIdentityLink.example.js",
        description: "Recommended mapping schema between GT_ONE and local users"
      },
      {
        path: "server/templates/product-connector/productSso.routes.example.js",
        description: "Example Express routes for /auth/sso/start and /auth/sso/callback"
      }
    ]
  };
};

const mapApplicationForResponse = (application) => {
  if (!application) return null;
  return {
    id: String(application._id),
    key: application.key,
    name: application.name,
    description: application.description || null,
    status: application.status,
    type: application.type,
    category: application.category || null,
    baseUrl: application.baseUrl,
    loginUrl: application.loginUrl || null,
    logoutUrl: application.logoutUrl || null,
    redirectUris: Array.isArray(application.redirectUris) ? application.redirectUris : [],
    audience: application.audience || null,
    clientAuthMethod: resolveApplicationClientAuthMethod(application),
    clientSecretConfigured: Boolean(application.clientSecretHash),
    clientSecretLastRotatedAt: application.clientSecretLastRotatedAt || null,
    icon: application.icon || null,
    supportsProvisioning: Boolean(application.supportsProvisioning),
    provisioningAdapter: application.provisioningAdapter || null,
    legacyProductName: application.legacyProductName || null,
    claimMapping: application.claimMapping || {},
    metadata: application.metadata || {},
    deletedAt: application.deletedAt || null,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt
  };
};

const parseApplicationPayload = (body, { partial = false } = {}) => {
  const payload = {};

  if (!partial || body.key !== undefined) {
    const key = normalizeApplicationInput(body.key);
    if (!partial && !key) {
      return { error: { status: 400, message: "key is required" } };
    }
    if (key) payload.key = key;
  }

  if (!partial || body.name !== undefined) {
    const name = normalizeStringOrNull(body.name);
    if (!partial && !name) {
      return { error: { status: 400, message: "name is required" } };
    }
    if (name) payload.name = name;
  }

  if (!partial || body.baseUrl !== undefined) {
    const baseUrl = normalizeStringOrNull(body.baseUrl);
    if (!partial && !baseUrl) {
      return { error: { status: 400, message: "baseUrl is required" } };
    }
    if (baseUrl && !isValidAbsoluteUrl(baseUrl)) {
      return { error: { status: 400, message: "baseUrl must be an absolute URL" } };
    }
    if (body.baseUrl !== undefined) {
      payload.baseUrl = baseUrl;
    }
  }

  if (body.description !== undefined) {
    payload.description = normalizeStringOrNull(body.description);
  }

  if (body.loginUrl !== undefined) {
    const loginUrl = normalizeStringOrNull(body.loginUrl);
    if (loginUrl && !isValidAbsoluteUrl(loginUrl)) {
      return { error: { status: 400, message: "loginUrl must be an absolute URL" } };
    }
    payload.loginUrl = loginUrl;
  }

  if (body.logoutUrl !== undefined) {
    const logoutUrl = normalizeStringOrNull(body.logoutUrl);
    if (logoutUrl && !isValidAbsoluteUrl(logoutUrl)) {
      return { error: { status: 400, message: "logoutUrl must be an absolute URL" } };
    }
    payload.logoutUrl = logoutUrl;
  }

  if (body.redirectUris !== undefined) {
    const redirectUris = normalizeUrlArray(body.redirectUris);
    const invalidRedirectUri = redirectUris.find((value) => !isValidAbsoluteUrl(value));
    if (invalidRedirectUri) {
      return { error: { status: 400, message: `redirectUri must be an absolute URL: ${invalidRedirectUri}` } };
    }
    payload.redirectUris = redirectUris;
  }

  if (body.status !== undefined) {
    const status = String(body.status || "").trim().toLowerCase();
    if (!ACTIVE_STATUSES.has(status)) {
      return { error: { status: 400, message: "status must be active or inactive" } };
    }
    payload.status = status;
  }

  if (body.type !== undefined) {
    const type = String(body.type || "").trim().toLowerCase();
    if (!APPLICATION_TYPES.has(type)) {
      return { error: { status: 400, message: "type must be first_party or external" } };
    }
    payload.type = type;
  }

  if (body.category !== undefined) {
    payload.category = normalizeStringOrNull(body.category);
  }

  if (body.audience !== undefined) {
    payload.audience = normalizeStringOrNull(body.audience);
  }

  if (body.clientAuthMethod !== undefined) {
    const clientAuthMethod = String(body.clientAuthMethod || "").trim().toLowerCase();
    if (!CLIENT_AUTH_METHODS.has(clientAuthMethod)) {
      return { error: { status: 400, message: "clientAuthMethod must be none or client_secret_post" } };
    }
    payload.clientAuthMethod = clientAuthMethod;
  }

  if (body.icon !== undefined) {
    payload.icon = normalizeStringOrNull(body.icon);
  }

  if (body.supportsProvisioning !== undefined) {
    payload.supportsProvisioning = Boolean(body.supportsProvisioning);
  }

  if (body.provisioningAdapter !== undefined) {
    payload.provisioningAdapter = normalizeStringOrNull(body.provisioningAdapter);
  }

  if (body.legacyProductName !== undefined) {
    payload.legacyProductName = normalizeStringOrNull(body.legacyProductName)?.toUpperCase() || null;
  }

  if (body.claimMapping !== undefined) {
    payload.claimMapping = body.claimMapping && typeof body.claimMapping === "object" ? body.claimMapping : {};
  }

  if (body.metadata !== undefined) {
    payload.metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  }

  return { payload };
};

export const listApps = async (req, res) => {
  try {
    const requestedStatus = String(req.query?.status || "").trim().toLowerCase();
    const query = notDeletedApplicationQuery(
      ACTIVE_STATUSES.has(requestedStatus) ? { status: requestedStatus } : {}
    );
    const applications = await Application.find(query).sort({ name: 1 }).lean();

    return res.json({
      applications: applications.map((application) => mapApplicationForResponse(application))
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getAppByKey = async (req, res) => {
  try {
    const key = normalizeApplicationInput(req.params.key);
    if (!key) {
      return res.status(400).json({ message: "application key is required" });
    }

    const application = await Application.findOne(notDeletedApplicationQuery({ key })).lean();
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    return res.json({ application: mapApplicationForResponse(application) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getAppConnectorTemplate = async (req, res) => {
  try {
    const key = normalizeApplicationInput(req.params.key);
    if (!key) {
      return res.status(400).json({ message: "application key is required" });
    }

    const application = await Application.findOne(notDeletedApplicationQuery({ key })).lean();
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    return res.json(buildConnectorTemplateResponse({ req, application }));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const createApp = async (req, res) => {
  try {
    const parsed = parseApplicationPayload(req.body || {}, { partial: false });
    if (parsed.error) {
      return res.status(parsed.error.status).json({ message: parsed.error.message });
    }

    const existing = await Application.findOne({
      $or: [
        { key: parsed.payload.key },
        { name: parsed.payload.name }
      ]
    }).lean();

    if (existing) {
      return res.status(409).json({ message: "Application key or name already exists" });
    }

    const application = await Application.create(parsed.payload);
    let issuedSecret = null;
    if (applicationRequiresClientSecret(application) && !application.clientSecretHash) {
      issuedSecret = await issueApplicationClientSecret(application);
    }

    return res.status(201).json({
      message: "Application created successfully",
      application: mapApplicationForResponse(application),
      generatedClientSecret: issuedSecret?.clientSecret || null
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const updateApp = async (req, res) => {
  try {
    const parsed = parseApplicationPayload(req.body || {}, { partial: true });
    if (parsed.error) {
      return res.status(parsed.error.status).json({ message: parsed.error.message });
    }

    const application = await Application.findOne(notDeletedApplicationQuery({ _id: req.params.id }));
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (parsed.payload.key && parsed.payload.key !== application.key) {
      const keyOwner = await Application.findOne(notDeletedApplicationQuery({ key: parsed.payload.key })).select("_id").lean();
      if (keyOwner) {
        return res.status(409).json({ message: "Application key already exists" });
      }
    }

    if (parsed.payload.name && parsed.payload.name !== application.name) {
      const nameOwner = await Application.findOne(notDeletedApplicationQuery({ name: parsed.payload.name })).select("_id").lean();
      if (nameOwner) {
        return res.status(409).json({ message: "Application name already exists" });
      }
    }

    Object.assign(application, parsed.payload);

    if (resolveApplicationClientAuthMethod(application) === "none") {
      application.clientSecretHash = null;
      application.clientSecretLastRotatedAt = null;
    }

    await application.save();
    let issuedSecret = null;
    if (applicationRequiresClientSecret(application) && !application.clientSecretHash) {
      issuedSecret = await issueApplicationClientSecret(application);
    }

    return res.json({
      message: "Application updated successfully",
      application: mapApplicationForResponse(application),
      generatedClientSecret: issuedSecret?.clientSecret || null
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const setAppStatus = async (req, res) => {
  try {
    const requestedStatus = String(req.body?.status || "").trim().toLowerCase();
    const status =
      ACTIVE_STATUSES.has(requestedStatus)
        ? requestedStatus
        : typeof req.body?.isActive === "boolean"
          ? (req.body.isActive ? "active" : "inactive")
          : null;

    if (!status) {
      return res.status(400).json({ message: "status must be active or inactive" });
    }

    const application = await Application.findOne(notDeletedApplicationQuery({ _id: req.params.id }));
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    application.status = status;
    await application.save();

    return res.json({
      message: `Application ${status === "active" ? "activated" : "deactivated"} successfully`,
      application: mapApplicationForResponse(application)
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const rotateAppClientSecret = async (req, res) => {
  try {
    const application = await Application.findOne(notDeletedApplicationQuery({ _id: req.params.id }));
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (!applicationRequiresClientSecret(application)) {
      return res.status(400).json({
        message: "Client secret rotation is only available when clientAuthMethod is client_secret_post"
      });
    }

    const issuedSecret = await issueApplicationClientSecret(application);
    return res.json({
      message: "Application client secret rotated successfully",
      application: mapApplicationForResponse(application),
      generatedClientSecret: issuedSecret?.clientSecret || null
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const deleteApp = async (req, res) => {
  try {
    const application = await Application.findOne(notDeletedApplicationQuery({ _id: req.params.id }));
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    application.status = "inactive";
    application.deletedAt = new Date();
    application.deletedBy = getRequestUserId(req);
    await application.save();

    await CompanyApplication.updateMany(
      { applicationId: application._id },
      { $set: { isActive: false } }
    );

    return res.json({
      message: "Application soft deleted successfully",
      application: mapApplicationForResponse(application)
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getCompanyApps = async (req, res) => {
  try {
    const { companyId } = req.params;
    const companyApplications = await CompanyApplication.find({ companyId, isActive: true })
      .populate("applicationId")
      .lean();

    return res.json({
      companyId,
      applications: companyApplications
        .filter((item) => item.applicationId && !item.applicationId.deletedAt)
        .map((item) => ({
          assignmentId: String(item._id),
          source: item.source,
          legacyProductName: item.legacyProductName || null,
          application: mapApplicationForResponse(item.applicationId)
        }))
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const syncLegacyApps = async (_req, res) => {
  try {
    const applications = await seedApplicationRegistry();
    const syncResult = await syncLegacyCompanyApplicationAssignments();

    return res.json({
      message: "Legacy product mappings synced into application registry",
      seededApplications: applications.map((application) => mapApplicationForResponse(application)),
      syncedCompanies: syncResult.syncedCompanies
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
