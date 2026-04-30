import mongoose from "mongoose";

const gtOneIdentityLinkSchema = new mongoose.Schema(
  {
    appKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    gtOneUserId: {
      type: String,
      required: true,
      trim: true
    },
    gtOneCompanyId: {
      type: String,
      default: null,
      trim: true
    },
    localUserId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User"
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    lastLoginAt: {
      type: Date,
      default: Date.now
    },
    claimsSnapshot: {
      type: Object,
      default: () => ({})
    }
  },
  { timestamps: true }
);

gtOneIdentityLinkSchema.index({ appKey: 1, gtOneUserId: 1 }, { unique: true });
gtOneIdentityLinkSchema.index({ appKey: 1, localUserId: 1 }, { unique: true });

export default mongoose.model("GtOneIdentityLink", gtOneIdentityLinkSchema);
