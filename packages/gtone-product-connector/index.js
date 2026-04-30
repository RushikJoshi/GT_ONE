const crypto = require("crypto");
const path = require("path");
const { createRequire } = require("module");

const hostRequire = createRequire(path.join(process.cwd(), "package.json"));
const express = hostRequire("express");
const axios = hostRequire("axios");
const jwt = hostRequire("jsonwebtoken");

const DEFAULT_STATE_COOKIE_NAME = "gtone_sso_state";
const DEFAULT_JWKS_CACHE_TTL_MS = Number(process.env.GTONE_JWKS_CACHE_MS || 5 * 60 * 1000);

const trim = (value) => String(value || "").trim();
const trimTrailingSlash = (value) => trim(value).replace(/\/+$/, "");
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toCookieSafeKey = (value) =>
  trim(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

const buildDefaultGlobalLogoutUrl = () =>
  `${trimTrailingSlash(process.env.GTONE_API_BASE_URL)}/sso/global-logout`;

const buildDefaultJwksUrl = () => {
  const explicit = trim(process.env.GTONE_JWKS_URL);
  if (explicit) {
    return explicit;
  }

  const apiBase = trimTrailingSlash(process.env.GTONE_API_BASE_URL);
  return `${apiBase.replace(/\/api$/i, "")}/.well-known/jwks.json`;
};

const buildDefaultAuthorizeUrl = (state) => {
  const params = new URLSearchParams({
    app: trim(process.env.GTONE_APP_KEY),
    redirect_uri: trim(process.env.GTONE_REDIRECT_URI),
    state
  });

  return `${trimTrailingSlash(process.env.GTONE_API_BASE_URL)}/sso/authorize?${params.toString()}`;
};

const buildDefaultCookieOptions = (maxAge) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: String(process.env.NODE_ENV || "").toLowerCase() === "production",
  ...(typeof maxAge === "number" ? { maxAge } : {})
});

const createGtOneJwksVerifier = (options = {}) => {
  const jwksCacheTtlMs = Number(options.jwksCacheTtlMs || DEFAULT_JWKS_CACHE_TTL_MS);
  let jwksCache = {
    expiresAt: 0,
    keysByKid: new Map()
  };

  const getCachedKey = (kid) => {
    if (!kid || Date.now() >= jwksCache.expiresAt) {
      return null;
    }

    return jwksCache.keysByKid.get(kid) || null;
  };

  const fetchJwks = async () => {
    const response = await axios.get(options.jwksUrl || buildDefaultJwksUrl(), {
      timeout: Number(options.httpTimeoutMs || 15000)
    });

    const keys = Array.isArray(response.data?.keys) ? response.data.keys : [];
    jwksCache = {
      expiresAt: Date.now() + jwksCacheTtlMs,
      keysByKid: new Map(keys.filter((item) => item?.kid).map((item) => [item.kid, item]))
    };

    return jwksCache.keysByKid;
  };

  const resolveVerificationKey = async (kid) => {
    let jwk = getCachedKey(kid);
    if (!jwk) {
      const keysByKid = await fetchJwks();
      jwk = keysByKid.get(kid) || null;
    }

    if (!jwk) {
      throw new Error("jwks_key_not_found");
    }

    return crypto.createPublicKey({
      key: jwk,
      format: "jwk"
    });
  };

  return async (token, overrideOptions = {}) => {
    const decoded = jwt.decode(token, { complete: true });
    const verificationKey = await resolveVerificationKey(trim(decoded?.header?.kid));
    const configuredAudience = trim(
      overrideOptions.audience
      || options.audience
      || process.env.GTONE_TOKEN_AUDIENCE
      || process.env.GTONE_APP_KEY
    );
    const normalizedAudience = configuredAudience.toLowerCase() || trim(process.env.GTONE_APP_KEY).toLowerCase();

    return jwt.verify(token, verificationKey, {
      algorithms: ["RS256"],
      issuer: trim(overrideOptions.issuer || options.issuer || process.env.GTONE_JWT_ISSUER) || "gtone-sso",
      audience: normalizedAudience
    });
  };
};

const exchangeGtOneAuthorizationCode = async ({ code, redirectUri, clientSecret, appKey, apiBaseUrl, timeoutMs }) => {
  const response = await axios.post(
    `${trimTrailingSlash(apiBaseUrl || process.env.GTONE_API_BASE_URL)}/sso/exchange`,
    {
      app: trim(appKey || process.env.GTONE_APP_KEY),
      code: trim(code),
      redirectUri: trim(redirectUri || process.env.GTONE_REDIRECT_URI),
      clientSecret: trim(clientSecret || process.env.GTONE_CLIENT_SECRET)
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: Number(timeoutMs || 15000)
    }
  );

  return response.data;
};

const findLocalUserByIdentityOrEmail = async ({
  claims,
  appKey,
  identityLinkModel,
  localUserModel,
  emailField = "email"
}) => {
  const gtOneUserId = trim(claims?.sub);
  const email = trim(claims?.email).toLowerCase();

  if (!gtOneUserId || !email) {
    throw new Error("missing_gtone_identity_claims");
  }

  const identityLink = await identityLinkModel.findOne({ appKey, gtOneUserId });
  if (identityLink?.localUserId) {
    const linkedUser = await localUserModel.findById(identityLink.localUserId);
    if (linkedUser) {
      return linkedUser;
    }
  }

  return localUserModel.findOne({
    [emailField]: new RegExp(`^${escapeRegex(email)}$`, "i")
  });
};

const syncGtOneIdentityLink = async ({
  claims,
  appKey,
  identityLinkModel,
  localUser
}) => {
  const gtOneUserId = trim(claims?.sub);
  const email = trim(claims?.email).toLowerCase();

  return identityLinkModel.findOneAndUpdate(
    { appKey, gtOneUserId },
    {
      appKey,
      gtOneUserId,
      gtOneCompanyId: trim(claims?.companyId) || null,
      localUserId: localUser._id,
      email,
      lastLoginAt: new Date(),
      claimsSnapshot: claims
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );
};

const createGtOneSsoRouter = (options = {}) => {
  if (typeof options.createLocalSession !== "function") {
    throw new Error("createLocalSession is required");
  }

  if (typeof options.clearLocalSession !== "function") {
    throw new Error("clearLocalSession is required");
  }

  if (!options.identityLinkModel) {
    throw new Error("identityLinkModel is required");
  }

  const configuredAppKey = trim(options.appKey || process.env.GTONE_APP_KEY);
  const derivedStateCookieName =
    configuredAppKey
      ? `${DEFAULT_STATE_COOKIE_NAME}_${toCookieSafeKey(configuredAppKey)}`
      : DEFAULT_STATE_COOKIE_NAME;
  const stateCookieName = options.stateCookieName || derivedStateCookieName;
  const verifyGtOneAccessToken =
    options.verifyGtOneAccessToken
    || createGtOneJwksVerifier({
      audience: options.audience,
      issuer: options.issuer,
      jwksUrl: options.jwksUrl,
      jwksCacheTtlMs: options.jwksCacheTtlMs,
      httpTimeoutMs: options.httpTimeoutMs
    });

  const getLocalUserModel = () => {
    if (typeof options.getLocalUserModel === "function") {
      return options.getLocalUserModel();
    }

    return options.localUserModel || null;
  };

  const buildCookieOptions = (req, maxAge) => {
    if (typeof options.buildCookieOptions === "function") {
      return options.buildCookieOptions(req, maxAge);
    }

    return buildDefaultCookieOptions(maxAge);
  };

  const buildClearCookieOptions = (req) => {
    if (typeof options.buildClearCookieOptions === "function") {
      return options.buildClearCookieOptions(req);
    }

    return buildDefaultCookieOptions();
  };

  const buildFailureRedirect = (req, reason) => {
    if (typeof options.buildFailureRedirect === "function") {
      return options.buildFailureRedirect(req, reason);
    }

    const frontendUrl = trimTrailingSlash(process.env.FRONTEND_URL) || "http://localhost:3000";
    const url = new URL(`${frontendUrl}/login`);
    if (reason) {
      url.searchParams.set("reason", reason);
    }
    return url.toString();
  };

  const buildSuccessRedirect = (req, context) => {
    if (typeof options.buildSuccessRedirect === "function") {
      return options.buildSuccessRedirect(req, context);
    }

    return `${trimTrailingSlash(process.env.FRONTEND_URL) || "http://localhost:3000"}/login?sso=1`;
  };

  const router = express.Router();

  router.get("/sso/start", async (req, res) => {
    const existingState = trim(req.cookies?.[stateCookieName]);
    const state = existingState || crypto.randomBytes(24).toString("base64url");
    res.cookie(stateCookieName, state, buildCookieOptions(req, Number(options.stateTtlMs || 10 * 60 * 1000)));

    const authorizeUrl = typeof options.buildAuthorizeUrl === "function"
      ? options.buildAuthorizeUrl({ req, state })
      : buildDefaultAuthorizeUrl(state);

    return res.redirect(authorizeUrl);
  });

  router.get("/sso/callback", async (req, res) => {
    try {
      const code = trim(req.query?.code);
      const state = trim(req.query?.state);
      const error = trim(req.query?.error);
      const expectedState = trim(req.cookies?.[stateCookieName]);

      res.clearCookie(stateCookieName, buildClearCookieOptions(req));

      if (error) {
        return res.redirect(buildFailureRedirect(req, error));
      }

      if (!code || !state || !expectedState || state !== expectedState) {
        if (typeof options.onStateMismatch === "function") {
          await options.onStateMismatch({ req, res, code, state, expectedState });
        }
        return res.redirect(buildFailureRedirect(req, "invalid_state"));
      }

      const exchangeResult = await exchangeGtOneAuthorizationCode({
        code,
        redirectUri: options.redirectUri || process.env.GTONE_REDIRECT_URI,
        clientSecret: options.clientSecret || process.env.GTONE_CLIENT_SECRET,
        appKey: options.appKey || process.env.GTONE_APP_KEY,
        apiBaseUrl: options.apiBaseUrl || process.env.GTONE_API_BASE_URL,
        timeoutMs: options.httpTimeoutMs
      });

      const claims = await verifyGtOneAccessToken(exchangeResult.accessToken);
      const appKey = trim(options.appKey || process.env.GTONE_APP_KEY);
      const localUserModel = getLocalUserModel();

      let localUser = null;
      if (typeof options.findLocalUserForClaims === "function") {
        localUser = await options.findLocalUserForClaims({
          req,
          res,
          claims,
          appKey,
          exchangeResult,
          localUserModel,
          identityLinkModel: options.identityLinkModel,
          helpers: {
            trim,
            trimTrailingSlash,
            escapeRegex,
            findLocalUserByIdentityOrEmail,
            syncGtOneIdentityLink
          }
        });
      } else if (localUserModel) {
        localUser = await findLocalUserByIdentityOrEmail({
          claims,
          appKey,
          identityLinkModel: options.identityLinkModel,
          localUserModel,
          emailField: options.emailField || "email"
        });
      }

      if (!localUser && typeof options.provisionLocalUserForClaims === "function") {
        localUser = await options.provisionLocalUserForClaims({
          req,
          res,
          claims,
          appKey,
          exchangeResult,
          localUserModel,
          identityLinkModel: options.identityLinkModel,
          helpers: {
            trim,
            trimTrailingSlash,
            escapeRegex,
            findLocalUserByIdentityOrEmail,
            syncGtOneIdentityLink
          }
        });
      }

      if (!localUser) {
        return res.redirect(buildFailureRedirect(req, options.userNotFoundReason || "user_not_found"));
      }

      if (typeof options.ensureLocalUser === "function") {
        const result = await options.ensureLocalUser({ req, res, claims, localUser, exchangeResult });
        if (result === false) {
          return res.redirect(buildFailureRedirect(req, options.userInvalidReason || "user_inactive"));
        }
        if (typeof result === "string") {
          return res.redirect(buildFailureRedirect(req, result));
        }
      }

      await syncGtOneIdentityLink({
        claims,
        appKey,
        identityLinkModel: options.identityLinkModel,
        localUser
      });

      if (typeof options.afterIdentityLinked === "function") {
        const nextUser = await options.afterIdentityLinked({ req, res, claims, localUser, exchangeResult });
        if (nextUser) {
          localUser = nextUser;
        }
      }

      const sessionContext = await options.createLocalSession({
        req,
        res,
        claims,
        localUser,
        exchangeResult,
        helpers: {
          trim,
          trimTrailingSlash,
          escapeRegex
        }
      });

      return res.redirect(buildSuccessRedirect(req, {
        claims,
        localUser,
        exchangeResult,
        sessionContext
      }));
    } catch (error) {
      if (typeof options.onCallbackError === "function") {
        await options.onCallbackError({ req, res, error });
      } else {
        console.error("GT_ONE SSO callback failed:", error.response?.data || error.message);
      }
      return res.redirect(buildFailureRedirect(req, options.exchangeFailureReason || "exchange_failed"));
    }
  });

  router.post("/sso/logout", async (req, res) => {
    try {
      await options.clearLocalSession({
        req,
        res,
        helpers: {
          trim,
          trimTrailingSlash
        }
      });

      res.clearCookie(stateCookieName, buildClearCookieOptions(req));

      return res.json({
        success: true,
        globalLogoutUrl:
          typeof options.buildGlobalLogoutUrl === "function"
            ? options.buildGlobalLogoutUrl(req)
            : buildDefaultGlobalLogoutUrl()
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to clear product SSO session"
      });
    }
  });

  return router;
};

module.exports = {
  createGtOneJwksVerifier,
  createGtOneSsoRouter,
  exchangeGtOneAuthorizationCode,
  findLocalUserByIdentityOrEmail,
  syncGtOneIdentityLink,
  helpers: {
    trim,
    trimTrailingSlash,
    escapeRegex
  }
};
