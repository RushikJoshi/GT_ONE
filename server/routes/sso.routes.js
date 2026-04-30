import express from "express";
import {
  authorize,
  exchange,
  globalLogout,
  logout,
  session,
  token,
  userinfo
} from "../controllers/sso.controller.js";
import { optionalProtect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/authorize", optionalProtect, authorize);
router.post("/exchange", exchange);
router.post("/token", token);
router.get("/userinfo", userinfo);
router.get("/session", optionalProtect, session);
router.post("/logout", optionalProtect, logout);
router.post("/global-logout", optionalProtect, globalLogout);

export default router;
