import express from "express";
import {
  createCompany,
  listCompanies,
  assignCompanyProducts,
  getCompanyHrmsModules,
  updateCompanyHrmsModules
} from "../controllers/company.controller.js";
import { verifyToken, authorizeRoles } from "../middleware/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(verifyToken, authorizeRoles(ROLES.SUPER_ADMIN));

router.get("/", listCompanies);
router.post("/", createCompany);
router.put("/:companyId/products", assignCompanyProducts);
router.get("/:id/hrms-modules", getCompanyHrmsModules);
router.put("/:id/hrms-modules", updateCompanyHrmsModules);

export default router;
