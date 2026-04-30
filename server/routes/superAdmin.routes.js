import express from "express";
import {
  getAllCompaniesModuleStats,
  getCompanyHrmsModules,
  getCompanyProductModules,
  updateCompanyProductModules,
  updateCompanyHrmsModules
} from "../controllers/company.controller.js";
import { verifyToken, authorizeRoles } from "../middleware/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(verifyToken, authorizeRoles(ROLES.SUPER_ADMIN));

router.get("/module-stats", getAllCompaniesModuleStats);
router.get("/companies/:id/hrms-modules", getCompanyHrmsModules);
router.put("/companies/:id/hrms-modules", updateCompanyHrmsModules);
router.get("/companies/:id/product-modules", getCompanyProductModules);
router.put("/companies/:id/products/:productName/modules", updateCompanyProductModules);

export default router;
