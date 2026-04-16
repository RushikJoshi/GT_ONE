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
  officeAddress,
  subCompanyLimit,
  products = []
}) => {
  const normalizedName = String(name || "").trim();
  const normalizedCompanyEmail = String(email || "").trim().toLowerCase();

  if (!normalizedName || !normalizedCompanyEmail) {
    return { error: { status: 400, message: "Company name and email are required" } };
  }

  const normalizedAdminEmail = String(adminEmail || normalizedCompanyEmail).trim().toLowerCase();
  const adminUserName = String(adminName || "Company Admin").trim() || "Company Admin";
  const adminUserPassword = String(adminPassword || "admin@2026").trim();

  if (!adminUserPassword) {
    return { error: { status: 400, message: "admin password is required" } };
  }

  const existingCompany = await Company.findOne({ email: normalizedCompanyEmail });
  if (existingCompany) {
    return { error: { status: 400, message: "Company email already exists" } };
  }

  const existingAdmin = await User.findOne({ email: normalizedAdminEmail });
  if (existingAdmin) {
    return { error: { status: 400, message: "Company admin email already exists" } };
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

  const company = await Company.create({
    name: normalizedName,
    email: normalizedCompanyEmail,
    code: generatedCompanyCode,
    companyCode: generatedCompanyCode,
    // Some environments have a unique Mongo index on `organizationId`.
    // Ensure it is always set to a unique value during creation.
    organizationId: generatedCompanyCode,
    // Some environments also have a unique Mongo index on `databaseName`.
    // Use a deterministic, unique value based on generated code.
    databaseName: String(generatedCompanyCode).toLowerCase(),
    phone: phone ? String(phone).trim() : null,
    companyType: companyType ? String(companyType).trim() : null,
    gstNumber: gstNumber ? String(gstNumber).trim() : null,
    panNumber: panNumber ? String(panNumber).trim() : null,
    registrationNo: registrationNo ? String(registrationNo).trim() : null,
    country: country ? String(country).trim() : null,
    state: state ? String(state).trim() : null,
    officeAddress: officeAddress ? String(officeAddress).trim() : null,
    subCompanyLimit: subCompanyLimit === undefined || subCompanyLimit === null || subCompanyLimit === ""
      ? null
      : Number.isFinite(Number(subCompanyLimit))
        ? Number(subCompanyLimit)
        : null,
    hrmsEnabledModules: defaultHrms.hrmsEnabledModules,
    hrmsModules: defaultHrms.hrmsModules
  });

  const hashedPassword = await bcrypt.hash(adminUserPassword, 10);

  const companyAdmin = await User.create({
    name: adminUserName,
    email: normalizedAdminEmail,
    password: hashedPassword,
    role: ROLES.COMPANY_ADMIN,
    companyId: company._id
  });

  await Company.updateOne(
    { _id: company._id },
    { $set: { hrmsAdminUserId: String(companyAdmin._id) } }
  );

  console.log(
    `[COMPANY][CREATE] COMPANY_ADMIN created: ${companyAdmin.email}, role=${companyAdmin.role}`
  );

  if (productDocs.length) {
    await CompanyProduct.insertMany(
      productDocs.map((product) => ({
        companyId: company._id,
        productId: product._id,
        isActive: true
      }))
    );
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
