import mongoose from "mongoose";

const activationTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    purpose: {
      type: String,
      enum: ["activation", "reset"],
      required: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    appKey: {
      type: String,
      default: null,
      lowercase: true,
      trim: true
    },
    consumedAt: {
      type: Date,
      default: null,
      index: true
    },
    requestedByIp: {
      type: String,
      default: null
    },
    userAgent: {
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

activationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("ActivationToken", activationTokenSchema);
