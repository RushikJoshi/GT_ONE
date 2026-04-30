import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import authRoutes from "./routes/auth.routes.js";
import appRoutes from "./routes/app.routes.js";
import ssoRoutes from "./routes/sso.routes.js";
import wellKnownRoutes from "./routes/wellKnown.routes.js";
import companyRoutes from "./routes/company.routes.js";
import tenantRoutes from "./routes/tenant.routes.js";
import superAdminRoutes from "./routes/superAdmin.routes.js";
import productRoutes from "./routes/product.routes.js";
import { seedInitialData } from "./services/seed.service.js";
import { dropLegacyUniqueEmailIndexes } from "./services/indexMigration.service.js";



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
        "http://localhost:5004",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5176",
        ...(process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : [])
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

const PORT = process.env.PORT || 5004;
const MONGO_DB_NAME = String(process.env.MONGO_DB_NAME || "").trim();

const resolveMongoDbName = (uri, configuredDbName) => {
  if (configuredDbName) {
    return configuredDbName;
  }

  try {
    const parsed = new URL(uri);
    const pathname = String(parsed.pathname || "").replace(/^\/+/, "").trim();
    return pathname || "";
  } catch {
    return "";
  }
};

// CORS Configuration
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5174",
  "http://localhost:5176",
  "http://localhost:5173"
];

const normalizeOrigin = (value) => {
  if (!value) return null;
  try {
    return new URL(String(value).trim()).origin;
  } catch {
    return null;
  }
};

const parseEnvOrigins = (raw) =>
  String(raw || "")
    .split(",")
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);

const configuredOrigins = parseEnvOrigins(process.env.CORS_ALLOWED_ORIGINS);
const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS;

const corsOptions = {
  origin: (origin, callback) => {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!origin || (normalizedOrigin && allowedOrigins.includes(normalizedOrigin))) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-ID", "X-Company-Code"],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
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
app.use("/api/sso", ssoRoutes);
app.use("/.well-known", wellKnownRoutes);
app.use("/api/applications", appRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/products", productRoutes);

// Catch-all for SPA
if (fs.existsSync(clientDistDir)) {
  app.get(/.*/, (req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API route not found" });
    res.sendFile(path.join(clientDistDir, "index.html"));
  });
}

// Database Connection
const connectDB = async () => {
  try {
    let finalUri = process.env.MONGO_URI;
    if (!finalUri) {
      throw new Error("MONGO_URI is not defined in environment variables");
    }

    const resolvedDbName = resolveMongoDbName(finalUri, MONGO_DB_NAME);
    if (!resolvedDbName) {
      throw new Error("MongoDB database name is missing. Set MONGO_DB_NAME or include the DB name in MONGO_URI.");
    }

    console.log(`[SSO] Connecting to MongoDB: ${finalUri.replace(/:[^:]+@/, ":****@")}`);
    const mongooseOptions = {};
    mongooseOptions.dbName = resolvedDbName;

    await mongoose.connect(finalUri, mongooseOptions);
    console.log(`[SSO] MongoDB Connected (db=${mongoose.connection.name})`);

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


