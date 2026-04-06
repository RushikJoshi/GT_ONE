import Company from "../models/Company.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";

// Create Company + Admin User
export const createCompany = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // 1. Create Company
        const company = await Company.create({
            name,
            email,
            allowedApps: ["crm"] // default
        });

        // 2. Create Admin User
        const hashedPassword = await bcrypt.hash(password, 10);

        const adminUser = await User.create({
            name: "Admin",
            email,
            password: hashedPassword,
            role: "admin",
            companyId: company._id,
            allowedApps: company.allowedApps
        });

        res.json({ company, adminUser });

    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};