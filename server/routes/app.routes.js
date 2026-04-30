import express from "express";
import {
  createApp,
  getAppByKey,
  getAppConnectorTemplate,
  getCompanyApps,
  listApps,
  rotateAppClientSecret,
  setAppStatus,
  syncLegacyApps,
  updateApp,
  deleteApp
} from "../controllers/app.controller.js";
import { verifyToken, authorizeRoles } from "../middleware/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(verifyToken, authorizeRoles(ROLES.SUPER_ADMIN));

router.get("/", listApps);
router.get("/key/:key/connector-template", getAppConnectorTemplate);
router.get("/key/:key", getAppByKey);
router.get("/companies/:companyId", getCompanyApps);
router.post("/legacy-sync", syncLegacyApps);
router.post("/", createApp);
router.put("/:id", updateApp);
router.delete("/:id", deleteApp);
router.post("/:id/rotate-secret", rotateAppClientSecret);
router.patch("/:id/status", setAppStatus);

export default router;
