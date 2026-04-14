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
    ? products.map((product) => String(product).toUpperCase()).filter(Boolean)
    : [];

const generateCompanyCode = ({ name, email }) => {
  const source = String(name || email || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  const prefix = source.slice(0, 6) || "TENANT";
  const suffix = Date.now().toString().slice(-4);
  return `${prefix}${suffix}`;
};

export const createCompanyWithAdmin = async ({
  name,
  email,
  adminName,
  adminEmail,
  adminPassword,
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
  const productDocs = await Product.find({ name: { $in: selectedProducts } });

  if (selectedProducts.length !== productDocs.length) {
    return { error: { status: 400, message: "Invalid product selection" } };
  }

  const defaultHrms = normalizeHrmsModuleSettings(undefined, undefined);
  const generatedCompanyCode = generateCompanyCode({
    name: normalizedName,
    email: normalizedCompanyEmail
  });

  const company = await Company.create({
    name: normalizedName,
    email: normalizedCompanyEmail,
    code: generatedCompanyCode,
    companyCode: generatedCompanyCode,
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

  const provisioning = await syncCompanyToHrms({
    company,
    products: productDocs.map((product) => product.name),
    adminName: companyAdmin.name,
    adminEmail: companyAdmin.email,
    source: "create_company"
  });

  return {
    company,
    companyAdmin,
    products: productDocs.map((product) => product.name),
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
