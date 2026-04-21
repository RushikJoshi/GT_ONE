import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    // Backward-compatible: some environments already have a unique index on tokenHash.
    // We persist a deterministic hash of the refresh JWT to satisfy that index.
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    jti: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    revokedAt: {
      type: Date,
      default: null
    },
    createdByIp: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    },
    expiresAt: {
      type: Date,
      required: true,
      index: false
    }
  },
  { timestamps: true }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("RefreshToken", refreshTokenSchema);

