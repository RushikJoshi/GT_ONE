import mongoose from "mongoose";

const companyApplicationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    source: {
      type: String,
      enum: ["legacy_product_sync", "manual"],
      default: "legacy_product_sync"
    },
    legacyProductName: {
      type: String,
      default: null,
      trim: true
    },
    settings: {
      type: Object,
      default: () => ({})
    },
    provisioningState: {
      type: Object,
      default: () => ({})
    }
  },
  { timestamps: true }
);

companyApplicationSchema.index({ companyId: 1, applicationId: 1 }, { unique: true });

export default mongoose.model("CompanyApplication", companyApplicationSchema);
