import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../lib/api";

const AuthContext = createContext(null);

const STORAGE_KEY = "gtone.auth.user";

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

  const loadSession = async () => {
    try {
      const res = await api.get("/auth/me");
      const nextUser = res.data?.user || null;
      setUser(nextUser);
      writeCachedUser(nextUser);
    } catch (error) {
      const status = error?.response?.status;
      // Only treat explicit auth failures as logout.
      if (status === 401 || status === 403) {
        setUser(null);
        writeCachedUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    const handler = (event) => {
      const status = event?.detail?.status;
      if (status === 401 || status === 403) {
        setUser(null);
        writeCachedUser(null);
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
      setUser(null);
      writeCachedUser(null);
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      setUser: (nextUser) => {
        setUser(nextUser);
        writeCachedUser(nextUser);
      },
      reloadSession: loadSession,
      logout,
      isAuthenticated: Boolean(user)
    }),
    [user, loading]
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
