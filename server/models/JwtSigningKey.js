import mongoose from "mongoose";

const jwtSigningKeySchema = new mongoose.Schema(
  {
    kid: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    algorithm: {
      type: String,
      default: "RS256"
    },
    status: {
      type: String,
      enum: ["active", "retired"],
      default: "active",
      index: true
    },
    publicJwk: {
      type: Object,
      required: true
    },
    privatePem: {
      type: String,
      required: true,
      select: false
    },
    activatedAt: {
      type: Date,
      default: () => new Date()
    },
    retiredAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

export default mongoose.model("JwtSigningKey", jwtSigningKeySchema);
