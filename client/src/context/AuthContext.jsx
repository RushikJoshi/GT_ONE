import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { getAccessToken, setAccessToken } from "../lib/api";

const AuthContext = createContext(null);

const STORAGE_KEY = "gtone.auth.user";

const decodeJwt = (token) => {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload));
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
  }
};

const isTokenValid = (decoded) => {
  const exp = Number(decoded?.exp || 0);
  if (!exp) return true; // non-exp tokens treated as valid
  return Date.now() < exp * 1000;
};

const readCachedUser = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const writeCachedUser = (nextUser) => {
  try {
    if (!nextUser) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
  } catch {
    // ignore storage failures (private mode / quota)
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => readCachedUser());
  const [loading, setLoading] = useState(true);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [launcherApplications, setLauncherApplications] = useState([]);
  const [launcherLoading, setLauncherLoading] = useState(false);

  const setUserAndCache = useCallback((nextUser) => {
    setUser(nextUser);
    writeCachedUser(nextUser);
  }, []);

  const clearLocalAuthState = useCallback(() => {
    setUserAndCache(null);
    setLauncherApplications([]);
    setAccessToken(null);
  }, [setUserAndCache]);

  const loadSession = async () => {
    try {
      const res = await api.get("/auth/me");
      const nextUser = res.data?.user || null;
      setUserAndCache(nextUser);
      if (res.data?.accessToken) {
        setAccessToken(res.data.accessToken);
      }
      return nextUser;
    } catch (error) {
      // Clear auth state on failure (including network errors and 500s)
      // to prevent broken cached sessions when backend is unreachable.
      clearLocalAuthState();
      return null;
    } finally {
      setLoading(false);
    }
  };

  const loadLauncherSession = useCallback(async () => {
    try {
      setLauncherLoading(true);
      const res = await api.get("/sso/session");
      const nextUser = res.data?.authenticated ? res.data?.user || null : null;
      const nextApplications = Array.isArray(res.data?.applications) ? res.data.applications : [];
      setLauncherApplications(nextApplications);
      if (nextUser) {
        setUserAndCache({
          ...(user || {}),
          ...nextUser
        });
      }
      return {
        authenticated: Boolean(res.data?.authenticated),
        user: nextUser,
        applications: nextApplications
      };
    } catch (error) {
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        clearLocalAuthState();
      }
      throw error;
    } finally {
      setLauncherLoading(false);
    }
  }, [clearLocalAuthState, setUserAndCache, user]);

  useEffect(() => {
    // SPA rule: auth check runs ONCE.
    // 1) Try access token from localStorage (fast path, no API)
    // 2) If missing/expired, try refresh once (API)
    // 3) Finally, hydrate /auth/me once to get latest user object
    let alive = true;
    const run = async () => {
      try {
        const token = getAccessToken();
        const decoded = token ? decodeJwt(token) : null;

        if (token && decoded && isTokenValid(decoded)) {
          // Minimal user from token (prevents redirect loops)
          const tokenUser = {
            id: decoded.id || decoded.sub || null,
            email: decoded.email || null,
            name: decoded.name || null,
            role: decoded.role || null,
            product: decoded.product || null,
            companyId: decoded.companyId || null,
            tenantId: decoded.tenantId || null,
            companyCode: decoded.companyCode || null,
            products: Array.isArray(decoded.products) ? decoded.products : []
          };
          if (alive) {
            setUserAndCache(tokenUser);
          }
        } else if (token) {
          setAccessToken(null);
        }

        // Hydrate once from server (will auto-refresh via interceptor if needed)
        await loadSession();
      } finally {
        if (alive) {
          setIsAuthChecked(true);
        }
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const handler = (event) => {
      const status = event?.detail?.status;
      if (status === 401 || status === 403) {
        clearLocalAuthState();
      }
    };

    window.addEventListener("auth:unauthorized", handler);
    return () => window.removeEventListener("auth:unauthorized", handler);
  }, [clearLocalAuthState]);

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      // Keep logout resilient even if the backend is temporarily unavailable.
    } finally {
      clearLocalAuthState();
    }
  };

  const logoutEverywhere = async () => {
    let productLogoutUrls = [];
    try {
      const res = await api.post("/sso/global-logout");
      productLogoutUrls = Array.isArray(res.data?.productLogoutUrls)
        ? res.data.productLogoutUrls.filter(Boolean)
        : [];
    } catch (_error) {
      // keep best-effort behavior
    } finally {
      clearLocalAuthState();
    }

    for (const url of productLogoutUrls) {
      try {
        const frame = document.createElement("iframe");
        frame.style.display = "none";
        frame.src = url;
        document.body.appendChild(frame);
        window.setTimeout(() => frame.remove(), 5000);
      } catch {
        // ignore per-product logout failures
      }
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthChecked,
      launcherApplications,
      launcherLoading,
      setUser: setUserAndCache,
      reloadSession: loadSession,
      loadLauncherSession,
      logout,
      logoutEverywhere,
      isAuthenticated: Boolean(user)
    }),
    [
      user,
      loading,
      isAuthChecked,
      launcherApplications,
      launcherLoading,
      setUserAndCache,
      loadLauncherSession
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
};
