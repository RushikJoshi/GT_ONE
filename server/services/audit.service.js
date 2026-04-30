import AuditEvent from "../models/AuditEvent.js";

const normalizeEmail = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
};

const normalizeAppKey = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
};

export const recordAuditEvent = async ({
  scope = "auth",
  event,
  userId = null,
  email = null,
  appKey = null,
  ipAddress = null,
  metadata = {}
} = {}) => {
  if (!event) return;

  try {
    await AuditEvent.create({
      scope,
      event,
      userId,
      email: normalizeEmail(email),
      appKey: normalizeAppKey(appKey),
      ipAddress: String(ipAddress || "").trim() || null,
      metadata: metadata && typeof metadata === "object" ? metadata : {}
    });
  } catch (error) {
    console.warn(`[AUDIT] Failed to record ${event}: ${error.message}`);
  }
};
