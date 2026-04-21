import jwt from "jsonwebtoken";
import User from "../models/User.js";

/**
 * Middleware to verify SSO session via HTTP-only cookie
 */
export const verifySsoSession = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.cookies?.sso_token;

    if (!token) {
      return res.status(401).json({ 
        authenticated: false,
        message: "No active session found. Please log in.", 
        reason: "no_token" 
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("[SSO] JWT_SECRET is missing in environment variables");
      return res.status(500).json({ message: "Internal server configuration error" });
    }

    // Verify token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: process.env.JWT_ISSUER || "gitakshmi-sso",
        algorithms: (process.env.JWT_ALLOWED_ALGS || "HS256").split(",").filter(Boolean)
      });

      // Fetch user to ensure they still exist and are active
      const userId = decoded.id || decoded.sub;
      const user = await User.findById(userId).select("-password").lean();

      if (!user) {
        return res.status(401).json({ 
          authenticated: false,
          message: "User session is invalid or user no longer exists.", 
          reason: "user_not_found" 
        });
      }

      // Populate SSO context
      req.sso = {
        token,
        decoded,
        user
      };

      return next();
    } catch (jwtError) {
      console.warn(`[SSO] Token verification failed: ${jwtError.message}`);
      return res.status(401).json({ 
        authenticated: false,
        message: "Session expired or invalid. Please login again.", 
        reason: "invalid_token" 
      });
    }
  } catch (error) {
    console.error(`[SSO] Middleware Error: ${error.message}`);
    return res.status(500).json({ message: "Authentication service error" });
  }
};

