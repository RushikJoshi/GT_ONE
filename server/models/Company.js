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
      lowercase: true,
      trim: true
    },
    companyEmail: {
      type: String,
      default: null,
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
    organizationId: {
      type: String,
      default: null,
      trim: true
    },
    databaseName: {
      type: String,
      default: null,
      trim: true
    },
    apiKey: {
      type: String,
      default: null,
      trim: true
    },
    phone: {
      type: String,
      default: null,
      trim: true
    },
    companyType: {
      type: String,
      default: null,
      trim: true
    },
    gstNumber: {
      type: String,
      default: null,
      trim: true
    },
    panNumber: {
      type: String,
      default: null,
      trim: true
    },
    registrationNo: {
      type: String,
      default: null,
      trim: true
    },
    country: {
      type: String,
      default: null,
      trim: true
    },
    state: {
      type: String,
      default: null,
      trim: true
    },
    district: {
      type: String,
      default: null,
      trim: true
    },
    officeAddress: {
      type: String,
      default: null,
      trim: true
    },
    subCompanyLimit: {
      type: Number,
      default: null
    },
    hrmsTenantId: {
      type: String,
      default: null,
      trim: true
    },
    tenantId: {
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
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("Company", companySchema);
