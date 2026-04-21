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
        "https://gaccess.gitakshmi.com",
        "https://hrms.dev.gitakshmi.com",
        "https://devprojects.gitakshmi.com"
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

const PORT = process.env.PORT || 5004;

// CORS Configuration
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS 
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim()) 
  : [];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      console.warn(`[CORS_BLOCKED] Origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Static Files & Frontend Build
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistDir = path.resolve(__dirname, "../client/dist");

if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
}

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

// Catch-all for SPA
if (fs.existsSync(clientDistDir)) {
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(clientDistDir, "index.html"));
  });
}

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


