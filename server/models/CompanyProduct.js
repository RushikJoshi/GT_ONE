import mongoose from "mongoose";

const companyProductSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    enabledModules: {
      type: Object,
      default: {}
    },
    modules: {
      type: [String],
      default: []
    }
  },
  { timestamps: true }
);

companyProductSchema.index({ companyId: 1, productId: 1 }, { unique: true });

export default mongoose.model("CompanyProduct", companyProductSchema);
