import { verifyJwtWithContract } from "../services/auth.service.js";

export const verifySSO = async (req, res, next) => {
  try {
    const token = req.cookies?.sso_token || req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        msg: "No SSO session detected",
        reason: "no_session"
      });
    }

    const decoded = await verifyJwtWithContract({
      token,
      audience: "sso"
    });

    if (!decoded.sub || !(decoded.email || decoded.login) || !decoded.role || !Array.isArray(decoded.products)) {
      return res.status(401).json({ msg: "Invalid token claims", reason: "missing_claims" });
    }

    req.user = decoded;

    next();
  } catch (_err) {
    return res.status(401).json({
      msg: "Invalid or expired token"
    });
  }
};
