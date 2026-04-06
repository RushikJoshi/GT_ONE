import express from "express";
import { register, login, logout } from "../controllers/auth.controller.js";
import { verifySSO } from "../middleware/verifySSO.js";
import { getMe } from "../controllers/auth.controller.js";

const router = express.Router();

// ================= PUBLIC ROUTES =================
router.post("/register", register);
router.post("/login", login);

// ================= SSO ROUTES =================

// 🔥 Get current logged-in user (SSO check)
router.get("/sso/me", getMe);

// 🔥 Logout
router.post("/logout", logout);

export default router;