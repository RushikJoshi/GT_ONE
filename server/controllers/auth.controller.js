import User from "../models/User.js";
import Company from "../models/Company.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// ================= REGISTER =================
export const register = async (req, res) => {
    try {
        const { name, email, password, companyId } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ msg: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        let allowedApps = [];
        if (companyId) {
            const company = await Company.findById(companyId);
            if (company) {
                allowedApps = company.allowedApps || [];
            }
        }

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            companyId: companyId || null,
            allowedApps,
            isActive: true
        });

        return res.status(201).json({
            msg: "User registered successfully",
            user
        });

    } catch (err) {
        return res.status(500).json({ msg: err.message });
    }
};

// ================= LOGIN =================
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email }).populate("companyId");

        if (!user) {
            return res.status(400).json({ msg: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: "Invalid password" });
        }

        if (user.isActive === false) {
            return res.status(403).json({ msg: "User is inactive" });
        }

        const companyApps = user.companyId?.allowedApps || [];

        const token = jwt.sign(
            {
                userId: user._id,
                role: user.role,
                companyId: user.companyId?._id || null,
                allowedApps: user.allowedApps || [],
                companyApps
            },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        // 🍪 COOKIE (SSO FIXED)
        res.cookie("token", token, {
            httpOnly: true,
            secure: false, // ⚠️ keep false for localhost
            sameSite: "lax", // ✅ IMPORTANT
            maxAge: 24 * 60 * 60 * 1000,
            path: "/",
        });

        console.log("✅ COOKIE SET SUCCESSFULLY");

        // 🔥 REDIRECT SUPPORT (MAIN FIX)
        const redirectURL = req.query.redirect || "http://localhost:5173";

        return res.json({
            msg: "Login successful",
            user,
            redirect: redirectURL
        });

    } catch (err) {
        return res.status(500).json({ msg: err.message });
    }
};

// ================= SSO ME =================
export const getMe = async (req, res) => {
    try {
        const token = req.cookies?.token;

        console.log("🍪 SSO CHECK - Cookie Token Found:", !!token);

        if (!token) {
            return res.status(200).json({ user: null, token: null });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            console.log("❌ TOKEN INVALID:", err.message);
            return res.status(200).json({ user: null, token: null });
        }

        console.log("✅ TOKEN DECODED:", decoded);

        const userId = decoded.userId || decoded.id || decoded._id;

        if (!userId) {
            console.log("❌ No userId in token");
            return res.status(200).json({ user: null, token: null });
        }

        const user = await User.findById(userId)
            .populate("companyId")
            .select("-password");

        if (!user) {
            console.log("❌ User not found in DB");
            return res.status(200).json({ user: null, token: null });
        }

        console.log("✅ SSO USER FOUND:", user.email);

        return res.json({
            user,
            token
        });

    } catch (err) {
        console.log("❌ SSO ERROR:", err.message);
        return res.status(200).json({ user: null, token: null });
    }
};

// ================= LOGOUT =================
export const logout = async (req, res) => {
    try {
        res.clearCookie("token", {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            path: "/"
        });

        console.log("🚪 USER LOGGED OUT");

        return res.json({
            msg: "Logged out successfully"
        });

    } catch (err) {
        return res.status(500).json({ msg: err.message });
    }
};