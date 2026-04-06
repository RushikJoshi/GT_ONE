import mongoose from "mongoose";

const companySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true
    },

    plan: {
        type: String,
        enum: ["basic", "pro", "enterprise"],
        default: "basic"
    },

    allowedApps: {
        type: [String],
        default: []
    },

    isActive: {
        type: Boolean,
        default: true
    }

}, { timestamps: true });

export default mongoose.model("Company", companySchema);