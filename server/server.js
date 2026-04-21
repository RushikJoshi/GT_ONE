import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import authRoutes from "./routes/auth.routes.js";
import companyRoutes from "./routes/company.routes.js";
import tenantRoutes from "./routes/tenant.routes.js";
import superAdminRoutes from "./routes/superAdmin.routes.js";
import productRoutes from "./routes/product.routes.js";
import { seedInitialData } from "./services/seed.service.js";
import { dropLegacyUniqueEmailIndexes } from "./services/indexMigration.service.js";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

// Security Headers with CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: [
        "'self'", 
        "http://localhost:5174", // SSO Client
        "http://localhost:5176", // HRMS Client
        "http://localhost:5173", // PMS Client
        "http://127.0.0.1:5174", // SSO Client (IP)
        "http://127.0.0.1:5176", // HRMS Client (IP)
        "http://127.0.0.1:5173", // PMS Client (IP)
        "http://localhost:5004", // SSO Self
        "http://127.0.0.1:5004", // SSO Self (IP)
        "ws://localhost:5174",   // Vite HMR
        "ws://localhost:5176",   // Vite HMR
        "ws://127.0.0.1:5174",   // Vite HMR (IP)
        "ws://127.0.0.1:5176",   // Vite HMR (IP)
        "ws://127.0.0.1:5173"    // Vite HMR (IP)
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

const PORT = process.env.PORT || 5004;

// CORS Configuration
const allowedOrigins = [
  "http://localhost:5173", // PMS
  "http://localhost:5174", // SSO
  "http://localhost:5176", // HRMS
  "http://127.0.0.1:5173", // PMS (IP)
  "http://127.0.0.1:5174", // SSO (IP)
  "http://127.0.0.1:5176", // HRMS (IP)
  "https://sso.gitakshmi.com",
  "https://hrms.gitakshmi.com"
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "Gitakshmi One SSO" });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/products", productRoutes);

// Database Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`[SSO] MongoDB Connected`);

    // Backward-compatible migration: allow duplicate emails in Company/User.
    await dropLegacyUniqueEmailIndexes();
    
    // Seed initial data (Super Admin)
    await seedInitialData();
    
    app.listen(PORT, () => {
      console.log(`[SSO] System running on port ${PORT}`);
    });
  } catch (error) {
    console.error(`[SSO] Connection Error: ${error.message}`);
    process.exit(1);
  }
};

connectDB();


