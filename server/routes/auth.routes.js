import express from "express";
import { login, getMe, logout } from "../controllers/auth.controller.js";
import { optionalProtect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/login", login);
router.get("/me", optionalProtect, getMe);
router.get("/sso/me", optionalProtect, getMe);
router.post("/logout", logout);
router.get("/logout", logout);

export default router;
