import express from "express";
import { createCompany } from "../controllers/company.controller.js";

const router = express.Router();

router.post("/create", createCompany);

export default router;