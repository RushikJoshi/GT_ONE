import mongoose from "mongoose";

const ssoSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    jti: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    scope: {
      type: String,
      enum: ["portal"],
      default: "portal"
    },
    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
      index: true
    },
    refreshJti: {
      type: String,
      default: null,
      index: true
    },
    createdByIp: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    },
    lastSeenAt: {
      type: Date,
      default: null
    },
    revokedAt: {
      type: Date,
      default: null
    },
    revokedReason: {
      type: String,
      default: null
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  { timestamps: true }
);

ssoSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("SsoSession", ssoSessionSchema);
