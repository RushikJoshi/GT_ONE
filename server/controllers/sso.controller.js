import User from "../models/User.js";
import Application from "../models/Application.js";
import {
  buildAppTokenFromContext,
  buildAuthorizationCode,
  exchangeAuthorizationCode,
  getCookieOptions,
  getRefreshCookieOptions,
  revokeAllUserPortalSessions,
  revokeRefreshSession,
  revokeSessionToken,
  verifyRefreshJwt,
  resolveAppContextForUser
} from "../services/auth.service.js";
import {
  listCompanyApplications,
  validateApplicationRedirectUri,
  verifyApplicationClientSecret
} from "../services/applicationRegistry.service.js";
import {
  decodePlatformJwt,
  getJwksPayload,
  verifyPlatformJwt
} from "../services/signingKey.service.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const APP_TOKEN_TTL_SECONDS = Number(process.env.SSO_APP_TOKEN_TTL_SECONDS || 900);

const normalizeString = (value) => String(value || "").trim();
const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

const buildPublicOrigin = (req) => {
  const configured = trimTrailingSlash(
    process.env.SSO_PUBLIC_ORIGIN ||
    process.env.SSO_PUBLIC_URL ||
    process.env.SSO_FRONTEND_URL
  );
  if (configured) {
    return configured;
  }

  const host = normalizeString(req.headers["x-forwarded-host"] || req.headers.host);
  const forwardedProto = normalizeString(req.headers["x-forwarded-proto"]).split(",")[0] || "";
  const hostName = host.includes(":") ? host.split(":")[0] : host;
  const isLocal = LOCAL_HOSTS.has(hostName.toLowerCase());
  const protocol = forwardedProto || (isLocal ? "http" : "https");
  return host ? `${protocol}://${host}` : `${protocol}://localhost:${process.env.PORT || 5004}`;
};

const buildPublicApiBaseUrl = (req) =>
  trimTrailingSlash(process.env.SSO_PUBLIC_API_URL || process.env.SSO_API_URL) ||
  `${buildPublicOrigin(req)}/api`;

const getOidcIssuer = (req) =>
  normalizeString(process.env.SSO_OIDC_ISSUER) ||
  normalizeString(process.env.JWT_ISSUER) ||
  buildPublicOrigin(req);

const buildOpenIdConfiguration = (req) => {
  const apiBaseUrl = buildPublicApiBaseUrl(req);
  const origin = buildPublicOrigin(req);

  return {
    issuer: getOidcIssuer(req),
    authorization_endpoint: `${apiBaseUrl}/sso/authorize`,
    token_endpoint: `${apiBaseUrl}/sso/token`,
    userinfo_endpoint: `${apiBaseUrl}/sso/userinfo`,
    jwks_uri: `${origin}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    scopes_supported: ["openid", "profile", "email"],
    claims_supported: [
      "sub",
      "email",
      "name",
      "role",
      "companyId",
      "tenantId",
      "companyCode",
      "products",
      "appKey",
      "applicationId"
    ]
  };
};

const getFrontendLoginUrl = (req, { app, redirectUri, state } = {}) => {
  const configuredLoginUrl = normalizeString(process.env.SSO_LOGIN_URL || process.env.SSO_FRONTEND_URL);
  let url;

  if (configuredLoginUrl) {
    url = new URL(configuredLoginUrl);
  } else {
    const host = normalizeString(req.headers.host);
    const forwardedProto = normalizeString(req.headers["x-forwarded-proto"]).split(",")[0] || "";
    const hostName = host.includes(":") ? host.split(":")[0] : host;
    const isLocal = LOCAL_HOSTS.has(hostName.toLowerCase());
    const protocol = forwardedProto || (isLocal ? "http" : "https");
    const localPort = normalizeString(process.env.SSO_FRONTEND_PORT || "5174");
    const origin = isLocal
      ? `${protocol}://${hostName}${localPort ? `:${localPort}` : ""}`
      : `${protocol}://${host}`;
    url = new URL("/login", origin);
  }

  url.pathname = "/login";
  url.search = "";

  if (app) {
    url.searchParams.set("app", app);
  }
  if (redirectUri) {
    url.searchParams.set("redirect_uri", redirectUri);
  }
  if (state) {
    url.searchParams.set("state", state);
  }

  return url.toString();
};

const buildRedirectUrl = ({ redirectUri, code, state, error, description }) => {
  const url = new URL(redirectUri);

  if (code) {
    url.searchParams.set("code", code);
  }
  if (error) {
    url.searchParams.set("error", error);
  }
  if (description) {
    url.searchParams.set("error_description", description);
  }
  if (state) {
    url.searchParams.set("state", state);
  }

  return url.toString();
};

const buildProductLaunchUrl = (application) => {
  const redirectUri = Array.isArray(application?.redirectUris) ? application.redirectUris[0] : "";
  const normalizedLoginUrl = normalizeString(application?.loginUrl);
  const normalizedBaseUrl = normalizeString(application?.baseUrl);

  if (redirectUri) {
    try {
      const callbackUrl = new URL(redirectUri);
      callbackUrl.pathname = callbackUrl.pathname.replace(/\/callback\/?$/i, "/start");
      callbackUrl.search = "";
      callbackUrl.hash = "";
      return callbackUrl.toString();
    } catch (_error) {
      // Fall through to configured login/base URLs.
    }
  }

  if (normalizedLoginUrl) {
    return normalizedLoginUrl;
  }

  return normalizedBaseUrl || null;
};

const loadAuthenticatedUser = async (req) => {
  const userId = normalizeString(req.user?.sub || req.user?.id);
  const email = normalizeString(req.user?.email).toLowerCase();

  let user = null;
  if (userId) {
    user = await User.findById(userId).lean();
  }

  if (!user && email) {
    user = await User.findOne({ email }).lean();
  }

  return user;
};

const buildSessionUser = (user) => ({
  id: String(user._id),
  email: user.email,
  name: user.name,
  role: user.role,
  product: user.product || null,
  accountStatus: user.accountStatus || "active",
  authSource: user.authSource || "local",
  allowDirectLogin: user.allowDirectLogin !== false,
  importedFromAppKey: user.importedFromAppKey || null,
  companyId: user.companyId ? String(user.companyId) : null
});

const listLauncherApplications = async ({ user, req }) => {
  const normalizedRole = normalizeString(user?.role).toLowerCase();
  const isSuperAdmin = normalizedRole === "super_admin" || normalizedRole === "superadmin";
  const applications = isSuperAdmin
    ? await Application.find({ status: "active" }).lean()
    : await listCompanyApplications({ companyId: user?.companyId });

  return applications.map((application) => ({
    id: String(application._id),
    key: application.key,
    name: application.name,
    description: application.description || "",
    status: application.status,
    baseUrl: application.baseUrl,
    loginUrl: application.loginUrl || null,
    logoutUrl: application.logoutUrl || null,
    redirectUris: Array.isArray(application.redirectUris) ? application.redirectUris : [],
    audience: application.audience || application.key,
    launchUrl: buildProductLaunchUrl(application)
  }));
};

const sendAuthorizeError = ({
  res,
  status,
  responseMode,
  redirectUri,
  state,
  reason,
  message
}) => {
  if (responseMode === "redirect" && redirectUri) {
    return res.redirect(
      buildRedirectUrl({
        redirectUri,
        state,
        error: reason || "access_denied",
        description: message
      })
    );
  }

  return res.status(status).json({
    success: false,
    reason: reason || "authorize_failed",
    message
  });
};

const mapExchangeErrorStatus = (reason) => {
  if (reason === "code_already_used") return 409;
  if (reason === "code_expired") return 401;
  if (reason === "invalid_client") return 401;
  if (reason === "client_not_configured") return 412;
  if (reason === "invalid_audience" || reason === "invalid_redirect_uri" || reason === "missing_claims") {
    return 400;
  }
  return 401;
};

export const authorize = async (req, res) => {
  try {
    const app = normalizeString(req.query?.app || req.query?.client_id);
    const redirectUri = normalizeString(req.query?.redirect_uri || req.query?.redirectUri);
    const state = normalizeString(req.query?.state) || null;
    const responseMode = normalizeString(req.query?.response_mode).toLowerCase() === "json" ? "json" : "redirect";

    if (!app) {
      return res.status(400).json({
        success: false,
        reason: "invalid_app",
        message: "app is required"
      });
    }

    const redirectValidation = await validateApplicationRedirectUri({ app, redirectUri });
    if (!redirectValidation.valid) {
      return res.status(redirectValidation.reason === "application_inactive" ? 403 : 400).json({
        success: false,
        reason: redirectValidation.reason,
        message: redirectValidation.message
      });
    }

    const user = await loadAuthenticatedUser(req);
    if (!user) {
      const loginUrl = getFrontendLoginUrl(req, {
        app: redirectValidation.application.key,
        redirectUri,
        state
      });

      if (responseMode === "json") {
        return res.status(401).json({
          success: false,
          authenticated: false,
          reason: "login_required",
          message: "SSO session required",
          loginUrl
        });
      }

      return res.redirect(loginUrl);
    }

    const appContext = await resolveAppContextForUser({
      user,
      app: redirectValidation.application.key
    });

    if (appContext.error) {
      return sendAuthorizeError({
        res,
        status: appContext.error.status || 403,
        responseMode,
        redirectUri,
        state,
        reason: appContext.error.reason,
        message: appContext.error.message
      });
    }

    const code = await buildAuthorizationCode({
      user,
      appContext,
      redirectUri
    });
    const redirectTo = buildRedirectUrl({
      redirectUri,
      code,
      state
    });

    if (responseMode === "json") {
      return res.json({
        success: true,
        authenticated: true,
        app: redirectValidation.application.key,
        redirectTo
      });
    }

    return res.redirect(redirectTo);
  } catch (error) {
    return res.status(500).json({
      success: false,
      reason: "authorize_failed",
      message: error.message || "Failed to authorize SSO request"
    });
  }
};

const getBearerToken = (req) => {
  const authorizationHeader = String(req.headers.authorization || "");
  return authorizationHeader.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : null;
};

const getTokenAudience = (claims) => {
  const aud = claims?.aud;
  if (Array.isArray(aud) && aud.length) return aud;
  if (aud) return String(aud);
  return claims?.appKey || claims?.audience || null;
};

const handleAuthorizationCodeExchange = async (req, res, { oauthResponse = false } = {}) => {
  try {
    const app = normalizeString(req.body?.app || req.body?.client_id);
    const code = normalizeString(req.body?.code);
    const redirectUri = normalizeString(req.body?.redirectUri || req.body?.redirect_uri);
    const clientSecret = normalizeString(req.body?.clientSecret || req.body?.client_secret);

    if (!app || !code || !redirectUri) {
      return res.status(400).json({
        success: false,
        reason: "invalid_request",
        message: "app, code, and redirectUri are required"
      });
    }

    const redirectValidation = await validateApplicationRedirectUri({ app, redirectUri });
    if (!redirectValidation.valid) {
      return res.status(redirectValidation.reason === "application_inactive" ? 403 : 400).json({
        success: false,
        reason: redirectValidation.reason,
        message: redirectValidation.message
      });
    }

    const clientValidation = verifyApplicationClientSecret({
      application: redirectValidation.application,
      clientSecret
    });
    if (!clientValidation.valid) {
      return res.status(mapExchangeErrorStatus(clientValidation.reason)).json({
        success: false,
        reason: clientValidation.reason,
        message: clientValidation.message
      });
    }

    let exchangedClaims = null;
    try {
      exchangedClaims = await exchangeAuthorizationCode({
        code,
        app: redirectValidation.application.key,
        redirectUri
      });
    } catch (error) {
      return res.status(mapExchangeErrorStatus(error.code)).json({
        success: false,
        reason: error.code || "invalid_code",
        message: "Authorization code exchange failed"
      });
    }

    let user = null;
    if (exchangedClaims?.sub) {
      user = await User.findById(exchangedClaims.sub).lean();
    }
    if (!user && exchangedClaims?.email) {
      user = await User.findOne({ email: String(exchangedClaims.email).toLowerCase() }).lean();
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        reason: "user_not_found",
        message: "User not found for authorization code"
      });
    }

    const appContext = await resolveAppContextForUser({
      user,
      app: redirectValidation.application.key
    });

    if (appContext.error) {
      return res.status(appContext.error.status || 403).json({
        success: false,
        reason: appContext.error.reason || "context_not_found",
        message: appContext.error.message || "Application context not found"
      });
    }

    const accessToken = await buildAppTokenFromContext({
      user,
      appContext
    });

    const userPayload = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      products: appContext.commonClaims.products,
      appKey: appContext.application?.key || redirectValidation.application.key,
      applicationId: appContext.application?._id ? String(appContext.application._id) : null
    };
    const claimsPayload = {
      appKey: appContext.application?.key || redirectValidation.application.key,
      applicationId: appContext.application?._id ? String(appContext.application._id) : null,
      audience: appContext.application?.audience || redirectValidation.application.audience || redirectValidation.application.key,
      ...appContext.appClaims
    };

    if (oauthResponse) {
      return res.json({
        access_token: accessToken,
        id_token: accessToken,
        token_type: "Bearer",
        expires_in: APP_TOKEN_TTL_SECONDS,
        scope: normalizeString(req.body?.scope) || "openid profile email",
        user: userPayload,
        claims: claimsPayload
      });
    }

    return res.json({
      success: true,
      app: redirectValidation.application.key,
      tokenType: "Bearer",
      accessToken,
      user: userPayload,
      claims: claimsPayload
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      reason: "exchange_failed",
      message: error.message || "Failed to exchange authorization code"
    });
  }
};

export const exchange = async (req, res) =>
  handleAuthorizationCodeExchange(req, res, { oauthResponse: false });

export const token = async (req, res) => {
  const grantType = normalizeString(req.body?.grant_type || req.body?.grantType || "authorization_code");
  if (grantType !== "authorization_code") {
    return res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Only authorization_code is supported"
    });
  }

  return handleAuthorizationCodeExchange(req, res, { oauthResponse: true });
};

export const userinfo = async (req, res) => {
  try {
    const tokenValue = getBearerToken(req);
    if (!tokenValue) {
      return res.status(401).json({
        error: "invalid_token",
        error_description: "Bearer token is required"
      });
    }

    const decoded = decodePlatformJwt(tokenValue) || {};
    const audience = getTokenAudience(decoded);
    if (!audience) {
      return res.status(401).json({
        error: "invalid_token",
        error_description: "Token audience is missing"
      });
    }

    const claims = await verifyPlatformJwt({
      token: tokenValue,
      audience
    });

    return res.json({
      sub: claims.sub || claims.id || null,
      email: claims.email || null,
      email_verified: Boolean(claims.email),
      name: claims.name || null,
      preferred_username: claims.email || claims.name || null,
      role: claims.role || null,
      companyId: claims.companyId || null,
      tenantId: claims.tenantId || null,
      companyCode: claims.companyCode || null,
      products: Array.isArray(claims.products) ? claims.products : [],
      appKey: claims.appKey || null,
      applicationId: claims.applicationId || null
    });
  } catch (_error) {
    return res.status(401).json({
      error: "invalid_token",
      error_description: "Token is invalid or expired"
    });
  }
};

export const openidConfiguration = (req, res) => res.json(buildOpenIdConfiguration(req));

export const session = async (req, res) => {
  try {
    const user = await loadAuthenticatedUser(req);
    if (!user) {
      return res.json({
        authenticated: false,
        user: null,
        applications: []
      });
    }

    const applications = await listLauncherApplications({ user, req });
    return res.json({
      authenticated: true,
      user: buildSessionUser(user),
      applications
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load GT_ONE session"
    });
  }
};

const clearSsoCookies = (req, res) => {
  const cookieOptions = getCookieOptions(req.headers.host);
  const refreshCookieOptions = getRefreshCookieOptions(req.headers.host);
  res.clearCookie("sso_token", cookieOptions);
  res.clearCookie("token", cookieOptions);
  res.clearCookie("sso_refresh", refreshCookieOptions);
};

export const logout = async (req, res) => {
  try {
    const ssoToken = req.cookies?.sso_token || req.cookies?.token;
    const refreshToken = req.cookies?.sso_refresh;

    if (ssoToken) {
      await revokeSessionToken(ssoToken, "sso_logout");
    }

    if (refreshToken) {
      try {
        const decoded = await verifyRefreshJwt(refreshToken);
        if (decoded?.jti) {
          await revokeRefreshSession(decoded.jti);
        }
      } catch (_error) {
        // ignore invalid refresh token during logout
      }
    }

    clearSsoCookies(req, res);
    return res.json({
      success: true,
      message: "GT_ONE session cleared."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to logout"
    });
  }
};

export const globalLogout = async (req, res) => {
  try {
    const user = await loadAuthenticatedUser(req);
    const refreshToken = req.cookies?.sso_refresh;

    if (user?._id) {
      await revokeAllUserPortalSessions(user._id, "global_logout");
    }

    if (refreshToken) {
      try {
        const decoded = await verifyRefreshJwt(refreshToken);
        if (decoded?.jti) {
          await revokeRefreshSession(decoded.jti);
        }
      } catch (_error) {
        // ignore invalid refresh token during logout
      }
    }

    const applications = user ? await listLauncherApplications({ user, req }) : [];
    clearSsoCookies(req, res);

    return res.json({
      success: true,
      message: "Signed out everywhere from GT_ONE.",
      productLogoutUrls: applications.map((application) => application.logoutUrl).filter(Boolean)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to sign out everywhere"
    });
  }
};

export const jwks = async (_req, res) => {
  try {
    const payload = await getJwksPayload();
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load JWKS"
    });
  }
};
