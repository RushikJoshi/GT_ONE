import mongoose from "mongoose";
import {
  createDefaultHrmsEnabledModules,
  HRMS_MODULE_KEYS
} from "../constants/hrmsModules.js";

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    code: {
      type: String,
      default: null,
      trim: true
    },
    companyCode: {
      type: String,
      default: null,
      trim: true
    },
    hrmsTenantId: {
      type: String,
      default: null,
      trim: true
    },
    hrmsAdminUserId: {
      type: String,
      default: null,
      trim: true
    },
    hrmsEnabledModules: {
      type: Object,
      default: () => createDefaultHrmsEnabledModules()
    },
    hrmsModules: {
      type: [String],
      default: () => [...HRMS_MODULE_KEYS]
    }
  },
  { timestamps: true }
);

export default mongoose.model("Company", companySchema);
