import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";

import appRoutes from "./routes/app.routes.js";
import companyRoutes from "./routes/company.routes.js";
import authRoutes from "./routes/auth.routes.js";

dotenv.config();

const app = express();

// ================= CORS (FINAL FIX) =================
app.use(cors({
    origin: [
        "http://localhost:5173", // CRM
        "http://localhost:5174"  // SSO frontend
    ],
    credentials: true
}));

// ❌ REMOVE buggy preflight like app.options("*path", cors());
// ✅ Express handles it automatically via cors middleware

// ================= MIDDLEWARE =================
app.use(express.json());

// 🔥 VERY IMPORTANT: BEFORE ROUTES
app.use(cookieParser());

// ================= ROUTES =================
app.use("/api/auth", authRoutes);
app.use("/api/apps", appRoutes);
app.use("/api/company", companyRoutes);

// ================= DB =================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ DB Connected"))
    .catch(err => console.log("❌ DB Error:", err));

// ================= SERVER =================
app.listen(process.env.PORT || 5000, () =>
    console.log(`🚀 Server running on port ${process.env.PORT || 5000}`)
);