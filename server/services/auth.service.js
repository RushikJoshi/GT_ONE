import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import Company from "../models/Company.js";
import CompanyProduct from "../models/CompanyProduct.js";
import Product from "../models/Product.js";
import { PRODUCT_URLS, getHrmsBaseUrl } from "../constants/products.js";
import { ROLES } from "../constants/roles.js";
import { normalizeHrmsModuleSettings } from "../constants/hrmsModules.js";
import { syncCompanyToHrms } from "./hrmsProvisioning.service.js";

const isLocalHost = (host) => {
  const normalized = String(host || "").toLowerCase();
  return (
    normalized.includes("localhost") ||
    normalized.includes("127.0.0.1") ||
    normalized.includes("0.0.0.0")
  );
};

const resolveCookieDomain = (host) => {
  if (isLocalHost(host)) return undefined;
  const configured = String(process.env.SSO_COOKIE_DOMAIN || "").trim();
  return configured || undefined;
};

const resolveCookieSecure = (host) => {
  // If it's localhost, we can't use Secure=true unless using https
  if (isLocalHost(host)) return false;
  // In production, always use Secure=true
  return process.env.SSO_COOKIE_SECURE === "true" || true;
};

const resolveSameSite = (host) => {
  if (isLocalHost(host)) return "lax";
  // For production cross-domain SSO, 'none' is often required, but 'lax' works for subdomains
  const configured = String(process.env.SSO_COOKIE_SAMESITE || "lax").toLowerCase();
  return configured;
};

export const getCookieOptions = (host) => {
  const isLocal = isLocalHost(host);
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: !isLocal, // false on localhost, true on production
    domain: isLocal ? undefined : (process.env.SSO_COOKIE_DOMAIN || ".gitakshmi.com"),

    path: "/"
  };
};



export const COOKIE_OPTIONS = getCookieOptions();

const AUTH_CODE_TTL_SECONDS = Number(process.env.SSO_AUTH_CODE_TTL_SECONDS || 120);
const APP_TOKEN_TTL_SECONDS = Number(process.env.SSO_APP_TOKEN_TTL_SECONDS || 900);
const ISSUER = process.env.JWT_ISSUER || "gitakshmi-sso";
const JWT_ALGORITHMS = (process.env.JWT_ALLOWED_ALGS || "HS256")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const USED_AUTH_CODE_JTIS = new Map();
const REVOKED_SESSION_JTIS = new Map();
const APP_ALIASES = {
  hrms: "hrms",
  tms: "tms",
  pms: "tms",
  crm: "tms"
};

const LOCAL_REDIRECT_ALLOWLIST = {
  hrms: [
    "http://localhost:5176",
    "http://localhost:5176/hr",
    "http://127.0.0.1:5176",
    "http://127.0.0.1:5176/hr"
  ],
  tms: [
    "http://localhost:5173",
    "http://localhost:5173/dashboard",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5173/dashboard"
  ]
};

const logAuth = (event, data = {}) => {
  console.log(
    JSON.stringify({
      scope: "AUTH",
      event,
      at: new Date().toISOString(),
      ...data
    })
  );
};

const normalizeRole = (role) => String(role || "").trim().toLowerCase();

const HRMS_ROLE_REDIRECT_PATHS = {
  SUPER_ADMIN: "/super-admin/dashboard",
  TENANT_ADMIN: "/tenant/admin-dashboard",
  TENANT_FALLBACK: "/tenant/dashboard",
  EMPLOYEE: "/employee/dashboard",
  FALLBACK: "/access-denied"
};

const TENANT_ADMIN_ROLES = new Set([
  "company_admin",
  "companyadmin",
  "hr",
  "admin",
  "hr_admin",
  "admin_manager",
  "hr_manager"
]);

const TENANT_FALLBACK_ROLES = new Set([
  "manager",
  "team_manager"
]);

const EMPLOYEE_ROLES = new Set(["employee", "user", "staff"]);

const buildAppUrlLikeOrigin = (baseUrl, requestOrigin) => {
  const url = new URL(baseUrl);
  if (!requestOrigin) return url.toString();

  try {
    const originUrl = new URL(requestOrigin);
    const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
    if (localHosts.has(url.hostname) && localHosts.has(originUrl.hostname)) {
      url.protocol = originUrl.protocol;
      url.hostname = originUrl.hostname;
      if (originUrl.port) {
        url.port = originUrl.port;
      }
    }
  } catch (_error) {
    // Keep configured base URL if the request origin cannot be parsed.
  }

  return url.toString();
};

const getSsoDashboardUrl = (requestOrigin) => {
  const ssoLoginUrl = process.env.SSO_LOGIN_URL || "http://localhost:5174/login?redirect=hrms";
  const url = new URL(buildAppUrlLikeOrigin(ssoLoginUrl, requestOrigin));
  url.pathname = "/dashboard";
  url.search = "";
  return url.toString();
};

const isSuperRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === "super_admin" || normalized === "superadmin" || normalized === "psa";
};

const toObjectIdIfValid = (value) => {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized || !mongoose.Types.ObjectId.isValid(normalized)) {
    return null;
  }
  return new mongoose.Types.ObjectId(normalized);
};

const sanitizeCompanyCode = (value) => {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
  return normalized || null;
};

const getTenantCollection = () => mongoose.connection?.db?.collection("tenants") || null;

const buildTenantQueryClauses = ({ company, user }) => {
  const clauses = [];
  const companyId = String(company?._id || "").trim();
  const companyCode = sanitizeCompanyCode(company?.code || company?.companyCode);
  const emails = [...new Set([user?.email, company?.email].map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];

  if (companyId) {
    clauses.push({ externalCompanyId: companyId });
    clauses.push({ companyId });
  }

  if (companyCode) {
    clauses.push({ code: companyCode });
    clauses.push({ companyCode });
  }

  for (const email of emails) {
    clauses.push({ adminEmail: email });
    clauses.push({ email });
  }

  return clauses;
};

const findTenantByMappedId = async (tenantId) => {
  const collection = getTenantCollection();
  if (!collection || !tenantId) return null;

  const normalized = String(tenantId).trim();
  const objectId = toObjectIdIfValid(normalized);
  const query = objectId ? { $or: [{ _id: objectId }, { _id: normalized }] } : { _id: normalized };

  return collection.findOne(query);
};

const findTenantForCompany = async ({ company, user }) => {
  const collection = getTenantCollection();
  if (!collection || !company) return null;

  const clauses = buildTenantQueryClauses({ company, user });
  if (!clauses.length) return null;

  // Prefer active tenant first, then most recently updated.
  return collection.findOne(
    { $or: clauses },
    { sort: { status: -1, updatedAt: -1, createdAt: -1 } }
  );
};

const backfillCompanyTenantMapping = async ({ companyId, tenantId }) => {
  if (!companyId || !tenantId) return;
  await Company.updateOne(
    { _id: companyId },
    { $set: { hrmsTenantId: tenantId, updatedAt: new Date() } }
  );
};

const resolveCompanyFromLinkageTable = async (user) => {
  const possibleLinkModels = [
    "UserCompanyLink",
    "CompanyUserLink",
    "TenantUserLink",
    "UserTenantLink"
  ];

  for (const modelName of possibleLinkModels) {
    if (!mongoose.models[modelName]) {
      continue;
    }

    const LinkModel = mongoose.models[modelName];
    const link = await LinkModel.findOne({
      $or: [
        { userId: user._id },
        { user: user._id },
        { email: String(user.email || "").toLowerCase() }
      ]
    }).lean();

    if (!link) {
      continue;
    }

    const possibleCompanyId =
      link.companyId ||
      link.tenantId ||
      link.company ||
      link.tenant ||
      null;

    if (possibleCompanyId) {
      const company = await Company.findById(possibleCompanyId);
      if (company) {
        return company;
      }
    }
  }

  return null;
};

const resolveCompanyForToken = async (user) => {
  if (!user) return null;

  let company = null;
  if (user.companyId) {
    company = await Company.findById(user.companyId);
  }

  if (!company && user._id) {
    company = await Company.findOne({ hrmsAdminUserId: String(user._id) });
  }

  if (!company && user.email) {
    company = await Company.findOne({ email: String(user.email).toLowerCase() });
  }

  if (!company) {
    company = await resolveCompanyFromLinkageTable(user);
  }

  return company;
};

const resolveHrmsTenantContext = async ({ company, user, products }) => {
  if (!company) {
    return { tenantId: null, companyId: null, companyCode: null, reason: "company_not_found" };
  }

  const normalizedProducts = Array.isArray(products)
    ? products.map((item) => String(item || "").toUpperCase())
    : [];
  const hasHrms = normalizedProducts.includes("HRMS");
  const companyCode = String(company.code || company.companyCode || "").trim() || null;

  if (company.hrmsTenantId) {
    const mappedTenant = await findTenantByMappedId(company.hrmsTenantId);
    if (mappedTenant) {
      const tenantId = String(mappedTenant._id);
      return {
        tenantId,
        companyId: tenantId,
        companyCode,
        source: "company_mapping"
      };
    }

    console.warn(
      `[SSO] stale hrmsTenantId detected company=${String(company._id)} mappedTenantId=${String(company.hrmsTenantId)}`
    );
  }

  const fallbackTenant = await findTenantForCompany({ company, user });
  if (fallbackTenant?._id) {
    const tenantId = String(fallbackTenant._id);
    await backfillCompanyTenantMapping({
      companyId: company._id,
      tenantId: fallbackTenant._id
    });
    company.hrmsTenantId = tenantId;
    return {
      tenantId,
      companyId: tenantId,
      companyCode,
      source: "tenant_lookup_backfill"
    };
  }

  if (!hasHrms) {
    return {
      tenantId: null,
      companyId: null,
      companyCode,
      reason: "hrms_not_assigned"
    };
  }

  const syncResult = await syncCompanyToHrms({
    company,
    products: normalizedProducts,
    adminName: user?.name,
    adminEmail: user?.email,
    source: "login_resolve_tenant"
  });

  if (syncResult?.success && syncResult?.tenantId) {
    return {
      tenantId: String(syncResult.tenantId),
      companyId: String(syncResult.tenantId),
      companyCode: String(syncResult.companyCode || company.code || company.companyCode || "").trim() || null,
      source: "provisioning_sync"
    };
  }

  const postProvisionLookup = await findTenantForCompany({ company, user });
  if (postProvisionLookup?._id) {
    const tenantId = String(postProvisionLookup._id);
    await backfillCompanyTenantMapping({
      companyId: company._id,
      tenantId: postProvisionLookup._id
    });
    return {
      tenantId,
      companyId: tenantId,
      companyCode,
      source: "post_provision_lookup_backfill"
    };
  }

  return {
    tenantId: null,
    companyId: null,
    companyCode,
    reason: syncResult?.message || "tenant_not_found_or_provisioning_failed",
    provisioningStatus: syncResult?.status || null
  };
};

export const getRoleRedirectPathForHrms = (role) => {
  const normalizedRole = normalizeRole(role);

  if (
    normalizedRole === "super_admin" ||
    normalizedRole === "superadmin" ||
    normalizedRole === "psa"
  ) {
    return HRMS_ROLE_REDIRECT_PATHS.SUPER_ADMIN;
  }

  if (TENANT_ADMIN_ROLES.has(normalizedRole)) {
    return HRMS_ROLE_REDIRECT_PATHS.TENANT_ADMIN;
  }

  if (TENANT_FALLBACK_ROLES.has(normalizedRole)) {
    return HRMS_ROLE_REDIRECT_PATHS.TENANT_FALLBACK;
  }

  if (EMPLOYEE_ROLES.has(normalizedRole)) {
    return HRMS_ROLE_REDIRECT_PATHS.EMPLOYEE;
  }

  return HRMS_ROLE_REDIRECT_PATHS.FALLBACK;
};

const buildHrmsRedirectUrl = ({ role, requestOrigin }) => {
  const redirectPath = getRoleRedirectPathForHrms(role);
  const redirectUrl = new URL(buildAppUrlLikeOrigin(getHrmsBaseUrl(), requestOrigin));
  redirectUrl.pathname = redirectPath;
  return {
    redirectPath,
    redirectUrl: redirectUrl.toString()
  };
};

const isValidAbsoluteUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_error) {
    return false;
  }
};

const DEFAULT_SUPER_ADMIN = {
  name: "GT ONE Super Admin",
  email: "admin@gitakshmi.com",
  password: "admin@2026"
};

const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }
  return process.env.JWT_SECRET;
};

const asArrayAudience = (audience) => {
  if (!audience) return [];
  if (Array.isArray(audience)) return audience.filter(Boolean);
  return [String(audience)];
};

const validateTokenContract = (decodedToken) => {
  if (!decodedToken || typeof decodedToken !== "object") {
    return { valid: false, reason: "missing_claims" };
  }

  const hasIdentity = Boolean(decodedToken.sub);
  const hasEmailOrLogin = Boolean(decodedToken.email || decodedToken.login);
  const hasRole = Boolean(decodedToken.role);
  const hasProducts = Array.isArray(decodedToken.products);

  if (!hasIdentity || !hasEmailOrLogin || !hasRole || !hasProducts) {
    return { valid: false, reason: "missing_claims" };
  }

  return { valid: true };
};

const cleanupUsedAuthCodes = () => {
  const now = Date.now();
  for (const [jti, expiresAt] of USED_AUTH_CODE_JTIS.entries()) {
    if (expiresAt <= now) {
      USED_AUTH_CODE_JTIS.delete(jti);
    }
  }
};

const cleanupRevokedSessions = () => {
  const now = Date.now();
  for (const [jti, expiresAt] of REVOKED_SESSION_JTIS.entries()) {
    if (expiresAt <= now) {
      REVOKED_SESSION_JTIS.delete(jti);
    }
  }
};

const getRedirectAllowlist = (canonicalApp) => {
  const envKey = canonicalApp === "hrms" ? "SSO_REDIRECT_ALLOWLIST_HRMS" : "SSO_REDIRECT_ALLOWLIST_TMS";
  const envList = (process.env[envKey] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return envList.length ? envList : LOCAL_REDIRECT_ALLOWLIST[canonicalApp] || [];
};

export const normalizeAppName = (app) => {
  const normalized = String(app || "").trim().toLowerCase();
  return APP_ALIASES[normalized] || null;
};

export const validateRedirectUriForApp = ({ app, redirectUri }) => {
  const canonicalApp = normalizeAppName(app);
  if (!canonicalApp) {
    return { valid: false, reason: "invalid_app", message: "app must be hrms or tms" };
  }

  if (!redirectUri) {
    return { valid: false, reason: "missing_redirect_uri", message: "redirect_uri is required" };
  }

  let parsed;
  try {
    parsed = new URL(redirectUri);
  } catch (_error) {
    return { valid: false, reason: "invalid_redirect_uri", message: "redirect_uri must be an absolute URL" };
  }

  const normalizedRedirect = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  const allowlist = getRedirectAllowlist(canonicalApp).map((item) => item.replace(/\/+$/, ""));
  const isAllowed = allowlist.some((allowedBase) =>
    normalizedRedirect === allowedBase ||
    normalizedRedirect.startsWith(`${allowedBase}/`)
  );

  if (!isAllowed) {
    return {
      valid: false,
      reason: "redirect_not_allowed",
      message: `redirect_uri is not allowlisted for app=${canonicalApp}`
    };
  }

  return { valid: true, app: canonicalApp };
};

export const buildToken = ({
  user,
  products,
  tenantId,
  companyId,
  companyCode,
  enabledModules,
  modules,
  audience = ["sso"],
  expiresIn = "1d",
  extraClaims = {}
}) => {
  const now = Math.floor(Date.now() / 1000);
  const jti = `${String(user._id)}-${now}-${Math.random().toString(36).slice(2, 10)}`;
  const payload = {
    sub: String(user._id),
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: tenantId || null,
    companyCode: companyCode || null,
    companyId: companyId || (user.companyId ? String(user.companyId) : null),
    products,
    enabledModules: enabledModules || {},
    modules: Array.isArray(modules) ? modules : [],
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    ...extraClaims
  };

  const token = jwt.sign(payload, getJwtSecret(), {
    algorithm: JWT_ALGORITHMS[0] || "HS256",
    expiresIn,
    issuer: ISSUER,
    audience: asArrayAudience(audience),
    jwtid: jti
  });
  const decoded = jwt.decode(token);
  logAuth("jwt_generated", {
    userId: payload.id,
    email: payload.email,
    role: payload.role,
    products: payload.products,
    exp: decoded?.exp || null
  });
  console.log(`[SSO] jwt generated id=${payload.id} email=${payload.email}`);
  return token;
};

export const getCompanyProducts = async (companyId) => {
  if (!companyId) return [];

  const companyProducts = await CompanyProduct.find({
    companyId,
    isActive: true
  }).populate("productId", "name");

  return companyProducts.map((item) => item.productId?.name).filter(Boolean);
};

export const resolveUserProducts = async (user) => {
  if (user.role === ROLES.SUPER_ADMIN) {
    const allProducts = await Product.find({}, "name").lean();
    return allProducts.map((item) => item.name);
  }

  const products = await getCompanyProducts(user.companyId);

  // If this is an HRMS employee, they must have HRMS access
  if (user?._source === "hrms_employee" && !products.includes("HRMS")) {
    products.push("HRMS");
  }

  return products;
};

export const resolveLoginRedirect = ({ user, redirect, products, requestOrigin }) => {
  const explicitRedirect = String(redirect || "").trim();
  const normalizedProducts = Array.isArray(products)
    ? products.map((item) => String(item || "").toUpperCase())
    : [];
  const hasHrmsAccess = normalizedProducts.includes("HRMS");
  const hasTmsFamily = normalizedProducts.some((item) => ["TMS", "PMS", "CRM"].includes(item));

  if (isValidAbsoluteUrl(explicitRedirect)) {
    const hrmsValidation = validateRedirectUriForApp({ app: "hrms", redirectUri: explicitRedirect });
    if (hrmsValidation.valid) {
      if (!isSuperRole(user.role) && !hasHrmsAccess) {
        logAuth("missing_hrms_product", {
          userId: String(user._id),
          email: user.email,
          role: user.role,
          products: normalizedProducts
        });
        return "__NO_HRMS_ACCESS__";
      }
      return explicitRedirect;
    }

    const tmsValidation = validateRedirectUriForApp({ app: "tms", redirectUri: explicitRedirect });
    if (tmsValidation.valid) {
      // For TMS-family explicit redirects, require the target product to be explicitly specified
      // (prevents CRM/PMS access when only one is assigned).
      try {
        const u = new URL(explicitRedirect);
        const requestedProductRaw = u.searchParams.get("product") || u.searchParams.get("app") || "";
        const requestedProduct = String(requestedProductRaw || "").trim().toUpperCase();
        if (!requestedProduct || !["CRM", "PMS", "TMS"].includes(requestedProduct)) {
          return null;
        }
        return normalizedProducts.includes(requestedProduct) ? explicitRedirect : null;
      } catch {
        return null;
      }
    }
  }

  const canonicalRequestedApp = normalizeAppName(redirect || "hrms");
  const requestedRedirect = String((canonicalRequestedApp || "hrms")).toUpperCase();

  if (!requestedRedirect) {
    return null;
  }

  logAuth("hrms_access_check", {
    userId: String(user._id),
    email: user.email,
    role: user.role,
    passed: hasHrmsAccess
  });

  if (requestedRedirect === "HRMS") {
    const normalizedRole = normalizeRole(user.role);
    // Previous behavior forced Super Admins to the SSO dashboard.
    // We now allow them to proceed to HRMS if that's the requested or default destination.
    // (We only force SSO dashboard if they specifically requested it or don't have a clear app target)
    if (
      normalizedRole === "super_admin" ||
      normalizedRole === "superadmin" ||
      normalizedRole === "psa"
    ) {
      const ssoDashboardUrl = getSsoDashboardUrl(requestOrigin);
      logAuth("super_admin_redirected_to_sso_dashboard", {
        userId: String(user._id),
        email: user.email,
        role: user.role,
        redirectTo: ssoDashboardUrl
      });
      return ssoDashboardUrl;
    }

    if (!hasHrmsAccess) {
      // Premium UX: if HRMS isn't enabled but another product is, send user to that product.
      if (hasTmsFamily) {
        if (normalizedProducts.includes("CRM") && PRODUCT_URLS.CRM) {
          return buildAppUrlLikeOrigin(PRODUCT_URLS.CRM, requestOrigin);
        }
        if (normalizedProducts.includes("PMS") && PRODUCT_URLS.PMS) {
          return buildAppUrlLikeOrigin(PRODUCT_URLS.PMS, requestOrigin);
        }
        if (normalizedProducts.includes("TMS") && PRODUCT_URLS.TMS) {
          return buildAppUrlLikeOrigin(PRODUCT_URLS.TMS, requestOrigin);
        }
      }
      logAuth("missing_hrms_product", {
        userId: String(user._id),
        email: user.email,
        role: user.role,
        products
      });
      return "__NO_HRMS_ACCESS__";
    }

    const { redirectPath, redirectUrl } = buildHrmsRedirectUrl({ role: user.role, requestOrigin });
    logAuth("hrms_role_redirect_selected", {
      role: user.role,
      path: redirectPath
    });
    return redirectUrl;
  }

  if (requestedRedirect === "TMS" && hasTmsFamily && PRODUCT_URLS.TMS) {
    return buildAppUrlLikeOrigin(PRODUCT_URLS.TMS, requestOrigin);
  }

  if (products.includes(requestedRedirect) && PRODUCT_URLS[requestedRedirect]) {
    return buildAppUrlLikeOrigin(PRODUCT_URLS[requestedRedirect], requestOrigin);
  }

  return null;
};

const getHrmsAuthBaseUrl = () => {
  const explicit = String(process.env.HRMS_AUTH_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  // Derive from provision URL when available (e.g. http://localhost:5003/api/sso/provision-tenant)
  const provision = String(process.env.HRMS_PROVISION_URL || "").trim();
  if (provision) {
    try {
      const u = new URL(provision);
      return `${u.protocol}//${u.host}`;
    } catch {
      // ignore
    }
  }

  return "http://localhost:5001";
};

const isEmailLike = (value) => String(value || "").includes("@");

export const validateLogin = async ({ identifier, password }) => {
  const normalizedEmail = String(identifier || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");

  if (!normalizedEmail || !normalizedPassword) {
    return { error: { status: 400, message: "Email and password are required" } };
  }

  // 1. Check SSO User collection first (admin/HR users)
  const ssoUser = await User.findOne({ email: normalizedEmail });
  if (ssoUser) {
    const isPasswordValid = await bcrypt.compare(normalizedPassword, ssoUser.password);
    if (isPasswordValid) {
      logAuth("login_success", { email: normalizedEmail, role: ssoUser.role, source: "sso_user" });
      return { user: ssoUser };
    }
    // If password failed here, we fall through to check specific tenant databases below
    logAuth("sso_password_mismatch_trying_fallback", { email: normalizedEmail });
  }

  // 2. Fallback: Check HRMS Tenant Databases (Multi-tenant isolation)
  try {
    console.log(`[SSO] Starting multi-database fallback for ${normalizedEmail}`);
    const client = mongoose.connection.client;
    if (!client) {
      console.error("[SSO] MongoDB client not initialized");
      return { error: { status: 500, message: "Database connection initializing. Please try again in a moment." } };
    }

    const centralDb = client.db("hrms");
    
    // Get list of tenant IDs to check
    let tenantIds = [];
    try {
      console.log("[SSO] Discovering tenant databases...");
      const admin = client.db("admin").admin();
      const dbs = await admin.listDatabases();
      tenantIds = dbs.databases
        .map(db => db.name)
        .filter(name => name.startsWith("company_"))
        .map(name => name.replace("company_", ""));
      console.log(`[SSO] Found ${tenantIds.length} physical tenant databases`);
    } catch (adminErr) {
      console.warn("[SSO] listDatabases permission denied, falling back to tenants collection");
      const tenants = await centralDb.collection("tenants").find({}).toArray();
      tenantIds = tenants.map(t => String(t._id));
      console.log(`[SSO] Found ${tenantIds.length} tenants via central registry`);
    }

    for (const tenantId of tenantIds) {
      const dbName = `company_${tenantId}`;
      console.log(`[SSO] Checking database: ${dbName}`);
      const tenantDb = client.db(dbName);
      let employee;
      try {
        employee = await tenantDb.collection("employees").findOne({
          email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
        });
      } catch (e) { 
        console.error(`[SSO] Failed to query ${dbName}: ${e.message}`);
        continue; 
      }

      if (employee && employee.password) {
        console.log(`[SSO] User found in ${dbName}, verifying password...`);
        const isPasswordValid = await bcrypt.compare(normalizedPassword, employee.password);
        if (!isPasswordValid) {
          console.log(`[SSO] Password mismatch in ${dbName}`);
          continue;
        }

        // Found a match
        console.log(`[SSO] Password verified successfully in ${dbName}`);
        let companyId = tenantId;
        try {
          const tenantRegistry = await centralDb.collection("tenants").findOne({ 
            _id: mongoose.Types.ObjectId.isValid(tenantId) ? new mongoose.Types.ObjectId(tenantId) : tenantId 
          });
          if (tenantRegistry) {
            companyId = String(tenantRegistry.externalCompanyId || tenantRegistry.companyId || tenantRegistry._id);
          }
        } catch (regErr) { /* ignore registry lookup error */ }

        const firstName = String(employee.firstName || "").trim();
        const lastName = String(employee.lastName || "").trim();
        const fullName = [firstName, lastName].filter(Boolean).join(" ") || normalizedEmail.split("@")[0];
        const empRole = String(employee.role || "employee").toLowerCase().trim();

        const virtualUser = {
          _id: employee._id,
          id: String(employee._id),
          name: fullName,
          email: String(employee.email || "").toLowerCase().trim(),
          role: empRole,
          companyId: mongoose.Types.ObjectId.isValid(companyId) ? new mongoose.Types.ObjectId(companyId) : null,
          tenantId: mongoose.Types.ObjectId.isValid(tenantId) ? new mongoose.Types.ObjectId(tenantId) : null,
          permissions: [],
          _source: "hrms_employee",
          _tenantId: tenantId,
          _companyId: companyId,
        };

        logAuth("login_success", { email: normalizedEmail, role: empRole, source: "hrms_employee", tenantId });
        return { user: virtualUser };
      }
    }

    console.log(`[SSO] No match found in any database for ${normalizedEmail}`);
    logAuth("login_failed", { reason: "user_not_found", email: normalizedEmail });
    return { error: { status: 401, message: "Invalid email or password" } };
  } catch (empErr) {
    console.error(`[SSO] CRITICAL_AUTH_FAILURE: ${empErr.message}`);
    if (empErr.stack) console.error(empErr.stack);
    return { error: { status: 500, message: "Internal server error. Please try again." } };
  }
};

export const getLoginResponseData = async ({ user, redirect, requestOrigin }) => {
  try {
    let latestUser = null;

  if (user?._source === "hrms_employee") {
    // If it's a virtual user resolved from HRMS Employee collection, use it directly
    latestUser = user;
  } else {
    // Otherwise look up in SSO User collection
    latestUser = await User.findById(user._id).lean();
  }

  if (!latestUser) {
    return { error: { status: 401, message: "User not found" } };
  }

  const roleFromDb = latestUser.role;
  const normalizedRoleFromDb = normalizeRole(roleFromDb);
  const company = await resolveCompanyForToken(latestUser);
  const products = await resolveUserProducts(latestUser);
  const normalizedProducts = Array.isArray(products)
    ? [...new Set(products.map((item) => String(item).toUpperCase()).filter(Boolean))]
    : [];
  const hrmsModuleSettings = normalizeHrmsModuleSettings(
    company?.hrmsEnabledModules,
    company?.hrmsModules
  );

  console.log(
    `[SSO] HRMS modules loaded for company=${company?._id || "N/A"} modules=${hrmsModuleSettings.hrmsModules.join(",")}`
  );

  const requestedRedirect = String(redirect || "HRMS").toUpperCase();
  const requestedApp = (() => {
    const explicitRedirect = String(redirect || "").trim();
    if (isValidAbsoluteUrl(explicitRedirect)) {
      if (validateRedirectUriForApp({ app: "tms", redirectUri: explicitRedirect }).valid) {
        // Keep TMS app context for CRM/PMS as well (same tenant mapping),
        // but enforce explicit product targeting via resolveLoginRedirect.
        return "TMS";
      }
      if (validateRedirectUriForApp({ app: "hrms", redirectUri: explicitRedirect }).valid) {
        return "HRMS";
      }
    }
    const normalized = normalizeAppName(redirect || "hrms")?.toUpperCase() || "HRMS";
    // If no explicit redirect provided and HRMS isn't enabled, prefer TMS-family apps.
    if (!redirect && normalized === "HRMS") {
      const hasHrms = normalizedProducts.includes("HRMS");
      const hasTmsFamily = normalizedProducts.some((item) => ["TMS", "PMS", "CRM"].includes(item));
      if (!hasHrms && hasTmsFamily) {
        if (normalizedProducts.includes("CRM")) return "CRM";
        if (normalizedProducts.includes("PMS")) return "PMS";
        return "TMS";
      }
    }
    return normalized;
  })();
  let tenantId, companyId, normalizedCompanyCode;

  if (latestUser._source === "hrms_employee") {
    tenantId = String(latestUser._tenantId || latestUser.tenantId || "");
    companyId = String(latestUser._companyId || latestUser.companyId || "");
    normalizedCompanyCode = String(latestUser.companyCode || "").trim();
  } else {
    const tenantContext = await resolveHrmsTenantContext({
      company,
      user: latestUser,
      products: normalizedProducts
    });
    normalizedCompanyCode = String(tenantContext.companyCode || "").trim();
    const hrmsTenantId = tenantContext.tenantId ? String(tenantContext.tenantId) : null;
    const hrmsCompanyId = tenantContext.companyId ? String(tenantContext.companyId) : null;
    const tmsCompanyId = String(company?._id || latestUser.companyId || "").trim() || null;
    const effectiveHrmsTenantId = hrmsTenantId || tmsCompanyId;
    const effectiveHrmsCompanyId = hrmsCompanyId || tmsCompanyId;
    tenantId = requestedApp === "TMS" ? tmsCompanyId : effectiveHrmsTenantId;
    companyId = requestedApp === "TMS" ? tmsCompanyId : effectiveHrmsCompanyId;

    if (requestedApp === "HRMS" && !isSuperRole(roleFromDb)) {
      if (!tenantId || !companyId) {
        logAuth("tenant_mapping_missing", {
          userId: String(latestUser._id),
          email: latestUser.email,
          companyId: String(company?._id || ""),
          companyCode: normalizedCompanyCode || null,
          reason: tenantContext.reason || "unknown",
          provisioningStatus: tenantContext.provisioningStatus || null
        });
        console.error(
          `[SSO] HRMS tenant mapping missing user=${latestUser.email} company=${String(company?._id || "")} reason=${tenantContext.reason || "unknown"}`
        );
      }
    }
  }

  const extraClaims = requestedApp === "TMS" && companyId
    ? {
        orgId: companyId,
        workspaceId: null
      }
    : {};

    console.log(
      `[SSO] hrms tenant resolved user=${latestUser.email} tenantId=${tenantId || "N/A"} companyCode=${normalizedCompanyCode || "N/A"} source=${latestUser._source || "sso"}`
    );

  let token;
  try {
    token = buildToken({
      user: latestUser,
      products: normalizedProducts,
      tenantId,
      companyId,
      companyCode: normalizedCompanyCode || null,
      enabledModules: hrmsModuleSettings.hrmsEnabledModules,
      modules: hrmsModuleSettings.hrmsModules,
      audience: ["sso"],
      extraClaims
    });
  } catch (error) {
    logAuth("jwt_generation_failed", {
      userId: String(latestUser._id),
      message: error.message
    });
    return { error: { status: 500, message: "Token generation failed" } };
  }

  if (!token) {
    logAuth("jwt_generation_failed", {
      userId: String(latestUser._id),
      message: "Empty token returned"
    });
    return { error: { status: 500, message: "Token generation failed" } };
  }

  console.log(
    `[SSO] HRMS modules injected into token userId=${String(latestUser._id)} modules=${hrmsModuleSettings.hrmsModules.join(",")}`
  );
  console.log(
    `[SSO] jwt context tenantId=${tenantId || "N/A"} companyId=${companyId || "N/A"} companyCode=${normalizedCompanyCode || "N/A"}`
  );
  console.log(
    `[SSO] token mapped to HRMS tenantId=${tenantId || "N/A"} companyCode=${normalizedCompanyCode || "N/A"}`
  );

  const redirectTo = resolveLoginRedirect({
    user: latestUser,
    redirect: redirect || "HRMS",
    products: normalizedProducts
  });

  if (!redirectTo) {
    logAuth("redirect_not_generated", {
      userId: String(latestUser._id),
      role: roleFromDb,
      redirect: redirect || "HRMS"
    });
    return { error: { status: 400, message: "Redirect URL generation failed" } };
  }

  if (redirectTo === "__NO_HRMS_ACCESS__") {
    return { error: { status: 403, message: "No HRMS access" } };
  }

  if (!isValidAbsoluteUrl(redirectTo)) {
    logAuth("redirect_invalid", {
      userId: String(latestUser._id),
      email: latestUser.email,
      role: roleFromDb,
      redirectTo
    });
    return { error: { status: 400, message: "Invalid redirect URL" } };
  }

  if (redirectTo) {
    console.log(
      `[SSO] resolved role userId=${String(latestUser._id)} email=${latestUser.email} role=${normalizedRoleFromDb}`
    );
    logAuth("role_resolved", {
      userId: String(latestUser._id),
      email: latestUser.email,
      role: roleFromDb,
      normalizedRole: normalizedRoleFromDb
    });
    logAuth("redirect_generated", {
      role: roleFromDb,
      userId: String(latestUser._id),
      email: latestUser.email,
      redirectTo
    });
    logAuth("login_redirect_final", {
      role: roleFromDb,
      redirectTo
    });
    console.log(`[SSO] final redirect URL = ${redirectTo}`);
  }

    return {
      token,
      redirectTo,
      payloadUser: {
        id: String(latestUser._id),
        email: latestUser.email,
        name: latestUser.name,
        role: roleFromDb,
        products: normalizedProducts,
        companyId: companyId || null,
        tenantId: tenantId || null
      }
    };
  } catch (globalErr) {
    console.error(`[SSO] GLOBAL_RESPONSE_ERROR: ${globalErr.message}`);
    if (globalErr.stack) console.error(globalErr.stack);
    return { error: { status: 500, message: "Internal server error during session creation. Please contact support." } };
  }
};

export const verifyJwtWithContract = ({ token, audience }) => {
  cleanupRevokedSessions();
  const decoded = jwt.verify(token, getJwtSecret(), {
    algorithms: JWT_ALGORITHMS,
    issuer: ISSUER,
    audience
  });

  if (decoded?.jti && REVOKED_SESSION_JTIS.has(decoded.jti)) {
    const error = new Error("session_revoked");
    error.code = "session_revoked";
    throw error;
  }

  const contractValidation = validateTokenContract(decoded);
  if (!contractValidation.valid) {
    const error = new Error(contractValidation.reason);
    error.code = contractValidation.reason;
    throw error;
  }

  return decoded;
};

export const revokeSessionToken = (token) => {
  if (!token) return;
  cleanupRevokedSessions();
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: JWT_ALGORITHMS,
      issuer: ISSUER,
      audience: "sso",
      ignoreExpiration: true
    });
    if (!decoded?.jti) return;
    const expiresAtMs = decoded.exp ? decoded.exp * 1000 : Date.now() + 24 * 60 * 60 * 1000;
    REVOKED_SESSION_JTIS.set(decoded.jti, expiresAtMs);
  } catch (_error) {
    // Best effort revocation for logout; ignore malformed tokens.
  }
};

export const resolveAppContextForUser = async ({ user, app }) => {
  const normalizedAppToken = normalizeAppName(app);
  if (!normalizedAppToken) {
    return { error: { status: 400, reason: "invalid_app", message: "app must be hrms or tms" } };
  }
  const normalizedApp = normalizedAppToken.toUpperCase();
  const company = await resolveCompanyForToken(user);
  const products = await resolveUserProducts(user);
  const normalizedProducts = Array.isArray(products)
    ? [...new Set(products.map((item) => String(item).toUpperCase()).filter(Boolean))]
    : [];
  const hasRequestedProduct =
    normalizedApp === "HRMS"
      ? normalizedProducts.includes("HRMS")
      : normalizedProducts.some((item) => ["TMS", "PMS", "CRM"].includes(item));

  if (!hasRequestedProduct) {
    return {
      error: {
        status: 403,
        reason: "context_not_found",
        message: `${normalizedApp} context not found`,
        detail: "product_not_enabled"
      }
    };
  }

  if (normalizedApp === "HRMS") {
    const tenantContext = await resolveHrmsTenantContext({
      company,
      user,
      products: normalizedProducts
    });

    if (!tenantContext.tenantId || !tenantContext.companyCode) {
      return {
        error: {
          status: 403,
          reason: "context_not_found",
          message: "HRMS context not found",
          detail: "missing_claims"
        }
      };
    }

    return {
      app: "HRMS",
      commonClaims: {
        sub: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
        products: normalizedProducts
      },
      appClaims: {
        tenantId: String(tenantContext.tenantId),
        companyCode: String(tenantContext.companyCode)
      }
    };
  }

  if (normalizedApp === "TMS") {
    const workspaceId =
      String(company?.hrmsTenantId || company?._id || user.companyId || "")
        .trim() || null;
    const orgId = String(company?._id || user.companyId || "").trim() || null;
    const companyId = String(user.companyId || company?._id || "").trim() || null;

    if (!workspaceId || (!orgId && !companyId)) {
      return {
        error: {
          status: 403,
          reason: "context_not_found",
          message: "TMS context not found",
          detail: "missing_claims"
        }
      };
    }

    return {
      app: "TMS",
      commonClaims: {
        sub: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
        products: normalizedProducts
      },
      appClaims: {
        workspaceId,
        orgId,
        companyId
      }
    };
  }

  return { error: { status: 400, reason: "invalid_audience", message: "Unsupported app" } };
};

export const buildAppTokenFromContext = ({ user, appContext }) => {
  const audience = String(appContext.app || "").toLowerCase();
  return buildToken({
    user,
    products: appContext.commonClaims.products,
    tenantId: appContext.appClaims.tenantId || null,
    companyCode: appContext.appClaims.companyCode || null,
    companyId: appContext.appClaims.orgId || user.companyId || null,
    audience: [audience],
    expiresIn: `${APP_TOKEN_TTL_SECONDS}s`,
    extraClaims: appContext.appClaims
  });
};

export const buildAuthorizationCode = ({ user, appContext, redirectUri }) => {
  cleanupUsedAuthCodes();

  const now = Math.floor(Date.now() / 1000);
  const jti = `${String(user._id)}-${now}-${Math.random().toString(36).slice(2, 10)}`;

  const code = jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      products: appContext.commonClaims.products,
      app: String(appContext.app).toLowerCase(),
      redirectUri,
      ...appContext.appClaims
    },
    getJwtSecret(),
    {
      algorithm: JWT_ALGORITHMS[0] || "HS256",
      expiresIn: `${AUTH_CODE_TTL_SECONDS}s`,
      issuer: ISSUER,
      audience: ["sso-exchange"],
      jwtid: jti
    }
  );

  return code;
};

export const exchangeAuthorizationCode = ({ code, app, redirectUri }) => {
  cleanupUsedAuthCodes();

  const decoded = verifyJwtWithContract({
    token: code,
    audience: "sso-exchange"
  });

  if (decoded.app !== String(app || "").toLowerCase()) {
    const error = new Error("invalid_audience");
    error.code = "invalid_audience";
    throw error;
  }

  if (decoded.redirectUri !== redirectUri) {
    const error = new Error("invalid_redirect_uri");
    error.code = "invalid_redirect_uri";
    throw error;
  }

  if (!decoded.jti) {
    const error = new Error("missing_claims");
    error.code = "missing_claims";
    throw error;
  }

  if (USED_AUTH_CODE_JTIS.has(decoded.jti)) {
    const error = new Error("code_already_used");
    error.code = "code_already_used";
    throw error;
  }

  USED_AUTH_CODE_JTIS.set(decoded.jti, decoded.exp * 1000);
  return decoded;
};

export const ensureDefaultSuperAdminCredentials = async () => {
  const existing = await User.findOne({
    email: DEFAULT_SUPER_ADMIN.email.toLowerCase()
  });

  if (existing) {
    console.log("[SEED] SUPER_ADMIN already exists: admin@gitakshmi.com");
    return;
  }

  const hashedPassword = await bcrypt.hash(DEFAULT_SUPER_ADMIN.password, 10);
  await User.create({
    name: DEFAULT_SUPER_ADMIN.name,
    email: DEFAULT_SUPER_ADMIN.email.toLowerCase(),
    password: hashedPassword,
    role: ROLES.SUPER_ADMIN,
    tenantId: null
  });


  console.log("[SEED] SUPER_ADMIN created: admin@gitakshmi.com");
};
