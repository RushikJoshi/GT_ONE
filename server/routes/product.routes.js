import express from "express";
import { listProducts } from "../controllers/product.controller.js";
import { verifyToken, authorizeRoles } from "../middleware/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.get("/", verifyToken, authorizeRoles(ROLES.SUPER_ADMIN), listProducts);

export default router;
