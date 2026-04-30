import express from "express";
import { jwks, openidConfiguration } from "../controllers/sso.controller.js";

const router = express.Router();

router.get("/openid-configuration", openidConfiguration);
router.get("/oauth-authorization-server", openidConfiguration);
router.get("/jwks.json", jwks);

export default router;
