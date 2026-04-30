import {
  activateAccountWithToken,
  listManagedAccounts,
  requestAccountAction,
  softDeleteManagedAccount
} from "../services/accountLifecycle.service.js";

const getRequestUserId = (req) => {
  const value = String(req.user?.id || req.user?.sub || "").trim();
  return /^[a-f\d]{24}$/i.test(value) ? value : null;
};

export const listAccounts = async (_req, res) => {
  try {
    const accounts = await listManagedAccounts();
    return res.json({
      success: true,
      accounts
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load accounts"
    });
  }
};

export const requestActivationReset = async (req, res) => {
  try {
    const { email, userId, purpose } = req.body || {};
    const result = await requestAccountAction({
      email,
      userId,
      purpose,
      req
    });

    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        reason: result.error.reason,
        message: result.error.message
      });
    }

    return res.json({
      success: true,
      purpose: result.purpose,
      message:
        result.purpose === "reset"
          ? "Password reset link issued successfully."
          : "Activation link issued successfully.",
      previewUrl: result.previewUrl || null,
      expiresAt: result.expiresAt
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.publicMessage || error.message || "Failed to issue account action link"
    });
  }
};

export const activateAccount = async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body || {};
    const result = await activateAccountWithToken({
      token,
      password,
      confirmPassword,
      req
    });

    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        reason: result.error.reason,
        message: result.error.message
      });
    }

    return res.json({
      success: true,
      message: "GT_ONE account activated successfully.",
      user: {
        id: String(result.user._id),
        email: result.user.email,
        name: result.user.name,
        accountStatus: result.user.accountStatus,
        authSource: result.user.authSource
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to activate account"
    });
  }
};

export const softDeleteAccount = async (req, res) => {
  try {
    const result = await softDeleteManagedAccount({
      userId: req.params.userId,
      deletedBy: getRequestUserId(req),
      req
    });

    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        reason: result.error.reason,
        message: result.error.message
      });
    }

    return res.json({
      success: true,
      message: "GT_ONE account soft deleted successfully.",
      account: {
        id: String(result.user._id),
        email: result.user.email,
        name: result.user.name,
        accountStatus: result.user.accountStatus,
        deletedAt: result.user.deletedAt
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to soft delete account"
    });
  }
};
