import mongoose from "mongoose";
import { ROLE_VALUES, ROLES } from "../constants/roles.js";
import { PRODUCTS } from "../constants/products.js";

const userSchema = new mongoose.Schema(
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
    password: {
      type: String,
      required: true
    },
    /**
     * Primary product context for this user (used for product-locked routing).
     * Company-level entitlements are still resolved via CompanyProduct.
     */
    product: {
      type: String,
      enum: PRODUCTS,
      default: null
    },
    role: {
      type: String,
      enum: ROLE_VALUES,
      default: ROLES.EMPLOYEE
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null
    }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);

