import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";

import Application from "../models/Application.js";
import Company from "../models/Company.js";
import CompanyApplication from "../models/CompanyApplication.js";
import User from "../models/User.js";
import { ROLES } from "../constants/roles.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const crmEnvPath = process.argv.find((arg) => arg.startsWith("--crm-env="))?.split("=")[1];
const crmMongoUriArg = process.argv.find((arg) => arg.startsWith("--crm-uri="))?.split("=")[1];
const gtOneMongoUri = process.env.MONGO_URI;

const loadCrmMongoUri = () => {
  if (crmMongoUriArg) return crmMongoUriArg;
  if (process.env.CRM_SOURCE_MONGO_URI) return process.env.CRM_SOURCE_MONGO_URI;
  if (!crmEnvPath) return null;

  const raw = fs.readFileSync(path.resolve(crmEnvPath), "utf8");
  const parsed = dotenv.parse(raw);
  return parsed.MONGO_URI || null;
};

const crmMongoUri = loadCrmMongoUri();

if (!gtOneMongoUri) {
  throw new Error("GT_ONE MONGO_URI is not configured");
}

if (!crmMongoUri) {
  throw new Error("CRM source MONGO_URI not found. Pass --crm-env=<path> or --crm-uri=<uri>.");
}

const crmConnection = await mongoose.createConnection(crmMongoUri).asPromise();

const crmUserSchema = new mongoose.Schema({}, { strict: false, collection: "users" });
const crmCompanySchema = new mongoose.Schema({}, { strict: false, collection: "companies" });

const CrmUser = crmConnection.model("CrmImportUser", crmUserSchema);
const CrmCompany = crmConnection.model("CrmImportCompany", crmCompanySchema);

const mapGtOneRole = (crmRole, hasCompanyId) => {
  const normalized = String(crmRole || "").trim().toLowerCase();
  if (normalized === "super_admin" && !hasCompanyId) {
    return ROLES.SUPER_ADMIN;
  }
  if (normalized === "company_admin" || normalized === "branch_manager") {
    return ROLES.COMPANY_ADMIN;
  }
  return ROLES.EMPLOYEE;
};

const normalize = (value) => String(value || "").trim();
const normalizeEmail = (value) => normalize(value).toLowerCase();
const CRM_PRODUCT_KEY = "CRM";

const ensureCrmApplication = async () => {
  const application = await Application.findOne({ key: "crm" });
  if (!application) {
    throw new Error("CRM application is not registered in GT_ONE");
  }
  return application;
};

const upsertGtOneCompany = async (crmCompany) => {
  if (!crmCompany) return null;

  const name = normalize(crmCompany.name);
  const email = normalizeEmail(crmCompany.email);
  const code = normalize(crmCompany.code);

  let gtCompany = await Company.findOne({
    $or: [
      ...(email ? [{ email }] : []),
      ...(code ? [{ code }] : []),
      ...(name ? [{ name }] : [])
    ]
  });

  if (!gtCompany) {
    gtCompany = await Company.create({
      name: name || "CRM Company",
      email: email || null,
      code: code || null,
      companyCode: code || null,
      companyEmail: email || null,
      isActive: true
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
    await gtCompany.save();
  }

  return gtCompany;
};

const ensureCompanyCrmAccess = async ({ companyId, applicationId }) => {
  if (!companyId || !applicationId) return;

  await CompanyApplication.findOneAndUpdate(
    {
      companyId,
      applicationId
    },
    {
      companyId,
      applicationId,
      isActive: true,
      source: "manual",
      legacyProductName: "CRM",
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
  const crmApp = await ensureCrmApplication();
  const crmCompanies = await CrmCompany.find({}).lean();
  const crmCompaniesById = new Map(crmCompanies.map((company) => [String(company._id), company]));

  const crmUsers = await CrmUser.find({
    email: { $exists: true, $ne: null },
    password: { $exists: true, $ne: null },
    status: { $nin: ["inactive", "suspended", "deleted"] }
  }).lean();

  let importedUsers = 0;
  let updatedUsers = 0;
  let importedCompanies = 0;
  const seenCompanyIds = new Set();

  for (const crmUser of crmUsers) {
    const email = normalizeEmail(crmUser.email);
    const passwordHash = normalize(crmUser.password);
    if (!email || !passwordHash) continue;

    const crmCompany = crmUser.companyId ? crmCompaniesById.get(String(crmUser.companyId)) : null;
    let gtCompany = await upsertGtOneCompany(crmCompany);
    if (gtCompany?._id && !seenCompanyIds.has(String(gtCompany._id))) {
      seenCompanyIds.add(String(gtCompany._id));
      importedCompanies += 1;
    }

    if (gtCompany?._id) {
      await ensureCompanyCrmAccess({
        companyId: gtCompany._id,
        applicationId: crmApp._id
      });
    }

    const role = mapGtOneRole(crmUser.role, Boolean(crmUser.companyId));
    const product = CRM_PRODUCT_KEY;
    const name = normalize(crmUser.name) || email.split("@")[0];

    let gtUser = await User.findOne({ email });
    if (!gtUser) {
      await User.create({
        name,
        email,
        password: passwordHash,
        authSource: "imported",
        accountStatus: "pending_activation",
        allowDirectLogin: false,
        importedFromAppKey: "crm",
        role,
        product,
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
      gtUser.importedFromAppKey = "crm";
    }
    gtUser.product = product;
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
    scannedUsers: crmUsers.length,
    importedUsers,
    updatedUsers,
    importedCompanies
  };
};

try {
  await mongoose.connect(gtOneMongoUri);
  const result = await importUsers();
  console.log("[CRM_IMPORT] Completed", JSON.stringify(result));
} finally {
  await crmConnection.close();
  await mongoose.disconnect();
}
