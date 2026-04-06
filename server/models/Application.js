import mongoose from "mongoose";

const appSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },

    url: {
        type: String,
        required: true
    },

    icon: String,

    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active"
    }

}, { timestamps: true });

export default mongoose.model("Application", appSchema);