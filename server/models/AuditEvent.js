import mongoose from "mongoose";

const auditEventSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      default: "auth",
      index: true
    },
    event: {
      type: String,
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    email: {
      type: String,
      default: null,
      lowercase: true,
      trim: true
    },
    appKey: {
      type: String,
      default: null,
      lowercase: true,
      trim: true
    },
    ipAddress: {
      type: String,
      default: null
    },
    metadata: {
      type: Object,
      default: () => ({})
    }
  },
  { timestamps: true }
);

export default mongoose.model("AuditEvent", auditEventSchema);
