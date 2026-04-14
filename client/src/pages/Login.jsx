import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser } = useAuth();
  const resolveFallbackRedirect = (role) => {
    const normalizedRole = String(role || "").trim().toLowerCase();

    const HRMS_BASE = "http://localhost:5176";

    if (["company_admin", "admin", "hr", "hr_admin", "owner"].includes(normalizedRole)) {
      return `${HRMS_BASE}/tenant/admin-dashboard`;
    }

    if (["manager", "team_manager"].includes(normalizedRole)) {
      return `${HRMS_BASE}/tenant/dashboard`;
    }

    if (["employee", "user", "staff"].includes(normalizedRole)) {
      return `${HRMS_BASE}/employee/dashboard`;
    }

    if (["super_admin", "superadmin", "psa"].includes(normalizedRole)) {
      return `${HRMS_BASE}/tenant/dashboard`;
    }

    return null;
  };
  const redirect = useMemo(
    () => searchParams.get("redirect") || "",
    [searchParams]
  );
  const hasExplicitRedirectUrl = useMemo(
    () => typeof redirect === "string" && /^https?:\/\//i.test(redirect),
    [redirect]
  );

  const [form, setForm] = useState({
    email: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    const redirectAuthenticatedUser = async () => {
      try {
        const res = await api.get("/auth/me");
        if (!active || !res.data?.authenticated || !res.data?.user) {
          return;
        }

        const nextUser = res.data.user;
        setUser(nextUser);

        if (hasExplicitRedirectUrl) {
          window.location.replace(redirect);
          return;
        }

        const normalizedRole = String(nextUser?.role || "").trim().toLowerCase();
        if (normalizedRole === "super_admin") {
          navigate("/dashboard", { replace: true });
          return;
        }

        const roleRedirect = resolveFallbackRedirect(normalizedRole);
        if (roleRedirect) {
          window.location.replace(roleRedirect);
          return;
        }

      } catch (_error) {
        // No active SSO session; keep the login form visible.
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    };

    void redirectAuthenticatedUser();

    return () => {
      active = false;
    };
  }, [hasExplicitRedirectUrl, navigate, redirect, setUser]);

  if (checkingSession) {
    return (
      <div className="center-screen">
        <div className="card simple-card">
          <h2>Checking Session...</h2>
          <p>Verifying your GT ONE sign-in.</p>
        </div>
      </div>
    );
  }

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) {
      return;
    }

    setError("");
    console.log("[SSO-FE] submit start");

    try {
      setLoading(true);
      const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
      const payload = {
        email: form.email.trim().toLowerCase(),
        password: form.password.trim()
      };
      const res = await api.post(`/auth/login${query}`, payload);
      const nextUser = res.data.user;
      setUser(nextUser);
      console.log("[SSO-FE] login success");
      const normalizedRole = String(nextUser?.role || "").trim().toLowerCase();

      if (normalizedRole === "super_admin" && !hasExplicitRedirectUrl) {
        navigate("/dashboard", { replace: true });
        return;
      }

      const redirectUrl = res.data?.redirectUrl || res.data?.redirectTo;

      if (typeof redirectUrl === "string" && redirectUrl.startsWith("http")) {
        console.log(`[SSO-FE] redirecting to ${redirectUrl}`);
        window.location.assign(redirectUrl);
        return;
      }

      const fallbackRedirect = resolveFallbackRedirect(normalizedRole);
      if (fallbackRedirect) {
        window.location.assign(fallbackRedirect);
        return;
      }

      setError("Login successful, but no app redirect is configured for this user yet.");
      console.log("[SSO-FE] login incomplete: redirect URL missing.");
    } catch (requestError) {
      const message = requestError?.response?.data?.message || "Login failed";
      setError(message);
      console.log(`[SSO-FE] login failed: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="center-screen">
      <form className="card" onSubmit={handleSubmit}>
        <h1>GT ONE Login</h1>
        <p className="muted">Central SSO authentication system</p>

        <label>Email</label>
        <input
          type="email"
          name="email"
          value={form.email}
          onChange={onChange}
          required
        />

        <label>Password</label>
        <input
          type="password"
          name="password"
          value={form.password}
          onChange={onChange}
          required
        />

        {redirect && <p className="muted">Redirect target: {redirect.toUpperCase()}</p>}
        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}

export default Login;
