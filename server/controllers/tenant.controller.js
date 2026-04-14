import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import { ROLES } from "../constants/roles.js";

/**
 * @desc    Create new tenant and its Company Admin
 * @route   POST /api/tenants
 */
export const createTenant = async (req, res) => {
  try {
    const { companyName, domain, adminName, adminEmail, adminPassword } = req.body;

    // Validate request
    if (!companyName || !domain || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if tenant already exists
    const existingTenant = await Tenant.findOne({ domain });
    if (existingTenant) {
      return res.status(400).json({ message: "Domain already in use" });
    }

    // Check if admin user already exists
    const existingUser = await User.findOne({ email: adminEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Admin email already in use" });
    }

    // Create Tenant
    const tenant = await Tenant.create({
      companyName,
      domain,
      status: "active"
    });

    // Hash Admin Password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Create Company Admin User
    const adminUser = await User.create({
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      role: ROLES.COMPANY_ADMIN,
      tenantId: tenant._id
    });

    console.log(`[SSO] Tenant created: ${companyName}, Admin: ${adminEmail}`);

    return res.status(201).json({
      success: true,
      message: "Tenant and Admin user created successfully",
      tenant,
      admin: {
        id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role
      }
    });
  } catch (error) {
    console.error(`[SSO] Create Tenant Error: ${error.message}`);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @desc    Get all tenants (Super Admin only)
 * @route   GET /api/tenants
 */
export const getTenants = async (req, res) => {
  try {
    const tenants = await Tenant.find().sort("-createdAt");
    return res.json({ success: true, count: tenants.length, tenants });
  } catch (error) {
    console.error(`[SSO] Get Tenants Error: ${error.message}`);
    return res.status(500).json({ message: "Internal server error" });
  }
};
