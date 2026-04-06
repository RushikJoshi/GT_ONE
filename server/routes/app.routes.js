import express from "express";
import {
    createApp,
    assignAppToCompany,
    assignAppToUser
} from "../controllers/app.controller.js";

import {
    verifyToken,
    isAdmin
} from "../middleware/auth.middleware.js";

const router = express.Router();

// 🔥 Create new application (Admin only)
router.post("/create", verifyToken, isAdmin, createApp);

// 🔥 Assign app to company (Admin only)
router.post("/assign-company", verifyToken, isAdmin, assignAppToCompany);

// 🔥 Assign app to user (Admin only)
router.post("/assign-user", verifyToken, isAdmin, assignAppToUser);

export default router;