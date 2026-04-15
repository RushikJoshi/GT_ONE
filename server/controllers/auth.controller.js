import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Tenant from "../models/Tenant.js";
import {
  getCookieOptions,
  getLoginResponseData,
  revokeSessionToken,
  validateLogin
} from "../services/auth.service.js";

/**
 * @desc    Login user & Set cookie
 * @route   POST /api/auth/login
 */
export const login = async (req, res) => {
  try {
    const { email, identifier, password } = req.body || {};
    const { redirect } = req.query;

    const resolvedIdentifier = String(identifier || email || "").trim();
    const validation = await validateLogin({ identifier: resolvedIdentifier, password });
    if (validation.error) {
      return res.status(validation.error.status).json({ message: validation.error.message });
    }

    const responseData = await getLoginResponseData({
      user: validation.user,
      redirect,
      requestOrigin: req.headers.origin || req.headers.referer || null
    });
    if (responseData.error) {
      return res.status(responseData.error.status).json({ message: responseData.error.message });
    }

    const cookieOptions = getCookieOptions(req.headers.host);
    res.cookie("sso_token", responseData.token, cookieOptions);

    console.log(`[SSO] User logged in: ${validation.user.email}, Role: ${validation.user.role}`);

    return res.json({
      success: true,
      message: "Login successful",
      redirectTo: responseData.redirectTo,
      user: responseData.payloadUser
    });
  } catch (error) {
    console.error(`[SSO] Login Error: ${error.message}`);
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

    if (!sessionUser && req.cookies?.sso_token) {
      try {
        sessionUser = jwt.verify(
          req.cookies.sso_token,
          process.env.JWT_SECRET || "fallback_secret"
        );
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
  revokeSessionToken(req.cookies?.sso_token);
  const cookieOptions = getCookieOptions(req.headers.host);
  res.clearCookie("sso_token", cookieOptions);

  const { redirect } = req.query;
  if (redirect && (redirect.startsWith("http") || redirect.startsWith("/"))) {
    return res.redirect(redirect);
  }

  return res.json({ message: "Logged out successfully" });
};
