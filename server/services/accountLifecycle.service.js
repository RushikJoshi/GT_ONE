import crypto from "crypto";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import ActivationToken from "../models/ActivationToken.js";
import RefreshToken from "../models/RefreshToken.js";
import SsoSession from "../models/SsoSession.js";
import { sendAccountActionEmail } from "./email.service.js";
import { recordAuditEvent } from "./audit.service.js";

const ACTION_TOKEN_TTL_MINUTES = Number(process.env.ACCOUNT_ACTION_TTL_MINUTES || 30);

const trim = (value) => String(value || "").trim();
const normalizeEmail = (value) => trim(value).toLowerCase();
const notDeletedUserQuery = (filter = {}) => ({
  $and: [
    filter,
    {
      $or: [
        { deletedAt: { $exists: false } },
        { deletedAt: null }
      ]
    }
  ]
});

const normalizeObjectIdString = (value) => {
  const normalized = String(value || "").trim();
  return /^[a-f\d]{24}$/i.test(normalized) ? normalized : null;
};

const hashActionToken = (value) =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex");

const getFrontendBaseUrl = () => {
  const configured = trim(
    process.env.ACCOUNT_ACTION_FRONTEND_URL ||
    process.env.SSO_FRONTEND_URL ||
    process.env.FRONTEND_URL
  );
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  return "http://localhost:5174";
};

const buildAccountActionUrl = ({ token, purpose, appKey = null }) => {
  const url = new URL("/activate-account", getFrontendBaseUrl());
  url.searchParams.set("token", token);
  url.searchParams.set("purpose", purpose);
  if (appKey) {
    url.searchParams.set("app", appKey);
  }
  return url.toString();
};

const getPasswordValidationError = (password, confirmPassword) => {
  const normalizedPassword = String(password || "");
  if (normalizedPassword.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (normalizedPassword !== String(confirmPassword || "")) {
    return "Password and confirm password must match.";
  }
  return null;
};

export const listManagedAccounts = async () => {
  const users = await User.find(notDeletedUserQuery())
    .populate("companyId", "name code email")
    .sort({ createdAt: -1 })
    .lean();

  return users.map((user) => ({
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    authSource: user.authSource,
    accountStatus: user.accountStatus || "active",
    allowDirectLogin: user.allowDirectLogin !== false,
    importedFromAppKey: user.importedFromAppKey || null,
    product: user.product || null,
    company: user.companyId
      ? {
          id: String(user.companyId._id || user.companyId),
          name: user.companyId.name || null,
          code: user.companyId.code || null,
          email: user.companyId.email || null
        }
      : null,
    activatedAt: user.activatedAt || null,
    lastActivationRequestedAt: user.lastActivationRequestedAt || null,
    lastSuccessfulLoginAt: user.lastSuccessfulLoginAt || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  }));
};

export const issueAccountActionForUser = async ({
  user,
  purpose = "activation",
  appKey = null,
  req = null
}) => {
  if (!user) {
    throw new Error("user_required");
  }

  const normalizedPurpose = String(purpose || "activation").trim().toLowerCase();
  const rawToken = crypto.randomBytes(48).toString("base64url");
  const tokenHash = hashActionToken(rawToken);
  const expiresAt = new Date(Date.now() + ACTION_TOKEN_TTL_MINUTES * 60 * 1000);

  await ActivationToken.updateMany(
    {
      userId: user._id,
      purpose: normalizedPurpose,
      consumedAt: null
    },
    {
      $set: { consumedAt: new Date() }
    }
  );

  await ActivationToken.create({
    userId: user._id,
    tokenHash,
    purpose: normalizedPurpose,
    email: normalizeEmail(user.email),
    appKey: trim(appKey || user.importedFromAppKey || user.product).toLowerCase() || null,
    requestedByIp: String(req?.ip || req?.headers?.["x-forwarded-for"] || "").trim() || null,
    userAgent: String(req?.headers?.["user-agent"] || "").trim() || null,
    expiresAt
  });

  const actionUrl = buildAccountActionUrl({
    token: rawToken,
    purpose: normalizedPurpose,
    appKey: trim(appKey || user.importedFromAppKey || user.product).toLowerCase() || null
  });

  user.lastActivationRequestedAt = new Date();
  await user.save();

  const mailResult = await sendAccountActionEmail({
    to: user.email,
    actionUrl,
    expiresInMinutes: ACTION_TOKEN_TTL_MINUTES,
    purpose: normalizedPurpose,
    allowPreview: String(process.env.NODE_ENV || "").toLowerCase() !== "production"
  });

  await recordAuditEvent({
    event: normalizedPurpose === "reset" ? "account_reset_requested" : "account_activation_requested",
    userId: user._id,
    email: user.email,
    appKey: trim(appKey || user.importedFromAppKey || user.product).toLowerCase() || null,
    ipAddress: String(req?.ip || req?.headers?.["x-forwarded-for"] || "").trim() || null,
    metadata: {
      deliveryMode: mailResult.deliveryMode,
      expiresAt
    }
  });

  return {
    actionUrl,
    expiresAt,
    deliveryMode: mailResult.deliveryMode,
    previewUrl: mailResult.previewUrl || null
  };
};

export const requestAccountAction = async ({
  email = null,
  userId = null,
  purpose = "activation",
  req = null
}) => {
  const user = userId
    ? await User.findOne(notDeletedUserQuery({ _id: userId }))
    : await User.findOne(notDeletedUserQuery({ email: normalizeEmail(email) }));

  if (!user) {
    return {
      error: {
        status: 404,
        reason: "user_not_found",
        message: "No GT_ONE user found for that email."
      }
    };
  }

  const normalizedPurpose = String(purpose || "activation").trim().toLowerCase();
  const effectivePurpose =
    normalizedPurpose === "reset" || user.accountStatus === "active"
      ? "reset"
      : "activation";

  const issued = await issueAccountActionForUser({
    user,
    purpose: effectivePurpose,
    appKey: user.importedFromAppKey || user.product || null,
    req
  });

  return {
    user,
    purpose: effectivePurpose,
    ...issued
  };
};

export const activateAccountWithToken = async ({
  token,
  password,
  confirmPassword,
  req = null
}) => {
  const passwordError = getPasswordValidationError(password, confirmPassword);
  if (passwordError) {
    return {
      error: {
        status: 400,
        reason: "invalid_password",
        message: passwordError
      }
    };
  }

  const tokenHash = hashActionToken(token);
  const actionToken = await ActivationToken.findOne({ tokenHash });
  if (!actionToken) {
    return {
      error: {
        status: 404,
        reason: "invalid_token",
        message: "This account link is invalid."
      }
    };
  }

  if (actionToken.consumedAt) {
    return {
      error: {
        status: 409,
        reason: "token_already_used",
        message: "This account link has already been used."
      }
    };
  }

  if (new Date(actionToken.expiresAt).getTime() <= Date.now()) {
    return {
      error: {
        status: 410,
        reason: "token_expired",
        message: "This account link has expired."
      }
    };
  }

  const user = await User.findOne(notDeletedUserQuery({ _id: actionToken.userId }));
  if (!user) {
    return {
      error: {
        status: 404,
        reason: "user_not_found",
        message: "The GT_ONE user for this link no longer exists."
      }
    };
  }

  user.password = await bcrypt.hash(String(password), 12);
  user.authSource = "local";
  user.allowDirectLogin = true;
  user.accountStatus = "active";
  user.activatedAt = new Date();
  await user.save();

  actionToken.consumedAt = new Date();
  await actionToken.save();

  await recordAuditEvent({
    event: "account_activated",
    userId: user._id,
    email: user.email,
    appKey: actionToken.appKey || null,
    ipAddress: String(req?.ip || req?.headers?.["x-forwarded-for"] || "").trim() || null,
    metadata: {
      purpose: actionToken.purpose
    }
  });

  return {
    user
  };
};

export const softDeleteManagedAccount = async ({ userId, deletedBy = null, req = null }) => {
  const normalizedUserId = normalizeObjectIdString(userId);
  if (!normalizedUserId) {
    return {
      error: {
        status: 400,
        reason: "invalid_user_id",
        message: "Valid userId is required."
      }
    };
  }

  const normalizedDeletedBy = normalizeObjectIdString(deletedBy);
  if (normalizedDeletedBy && normalizedDeletedBy === normalizedUserId) {
    return {
      error: {
        status: 400,
        reason: "self_delete_blocked",
        message: "You cannot soft delete your own active admin account."
      }
    };
  }

  const user = await User.findOne(notDeletedUserQuery({ _id: normalizedUserId }));
  if (!user) {
    return {
      error: {
        status: 404,
        reason: "user_not_found",
        message: "GT_ONE account not found."
      }
    };
  }

  const deletedAt = new Date();
  user.accountStatus = "disabled";
  user.allowDirectLogin = false;
  user.deletedAt = deletedAt;
  user.deletedBy = normalizedDeletedBy;
  await user.save();

  await Promise.all([
    ActivationToken.updateMany(
      { userId: user._id, consumedAt: null },
      { $set: { consumedAt: deletedAt } }
    ),
    SsoSession.updateMany(
      { userId: user._id, status: "active" },
      {
        $set: {
          status: "revoked",
          revokedAt: deletedAt,
          revokedReason: "account_soft_deleted"
        }
      }
    ),
    RefreshToken.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: deletedAt } }
    )
  ]);

  await recordAuditEvent({
    event: "account_soft_deleted",
    userId: user._id,
    email: user.email,
    appKey: user.importedFromAppKey || user.product || null,
    ipAddress: String(req?.ip || req?.headers?.["x-forwarded-for"] || "").trim() || null,
    metadata: {
      deletedBy: normalizedDeletedBy
    }
  });

  return { user };
};
