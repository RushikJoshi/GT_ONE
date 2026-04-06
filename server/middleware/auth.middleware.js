import jwt from "jsonwebtoken";
import User from "../models/User.js";

// 🔥 Verify Token (Cookie-based SSO)
export const verifyToken = (req, res, next) => {
    try {
        // ✅ GET TOKEN FROM COOKIE
        const token = req.cookies.token;

        if (!token) {
            return res.status(401).json({ msg: "No token, authorization denied" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;

        next();
    } catch (err) {
        return res.status(401).json({ msg: "Token is invalid or expired" });
    }
};

// 🔥 Admin Access
export const isAdmin = (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ msg: "Not authorized" });
        }

        const { role } = req.user;

        if (role === "admin" || role === "superadmin") {
            next();
        } else {
            return res.status(403).json({ msg: "Access denied. Admin only." });
        }
    } catch (err) {
        return res.status(500).json({ msg: "Server error in admin check" });
    }
};