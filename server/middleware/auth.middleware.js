import { ROLES } from "../constants/roles.js";
import { verifyJwtWithContract } from "../services/auth.service.js";

/**
 * @desc    Middleware to verify access token (Authorization Bearer or sso_token cookie)
 */
export const protect = async (req, res, next) => {
  try {
    const bearer = String(req.headers.authorization || "").trim();
    const token =
      bearer.toLowerCase().startsWith("bearer ")
        ? bearer.slice("bearer ".length).trim()
        : req.cookies?.sso_token;
    console.log(`[AUTH] Checking token. Found: ${!!token}`);

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    // Verify token
    const decoded = verifyJwtWithContract({
      token,
      audience: "sso"
    });

    // Attach user to request
    req.user = decoded;
    next();
  } catch (error) {
    console.warn(`[SSO] Auth Middleware Error: ${error.message}`);
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

/**
 * @desc    Middleware for session probe endpoints
 *          Attaches req.user when the cookie is valid, otherwise continues unauthenticated.
 */
export const optionalProtect = async (req, _res, next) => {
  try {
    const bearer = String(req.headers.authorization || "").trim();
    const token =
      bearer.toLowerCase().startsWith("bearer ")
        ? bearer.slice("bearer ".length).trim()
        : req.cookies?.sso_token;

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = verifyJwtWithContract({
      token,
      audience: "sso"
    });
    req.user = decoded;
    return next();
  } catch (error) {
    console.warn(`[SSO] Optional auth skipped: ${error.message}`);
    req.user = null;
    return next();
  }
};

/**
 * @desc    Alias for protect (backward compatibility)
 */
export const verifyToken = protect;

/**
 * @desc    Middleware to restrict access based on roles
 */
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied: Unauthorized role" });
    }
    next();
  };
};

/**
 * @desc    Middleware to restrict access to Super Admin only
 */
export const superAdminOnly = (req, res, next) => {
  if (req.user && req.user.role === ROLES.SUPER_ADMIN) {
    next();
  } else {
    return res.status(403).json({ message: "Access denied: Super Admin only" });
  }
};

/**
 * @desc    Middleware to restrict access to Company Admin or Super Admin
 */
export const adminOnly = (req, res, next) => {
  if (req.user && (req.user.role === ROLES.SUPER_ADMIN || req.user.role === ROLES.COMPANY_ADMIN)) {
    next();
  } else {
    return res.status(403).json({ message: "Access denied: Admin only" });
  }
};
