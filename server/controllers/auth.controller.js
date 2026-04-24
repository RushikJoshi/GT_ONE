import User from "../models/User.js";
import Tenant from "../models/Tenant.js";
import {
  getCookieOptions,
  getRefreshCookieOptions,
  getLoginResponseData,
  isDirectAdminLogin,
  persistRefreshSession,
  buildRefreshToken,
  revokeSessionToken,
  resolveDirectAdminUser,
  revokeRefreshSession,
  rotateRefreshToken,
  verifyRefreshJwt,
  shouldBypassOtpForUser,
  validateLogin,
  verifyJwtWithContract
} from "../services/auth.service.js";
import {
  clearBruteForceFailures,
  getBruteForceState,
  recordBruteForceFailure
} from "../services/bruteForce.service.js";
import {
  createLoginOtpChallenge,
  resendLoginOtpChallenge,
  verifyLoginOtpChallenge
} from "../services/otp.service.js";

const getClientIpAddress = (req) =>
  String(req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").trim();

const getRequestOrigin = (req) => req.headers.origin || req.headers.referer || null;
const isLocalRequest = (req) => {
  const host = String(req.headers.host || "").toLowerCase();
  const origin = String(getRequestOrigin(req) || "").toLowerCase();
  return (
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1")
  );
};

const applySessionCookie = ({ req, res, token }) => {
  const cookieOptions = getCookieOptions(req.headers.host);
  res.cookie("sso_token", token, cookieOptions);
  // Keep legacy cookie cleared to avoid oversized Cookie/Set-Cookie headers in proxy hops.
  res.clearCookie("token", cookieOptions);
};

const applyRefreshCookie = ({ req, res, token }) => {
  const cookieOptions = getRefreshCookieOptions(req.headers.host);
  res.cookie("sso_refresh", token, cookieOptions);
};

const buildLockResponse = ({ res, retryAfterSeconds, message }) => {
  if (retryAfterSeconds) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
  }

  return res.status(429).json({
    message,
    retryAfterSeconds
  });
};

/**
 * @desc    Start login flow. Admin logs in directly, all other users must verify OTP.
 * @route   POST /api/auth/login
 */
export const login = async (req, res) => {
  try {
    const { email, identifier, password } = req.body || {};
    const { redirect } = req.query;
    const clientIpAddress = getClientIpAddress(req);

    const resolvedIdentifier = String(identifier || email || "").trim().toLowerCase();
    const lockState = getBruteForceState({
      scope: "login",
      identifier: resolvedIdentifier,
      ipAddress: clientIpAddress
    });

    if (lockState.blocked) {
      // Dev-only escape hatch: unblock local lockouts caused by repeated testing.
      // Enable by calling POST /api/auth/login?devReset=1 (NOT active in production).
      const devResetRequested = String(req.query?.devReset || "").trim() === "1";
      const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
      if (!isProd && devResetRequested) {
        clearBruteForceFailures({
          scope: "login",
          identifier: resolvedIdentifier,
          ipAddress: clientIpAddress
        });
      } else {
        return buildLockResponse({
          res,
          retryAfterSeconds: lockState.retryAfterSeconds,
          message: "Too many failed login attempts. Please try again later."
        });
      }
    }

    if (isDirectAdminLogin({ email: resolvedIdentifier, password })) {
      const adminUser = await resolveDirectAdminUser();
      const responseData = await getLoginResponseData({
        user: adminUser,
        redirect,
        requestOrigin: getRequestOrigin(req)
      });

      if (responseData.error) {
        return res.status(responseData.error.status).json({ message: responseData.error.message });
      }

      clearBruteForceFailures({
        scope: "login",
        identifier: resolvedIdentifier,
        ipAddress: clientIpAddress
      });

      applySessionCookie({
        req,
        res,
        token: responseData.token
      });

      const refresh = buildRefreshToken({ userId: adminUser._id });
      await persistRefreshSession({ userId: adminUser._id, jti: refresh.jti, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt, req });
      applyRefreshCookie({ req, res, token: refresh.token });

      console.log(`[SSO] Direct admin login successful: ${adminUser.email}`);

      return res.json({
        success: true,
        requiresOtp: false,
        message: "Login successful",
        redirectTo: responseData.redirectTo,
        user: responseData.payloadUser,
        accessToken: responseData.token
      });
    }

    const validation = await validateLogin({ identifier: resolvedIdentifier, password });
    if (validation.error) {
      if (validation.error.status === 401) {
        const failureState = recordBruteForceFailure({
          scope: "login",
          identifier: resolvedIdentifier,
          ipAddress: clientIpAddress
        });

        if (failureState.blocked) {
          return buildLockResponse({
            res,
            retryAfterSeconds: failureState.retryAfterSeconds,
            message: "Too many failed login attempts. Please try again later."
          });
        }
      }

      return res.status(validation.error.status).json({ message: validation.error.message });
    }

    clearBruteForceFailures({
      scope: "login",
      identifier: resolvedIdentifier,
      ipAddress: clientIpAddress
    });

    if (shouldBypassOtpForUser(validation.user)) {
      const responseData = await getLoginResponseData({
        user: validation.user,
        redirect,
        requestOrigin: getRequestOrigin(req)
      });

      if (responseData.error) {
        return res.status(responseData.error.status).json({ message: responseData.error.message });
      }

      applySessionCookie({
        req,
        res,
        token: responseData.token
      });

      const refresh = buildRefreshToken({ userId: validation.user._id });
      await persistRefreshSession({ userId: validation.user._id, jti: refresh.jti, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt, req });
      applyRefreshCookie({ req, res, token: refresh.token });

      console.log(`[SSO] OTP bypass login successful: ${validation.user.email}`);

      return res.json({
        success: true,
        requiresOtp: false,
        message: "Login successful",
        redirectTo: responseData.redirectTo,
        user: responseData.payloadUser,
        accessToken: responseData.token
      });
    }

    const otpChallenge = await createLoginOtpChallenge({
      user: validation.user,
      redirect,
      ipAddress: clientIpAddress,
      userAgent: req.headers["user-agent"],
      allowDevPreview: isLocalRequest(req)
    });

    return res.json({
      success: true,
      requiresOtp: true,
      message:
        otpChallenge.deliveryMode === "json"
          ? "OTP email delivery is not configured. Use the local preview OTP until SMTP/Gmail is set up."
          : "OTP sent to your registered email address",
      email: otpChallenge.email,
      otpRequestId: otpChallenge.requestId,
      otpSource: otpChallenge.source,
      otpTenantId: otpChallenge.tenantId,
      devOtpPreview: otpChallenge.devOtpPreview || null,
      expiresInSeconds: otpChallenge.expiresInSeconds,
      expiresAt: otpChallenge.expiresAt
    });
  } catch (error) {
    console.error(`[SSO] Login Error: ${error.message}`);
    if (error.publicMessage) {
      return res.status(error.status || 500).json({ message: error.publicMessage });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @desc    Verify login OTP and create session
 * @route   POST /api/auth/verify-otp
 */
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp, otpRequestId, requestId, source, otpSource, tenantId, otpTenantId } = req.body || {};
    const { redirect } = req.query;
    const resolvedEmail = String(email || "").trim().toLowerCase();
    const clientIpAddress = getClientIpAddress(req);
    const rateState = getBruteForceState({
      scope: "otp_verify",
      identifier: resolvedEmail || String(otpRequestId || requestId || "").trim(),
      ipAddress: clientIpAddress
    });

    if (rateState.blocked) {
      return buildLockResponse({
        res,
        retryAfterSeconds: rateState.retryAfterSeconds,
        message: "Too many invalid OTP attempts. Please try again later."
      });
    }

    const verification = await verifyLoginOtpChallenge({
      email: resolvedEmail,
      requestId: otpRequestId || requestId,
      otp,
      source: source || otpSource,
      tenantId: tenantId || otpTenantId
    });

    console.log("[AUTH] verifyOtp verification result:", JSON.stringify(verification));

    if (verification.error) {
      if (verification.error.reason === "otp_invalid") {
        const failureState = recordBruteForceFailure({
          scope: "otp_verify",
          identifier: resolvedEmail || String(otpRequestId || requestId || "").trim(),
          ipAddress: clientIpAddress
        });

        if (failureState.blocked) {
          return buildLockResponse({
            res,
            retryAfterSeconds: failureState.retryAfterSeconds,
            message: "Too many invalid OTP attempts. Please try again later."
          });
        }
      }

      return res.status(verification.error.status).json({
        message: verification.error.message,
        reason: verification.error.reason || null
      });
    }

    clearBruteForceFailures({
      scope: "otp_verify",
      identifier: resolvedEmail || String(otpRequestId || requestId || "").trim(),
      ipAddress: clientIpAddress
    });

    const responseData = await getLoginResponseData({
      user: verification.user,
      redirect: redirect || verification.redirect,
      requestOrigin: getRequestOrigin(req)
    });

    if (responseData.error) {
      return res.status(responseData.error.status).json({ message: responseData.error.message });
    }

    applySessionCookie({
      req,
      res,
      token: responseData.token
    });

    const refresh = buildRefreshToken({ userId: verification.user._id });
    await persistRefreshSession({ userId: verification.user._id, jti: refresh.jti, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt, req });
    applyRefreshCookie({ req, res, token: refresh.token });

    console.log(`[SSO] OTP login successful: ${verification.email}`);

    return res.json({
      success: true,
      requiresOtp: false,
      message: "OTP verified. Login successful",
      redirectTo: responseData.redirectTo,
      user: responseData.payloadUser,
      accessToken: responseData.token
    });
  } catch (error) {
    console.error(`[SSO] OTP Verification Error: ${error.message}`);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @desc    Resend login OTP with cooldown
 * @route   POST /api/auth/resend-otp
 */
export const resendOtp = async (req, res) => {
  try {
    const { email, otpRequestId, requestId, source, otpSource, tenantId, otpTenantId } = req.body || {};
    const challenge = await resendLoginOtpChallenge({
      email: String(email || "").trim().toLowerCase(),
      requestId: otpRequestId || requestId,
      source: source || otpSource,
      tenantId: tenantId || otpTenantId,
      ipAddress: getClientIpAddress(req),
      userAgent: req.headers["user-agent"],
      allowDevPreview: isLocalRequest(req)
    });

    if (challenge?.error) {
      if (challenge.error.retryAfterSeconds) {
        res.setHeader("Retry-After", String(challenge.error.retryAfterSeconds));
      }
      return res.status(challenge.error.status).json({
        message: challenge.error.message,
        retryAfterSeconds: challenge.error.retryAfterSeconds || null
      });
    }

    return res.json({
      success: true,
      message:
        challenge.deliveryMode === "json"
          ? "OTP regenerated. Use preview OTP for local testing."
          : "A new OTP has been sent.",
      email: challenge.email,
      otpRequestId: challenge.requestId,
      otpSource: challenge.source,
      otpTenantId: challenge.tenantId,
      devOtpPreview: challenge.devOtpPreview || null,
      expiresInSeconds: challenge.expiresInSeconds,
      expiresAt: challenge.expiresAt
    });
  } catch (error) {
    console.error(`[SSO] OTP Resend Error: ${error.message}`);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @desc    Get current user profile
 * @route   GET /api/auth/me
 */
export const getMe = async (req, res) => {
  try {
    let sessionUser = req.user || null;

    const sessionToken = req.cookies?.sso_token || req.cookies?.token;
    if (!sessionUser && sessionToken) {
      try {
        sessionUser = verifyJwtWithContract({
          token: sessionToken,
          audience: "sso"
        });
      } catch (_error) {
        sessionUser = null;
      }
    }

    const userId = sessionUser?.id || sessionUser?.sub || null;
    const userEmail = String(sessionUser?.email || "").trim().toLowerCase() || null;

    if (!userId && !userEmail) {
      return res.json({
        authenticated: false,
        user: null
      });
    }

    let user = null;

    if (userId) {
      user = await User.findById(userId).select("-password").lean();
    }

    if (!user && userEmail) {
      user = await User.findOne({ email: userEmail }).select("-password").lean();
    }

    if (!user) {
      return res.json({
        authenticated: true,
        accessToken: sessionToken || null,
        user: {
          id: userId || null,
          _id: userId || null,
          email: userEmail,
          name: sessionUser?.name || null,
          role: sessionUser?.role || null,
          companyId: sessionUser?.companyId || null,
          tenantId: sessionUser?.tenantId || null,
          companyCode: sessionUser?.companyCode || null,
          products: Array.isArray(sessionUser?.products) ? sessionUser.products : [],
          enabledModules: sessionUser?.enabledModules || {},
          modules: Array.isArray(sessionUser?.modules) ? sessionUser.modules : [],
          permissions: Array.isArray(sessionUser?.permissions) ? sessionUser.permissions : [],
          tenant: null
        }
      });
    }

    let tenant = null;
    if (user.tenantId) {
      tenant = await Tenant.findById(user.tenantId).lean();
    }

    return res.json({
      authenticated: true,
      accessToken: sessionToken || null,
      user: {
        ...user,
        tenant
      }
    });
  } catch (error) {
    console.error(`[SSO] getMe Error: ${error.message}`);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @desc    Logout & clear cookie
 */
export const logout = async (req, res) => {
  const ssoToken = req.cookies?.sso_token || req.cookies?.token;
  const refreshToken = req.cookies?.sso_refresh;

  if (ssoToken) {
    revokeSessionToken(ssoToken);
  }

  if (refreshToken) {
    try {
      const decoded = verifyRefreshJwt(refreshToken);
      if (decoded?.jti) {
        await revokeRefreshSession(decoded.jti);
      }
    } catch (_err) {
      // Ignore invalid/expired refresh tokens during logout
    }
  }

  const cookieOptions = getCookieOptions(req.headers.host);
  const refreshCookieOptions = getRefreshCookieOptions(req.headers.host);

  res.clearCookie("sso_token", cookieOptions);
  res.clearCookie("token", cookieOptions);
  res.clearCookie("sso_refresh", refreshCookieOptions);

  const { redirect } = req.query;
  if (redirect && (redirect.startsWith("http") || redirect.startsWith("/"))) {
    return res.redirect(redirect);
  }

  return res.json({ message: "Logged out successfully" });
};

/**
 * @desc    Refresh access token using refresh cookie
 * @route   POST /api/auth/refresh
 */
export const refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies?.sso_refresh;
    if (!refreshToken) {
      return res.status(401).json({ message: "Missing refresh token" });
    }

    const rotated = await rotateRefreshToken({ refreshToken });
    applyRefreshCookie({ req, res, token: rotated.refresh.token });

    // Build a fresh access token with normal login response (no redirect logic needed here)
    const user = await User.findById(rotated.userId).lean();
    if (!user) return res.status(401).json({ message: "User not found" });

    const desiredProduct = String(req.query?.product || user.product || "").trim();
    const responseData = await getLoginResponseData({
      user,
      redirect: desiredProduct || "HRMS",
      requestOrigin: getRequestOrigin(req)
    });
    if (responseData.error) {
      return res.status(responseData.error.status).json({ message: responseData.error.message });
    }

    applySessionCookie({ req, res, token: responseData.token });
    return res.json({ success: true, accessToken: responseData.token, user: responseData.payloadUser });
  } catch (error) {
    return res.status(401).json({ message: "Refresh token invalid" });
  }
};
