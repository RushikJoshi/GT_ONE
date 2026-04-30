import nodemailer from "nodemailer";

let cachedTransporter = null;
let cachedTransportKey = null;
let transportVerified = false;

const isProduction = () => String(process.env.NODE_ENV || "").toLowerCase() === "production";
const isTruthy = (value) => String(value || "").trim().toLowerCase() === "true";
const hasValue = (value) => Boolean(String(value || "").trim());
const isPlaceholderValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    !normalized ||
    normalized.includes("your_email") ||
    normalized.includes("your_new_app_password") ||
    normalized.includes("change_me") ||
    normalized.includes("replace_me")
  );
};
const hasCredentialValue = (value) => hasValue(value) && !isPlaceholderValue(value);

const hasSmtpConfig = () =>
  hasValue(process.env.SMTP_HOST) &&
  hasValue(process.env.SMTP_PORT) &&
  (
    (!hasValue(process.env.SMTP_USER) && !hasValue(process.env.SMTP_PASS)) ||
    (hasCredentialValue(process.env.SMTP_USER) && hasCredentialValue(process.env.SMTP_PASS))
  );

const hasGmailConfig = () =>
  hasCredentialValue(process.env.GMAIL_USER) &&
  hasCredentialValue(process.env.GMAIL_APP_PASSWORD);

const allowJsonPreviewTransport = () =>
  !isProduction() && isTruthy(process.env.ALLOW_DEV_JSON_EMAIL);

const allowDevOtpPreview = ({ force = false } = {}) => {
  if (force) return true;
  if (isProduction()) return false;
  const configured = String(process.env.ALLOW_DEV_OTP_IN_RESPONSE || "").trim().toLowerCase();
  if (!configured) return true;
  return configured === "true";
};

const createMailError = ({ message, publicMessage, code = "mail_delivery_failed", status = 503 }) => {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.publicMessage = publicMessage || "OTP email could not be sent";
  return error;
};

const getTransportDescriptor = () => {
  if (hasSmtpConfig()) {
    return { key: "smtp", type: "smtp" };
  }

  if (hasGmailConfig()) {
    return { key: "gmail", type: "gmail" };
  }

  if (allowJsonPreviewTransport()) {
    return { key: "json-preview", type: "json" };
  }

  return null;
};

const createTransport = (descriptor) => {
  if (descriptor.type === "smtp") {
    return nodemailer.createTransport({
      host: String(process.env.SMTP_HOST).trim(),
      port: Number(process.env.SMTP_PORT),
      secure: isTruthy(process.env.SMTP_SECURE),
      auth: hasValue(process.env.SMTP_USER)
        ? {
            user: String(process.env.SMTP_USER).trim(),
            pass: String(process.env.SMTP_PASS || "")
          }
        : undefined
    });
  }

  if (descriptor.type === "gmail") {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: String(process.env.GMAIL_USER).trim(),
        pass: String(process.env.GMAIL_APP_PASSWORD || "")
      }
    });
  }

  return nodemailer.createTransport({
    jsonTransport: true
  });
};

const getTransporter = () => {
  const descriptor = getTransportDescriptor();

  if (!descriptor) {
    throw createMailError({
      code: "mail_not_configured",
      status: 503,
      message: "Email transport is not configured",
      publicMessage:
        "OTP email is not configured on the server. Set SMTP or Gmail credentials in server/.env."
    });
  }

  if (!cachedTransporter || cachedTransportKey !== descriptor.key) {
    cachedTransporter = createTransport(descriptor);
    cachedTransportKey = descriptor.key;
    transportVerified = false;
  }

  return {
    descriptor,
    transporter: cachedTransporter
  };
};

const verifyTransportIfNeeded = async ({ transporter, descriptor }) => {
  if (transportVerified || descriptor.type === "json") {
    return;
  }

  try {
    await transporter.verify();
    transportVerified = true;
  } catch (error) {
    throw createMailError({
      code: "mail_delivery_failed",
      status: 502,
      message: `Email transport verification failed: ${error.message}`,
      publicMessage:
        "OTP email could not be sent. Please check the configured SMTP/Gmail credentials."
    });
  }
};

const getMailFrom = () =>
  String(
    process.env.MAIL_FROM ||
      process.env.SMTP_FROM ||
      process.env.GMAIL_USER ||
      "Gitakshmi One <no-reply@example.com>"
  ).trim();

const buildPreviewResult = ({ deliveryMode = "preview", previewOtp = null, previewUrl = null }) => ({
  info: null,
  deliveryMode,
  previewOtp,
  previewUrl
});

export const sendLoginOtpEmail = async ({ to, otp, expiresInMinutes, allowPreview = false }) => {
  const normalizedTo = String(to || "").trim().toLowerCase();
  if (!normalizedTo) {
    throw createMailError({
      code: "mail_invalid_recipient",
      status: 400,
      message: "Recipient email is required",
      publicMessage: "Recipient email is required"
    });
  }

  let descriptor;
  let transporter;
  try {
    ({ descriptor, transporter } = getTransporter());
    await verifyTransportIfNeeded({ transporter, descriptor });
  } catch (error) {
    if (allowDevOtpPreview({ force: allowPreview })) {
      console.warn(`[MAIL] Falling back to local OTP preview for ${normalizedTo}: ${error.message}`);
      console.log(`[MAIL] OTP preview (${normalizedTo}): ${otp}`);
      return buildPreviewResult({
        previewOtp: otp
      });
    }
    throw error;
  }

  const subject = "Your Gitakshmi One login OTP";
  const text = [
    "Your one-time password for Gitakshmi One login is:",
    otp,
    "",
    `This code will expire in ${expiresInMinutes} minutes.`,
    "If you did not request this login, please ignore this email."
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h2 style="margin-bottom: 8px;">Gitakshmi One Login Verification</h2>
      <p style="margin-top: 0;">Use the one-time password below to complete your login.</p>
      <div style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 24px 0; color: #1d4ed8;">
        ${otp}
      </div>
      <p>This code expires in <strong>${expiresInMinutes} minutes</strong>.</p>
      <p>If you did not request this login, you can safely ignore this email.</p>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: getMailFrom(),
      to: normalizedTo,
      subject,
      text,
      html
    });

    if (descriptor.type === "json") {
      console.warn(
        `[MAIL] Real email delivery is not configured. OTP for ${normalizedTo} is available only in local preview mode.`
      );
      console.log(`[MAIL] OTP preview (${normalizedTo}): ${otp}`);
    }

    return {
      info,
      deliveryMode: descriptor.type,
      previewOtp: allowDevOtpPreview({ force: allowPreview }) ? otp : null
    };
  } catch (error) {
    if (allowDevOtpPreview({ force: allowPreview })) {
      console.warn(`[MAIL] Falling back to local OTP preview for ${normalizedTo}: ${error.message}`);
      console.log(`[MAIL] OTP preview (${normalizedTo}): ${otp}`);
      return buildPreviewResult({
        previewOtp: otp
      });
    }

    throw createMailError({
      code: "mail_delivery_failed",
      status: 502,
      message: `Email send failed: ${error.message}`,
      publicMessage:
        "OTP email could not be delivered. Please verify the SMTP/Gmail configuration and try again."
    });
  }
};

export const sendAccountActionEmail = async ({
  to,
  actionUrl,
  expiresInMinutes,
  purpose = "activation",
  allowPreview = false
}) => {
  const normalizedTo = String(to || "").trim().toLowerCase();
  if (!normalizedTo) {
    throw createMailError({
      code: "mail_invalid_recipient",
      status: 400,
      message: "Recipient email is required",
      publicMessage: "Recipient email is required"
    });
  }

  let descriptor;
  let transporter;
  try {
    ({ descriptor, transporter } = getTransporter());
    await verifyTransportIfNeeded({ transporter, descriptor });
  } catch (error) {
    if (allowDevOtpPreview({ force: allowPreview })) {
      console.warn(`[MAIL] Falling back to local account action preview for ${normalizedTo}: ${error.message}`);
      console.log(`[MAIL] Account action preview (${normalizedTo}): ${actionUrl}`);
      return buildPreviewResult({
        previewUrl: actionUrl
      });
    }
    throw error;
  }

  const isReset = String(purpose || "").trim().toLowerCase() === "reset";
  const subject = isReset
    ? "Reset your GT_ONE account password"
    : "Activate your GT_ONE account";
  const text = [
    isReset
      ? "Use the link below to reset your GT_ONE password:"
      : "Use the link below to activate your GT_ONE account:",
    actionUrl,
    "",
    `This link expires in ${expiresInMinutes} minutes.`,
    "If you did not request this action, you can ignore this email."
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h2 style="margin-bottom: 8px;">GT_ONE Account ${isReset ? "Reset" : "Activation"}</h2>
      <p style="margin-top: 0;">
        ${isReset
          ? "Use the button below to reset your GT_ONE password."
          : "Use the button below to activate your GT_ONE account and set your GT_ONE password."}
      </p>
      <p style="margin: 24px 0;">
        <a
          href="${actionUrl}"
          style="display: inline-block; padding: 12px 20px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700;"
        >
          ${isReset ? "Reset GT_ONE Password" : "Activate GT_ONE Account"}
        </a>
      </p>
      <p>This link expires in <strong>${expiresInMinutes} minutes</strong>.</p>
      <p>If you did not request this action, you can safely ignore this email.</p>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: getMailFrom(),
      to: normalizedTo,
      subject,
      text,
      html
    });

    if (descriptor.type === "json") {
      console.warn(`[MAIL] Account action preview (${normalizedTo}): ${actionUrl}`);
    }

    return {
      info,
      deliveryMode: descriptor.type,
      previewUrl: allowDevOtpPreview({ force: allowPreview }) ? actionUrl : null
    };
  } catch (error) {
    if (allowDevOtpPreview({ force: allowPreview })) {
      console.warn(`[MAIL] Falling back to local account action preview for ${normalizedTo}: ${error.message}`);
      console.log(`[MAIL] Account action preview (${normalizedTo}): ${actionUrl}`);
      return buildPreviewResult({
        previewUrl: actionUrl
      });
    }

    throw createMailError({
      code: "mail_delivery_failed",
      status: 502,
      message: `Account action email send failed: ${error.message}`,
      publicMessage:
        "Account email could not be delivered. Please verify the SMTP/Gmail configuration and try again."
    });
  }
};
