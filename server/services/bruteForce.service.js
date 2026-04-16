import crypto from "crypto";

const attemptsStore = new Map();
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LOCK_MS = 15 * 60 * 1000;
const DEFAULT_MAX_FAILURES = 5;

const buildStoreKey = ({ scope, identifier, ipAddress }) => {
  const normalizedScope = String(scope || "auth").trim().toLowerCase();
  const normalizedIdentifier = String(identifier || "anonymous").trim().toLowerCase();
  const normalizedIp = String(ipAddress || "unknown").trim().toLowerCase();
  const digest = crypto
    .createHash("sha256")
    .update(`${normalizedScope}:${normalizedIdentifier}:${normalizedIp}`)
    .digest("hex");

  return `${normalizedScope}:${digest}`;
};

const cleanupExpiredEntries = () => {
  const now = Date.now();
  for (const [key, entry] of attemptsStore.entries()) {
    if (entry.expiresAt <= now) {
      attemptsStore.delete(key);
    }
  }
};

export const getBruteForceState = ({
  scope,
  identifier,
  ipAddress,
  maxFailures = DEFAULT_MAX_FAILURES,
  windowMs = DEFAULT_WINDOW_MS,
  lockMs = DEFAULT_LOCK_MS
}) => {
  cleanupExpiredEntries();

  const key = buildStoreKey({ scope, identifier, ipAddress });
  const now = Date.now();
  const entry = attemptsStore.get(key);

  if (!entry) {
    return {
      blocked: false,
      remainingAttempts: maxFailures
    };
  }

  if (entry.lockUntil && entry.lockUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.lockUntil - now) / 1000)),
      remainingAttempts: 0
    };
  }

  if (entry.windowStartedAt + windowMs <= now) {
    attemptsStore.delete(key);
    return {
      blocked: false,
      remainingAttempts: maxFailures
    };
  }

  return {
    blocked: false,
    remainingAttempts: Math.max(0, maxFailures - entry.failures)
  };
};

export const recordBruteForceFailure = ({
  scope,
  identifier,
  ipAddress,
  maxFailures = DEFAULT_MAX_FAILURES,
  windowMs = DEFAULT_WINDOW_MS,
  lockMs = DEFAULT_LOCK_MS
}) => {
  cleanupExpiredEntries();

  const key = buildStoreKey({ scope, identifier, ipAddress });
  const now = Date.now();
  const existing = attemptsStore.get(key);

  let entry = existing;
  if (!entry || entry.windowStartedAt + windowMs <= now) {
    entry = {
      failures: 0,
      windowStartedAt: now,
      lockUntil: null,
      expiresAt: now + windowMs + lockMs
    };
  }

  entry.failures += 1;
  entry.expiresAt = now + windowMs + lockMs;

  if (entry.failures >= maxFailures) {
    entry.lockUntil = now + lockMs;
  }

  attemptsStore.set(key, entry);

  return {
    blocked: Boolean(entry.lockUntil && entry.lockUntil > now),
    retryAfterSeconds:
      entry.lockUntil && entry.lockUntil > now
        ? Math.max(1, Math.ceil((entry.lockUntil - now) / 1000))
        : 0,
    remainingAttempts: Math.max(0, maxFailures - entry.failures)
  };
};

export const clearBruteForceFailures = ({ scope, identifier, ipAddress }) => {
  const key = buildStoreKey({ scope, identifier, ipAddress });
  attemptsStore.delete(key);
};
