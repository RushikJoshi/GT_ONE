import Company from "../models/Company.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import CompanyProduct from "../models/CompanyProduct.js";
import { ROLES } from "../constants/roles.js";
import bcrypt from "bcryptjs";
import {
  createCompanyWithAdmin,
  getCompanyHrmsModulesById,
  updateCompanyHrmsModulesById
} from "../services/company.service.js";
import { syncCompanyToHrms } from "../services/hrmsProvisioning.service.js";

const normalizeProductNames = (products) => {
  return Array.isArray(products)
    ? products
        .map((product) => String(product || "").trim().toUpperCase())
        .filter(Boolean)
    : [];
};

export const createCompany = async (req, res) => {
  try {
    const {
      name,
      email,
      adminName,
      adminEmail,
      adminPassword,
      products,
      phone,
      companyType,
      gstNumber,
      panNumber,
      registrationNo,
      country,
      state,
      officeAddress,
      subCompanyLimit
    } = req.body || {};

    if (!name || !email) {
      return res.status(400).json({ message: "name and email are required" });
    }

    const result = await createCompanyWithAdmin({
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
      products: products || []
    });

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    return res.status(201).json({
      message: "Company created successfully",
      company: result.company,
      companyAdmin: result.companyAdmin,
      products: result.products,
      provisioning: result.provisioning?.success
        ? result.provisioning
        : {
            warning: true,
            message: result.provisioning?.message || "HRMS provisioning failed"
          },
      adminCredentials: {
        email: result.companyAdmin.email,
        password: result.adminPlainPassword
      }
    });
  } catch (error) {
    console.error("[COMPANY][CREATE] Failed to create company:", error);
    return res.status(500).json({ message: error.message });
  }
};

export const listCompanies = async (_req, res) => {
  try {
    const companies = await Company.find({}).sort({ createdAt: -1 }).lean();

    const companyIds = companies.map((company) => company._id);

    const [companyAdmins, companyProducts] = await Promise.all([
      User.find({ role: ROLES.COMPANY_ADMIN, companyId: { $in: companyIds } })
        .select("name email companyId")
        .lean(),
      CompanyProduct.find({ companyId: { $in: companyIds }, isActive: true })
        .populate("productId", "name")
        .lean()
    ]);

    const adminsByCompany = new Map();
    for (const admin of companyAdmins) {
      adminsByCompany.set(String(admin.companyId), admin);
    }

    const productsByCompany = new Map();
    for (const link of companyProducts) {
      const key = String(link.companyId);
      const current = productsByCompany.get(key) || [];
      if (link.productId?.name) {
        current.push(link.productId.name);
      }
      productsByCompany.set(key, current);
    }

    const data = companies.map((company) => ({
      ...company,
      admin: adminsByCompany.get(String(company._id)) || null,
      products: productsByCompany.get(String(company._id)) || [],
      status: company.isActive ? "ACTIVE" : "INACTIVE"
    }));

    return res.json({ companies: data });
  } catch (error) {
    console.error("[COMPANY][LIST] Failed to list companies:", error);
    return res.status(500).json({ message: error.message });
  }
};

export const updateCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    const {
      name,
      email,
      code,
      phone,
      companyType,
      gstNumber,
      panNumber,
      registrationNo,
      country,
      state,
      officeAddress,
      subCompanyLimit,
      adminName,
      adminPassword
    } = req.body || {};

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const normalizedName = String(name ?? company.name).trim();
    const normalizedEmail = String(email ?? company.email).trim().toLowerCase();
    const normalizedCode = code === undefined ? company.code : String(code || "").trim() || null;

    if (!normalizedName || !normalizedEmail) {
      return res.status(400).json({ message: "name and email are required" });
    }

    const emailOwner = await Company.findOne({ email: normalizedEmail }).select("_id").lean();
    if (emailOwner && String(emailOwner._id) !== String(company._id)) {
      return res.status(400).json({ message: "Company email already exists" });
    }

    company.name = normalizedName;
    company.email = normalizedEmail;
    company.code = normalizedCode;
    company.companyCode = normalizedCode;
    if (phone !== undefined) company.phone = String(phone || "").trim() || null;
    if (companyType !== undefined) company.companyType = String(companyType || "").trim() || null;
    if (gstNumber !== undefined) company.gstNumber = String(gstNumber || "").trim() || null;
    if (panNumber !== undefined) company.panNumber = String(panNumber || "").trim() || null;
    if (registrationNo !== undefined) company.registrationNo = String(registrationNo || "").trim() || null;
    if (country !== undefined) company.country = String(country || "").trim() || null;
    if (state !== undefined) company.state = String(state || "").trim() || null;
    if (officeAddress !== undefined) company.officeAddress = String(officeAddress || "").trim() || null;
    if (subCompanyLimit !== undefined) {
      const n = Number(subCompanyLimit);
      company.subCompanyLimit = Number.isFinite(n) ? n : null;
    }
    await company.save();

    const normalizedAdminName =
      adminName === undefined ? null : String(adminName || "").trim() || null;
    const normalizedAdminPassword =
      adminPassword === undefined ? null : String(adminPassword || "").trim() || null;

    if (normalizedAdminName || normalizedAdminPassword) {
      const adminUser = await User.findOne({
        role: ROLES.COMPANY_ADMIN,
        companyId: company._id
      });

      if (adminUser) {
        if (normalizedAdminName) adminUser.name = normalizedAdminName;
        if (normalizedAdminPassword) {
          adminUser.password = await bcrypt.hash(normalizedAdminPassword, 10);
        }
        await adminUser.save();
      }
    }

    return res.json({ message: "Company updated successfully", company: company.toObject() });
  } catch (error) {
    console.error("[COMPANY][UPDATE] Failed:", error);
    return res.status(500).json({ message: error.message });
  }
};

export const deleteCompany = async (req, res) => {
  try {
    const { companyId } = req.params;

    const company = await Company.findById(companyId).lean();
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    await Promise.all([
      CompanyProduct.deleteMany({ companyId }),
      User.deleteMany({ companyId }),
      Company.deleteOne({ _id: companyId })
    ]);

    return res.json({ message: "Company deleted successfully" });
  } catch (error) {
    console.error("[COMPANY][DELETE] Failed:", error);
    return res.status(500).json({ message: error.message });
  }
};

export const setCompanyActiveStatus = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { isActive } = req.body || {};

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be boolean" });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    company.isActive = isActive;
    await company.save();

    return res.json({
      message: `Company ${isActive ? "activated" : "deactivated"} successfully`,
      company: company.toObject(),
      status: company.isActive ? "ACTIVE" : "INACTIVE"
    });
  } catch (error) {
    console.error("[COMPANY][STATUS] Failed:", error);
    return res.status(500).json({ message: error.message });
  }
};

export const assignCompanyProducts = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { products = [] } = req.body;

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const normalizedProducts = normalizeProductNames(products);
    const productDocs = await Product.find({ name: { $in: normalizedProducts } }).collation({
      locale: "en",
      strength: 2
    });

    if (normalizedProducts.length !== productDocs.length) {
      return res.status(400).json({ message: "Invalid product selection" });
    }

    await CompanyProduct.deleteMany({ companyId: company._id });

    if (productDocs.length) {
      await CompanyProduct.insertMany(
        productDocs.map((product) => ({
          companyId: company._id,
          productId: product._id,
          isActive: true
        }))
      );
    }

    const admin = await User.findOne({ companyId: company._id, role: ROLES.COMPANY_ADMIN })
      .select("name email")
      .lean();
    const provisioning = await syncCompanyToHrms({
      company,
      products: productDocs.map((product) => product.name),
      adminName: admin?.name,
      adminEmail: admin?.email,
      source: "assign_products"
    });

    return res.json({
      message: "Products assigned successfully",
      products: productDocs.map((product) => product.name),
      provisioning: provisioning.success
        ? provisioning
        : { warning: true, message: provisioning.message || "HRMS provisioning failed" }
    });
  } catch (error) {
    console.error("[COMPANY][ASSIGN_PRODUCTS] Failed to assign products:", error);
    return res.status(500).json({ message: error.message });
  }
};

export const getCompanyHrmsModules = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getCompanyHrmsModulesById(id);

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    return res.json(result);
  } catch (error) {
    console.error("[COMPANY][HRMS_MODULES][GET] Failed:", error);
    return res.status(500).json({ message: error.message });
  }
};

export const updateCompanyHrmsModules = async (req, res) => {
  try {
    const { id } = req.params;
    const { hrmsEnabledModules, hrmsModules } = req.body || {};

    const result = await updateCompanyHrmsModulesById(id, {
      hrmsEnabledModules,
      hrmsModules
    });

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    return res.json({
      message: "HRMS modules updated successfully",
      ...result
    });
  } catch (error) {
    console.error("[COMPANY][HRMS_MODULES][PUT] Failed:", error);
    return res.status(500).json({ message: error.message });
  }
};
