import crypto from "crypto";
import jwt from "jsonwebtoken";
import JwtSigningKey from "../models/JwtSigningKey.js";

const ISSUER = process.env.SSO_OIDC_ISSUER || process.env.JWT_ISSUER || "gtone-sso";
const ACCESS_ALGORITHM = "RS256";
const LEGACY_SHARED_SECRET_ALGORITHM = "HS256";

const getAllowedAlgorithms = () => {
  const configured = String(process.env.JWT_ALLOWED_ALGS || `${ACCESS_ALGORITHM},${LEGACY_SHARED_SECRET_ALGORITHM}`)
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  return configured.length ? configured : [ACCESS_ALGORITHM];
};

const toAudienceArray = (audience) => {
  if (!audience) return [];
  if (Array.isArray(audience)) {
    return audience.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return [String(audience).trim()].filter(Boolean);
};

const createKeyPairRecord = () => {
  const modulusLength = Number(process.env.JWT_RSA_BITS || 2048);
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength,
    publicKeyEncoding: { format: "jwk" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });

  return {
    kid: crypto.randomUUID(),
    algorithm: ACCESS_ALGORITHM,
    publicJwk: publicKey,
    privatePem: privateKey,
    status: "active",
    activatedAt: new Date()
  };
};

const normalizeJwk = (jwk, kid, algorithm) => ({
  ...jwk,
  kid,
  alg: algorithm || ACCESS_ALGORITHM,
  use: "sig"
});

export const ensureActiveSigningKey = async () => {
  let existing = await JwtSigningKey.findOne({ status: "active" })
    .sort({ activatedAt: -1 })
    .select("+privatePem");

  if (existing) {
    return existing;
  }

  existing = await JwtSigningKey.create(createKeyPairRecord());
  return JwtSigningKey.findById(existing._id).select("+privatePem");
};

export const getJwksPayload = async () => {
  const keys = await JwtSigningKey.find({
    status: { $in: ["active", "retired"] }
  })
    .sort({ activatedAt: -1 })
    .lean();

  return {
    keys: keys.map((item) => normalizeJwk(item.publicJwk, item.kid, item.algorithm))
  };
};

const loadVerificationKey = async (kid) => {
  if (!kid) {
    throw new Error("missing_kid");
  }

  const signingKey = await JwtSigningKey.findOne({
    kid,
    status: { $in: ["active", "retired"] }
  }).lean();

  if (!signingKey?.publicJwk) {
    throw new Error("signing_key_not_found");
  }

  return crypto.createPublicKey({
    key: signingKey.publicJwk,
    format: "jwk"
  });
};

export const signPlatformJwt = async ({
  payload,
  audience,
  expiresIn,
  jwtid,
  subject,
  type = "access"
}) => {
  const allowedAlgs = getAllowedAlgorithms();
  const requestedSigningAlgorithm = String(process.env.JWT_SIGNING_ALG || ACCESS_ALGORITHM)
    .trim()
    .toUpperCase();
  const useSymmetric =
    requestedSigningAlgorithm === LEGACY_SHARED_SECRET_ALGORITHM &&
    allowedAlgs.includes(LEGACY_SHARED_SECRET_ALGORITHM) &&
    process.env.JWT_SECRET;

  const normalizedSubject = subject || payload?.sub || undefined;
  const finalPayload = {
    ...payload,
    typ: type
  };

  if (normalizedSubject && Object.prototype.hasOwnProperty.call(finalPayload, "sub")) {
    delete finalPayload.sub;
  }

  if (useSymmetric) {
    return jwt.sign(finalPayload, process.env.JWT_SECRET, {
      algorithm: LEGACY_SHARED_SECRET_ALGORITHM,
      expiresIn,
      issuer: ISSUER,
      audience: toAudienceArray(audience),
      jwtid,
      subject: normalizedSubject
    });
  }

  const signingKey = await ensureActiveSigningKey();
  return jwt.sign(finalPayload, signingKey.privatePem, {
    algorithm: ACCESS_ALGORITHM,
    expiresIn,
    issuer: ISSUER,
    audience: toAudienceArray(audience),
    keyid: signingKey.kid,
    jwtid,
    subject: normalizedSubject
  });
};

export const decodePlatformJwt = (token, { complete = false } = {}) =>
  jwt.decode(token, complete ? { complete: true } : undefined);

export const verifyPlatformJwt = async ({
  token,
  audience,
  ignoreExpiration = false
}) => {
  const decodedHeader = jwt.decode(token, { complete: true });
  const algorithm = String(decodedHeader?.header?.alg || "").trim().toUpperCase();
  const allowedAlgs = getAllowedAlgorithms();

  if (!algorithm || !allowedAlgs.includes(algorithm)) {
    throw new Error("jwt_algorithm_not_allowed");
  }

  if (algorithm === LEGACY_SHARED_SECRET_ALGORITHM) {
    if (!process.env.JWT_SECRET) {
      throw new Error("missing_jwt_secret");
    }

    return jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: [LEGACY_SHARED_SECRET_ALGORITHM],
      issuer: ISSUER,
      audience: toAudienceArray(audience),
      ignoreExpiration
    });
  }

  if (algorithm !== ACCESS_ALGORITHM) {
    throw new Error("unsupported_jwt_algorithm");
  }

  const kid = decodedHeader?.header?.kid;
  const verificationKey = await loadVerificationKey(kid);

  return jwt.verify(token, verificationKey, {
    algorithms: [ACCESS_ALGORITHM],
    issuer: ISSUER,
    audience: toAudienceArray(audience),
    ignoreExpiration
  });
};
