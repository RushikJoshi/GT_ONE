import express from "express";
import { getMe, login, logout, refresh, resendOtp, verifyOtp } from "../controllers/auth.controller.js";
import {
  activateAccount,
  listAccounts,
  requestActivationReset,
  softDeleteAccount
} from "../controllers/account.controller.js";
import { optionalProtect, protect, superAdminOnly } from "../middleware/auth.middleware.js";
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
router.post("/resend-otp", otpVerificationLimiter, resendOtp);
router.post("/request-activation-reset", requestActivationReset);
router.post("/activate-account", activateAccount);
router.get("/me", optionalProtect, getMe);
router.get("/sso/me", optionalProtect, getMe);
router.get("/accounts", protect, superAdminOnly, listAccounts);
router.delete("/accounts/:userId", protect, superAdminOnly, softDeleteAccount);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get("/logout", logout);

export default router;
