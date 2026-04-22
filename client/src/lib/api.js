import axios from "axios";

const resolveApiBaseUrl = () => {
  return "https://gaccess.gitakshmi.com/api";
};

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  withCredentials: true
});

const ACCESS_TOKEN_KEY = "gtone.accessToken";

export const getAccessToken = () => {
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setAccessToken = (token) => {
  try {
    if (!token) window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    else window.localStorage.setItem(ACCESS_TOKEN_KEY, String(token));
  } catch {
    // ignore
  }
};

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const shouldDebugAuth = () => {
  try {
    return (
      window.localStorage.getItem("debug.auth") === "1" ||
      window.sessionStorage.getItem("debug.auth") === "1"
    );
  } catch {
    return false;
  }
};

let refreshPromise = null;
const refreshAccessTokenOnce = async () => {
  if (!refreshPromise) {
    refreshPromise = api
      .post("/auth/refresh")
      .then((res) => {
        const next = res.data?.accessToken || null;
        if (next) setAccessToken(next);
        return next;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

// Global API handling:
// - No full page reloads
// - No infinite retry loops
// - Centralized 401/403 signaling to AuthContext
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url;
    const original = error?.config || {};

    if (shouldDebugAuth()) {
      // eslint-disable-next-line no-console
      console.warn("[API][ERROR]", { status, url, message: error?.message });
    }

    // Attempt a single refresh on 401 for protected calls (avoid loops)
    if (status === 401 && !original.__isRetryRequest && url && !String(url).includes("/auth/")) {
      try {
        const next = await refreshAccessTokenOnce();
        if (next) {
          original.__isRetryRequest = true;
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${next}`;
          return api.request(original);
        }
      } catch {
        // fall through to unauthorized event
      }
    }

    if (status === 401 || status === 403) {
      try {
        window.dispatchEvent(
          new CustomEvent("auth:unauthorized", {
            detail: { status, url }
          })
        );
      } catch {
        // ignore
      }
    }

    return Promise.reject(error);
  }
);

export default api;
