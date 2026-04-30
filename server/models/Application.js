import mongoose from "mongoose";

const normalizeUrlArray = (values) =>
  [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];

const applicationSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: {
      type: String,
      default: null,
      trim: true
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true
    },
    type: {
      type: String,
      enum: ["first_party", "external"],
      default: "first_party"
    },
    category: {
      type: String,
      default: "business",
      trim: true
    },
    baseUrl: {
      type: String,
      required: true,
      trim: true
    },
    loginUrl: {
      type: String,
      default: null,
      trim: true
    },
    logoutUrl: {
      type: String,
      default: null,
      trim: true
    },
    redirectUris: {
      type: [String],
      default: [],
      set: normalizeUrlArray
    },
    audience: {
      type: String,
      default: null,
      trim: true
    },
    clientAuthMethod: {
      type: String,
      enum: ["none", "client_secret_post"],
      default: "client_secret_post"
    },
    clientSecretHash: {
      type: String,
      default: null
    },
    clientSecretLastRotatedAt: {
      type: Date,
      default: null
    },
    icon: {
      type: String,
      default: null,
      trim: true
    },
    supportsProvisioning: {
      type: Boolean,
      default: false
    },
    provisioningAdapter: {
      type: String,
      default: null,
      trim: true
    },
    legacyProductName: {
      type: String,
      default: null,
      trim: true
    },
    claimMapping: {
      type: Object,
      default: () => ({})
    },
    metadata: {
      type: Object,
      default: () => ({})
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

export default mongoose.model("Application", applicationSchema);
