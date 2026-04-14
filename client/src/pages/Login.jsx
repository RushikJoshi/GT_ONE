import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import "./Login.css";

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
  const [showPassword, setShowPassword] = useState(false);

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
        if (["super_admin", "superadmin", "psa"].includes(normalizedRole)) {
          navigate("/dashboard", { replace: true });
          return;
        }

        const roleRedirect = resolveFallbackRedirect(normalizedRole);
        if (roleRedirect) {
          window.location.replace(roleRedirect);
          return;
        }

      } catch (_error) {
        // No active SSO session
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
      <div className="login-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="login-card" style={{ textAlign: 'center', animation: 'fadeInDown 0.8s ease-out' }}>
          <div className="login-header" style={{ textAlign: 'center' }}>
            <h2>GT ONE</h2>
            <p>Verifying your session...</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
             <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="#e2e8f0" strokeWidth="4" />
                <path d="M12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.0434 16.4527" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
             </svg>
          </div>
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
    if (loading) return;

    setError("");
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
      
      const normalizedRole = String(nextUser?.role || "").trim().toLowerCase();

      if (["super_admin", "superadmin", "psa"].includes(normalizedRole) && !hasExplicitRedirectUrl) {
        navigate("/dashboard", { replace: true });
        return;
      }

      const redirectUrl = res.data?.redirectUrl || res.data?.redirectTo;

      if (typeof redirectUrl === "string" && redirectUrl.startsWith("http")) {
        window.location.assign(redirectUrl);
        return;
      }

      const fallbackRedirect = resolveFallbackRedirect(normalizedRole);
      if (fallbackRedirect) {
        window.location.assign(fallbackRedirect);
        return;
      }

      setError("Login successful, but no app redirect is configured.");
    } catch (requestError) {
      const message = requestError?.response?.data?.message || "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-branding">
        <div className="branding-content">
          <h1>GT ONE</h1>
          <p>Your unified gateway to enterprise management. Secure, seamless, and powerful.</p>
          
          <div className="branding-features">
            <div className="feature-item">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="24" height="24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Centralized Authentication System</span>
            </div>
            <div className="feature-item">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="24" height="24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Single Sign-On for all GT Modules</span>
            </div>
            <div className="feature-item">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="24" height="24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 00-2 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Enterprise Grade Security</span>
            </div>
          </div>
        </div>
      </div>

      <div className="login-form-area">
        <div className="login-card">
          <div className="login-header">
            <h2>Welcome Back</h2>
            <p>Please enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="error-message">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <div className="input-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
                <input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="name@company.com"
                  value={form.email}
                  onChange={onChange}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="input-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 00-2 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={onChange}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;
