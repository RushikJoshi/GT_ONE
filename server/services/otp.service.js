import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import { sendLoginOtpEmail } from "./email.service.js";

const OTP_EXPIRY_MINUTES = Number(process.env.LOGIN_OTP_EXPIRY_MINUTES || 5);
const OTP_EXPIRY_SECONDS = Number(process.env.LOGIN_OTP_EXPIRY_SECONDS || OTP_EXPIRY_MINUTES * 60 || 60);
const OTP_EXPIRY_MS = OTP_EXPIRY_SECONDS * 1000;
const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.LOGIN_OTP_RESEND_COOLDOWN_SECONDS || 60);
const OTP_RESEND_COOLDOWN_MS = OTP_RESEND_COOLDOWN_SECONDS * 1000;
const OTP_MAX_ATTEMPTS = Number(process.env.LOGIN_OTP_MAX_ATTEMPTS || 5);

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeSource = (value) => String(value || "").trim().toLowerCase();
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getOtpSecret = () =>
  String(process.env.OTP_SECRET || process.env.JWT_SECRET || "gitakshmi-dev-otp-secret").trim();

const generateOtp = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

const hashOtp = ({ requestId, email, otp }) =>
  crypto
    .createHmac("sha256", getOtpSecret())
    .update(`${String(requestId).trim()}:${normalizeEmail(email)}:${String(otp).trim()}`)
    .digest("hex");

const compareHashes = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""), "hex");
  const rightBuffer = Buffer.from(String(right || ""), "hex");

  if (leftBuffer.length === 0 || rightBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const getMongoClient = () => mongoose.connection?.client || null;
const getSsoDb = () => mongoose.connection?.db || null;

const getHrmsOtpFallbackCollection = () => {
  const db = getSsoDb();
  if (!db) return null;
  return db.collection("hrms_login_otps");
};

const getSsoOtpFallbackCollection = () => {
  const db = getSsoDb();
  if (!db) return null;
  return db.collection("sso_login_otps");
};

const buildOtpState = ({ user, requestId, redirect, otpHash, ipAddress, userAgent, expiresAt }) => {
  const authSource = user?._source === "hrms_employee" ? "hrms_employee" : "sso_user";

  return {
    requestId,
    otpHash,
    authSource,
    redirect: String(redirect || "").trim(),
    status: "pending",
    verificationAttempts: 0,
    maxVerificationAttempts: OTP_MAX_ATTEMPTS,
    ipAddress: ipAddress ? String(ipAddress).trim() : null,
    userAgent: userAgent ? String(userAgent).trim() : null,
    tenantId: user?._tenantId ? String(user._tenantId) : (user?.tenantId ? String(user.tenantId) : null),
    companyId: user?._companyId ? String(user._companyId) : (user?.companyId ? String(user.companyId) : null),
    expiresAt,
    verifiedAt: null,
    invalidatedAt: null,
    lastAttemptAt: null,
    // Store a minimal snapshot so OTP verification can succeed even when the employee
    // record lives outside `company_<tenantId>.employees` (e.g. `test.users`).
    userSnapshot: user
      ? {
          _id: String(user._id || user.id || ""),
          id: String(user._id || user.id || ""),
          name: String(user.name || "").trim(),
          email: normalizeEmail(user.email),
          role: String(user.role || "").trim(),
          tenantId: user?._tenantId ? String(user._tenantId) : (user?.tenantId ? String(user.tenantId) : null),
          companyId: user?._companyId ? String(user._companyId) : (user?.companyId ? String(user.companyId) : null),
          permissions: Array.isArray(user?.permissions) ? user.permissions : [],
          _source: authSource
        }
      : null,
    createdAt: new Date()
  };
};

const getHrmsEmployeeCollection = (tenantId, collectionName = "employees") => {
  const client = getMongoClient();
  const normalizedTenantId = String(tenantId || "").trim();
  if (!client || !normalizedTenantId) {
    return null;
  }

  // If the tenantId already looks like a full DB name (e.g. company_xxx or hrm001), 
  // try using it directly before falling back to prepending 'company_'.
  if (normalizedTenantId.startsWith("company_") || /^[a-z0-9]{3,8}\d{3}$/i.test(normalizedTenantId)) {
    return client.db(normalizedTenantId).collection(collectionName);
  }

  return client.db(`company_${normalizedTenantId}`).collection(collectionName);
};

const discoverTenantIds = async () => {
  const client = getMongoClient();
  if (!client) {
    return [];
  }

  const centralDb = client.db("hrms");

  try {
    const admin = client.db("admin").admin();
    const dbs = await admin.listDatabases();
    return dbs.databases
      .map((db) => db.name)
      .filter((name) => name.startsWith("company_"))
      .map((name) => name.replace("company_", ""));
  } catch (_error) {
    const tenants = await centralDb.collection("tenants").find({}).toArray();
    return tenants.map((tenant) => String(tenant._id));
  }
};

const resolveCompanyIdFromTenant = async (tenantId) => {
  const client = getMongoClient();
  if (!client || !tenantId) {
    return String(tenantId || "").trim() || null;
  }

  try {
    const tenantRegistry = await client.db("hrms").collection("tenants").findOne({
      _id: mongoose.Types.ObjectId.isValid(tenantId)
        ? new mongoose.Types.ObjectId(tenantId)
        : tenantId
    });

    if (!tenantRegistry) {
      return String(tenantId).trim();
    }

    return String(
      tenantRegistry.externalCompanyId || tenantRegistry.companyId || tenantRegistry._id || tenantId
    ).trim();
  } catch (_error) {
    return String(tenantId).trim();
  }
};

const persistSsoOtpState = async ({ userId, otpState }) => {
  if (otpState) {
    return User.collection.updateOne({ _id: userId }, { $set: { loginOtp: otpState } });
  }

  return User.collection.updateOne({ _id: userId }, { $unset: { loginOtp: "" } });
};

const persistHrmsEmployeeOtpState = async ({ employeeId, tenantId, otpState }) => {
  const candidateCollections = ["employees", "Employees", "users", "Users"];
  const normalizedTenantId = String(tenantId || "").trim();

  for (const collName of candidateCollections) {
    const collection = getHrmsEmployeeCollection(normalizedTenantId, collName);
    if (!collection) continue;

    try {
      const res = await collection.updateOne({ _id: employeeId }, { $set: { loginOtp: otpState } });
      if (res && res.matchedCount > 0) {
        return res;
      }
    } catch (_err) {
      continue;
    }
  }

  // If we couldn't find/update in any collection, return a mock result with matchedCount 0 
  // to trigger fallback to central record storage in the caller.
  return { matchedCount: 0 };
};

const persistHrmsOtpFallbackState = async ({ email, requestId, otpState }) => {
  const collection = getHrmsOtpFallbackCollection();
  if (!collection) {
    throw new Error("HRMS OTP fallback collection is unavailable");
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !requestId) {
    throw new Error("email and requestId are required");
  }

  if (!otpState) {
    await collection.deleteOne({ email: normalizedEmail, requestId: String(requestId).trim() });
    return;
  }

  await collection.updateOne(
    { email: normalizedEmail, requestId: String(requestId).trim() },
    {
      $set: {
        email: normalizedEmail,
        requestId: String(requestId).trim(),
        otpState,
        updatedAt: new Date()
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );
};

const persistSsoOtpFallbackState = async ({ email, requestId, otpState }) => {
  const collection = getSsoOtpFallbackCollection();
  if (!collection) {
    throw new Error("SSO OTP fallback collection is unavailable");
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !requestId) {
    throw new Error("email and requestId are required");
  }

  if (!otpState) {
    await collection.deleteOne({ email: normalizedEmail, requestId: String(requestId).trim() });
    return;
  }

  await collection.updateOne(
    { email: normalizedEmail, requestId: String(requestId).trim() },
    {
      $set: {
        email: normalizedEmail,
        requestId: String(requestId).trim(),
        otpState,
        updatedAt: new Date()
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );
};

const buildSsoUserAdapter = (userDoc) => ({
  email: normalizeEmail(userDoc?.email),
  otpState: userDoc?.loginOtp || null,
  persist: async (nextOtpState) => persistSsoOtpState({ userId: userDoc._id, otpState: nextOtpState }),
  buildUser: async () => ({
    _id: userDoc._id,
    id: String(userDoc._id),
    name: String(userDoc.name || "").trim(),
    email: normalizeEmail(userDoc.email),
    role: String(userDoc.role || "").trim(),
    companyId: userDoc.companyId ? String(userDoc.companyId) : null,
    tenantId: userDoc.tenantId ? String(userDoc.tenantId) : null,
    permissions: Array.isArray(userDoc.permissions) ? userDoc.permissions : [],
    _source: "sso_user"
  })
});

const buildSsoOtpFallbackAdapter = ({ email, requestId, otpState }) => ({
  email: normalizeEmail(email),
  otpState: otpState || null,
  persist: async (nextOtpState) => {
    const nextRequestId = String(nextOtpState?.requestId || requestId).trim();
    await persistSsoOtpFallbackState({
      email,
      requestId: nextRequestId,
      otpState: nextOtpState
    });
    if (nextRequestId !== String(requestId).trim()) {
      await persistSsoOtpFallbackState({
        email,
        requestId,
        otpState: null
      });
    }

    const fallbackUserId = otpState?.userSnapshot?._id || nextOtpState?.userSnapshot?._id || null;
    if (fallbackUserId) {
      try {
        await persistSsoOtpState({
          userId: fallbackUserId,
          otpState: nextOtpState
        });
      } catch (_error) {
        // Keep fallback collection as the source of truth for OTP verification.
      }
    }
  },
  buildUser: async () => {
    const snapshot = otpState?.userSnapshot || null;
    if (snapshot && snapshot.email) {
      return {
        _id: snapshot._id,
        id: snapshot.id,
        name: snapshot.name,
        email: snapshot.email,
        role: String(snapshot.role || "employee").trim().toLowerCase(),
        companyId: snapshot.companyId || null,
        tenantId: snapshot.tenantId || null,
        permissions: Array.isArray(snapshot.permissions) ? snapshot.permissions : [],
        _source: "sso_user"
      };
    }

    const ssoUserDoc = await User.findOne({ email: normalizeEmail(email) }).lean();
    if (ssoUserDoc) {
      return {
        _id: ssoUserDoc._id,
        id: String(ssoUserDoc._id),
        name: String(ssoUserDoc.name || "").trim(),
        email: normalizeEmail(ssoUserDoc.email),
        role: String(ssoUserDoc.role || "").trim(),
        companyId: ssoUserDoc.companyId ? String(ssoUserDoc.companyId) : null,
        tenantId: ssoUserDoc.tenantId ? String(ssoUserDoc.tenantId) : null,
        permissions: Array.isArray(ssoUserDoc.permissions) ? ssoUserDoc.permissions : [],
        _source: "sso_user"
      };
    }

    return {
      _id: requestId,
      id: String(requestId),
      name: normalizeEmail(email).split("@")[0],
      email: normalizeEmail(email),
      role: "employee",
      companyId: null,
      tenantId: null,
      permissions: [],
      _source: "sso_user"
    };
  }
});

const buildVirtualHrmsUser = ({ employee, tenantId, companyId }) => {
  const firstName = String(employee?.firstName || "").trim();
  const lastName = String(employee?.lastName || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || normalizeEmail(employee?.email).split("@")[0];

  return {
    _id: employee._id,
    id: String(employee._id),
    name: fullName,
    email: normalizeEmail(employee.email),
    role: String(employee.role || "employee").trim().toLowerCase(),
    companyId: mongoose.Types.ObjectId.isValid(String(companyId || ""))
      ? new mongoose.Types.ObjectId(String(companyId))
      : null,
    tenantId: mongoose.Types.ObjectId.isValid(String(tenantId || ""))
      ? new mongoose.Types.ObjectId(String(tenantId))
      : null,
    permissions: [],
    _source: "hrms_employee",
    _tenantId: String(tenantId || "").trim() || null,
    _companyId: String(companyId || "").trim() || null
  };
};

const buildHrmsEmployeeAdapter = ({ employeeDoc, tenantId }) => ({
  email: normalizeEmail(employeeDoc?.email),
  otpState: employeeDoc?.loginOtp || null,
  persist: async (nextOtpState) =>
    persistHrmsEmployeeOtpState({
      employeeId: employeeDoc._id,
      tenantId,
      otpState: nextOtpState
    }),
  buildUser: async () =>
    buildVirtualHrmsUser({
      employee: employeeDoc,
      tenantId,
      companyId: employeeDoc?.loginOtp?.companyId || (await resolveCompanyIdFromTenant(tenantId))
    })
});

const buildHrmsOtpFallbackAdapter = ({ email, requestId, otpState }) => ({
  email: normalizeEmail(email),
  otpState: otpState || null,
  persist: async (nextOtpState) => {
    const nextRequestId = String(nextOtpState?.requestId || requestId).trim();
    await persistHrmsOtpFallbackState({
      email,
      requestId: nextRequestId,
      otpState: nextOtpState
    });
    if (nextRequestId !== String(requestId).trim()) {
      await persistHrmsOtpFallbackState({
        email,
        requestId,
        otpState: null
      });
    }
  },
  buildUser: async () => {
    const snapshot = otpState?.userSnapshot || null;
    if (snapshot && snapshot.email) {
      return {
        _id: snapshot._id,
        id: snapshot.id,
        name: snapshot.name,
        email: snapshot.email,
        role: String(snapshot.role || "employee").trim().toLowerCase(),
        permissions: [],
        _source: "hrms_employee",
        _tenantId: snapshot.tenantId || null,
        _companyId: snapshot.companyId || null
      };
    }
    return {
      _id: requestId,
      id: String(requestId),
      name: normalizeEmail(email).split("@")[0],
      email: normalizeEmail(email),
      role: "employee",
      permissions: [],
      _source: "hrms_employee",
      _tenantId: null,
      _companyId: null
    };
  }
});

const findSsoUserOtpRecord = async ({ email, requestId }) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedRequestId = String(requestId || "").trim();
  const userDoc = await User.collection.findOne(
    {
      email: normalizedEmail,
      "loginOtp.requestId": normalizedRequestId
    },
    {
      projection: {
        _id: 1,
        name: 1,
        email: 1,
        role: 1,
        companyId: 1,
        tenantId: 1,
        permissions: 1,
        loginOtp: 1
      }
    }
  );

  if (!userDoc?.loginOtp) {
    return null;
  }

  return buildSsoUserAdapter(userDoc);
};

const findSsoOtpFallbackRecord = async ({ email, requestId }) => {
  const collection = getSsoOtpFallbackCollection();
  if (!collection) return null;

  const normalizedEmail = normalizeEmail(email);
  const normalizedRequestId = String(requestId || "").trim();
  if (!normalizedEmail || !normalizedRequestId) return null;

  const doc = await collection.findOne(
    { email: normalizedEmail, requestId: normalizedRequestId },
    { projection: { otpState: 1, email: 1, requestId: 1 } }
  );
  if (!doc?.otpState) return null;

  return buildSsoOtpFallbackAdapter({
    email: normalizedEmail,
    requestId: normalizedRequestId,
    otpState: doc.otpState
  });
};

const findHrmsEmployeeOtpRecord = async ({ email, requestId, tenantId }) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedRequestId = String(requestId || "").trim();
  const tenantIds = tenantId ? [String(tenantId).trim()] : await discoverTenantIds();
  const candidateCollections = ["employees", "Employees", "users", "Users"];

  for (const currentTenantId of tenantIds) {
    if (!currentTenantId) {
      continue;
    }

    for (const collName of candidateCollections) {
      const collection = getHrmsEmployeeCollection(currentTenantId, collName);
      if (!collection) {
        continue;
      }

      const employeeDoc = await collection.findOne(
        {
          email: {
            $regex: new RegExp(`^${escapeRegex(normalizedEmail)}$`, "i")
          },
          "loginOtp.requestId": normalizedRequestId
        },
        {
          projection: {
            _id: 1,
            firstName: 1,
            lastName: 1,
            email: 1,
            role: 1,
            loginOtp: 1
          }
        }
      );

      if (!employeeDoc?.loginOtp) {
        continue;
      }

      if (String(employeeDoc.loginOtp.requestId || "").trim() !== normalizedRequestId) {
        continue;
      }

      return buildHrmsEmployeeAdapter({
        employeeDoc,
        tenantId: currentTenantId
      });
    }
  }

  return null;
};

const findHrmsOtpFallbackRecord = async ({ email, requestId }) => {
  const collection = getHrmsOtpFallbackCollection();
  if (!collection) return null;

  const normalizedEmail = normalizeEmail(email);
  const normalizedRequestId = String(requestId || "").trim();
  if (!normalizedEmail || !normalizedRequestId) return null;

  const doc = await collection.findOne(
    { email: normalizedEmail, requestId: normalizedRequestId },
    { projection: { otpState: 1, email: 1, requestId: 1 } }
  );
  if (!doc?.otpState) return null;

  return buildHrmsOtpFallbackAdapter({
    email: normalizedEmail,
    requestId: normalizedRequestId,
    otpState: doc.otpState
  });
};

const findOtpRecord = async ({ email, requestId, source, tenantId }) => {
  const normalizedSource = normalizeSource(source);

  if (normalizedSource === "sso_user") {
    return (
      (await findSsoOtpFallbackRecord({ email, requestId })) ||
      (await findSsoUserOtpRecord({ email, requestId }))
    );
  }

  if (normalizedSource === "hrms_employee") {
    return (
      (await findHrmsEmployeeOtpRecord({ email, requestId, tenantId })) ||
      (await findHrmsOtpFallbackRecord({ email, requestId }))
    );
  }

  return (
    (await findSsoOtpFallbackRecord({ email, requestId })) ||
    (await findSsoUserOtpRecord({ email, requestId })) ||
    (await findHrmsEmployeeOtpRecord({ email, requestId, tenantId })) ||
    (await findHrmsOtpFallbackRecord({ email, requestId }))
  );
};

export const createLoginOtpChallenge = async ({
  user,
  redirect,
  ipAddress,
  userAgent,
  allowDevPreview = false
}) => {
  const email = normalizeEmail(user?.email);
  if (!email) {
    throw new Error("User email is required to create OTP");
  }

  const requestId = crypto.randomUUID();
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  const otpState = buildOtpState({
    user,
    requestId,
    redirect,
    otpHash: hashOtp({ requestId, email, otp }),
    ipAddress,
    userAgent,
    expiresAt
  });

  const authSource = otpState.authSource;
  const tenantId = otpState.tenantId || null;

  if (authSource === "hrms_employee") {
    // Prefer writing onto tenant employee record when available.
    // Fallback to central SSO collection for HRMS employees that live outside `company_<tenantId>.employees`
    // (e.g. `test.users`), so OTP verify can still succeed.
    try {
      const writeRes = await persistHrmsEmployeeOtpState({
        employeeId: user._id,
        tenantId,
        otpState
      });
      // If the tenant collection exists but the document isn't there, updateOne succeeds with matchedCount=0.
      // In that case, also persist to fallback collection.
      if (!writeRes || Number(writeRes.matchedCount || 0) === 0) {
        await persistHrmsOtpFallbackState({
          email,
          requestId,
          otpState
        });
      }
    } catch (_error) {
      await persistHrmsOtpFallbackState({
        email,
        requestId,
        otpState
      });
    }
  } else {
    await persistSsoOtpFallbackState({
      email,
      requestId,
      otpState
    });
    try {
      await persistSsoOtpState({
        userId: user._id,
        otpState
      });
    } catch (_error) {
      // Keep fallback collection as the primary OTP store for SSO users.
    }
  }

  try {
    const delivery = await sendLoginOtpEmail({
      to: email,
      otp,
      expiresInMinutes: Math.max(1, Math.ceil(OTP_EXPIRY_SECONDS / 60)),
      allowPreview: allowDevPreview
    });

    return {
      requestId,
      email,
      source: authSource,
      tenantId,
      deliveryMode: delivery.deliveryMode,
      devOtpPreview: delivery.previewOtp,
      expiresInSeconds: OTP_EXPIRY_SECONDS,
      expiresAt: expiresAt.toISOString()
    };
  } catch (error) {
    if (authSource === "hrms_employee") {
      try {
        const writeRes = await persistHrmsEmployeeOtpState({
          employeeId: user._id,
          tenantId,
          otpState: null
        });
        if (!writeRes || Number(writeRes.matchedCount || 0) === 0) {
          await persistHrmsOtpFallbackState({
            email,
            requestId,
            otpState: null
          });
        }
      } catch (_err) {
        await persistHrmsOtpFallbackState({
          email,
          requestId,
          otpState: null
        });
      }
    } else {
      try {
        await persistSsoOtpState({
          userId: user._id,
          otpState: null
        });
      } finally {
        await persistSsoOtpFallbackState({
          email,
          requestId,
          otpState: null
        });
      }
    }

    throw error;
  }
};

export const resendLoginOtpChallenge = async ({
  email,
  requestId,
  source,
  tenantId,
  ipAddress,
  userAgent,
  allowDevPreview = false
}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedRequestId = String(requestId || "").trim();

  if (!normalizedEmail || !normalizedRequestId) {
    return {
      error: {
        status: 400,
        reason: "missing_fields",
        message: "Email and otpRequestId are required"
      }
    };
  }

  const record = await findOtpRecord({
    email: normalizedEmail,
    requestId: normalizedRequestId,
    source,
    tenantId
  });

  if (!record?.otpState) {
    return {
      error: {
        status: 400,
        reason: "request_invalid",
        message: "Invalid or expired OTP request"
      }
    };
  }

  const currentOtpState = record.otpState;
  if (currentOtpState.status === "verified") {
    return {
      error: {
        status: 400,
        reason: "request_consumed",
        message: "OTP already verified. Please login again."
      }
    };
  }

  const createdAtMs = new Date(currentOtpState.createdAt || Date.now()).getTime();
  const elapsedMs = Date.now() - createdAtMs;
  if (elapsedMs < OTP_RESEND_COOLDOWN_MS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsedMs) / 1000));
    return {
      error: {
        status: 429,
        reason: "resend_cooldown",
        message: `Please wait ${retryAfterSeconds}s before requesting a new OTP`,
        retryAfterSeconds
      }
    };
  }

  const nextRequestId = crypto.randomUUID();
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  const nextOtpState = {
    ...currentOtpState,
    requestId: nextRequestId,
    otpHash: hashOtp({ requestId: nextRequestId, email: record.email, otp }),
    status: "pending",
    verificationAttempts: 0,
    ipAddress: ipAddress ? String(ipAddress).trim() : currentOtpState.ipAddress || null,
    userAgent: userAgent ? String(userAgent).trim() : currentOtpState.userAgent || null,
    expiresAt,
    verifiedAt: null,
    invalidatedAt: null,
    lastAttemptAt: null,
    createdAt: new Date()
  };

  await record.persist(nextOtpState);

  try {
    const delivery = await sendLoginOtpEmail({
      to: record.email,
      otp,
      expiresInMinutes: Math.max(1, Math.ceil(OTP_EXPIRY_SECONDS / 60)),
      allowPreview: allowDevPreview
    });

    return {
      requestId: nextRequestId,
      email: record.email,
      source: nextOtpState.authSource,
      tenantId: nextOtpState.tenantId || null,
      deliveryMode: delivery.deliveryMode,
      devOtpPreview: delivery.previewOtp,
      expiresInSeconds: OTP_EXPIRY_SECONDS,
      expiresAt: expiresAt.toISOString()
    };
  } catch (error) {
    await record.persist({
      ...nextOtpState,
      status: "expired",
      invalidatedAt: new Date(),
      otpHash: null
    });
    throw error;
  }
};

export const verifyLoginOtpChallenge = async ({
  email,
  requestId,
  otp,
  source,
  tenantId
}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedRequestId = String(requestId || "").trim();
  const normalizedOtp = String(otp || "").trim();
  console.log("[OTP] verifyLoginOtpChallenge params:", { normalizedEmail, normalizedRequestId, normalizedOtp, source, tenantId });

  if (!normalizedEmail || !normalizedRequestId || !normalizedOtp) {
    console.warn("[OTP] Validation failed: missing email, requestId, or otp");
    return {
      error: {
        status: 400,
        reason: "missing_fields",
        message: "Email, OTP, and otpRequestId are required"
      }
    };
  }

  const record = await findOtpRecord({
    email: normalizedEmail,
    requestId: normalizedRequestId,
    source,
    tenantId
  });

  if (!record?.otpState) {
    console.warn(`[OTP] Record not found for email=${normalizedEmail} requestId=${normalizedRequestId} source=${source} tenantId=${tenantId}`);
    return {
      error: {
        status: 400,
        reason: "request_invalid",
        message: "Invalid or expired OTP request"
      }
    };
  }

  if (record.otpState.status !== "pending") {
    console.warn(`[OTP] Request status is ${record.otpState.status} (expected pending) for email=${normalizedEmail}`);
    return {
      error: {
        status: 400,
        reason: "request_invalid",
        message: "Invalid or expired OTP request"
      }
    };
  }

  const currentOtpState = record.otpState;
  const now = new Date();

  if (new Date(currentOtpState.expiresAt).getTime() <= Date.now()) {
    await record.persist({
      ...currentOtpState,
      status: "expired",
      invalidatedAt: now,
      lastAttemptAt: now,
      otpHash: null
    });

    return {
      error: {
        status: 400,
        reason: "otp_expired",
        message: "OTP has expired"
      }
    };
  }

  if (Number(currentOtpState.verificationAttempts || 0) >= Number(currentOtpState.maxVerificationAttempts || OTP_MAX_ATTEMPTS)) {
    await record.persist({
      ...currentOtpState,
      status: "locked",
      invalidatedAt: now,
      lastAttemptAt: now,
      otpHash: null
    });

    return {
      error: {
        status: 429,
        reason: "otp_locked",
        message: "OTP verification is locked. Please request a new OTP."
      }
    };
  }

  const expectedOtpHash = hashOtp({
    requestId: normalizedRequestId,
    email: normalizedEmail,
    otp: normalizedOtp
  });


  if (!compareHashes(expectedOtpHash, currentOtpState.otpHash)) {
    const nextAttempts = Number(currentOtpState.verificationAttempts || 0) + 1;
    const nextStatus =
      nextAttempts >= Number(currentOtpState.maxVerificationAttempts || OTP_MAX_ATTEMPTS)
        ? "locked"
        : "pending";

    await record.persist({
      ...currentOtpState,
      verificationAttempts: nextAttempts,
      status: nextStatus,
      lastAttemptAt: now,
      invalidatedAt: nextStatus === "locked" ? now : currentOtpState.invalidatedAt || null
    });

    return {
      error: {
        status: nextStatus === "locked" ? 429 : 400,
        reason: nextStatus === "locked" ? "otp_locked" : "otp_invalid",
        message:
          nextStatus === "locked"
            ? "Too many invalid OTP attempts. Please request a new OTP."
            : "Invalid OTP"
      }
    };
  }

  await record.persist({
    ...currentOtpState,
    status: "verified",
    verifiedAt: now,
    lastAttemptAt: now,
    otpHash: null
  });

  return {
    user: await record.buildUser(),
    redirect: currentOtpState.redirect,
    email: record.email
  };
};
