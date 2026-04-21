import axios from "axios";

const resolveApiBaseUrl = () => {
  const explicit = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  if (explicit) {
    return explicit;
  }

  // In local dev, bypass Vite proxy to avoid proxy parser/header limits.
  if (import.meta.env.DEV) {
    return "http://localhost:5004/api";
  }

  return "/api";
};

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  withCredentials: true
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

// Global API handling:
// - No full page reloads
// - No infinite retry loops
// - Centralized 401/403 signaling to AuthContext
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url;

    if (shouldDebugAuth()) {
      // eslint-disable-next-line no-console
      console.warn("[API][ERROR]", { status, url, message: error?.message });
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
