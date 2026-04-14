import express from "express";
import { createTenant, getTenants } from "../controllers/tenant.controller.js";
import { protect, superAdminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

// Only Super Admin can create tenants or view all tenants
router.post("/", protect, superAdminOnly, createTenant);
router.get("/", protect, superAdminOnly, getTenants);

export default router;
