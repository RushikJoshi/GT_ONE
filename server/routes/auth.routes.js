import express from "express";
import { getMe, login, logout, verifyOtp } from "../controllers/auth.controller.js";
import { optionalProtect } from "../middleware/auth.middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

const getRateLimitKey = (req, fieldNames = []) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
  const identifier = fieldNames
    .map((fieldName) => String(req.body?.[fieldName] || "").trim().toLowerCase())
    .find(Boolean);

  return `${req.path}:${ip}:${identifier || "anonymous"}`;
};

const loginOtpRequestLimiter = createRateLimiter({
  maxRequestsLocal: 60,
  maxRequestsProd: 8,
  windowMs: 15 * 60 * 1000,
  keyBuilder: (req) => getRateLimitKey(req, ["identifier", "email"])
});

const otpVerificationLimiter = createRateLimiter({
  maxRequestsLocal: 120,
  maxRequestsProd: 10,
  windowMs: 15 * 60 * 1000,
  keyBuilder: (req) => getRateLimitKey(req, ["otpRequestId", "requestId", "email"])
});

router.post("/login", loginOtpRequestLimiter, login);
router.post("/verify-otp", otpVerificationLimiter, verifyOtp);
router.get("/me", optionalProtect, getMe);
router.get("/sso/me", optionalProtect, getMe);
router.post("/logout", logout);
router.get("/logout", logout);

export default router;
