import bcrypt from "bcryptjs";
import Company from "../models/Company.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import CompanyProduct from "../models/CompanyProduct.js";
import { ROLES } from "../constants/roles.js";
import {
  normalizeHrmsModuleSettings,
  HRMS_MODULE_KEYS
} from "../constants/hrmsModules.js";
import { syncCompanyToHrms } from "./hrmsProvisioning.service.js";

const normalizeProductNames = (products) =>
  Array.isArray(products)
    ? products
        .map((product) => String(product || "").trim().toUpperCase())
        .filter(Boolean)
    : [];

const generateCompanyCode = async ({ name, email }) => {
  // Requirement: 3 letters from company name + 001/002/...
  // Example: "gitakshmi" -> "GIT001"
  const nameSource = String(name || "").trim();
  const emailSource = String(email || "").trim();
  const source = (nameSource || emailSource)
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();

  const prefix = (source.slice(0, 3) || "COM").padEnd(3, "X");

  const existing = await Company.find(
    {
      $or: [
        { code: { $regex: new RegExp(`^${prefix}\\d{3}$`, "i") } },
        { companyCode: { $regex: new RegExp(`^${prefix}\\d{3}$`, "i") } }
      ]
    },
    { code: 1, companyCode: 1 }
  ).lean();

  let max = 0;
  for (const item of existing) {
    const candidate = String(item?.code || item?.companyCode || "").toUpperCase();
    if (!candidate.startsWith(prefix)) continue;
    const suffix = candidate.slice(prefix.length);
    const n = Number.parseInt(suffix, 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }

  const next = String(max + 1).padStart(3, "0");
  return `${prefix}${next}`;
};

const mapCreateCompanyError = (error) => {
  if (!error) {
    return { status: 500, message: "Failed to create company" };
  }

  if (error?.code === 11000) {
    const duplicateKeys = Object.keys(error?.keyPattern || error?.keyValue || {});

    if (duplicateKeys.includes("tenantId")) {
      return {
        status: 409,
        message: "Company creation failed because of a legacy tenant mapping conflict. Please try again."
      };
    }

    if (duplicateKeys.includes("email") || duplicateKeys.includes("companyEmail")) {
      return {
        status: 409,
        message: "A company or admin with this email already exists."
      };
    }

    if (
      duplicateKeys.includes("code") ||
      duplicateKeys.includes("companyCode") ||
      duplicateKeys.includes("apiKey")
    ) {
      return {
        status: 409,
        message: "Generated company code already exists. Please try again."
      };
    }

    if (duplicateKeys.includes("organizationId") || duplicateKeys.includes("databaseName")) {
      return {
        status: 409,
        message: "Company provisioning identifiers already exist. Please try again."
      };
    }
  }

  if (error?.name === "ValidationError") {
    return {
      status: 400,
      message: Object.values(error.errors || {})[0]?.message || "Invalid company details"
    };
  }

  return {
    status: 500,
    message: error.message || "Failed to create company"
  };
};

export const createCompanyWithAdmin = async ({
  name,
  email,
  adminName,
  adminEmail,
  adminPassword,
  phone,
  companyType,
  gstNumber,
  panNumber,
  registrationNo,
  country,
  state,
  district,
  officeAddress,
  subCompanyLimit,
  products = [],
  productEmployeeLimits = {}
}) => {
  const normalizedName = String(name || "").trim();
  const normalizedCompanyEmail = String(email || "").trim().toLowerCase();

  if (!normalizedName || !normalizedCompanyEmail) {
    return { error: { status: 400, message: "Company name and email are required" } };
  }

  const normalizedAdminEmail = String(adminEmail || normalizedCompanyEmail).trim().toLowerCase();
  const adminUserName = String(adminName || "Company Admin").trim() || "Company Admin";
  const adminUserPassword = String(adminPassword || "admin@2026").trim();
  const normalizedDistrict = district ? String(district).trim() : null;

  if (!adminUserPassword) {
    return { error: { status: 400, message: "admin password is required" } };
  }

  const selectedProducts = normalizeProductNames(products);
  let productDocs = [];
  
  if (selectedProducts.length > 0) {
    productDocs = await Product.find({ name: { $in: selectedProducts } }).collation({
      locale: "en",
      strength: 2
    });
    if (selectedProducts.length !== productDocs.length) {
      return { error: { status: 400, message: "Invalid product selection" } };
    }
  } else {
    return { error: { status: 400, message: "Select at least one product" } };
  }

  const defaultHrms = normalizeHrmsModuleSettings(undefined, undefined);
  const generatedCompanyCode = await generateCompanyCode({
    name: normalizedName,
    email: normalizedCompanyEmail
  });

  let company;
  try {
    company = await Company.create({
      name: normalizedName,
      email: normalizedCompanyEmail,
      companyEmail: normalizedCompanyEmail,
      code: generatedCompanyCode,
      companyCode: generatedCompanyCode,
      // Legacy deployments may still have a unique index on `tenantId`.
      // Seed a unique placeholder immediately, then overwrite it with the HRMS tenant id after provisioning.
      tenantId: generatedCompanyCode,
      // Some environments have a unique Mongo index on `organizationId`.
      // Ensure it is always set to a unique value during creation.
      organizationId: generatedCompanyCode,
      // Some environments also have a unique Mongo index on `databaseName`.
      // Use a deterministic, unique value based on generated code.
      databaseName: String(generatedCompanyCode).toLowerCase(),
      // Some legacy schemas keep a unique `apiKey` index even when the field is no longer used.
      apiKey: generatedCompanyCode,
      phone: phone ? String(phone).trim() : null,
      companyType: companyType ? String(companyType).trim() : null,
      gstNumber: gstNumber ? String(gstNumber).trim() : null,
      panNumber: panNumber ? String(panNumber).trim() : null,
      registrationNo: registrationNo ? String(registrationNo).trim() : null,
      country: country ? String(country).trim() : null,
      state: state ? String(state).trim() : null,
      district: normalizedDistrict,
      officeAddress: officeAddress ? String(officeAddress).trim() : null,
      subCompanyLimit: subCompanyLimit === undefined || subCompanyLimit === null || subCompanyLimit === ""
        ? null
        : Number.isFinite(Number(subCompanyLimit))
          ? Number(subCompanyLimit)
          : null,
      productEmployeeLimits: productEmployeeLimits || {},
      hrmsEnabledModules: defaultHrms.hrmsEnabledModules,
      hrmsModules: defaultHrms.hrmsModules
    });
  } catch (error) {
    if (error.code === 11000) {
      console.error("[COMPANY] Duplicate Key Error (Company):", {
        message: error.message,
        keyPattern: error.keyPattern,
        keyValue: error.keyValue
      });
    }
    return { error: mapCreateCompanyError(error) };
  }

  const hashedPassword = await bcrypt.hash(adminUserPassword, 10);

  let companyAdmin;
  try {
    companyAdmin = await User.create({
      name: adminUserName,
      email: normalizedAdminEmail,
      password: hashedPassword,
      role: ROLES.COMPANY_ADMIN,
      companyId: company._id
    });
  } catch (error) {
    if (error.code === 11000) {
      console.error("[COMPANY] Duplicate Key Error (User):", {
        message: error.message,
        keyPattern: error.keyPattern,
        keyValue: error.keyValue
      });
    }
    await Company.deleteOne({ _id: company._id });
    return { error: mapCreateCompanyError(error) };
  }

  await Company.updateOne(
    { _id: company._id },
    { $set: { hrmsAdminUserId: String(companyAdmin._id) } }
  );

  console.log(
    `[COMPANY][CREATE] COMPANY_ADMIN created: ${companyAdmin.email}, role=${companyAdmin.role}`
  );

  if (productDocs.length) {
    try {
      await CompanyProduct.insertMany(
        productDocs.map((product) => ({
          companyId: company._id,
          productId: product._id,
          isActive: true
        }))
      );
    } catch (error) {
      if (error.code === 11000) {
      console.error("[COMPANY] Duplicate Key Error (Product):", {
        message: error.message,
        keyPattern: error.keyPattern,
        keyValue: error.keyValue
      });
    }
    await Promise.all([
      User.deleteOne({ _id: companyAdmin._id }),
      Company.deleteOne({ _id: company._id })
    ]);
    return { error: mapCreateCompanyError(error) };
  }
  }

  const selectedProductNames = productDocs.map((product) => product.name);
  const hasHrms = selectedProductNames.some((p) => String(p).toUpperCase() === "HRMS");
  let provisioning = {
    warning: true,
    skipped: true,
    message: "HRMS not selected; provisioning skipped"
  };

  // Provisioning should never block company creation.
  if (hasHrms) {
    try {
      provisioning = await syncCompanyToHrms({
        company,
        products: selectedProductNames,
        adminName: companyAdmin.name,
        adminEmail: companyAdmin.email,
        source: "create_company"
      });
    } catch (error) {
      provisioning = {
        success: false,
        warning: true,
        skipped: false,
        message: error?.message || "HRMS provisioning failed"
      };
    }
  }

  return {
    company,
    companyAdmin,
    products: selectedProductNames,
    adminPlainPassword: adminUserPassword,
    provisioning
  };
};

export const getCompanyHrmsModulesById = async (companyId) => {
  const company = await Company.findById(companyId).lean();
  if (!company) {
    return { error: { status: 404, message: "Company not found" } };
  }

  const normalized = normalizeHrmsModuleSettings(company.hrmsEnabledModules, company.hrmsModules);

  return {
    companyId: String(company._id),
    companyName: company.name,
    moduleKeys: HRMS_MODULE_KEYS,
    hrmsEnabledModules: normalized.hrmsEnabledModules,
    hrmsModules: normalized.hrmsModules
  };
};

export const updateCompanyHrmsModulesById = async (
  companyId,
  { hrmsEnabledModules, hrmsModules }
) => {
  const company = await Company.findById(companyId);
  if (!company) {
    return { error: { status: 404, message: "Company not found" } };
  }

  const normalized = normalizeHrmsModuleSettings(hrmsEnabledModules, hrmsModules);

  company.hrmsEnabledModules = normalized.hrmsEnabledModules;
  company.hrmsModules = normalized.hrmsModules;
  await company.save();

  const companyProducts = await CompanyProduct.find({
    companyId: company._id,
    isActive: true
  }).populate("productId", "name");
  const products = companyProducts.map((item) => item.productId?.name).filter(Boolean);
  const admin = await User.findOne({ companyId: company._id, role: ROLES.COMPANY_ADMIN })
    .select("name email")
    .lean();
  const provisioning = await syncCompanyToHrms({
    company,
    products,
    adminName: admin?.name,
    adminEmail: admin?.email,
    source: "update_hrms_modules"
  });

  return {
    companyId: String(company._id),
    companyName: company.name,
    moduleKeys: HRMS_MODULE_KEYS,
    hrmsEnabledModules: normalized.hrmsEnabledModules,
    hrmsModules: normalized.hrmsModules,
    provisioning
  };
};
