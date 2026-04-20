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

  const setUserAndCache = useCallback((nextUser) => {
    setUser(nextUser);
    writeCachedUser(nextUser);
  }, []);

  const loadSession = async () => {
    try {
      const res = await api.get("/auth/me");
      const nextUser = res.data?.user || null;
      setUserAndCache(nextUser);
    } catch (error) {
      const status = error?.response?.status;
      // Only treat explicit auth failures as logout.
      if (status === 401 || status === 403) {
        setUserAndCache(null);
      }
    } finally {
      setLoading(false);
    }
  };

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
        setUserAndCache(null);
        setAccessToken(null);
      }
    };

    window.addEventListener("auth:unauthorized", handler);
    return () => window.removeEventListener("auth:unauthorized", handler);
  }, []);

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      // Keep logout resilient even if the backend is temporarily unavailable.
    } finally {
      setUserAndCache(null);
      setAccessToken(null);
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthChecked,
      setUser: setUserAndCache,
      reloadSession: loadSession,
      logout,
      isAuthenticated: Boolean(user)
    }),
    [user, loading, isAuthChecked, setUserAndCache]
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
