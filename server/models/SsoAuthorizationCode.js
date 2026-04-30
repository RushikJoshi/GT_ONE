import mongoose from "mongoose";

const ssoAuthorizationCodeSchema = new mongoose.Schema(
  {
    codeHash: {
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
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true
    },
    appKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    redirectUri: {
      type: String,
      required: true,
      trim: true
    },
    claimsSnapshot: {
      type: Object,
      default: () => ({})
    },
    consumedAt: {
      type: Date,
      default: null,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  { timestamps: true }
);

ssoAuthorizationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("SsoAuthorizationCode", ssoAuthorizationCodeSchema);
