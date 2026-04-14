const WINDOW_MS = 60 * 1000;
const store = new Map();

const isLocalEnv = () => {
  const env = String(process.env.NODE_ENV || "").toLowerCase();
  return env !== "production";
};

const getClientKey = (req) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
  return `${ip}:${req.path}`;
};

export const createRateLimiter = ({ maxPerMinuteLocal, maxPerMinuteProd }) => {
  return (req, res, next) => {
    const now = Date.now();
    const key = getClientKey(req);
    const limit = isLocalEnv() ? maxPerMinuteLocal : maxPerMinuteProd;
    const entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return next();
    }

    if (entry.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        message: "Too many requests",
        reason: "rate_limited",
        retryAfterSeconds
      });
    }

    entry.count += 1;
    store.set(key, entry);
    return next();
  };
};

export const bootstrapAuthRateLimiter = createRateLimiter({
  // Local dev should not be aggressively limited.
  maxPerMinuteLocal: 300,
  maxPerMinuteProd: 80
});
