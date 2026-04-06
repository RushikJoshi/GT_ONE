import jwt from "jsonwebtoken";

export const verifySSO = (req, res, next) => {
    try {
        const token = req.cookies.token; // 🍪 READ COOKIE

        if (!token) {
            return res.status(401).json({
                msg: "No SSO session detected"
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = decoded; // 🔥 attach user

        next();
    } catch (err) {
        return res.status(401).json({
            msg: "Invalid or expired token"
        });
    }
};