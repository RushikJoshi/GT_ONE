import Application from "../models/Application.js";
import User from "../models/User.js";
import Company from "../models/Company.js";

// Create App
export const createApp = async (req, res) => {
    const app = await Application.create(req.body);
    res.json(app);
};

// Assign App to Company
export const assignAppToCompany = async (req, res) => {
    const { companyId, appName } = req.body;

    await Company.findByIdAndUpdate(companyId, {
        $addToSet: { allowedApps: appName }
    });

    res.json({ msg: "App assigned to company" });
};

// Assign App to User
export const assignAppToUser = async (req, res) => {
    const { userId, appName } = req.body;

    await User.findByIdAndUpdate(userId, {
        $addToSet: { allowedApps: appName }
    });

    res.json({ msg: "App assigned to user" });
};