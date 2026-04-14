import Company from "../models/Company.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import CompanyProduct from "../models/CompanyProduct.js";
import { ROLES } from "../constants/roles.js";
import {
  createCompanyWithAdmin,
  getCompanyHrmsModulesById,
  updateCompanyHrmsModulesById
} from "../services/company.service.js";
import { syncCompanyToHrms } from "../services/hrmsProvisioning.service.js";

const normalizeProductNames = (products) => {
  return Array.isArray(products)
    ? products.map((product) => String(product).toUpperCase()).filter(Boolean)
    : [];
};

export const createCompany = async (req, res) => {
  try {
    const { name, email, adminName, adminEmail, adminPassword, products } = req.body || {};

    if (!name || !email) {
      return res.status(400).json({ message: "name and email are required" });
    }

    const result = await createCompanyWithAdmin({
      name,
      email,
      adminName,
      adminEmail,
      adminPassword,
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
      products: productsByCompany.get(String(company._id)) || []
    }));

    return res.json({ companies: data });
  } catch (error) {
    console.error("[COMPANY][LIST] Failed to list companies:", error);
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
    const productDocs = await Product.find({ name: { $in: normalizedProducts } });

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
