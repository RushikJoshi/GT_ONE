import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";

import Application from "../models/Application.js";
import Company from "../models/Company.js";
import CompanyApplication from "../models/CompanyApplication.js";
import User from "../models/User.js";
import { ROLES } from "../constants/roles.js";
import { PRODUCTS } from "../constants/products.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const hrmsEnvPath = process.argv.find((arg) => arg.startsWith("--hrms-env="))?.split("=")[1];
const hrmsMongoUriArg = process.argv.find((arg) => arg.startsWith("--hrms-uri="))?.split("=")[1];
const appKeyArg = process.argv.find((arg) => arg.startsWith("--app-key="))?.split("=")[1];
const gtOneMongoUri = process.env.MONGO_URI;
const gtOneDbName = process.env.MONGO_DB_NAME || undefined;

const trim = (value) => String(value || "").trim();
const normalizeEmail = (value) => trim(value).toLowerCase();
const appKey = trim(appKeyArg || process.env.HRMS_IMPORT_APP_KEY || "hrmspro").toLowerCase();
const normalizeProductName = (value) => trim(value).toUpperCase();

const loadHrmsMongoUri = () => {
  if (hrmsMongoUriArg) return hrmsMongoUriArg;
  if (process.env.HRMS_SOURCE_MONGO_URI) return process.env.HRMS_SOURCE_MONGO_URI;
  if (!hrmsEnvPath) return null;

  const raw = fs.readFileSync(path.resolve(hrmsEnvPath), "utf8");
  const parsed = dotenv.parse(raw);
  return parsed.MONGO_URI || null;
};

const hrmsMongoUri = loadHrmsMongoUri();

if (!gtOneMongoUri) {
  throw new Error("GT_ONE MONGO_URI is not configured");
}

if (!hrmsMongoUri) {
  throw new Error("HRMS source MONGO_URI not found. Pass --hrms-env=<path> or --hrms-uri=<uri>.");
}

const hrmsConnection = await mongoose.createConnection(hrmsMongoUri).asPromise();

const hrmsUserSchema = new mongoose.Schema({}, { strict: false, collection: "users" });
const hrmsTenantSchema = new mongoose.Schema({}, { strict: false, collection: "companies" });

const HrmsUser = hrmsConnection.model("HrmsImportUser", hrmsUserSchema);
const HrmsTenant = hrmsConnection.model("HrmsImportTenant", hrmsTenantSchema);

const mapGtOneRole = (hrmsRole, hasTenantId) => {
  const normalized = trim(hrmsRole).toLowerCase();
  if (["psa", "super_admin", "superadmin"].includes(normalized) && !hasTenantId) {
    return ROLES.SUPER_ADMIN;
  }

  if (
    [
      "company_admin",
      "company_super_admin",
      "admin",
      "hr",
      "hr_admin",
      "hr_manager",
      "manager"
    ].includes(normalized)
  ) {
    return ROLES.COMPANY_ADMIN;
  }

  return ROLES.EMPLOYEE;
};

const resolveCanonicalProductName = (application) => {
  const candidates = [
    normalizeProductName(application?.legacyProductName),
    normalizeProductName(application?.name),
    normalizeProductName(appKey)
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (PRODUCTS.includes(candidate)) {
      return candidate;
    }
  }

  if (appKey.startsWith("hrms")) {
    return "HRMS";
  }

  throw new Error(`Unable to resolve canonical product for app '${appKey}'`);
};

const ensureApplication = async () => {
  const application = await Application.findOne({ key: appKey });
  if (!application) {
    throw new Error(`Application '${appKey}' is not registered in GT_ONE`);
  }
  return application;
};

const upsertGtOneCompany = async (tenant) => {
  if (!tenant) return null;

  const name = trim(tenant.companyName || tenant.name);
  const email = normalizeEmail(tenant.companyEmail || tenant.adminEmail);
  const code = trim(tenant.code || tenant.companyCode || tenant.tenantId);

  let gtCompany = await Company.findOne({
    $or: [
      ...(email ? [{ email }] : []),
      ...(code ? [{ code }] : []),
      ...(name ? [{ name }] : [])
    ]
  });

  if (!gtCompany) {
    gtCompany = await Company.create({
      name: name || "HRMS Company",
      email: email || null,
      code: code || null,
      companyCode: code || null,
      companyEmail: email || null,
      isActive: tenant.status !== "suspended"
    });
  } else {
    gtCompany.name = gtCompany.name || name || gtCompany.name;
    if (email) {
      gtCompany.email = gtCompany.email || email;
      gtCompany.companyEmail = gtCompany.companyEmail || email;
    }
    if (code) {
      gtCompany.code = gtCompany.code || code;
      gtCompany.companyCode = gtCompany.companyCode || code;
    }
    if (tenant.status === "suspended") {
      gtCompany.isActive = false;
    }
    await gtCompany.save();
  }

  return gtCompany;
};

const ensureCompanyAppAccess = async ({ companyId, applicationId, legacyProductName }) => {
  if (!companyId || !applicationId) return;

  await CompanyApplication.findOneAndUpdate(
    { companyId, applicationId },
    {
      companyId,
      applicationId,
      isActive: true,
      source: "manual",
      legacyProductName,
      settings: {},
      provisioningState: {}
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );
};

const importUsers = async () => {
  const application = await ensureApplication();
  const canonicalProductName = resolveCanonicalProductName(application);
  const tenants = await HrmsTenant.find({}).lean();
  const tenantsById = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));

  const hrmsUsers = await HrmsUser.find({
    email: { $exists: true, $ne: null },
    password: { $exists: true, $ne: null }
  }).lean();

  let importedUsers = 0;
  let updatedUsers = 0;
  let importedCompanies = 0;
  const seenCompanyIds = new Set();

  for (const hrmsUser of hrmsUsers) {
    const email = normalizeEmail(hrmsUser.email);
    const passwordHash = trim(hrmsUser.password);
    if (!email || !passwordHash) continue;

    const tenant = hrmsUser.tenant ? tenantsById.get(String(hrmsUser.tenant)) : null;
    const gtCompany = await upsertGtOneCompany(tenant);

    if (gtCompany?._id && !seenCompanyIds.has(String(gtCompany._id))) {
      seenCompanyIds.add(String(gtCompany._id));
      importedCompanies += 1;
    }

    if (gtCompany?._id) {
      await ensureCompanyAppAccess({
        companyId: gtCompany._id,
        applicationId: application._id,
        legacyProductName: canonicalProductName
      });
    }

    const role = mapGtOneRole(hrmsUser.role, Boolean(hrmsUser.tenant));
    const name = trim(hrmsUser.name) || trim(tenant?.adminName) || email.split("@")[0];

    let gtUser = await User.findOne({ email });
    if (!gtUser) {
      await User.create({
        name,
        email,
        password: passwordHash,
        authSource: "imported",
        accountStatus: "pending_activation",
        allowDirectLogin: false,
        importedFromAppKey: appKey,
        role,
        product: canonicalProductName,
        companyId: gtCompany?._id || null,
        tenantId: null
      });
      importedUsers += 1;
      continue;
    }

    const isActivatedGtOneUser =
      gtUser.authSource === "local" ||
      gtUser.allowDirectLogin === true ||
      Boolean(gtUser.activatedAt);

    gtUser.name = gtUser.name || name;
    if (!isActivatedGtOneUser) {
      gtUser.password = passwordHash;
      gtUser.authSource = "imported";
      gtUser.accountStatus = "pending_activation";
      gtUser.allowDirectLogin = false;
      gtUser.importedFromAppKey = appKey;
    }
    gtUser.product = canonicalProductName;
    if (gtCompany?._id && !gtUser.companyId) {
      gtUser.companyId = gtCompany._id;
    }
    if (gtUser.role !== ROLES.SUPER_ADMIN) {
      gtUser.role = role;
    }
    await gtUser.save();
    updatedUsers += 1;
  }

  return {
    appKey,
    canonicalProductName,
    scannedUsers: hrmsUsers.length,
    importedUsers,
    updatedUsers,
    importedCompanies
  };
};

try {
  await mongoose.connect(gtOneMongoUri, gtOneDbName ? { dbName: gtOneDbName } : {});
  const result = await importUsers();
  console.log("[HRMS_IMPORT] Completed", JSON.stringify(result));
} finally {
  await hrmsConnection.close();
  await mongoose.disconnect();
}
