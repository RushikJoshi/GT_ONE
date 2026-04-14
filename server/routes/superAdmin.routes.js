import express from "express";
import { getCompanyHrmsModules, updateCompanyHrmsModules } from "../controllers/company.controller.js";
import { verifyToken, authorizeRoles } from "../middleware/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(verifyToken, authorizeRoles(ROLES.SUPER_ADMIN));

router.get("/companies/:id/hrms-modules", getCompanyHrmsModules);
router.put("/companies/:id/hrms-modules", updateCompanyHrmsModules);

export default router;
