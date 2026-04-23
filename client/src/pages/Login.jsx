import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api, { getAccessToken, setAccessToken } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import "./Login.css";

function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser } = useAuth();
  const [didCheckSession, setDidCheckSession] = useState(false);
  const HRMS_BASE = import.meta.env.VITE_HRMS_BASE_URL || "https://hrms.dev.gitakshmi.com";
  const TMS_BASE = import.meta.env.VITE_TMS_BASE_URL || "https://devprojects.gitakshmi.com";

  const TOKEN_BRIDGE_ALLOWED_ORIGINS = useMemo(() => {
    const origins = [
      "https://hrms.dev.gitakshmi.com",
      "https://devprojects.gitakshmi.com",
      "https://gaccess.gitakshmi.com"
    ];

    [
      import.meta.env.VITE_HRMS_BASE_URL,
      import.meta.env.VITE_TMS_BASE_URL,
      import.meta.env.VITE_PMS_BASE_URL
    ].forEach(val => {
      if (val) {
        try {
          origins.push(new URL(val).origin);
        } catch {
          // invalid url, skip
        }
      }
    });
    
    origins.push(window.location.origin);
    return new Set(origins.filter(Boolean));
  }, []);

  const isLocalOriginUrl = (value) => {
    try {
      const parsed = new URL(value);
      return ["localhost", "127.0.0.1"].includes(parsed.hostname);
    } catch {
      return false;
    }
  };

  const shouldUseAbsoluteRedirect = (url) => {
    if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return false;
    }

    if (!isLocal) {
      return true;
    }

    return isLocalOriginUrl(url);
  };

  const markRedirectAttempt = (url) => {
    try {
      const key = `gtone.redirectAttempt:${url}`;
      window.sessionStorage.setItem(key, String(Date.now()));
    } catch {
      // ignore storage failures
    }
  };

  const shouldBlockAutoRedirect = (url) => {
    try {
      const key = `gtone.redirectAttempt:${url}`;
      const last = Number(window.sessionStorage.getItem(key) || "0");
      // Prevent redirect ping-pong loops: if we already tried to send the user to this URL recently,
      // don't auto-redirect again.
      return Number.isFinite(last) && last > 0 && Date.now() - last < 5_000;
    } catch {
      return false;
    }
  };

  const hasRecentRedirectAttempt = (url, windowMs = 120_000) => {
    try {
      const key = `gtone.redirectAttempt:${url}`;
      const last = Number(window.sessionStorage.getItem(key) || "0");
      return Number.isFinite(last) && last > 0 && Date.now() - last < windowMs;
    } catch {
      return false;
    }
  };

  const buildBridgeRedirectUrl = (url, accessToken) => {
    if (!url || typeof url !== "string" || !accessToken) {
      return url;
    }

    try {
      const parsed = new URL(url);
      const origin = parsed.origin;
      // Allow relative paths or allowed origins
      const isAllowed = TOKEN_BRIDGE_ALLOWED_ORIGINS.has(origin) || origin.endsWith(".gitakshmi.com");

      if (!isAllowed) {
        return url;
      }
      if (!parsed.searchParams.has("token")) {
        parsed.searchParams.set("token", accessToken);
      }
      return parsed.toString();
    } catch {
      return url;
    }
  };

  const safeRedirectTo = (url, { replace = true, accessToken = null } = {}) => {
    if (!url || typeof url !== "string") return false;
    if (!/^https?:\/\//i.test(url)) return false;

    if (shouldBlockAutoRedirect(url)) {
      // Silent block (no UI banner) to keep SPA stable.
      return false;
    }

    const finalUrl = buildBridgeRedirectUrl(url, accessToken || getAccessToken());
    markRedirectAttempt(url);
    if (replace) {
      window.location.replace(finalUrl);
    } else {
      window.location.assign(finalUrl);
    }
    return true;
  };

  const resolveFallbackRedirect = (role, products = []) => {
    const normalizedRole = String(role || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");

    const assigned = new Set((products || []).map(p => String(p).toUpperCase()));
    const hasHrms = assigned.has("HRMS");
    const hasTms = assigned.has("TMS") || assigned.has("CRM") || assigned.has("PMS");

    if (["company_admin", "admin", "hr", "hr_admin", "owner"].includes(normalizedRole)) {
      if (hasHrms) return `${HRMS_BASE}/tenant/dashboard`;
      if (hasTms) return `${TMS_BASE}/dashboard`;
      return `${HRMS_BASE}/tenant/dashboard`;
    }
    if (["manager", "team_manager"].includes(normalizedRole)) {
      if (hasHrms) return `${HRMS_BASE}/tenant/dashboard`;
      if (hasTms) return `${TMS_BASE}/dashboard`;
      return `${HRMS_BASE}/tenant/dashboard`;
    }
    if (["employee", "user", "staff"].includes(normalizedRole)) {
      if (hasHrms) return `${HRMS_BASE}/employee/dashboard`;
      if (hasTms) return `${TMS_BASE}/dashboard`;
      return `${HRMS_BASE}/employee/dashboard`;
    }

    return null;
  };

  const isPsaRole = (role) => {
    const normalizedRole = String(role || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    return ["super_admin", "superadmin", "psa"].includes(normalizedRole);
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
  const [otpCode, setOtpCode] = useState("");
  const [otpChallenge, setOtpChallenge] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [resendingOtp, setResendingOtp] = useState(false);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const isOtpStep = Boolean(otpChallenge?.otpRequestId);

  useEffect(() => {
    if (!isOtpStep) {
      setOtpSecondsLeft(0);
      setResendSecondsLeft(0);
      return undefined;
    }

    const expiresAtMs = otpChallenge?.expiresAt ? new Date(otpChallenge.expiresAt).getTime() : null;
    if (Number.isFinite(expiresAtMs)) {
      setOtpSecondsLeft(Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)));
    } else {
      setOtpSecondsLeft(Math.max(0, Number(otpChallenge?.expiresInSeconds || 0)));
    }
    setResendSecondsLeft(Math.max(0, Number(otpChallenge?.expiresInSeconds || 0)));
    return undefined;
  }, [isOtpStep, otpChallenge?.expiresAt, otpChallenge?.expiresInSeconds, otpChallenge?.otpRequestId]);

  useEffect(() => {
    if (!isOtpStep) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setOtpSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
      setResendSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isOtpStep]);

  useEffect(() => {
    if (!hasExplicitRedirectUrl) return;
  }, [hasExplicitRedirectUrl, redirect]);

  useEffect(() => {
    let active = true;
    if (didCheckSession) return;

    const redirectAuthenticatedUser = async () => {
      try {
        const res = await api.get("/auth/me");
        if (!active || !res.data?.authenticated || !res.data?.user) {
          return;
        }

        const nextUser = res.data.user;
        setUser(nextUser);
        if (res.data?.accessToken) {
          setAccessToken(res.data.accessToken);
        }

        if (isPsaRole(nextUser?.role)) {
          navigate("/dashboard", { replace: true });
          return;
        }

        if (hasExplicitRedirectUrl && shouldUseAbsoluteRedirect(redirect)) {
          if (safeRedirectTo(redirect, { replace: true })) {
            return;
          }
        }

        const normalizedRole = String(nextUser?.role || "")
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, "_");

        const roleRedirect = resolveFallbackRedirect(normalizedRole, nextUser?.products || []);
        if (roleRedirect) {
          if (safeRedirectTo(roleRedirect, { replace: true })) {
            return;
          }
        }

      } catch (_error) {
        // No active SSO session
      } finally {
        if (active) {
          setCheckingSession(false);
          setDidCheckSession(true);
        }
      }
    };

    void redirectAuthenticatedUser();

    return () => {
      active = false;
    };
  }, [didCheckSession, hasExplicitRedirectUrl, navigate, redirect, setUser]);

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

  const handleOtpChange = (event) => {
    const numericOnly = event.target.value.replace(/\D+/g, "").slice(0, 6);
    setOtpCode(numericOnly);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setError("");
    setNotice("");
    try {
      setLoading(true);
      const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";

      if (isOtpStep) {
        if (!otpChallenge?.otpRequestId) {
          setError("OTP session expired. Please try logging in again.");
          setOtpChallenge(null);
          return;
        }
        const otpPayload = {
          email: otpChallenge.email,
          otp: otpCode.trim(),
          otpRequestId: otpChallenge.otpRequestId,
          otpSource: otpChallenge.otpSource,
          otpTenantId: otpChallenge.otpTenantId
        };
        console.log("[LOGIN] Submitting OTP:", otpPayload);
        const res = await api.post(`/auth/verify-otp${query}`, otpPayload);

        const nextUser = res.data.user;
        setUser(nextUser);
        const accessToken = res.data?.accessToken || null;
        if (accessToken) {
          setAccessToken(accessToken);
        }

        if (isPsaRole(nextUser?.role)) {
          navigate("/dashboard", { replace: true });
          return;
        }

        const normalizedRole = String(nextUser?.role || "").trim().toLowerCase();

        const redirectUrl = res.data?.redirectUrl || res.data?.redirectTo;

        if (shouldUseAbsoluteRedirect(redirectUrl)) {
          if (safeRedirectTo(redirectUrl, { replace: false, accessToken })) {
            return;
          }
        }

        const fallbackRedirect = resolveFallbackRedirect(normalizedRole, nextUser?.products || []);
        if (fallbackRedirect) {
          if (safeRedirectTo(fallbackRedirect, { replace: false, accessToken })) {
            return;
          }
        }

        setError("Login successful, but no app redirect is configured.");
        return;
      }

      const payload = {
        identifier: form.email.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password.trim()
      };
      let res;
      try {
        res = await api.post(`/auth/login${query}`, payload);
      } catch (e) {
        const status = e?.response?.status;
        if (status === 429) {
          const joiner = query ? "&" : "?";
          res = await api.post(`/auth/login${query}${joiner}devReset=1`, payload);
        } else {
          throw e;
        }
      }

      if (res.data?.requiresOtp) {
        setOtpChallenge({
          email: res.data.email,
          otpRequestId: res.data.otpRequestId,
          otpSource: res.data.otpSource,
          otpTenantId: res.data.otpTenantId,
          devOtpPreview: res.data.devOtpPreview || null,
          expiresInSeconds: res.data.expiresInSeconds,
          expiresAt: res.data.expiresAt || null
        });
        setOtpCode("");
        setNotice(res.data?.message || "OTP sent to your email.");
        return;
      }

      const nextUser = res.data.user;
      setUser(nextUser);
      const accessToken = res.data?.accessToken || null;
      if (accessToken) {
        setAccessToken(accessToken);
      }

      if (isPsaRole(nextUser?.role)) {
        navigate("/dashboard", { replace: true });
        return;
      }

      const normalizedRole = String(nextUser?.role || "").trim().toLowerCase();

      const redirectUrl = res.data?.redirectUrl || res.data?.redirectTo;

      if (shouldUseAbsoluteRedirect(redirectUrl)) {
        if (safeRedirectTo(redirectUrl, { replace: false, accessToken })) {
          return;
        }
      }

      const fallbackRedirect = resolveFallbackRedirect(normalizedRole, nextUser?.products || []);
      if (fallbackRedirect) {
        if (safeRedirectTo(fallbackRedirect, { replace: false, accessToken })) {
          return;
        }
      }

      setError("Login successful, but no app redirect is configured.");
    } catch (requestError) {
      if (isOtpStep && requestError?.response?.data?.reason === "otp_expired") {
        setOtpSecondsLeft(0);
      }
      const message = requestError?.response?.data?.message || "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!isOtpStep || resendingOtp || resendSecondsLeft > 0) {
      return;
    }

    setError("");
    setNotice("");
    try {
      setResendingOtp(true);
      const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
      const res = await api.post(`/auth/resend-otp${query}`, {
        email: otpChallenge.email,
        otpRequestId: otpChallenge.otpRequestId,
        otpSource: otpChallenge.otpSource,
        otpTenantId: otpChallenge.otpTenantId
      });

      const nextChallenge = {
        email: res.data.email || otpChallenge.email,
        otpRequestId: res.data.otpRequestId,
        otpSource: res.data.otpSource || otpChallenge.otpSource,
        otpTenantId: res.data.otpTenantId || otpChallenge.otpTenantId,
        devOtpPreview: res.data.devOtpPreview || null,
        expiresInSeconds: Number(res.data.expiresInSeconds || 60),
        expiresAt: res.data.expiresAt || null
      };

      setOtpChallenge(nextChallenge);
      setOtpCode("");
      setOtpSecondsLeft(nextChallenge.expiresInSeconds);
      setResendSecondsLeft(nextChallenge.expiresInSeconds);
      setNotice(res.data?.message || "New OTP sent.");
    } catch (requestError) {
      const retryAfter = Number(requestError?.response?.data?.retryAfterSeconds || 0);
      if (retryAfter > 0) {
        setResendSecondsLeft(retryAfter);
      }
      setError(requestError?.response?.data?.message || "Failed to resend OTP");
    } finally {
      setResendingOtp(false);
    }
  };

  const resetOtpStep = () => {
    setOtpChallenge(null);
    setOtpCode("");
    setOtpSecondsLeft(0);
    setResendSecondsLeft(0);
    setNotice("");
    setError("");
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
            <h2>{isOtpStep ? "Verify OTP" : "Welcome Back"}</h2>
            <p>
              {isOtpStep
                ? `Enter the 6-digit code sent to ${otpChallenge.email}`
                : "Please enter your credentials to continue"}
            </p>
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

            {notice && !error && (
              <div className="error-message" style={{ background: "#ecfdf5", color: "#065f46", borderColor: "#a7f3d0" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {notice}
              </div>
            )}

            {!isOtpStep ? (
              <>
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
              </>
            ) : (
              <div className="form-group">
                <label htmlFor="otp">One-Time Password</label>
                <div className="input-wrapper">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m1-5H8a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2z" />
                  </svg>
                  <input
                    id="otp"
                    type="text"
                    name="otp"
                    placeholder="Enter 6-digit OTP"
                    value={otpCode}
                    onChange={handleOtpChange}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                  />
                </div>
                <p style={{ marginTop: "10px", color: "#64748b", fontSize: "0.95rem" }}>
                  {otpSecondsLeft > 0
                    ? `This OTP expires in ${otpSecondsLeft}s.`
                    : "OTP expired. You can request a new OTP now."}
                </p>
              </div>
            )}

            <button type="submit" className="login-button" disabled={loading || (isOtpStep && otpSecondsLeft <= 0)}>
              {loading ? (isOtpStep ? "Verifying..." : "Signing in...") : (isOtpStep ? "Verify OTP" : "Sign In")}
            </button>

            {isOtpStep && (
              <>
                <button
                  type="button"
                  className="login-button"
                  onClick={handleResendOtp}
                  disabled={resendingOtp || resendSecondsLeft > 0}
                  style={{
                    marginTop: "12px",
                    background: (resendingOtp || resendSecondsLeft > 0) ? "#cbd5e1" : "#0f172a",
                    color: "#ffffff",
                    boxShadow: "none"
                  }}
                >
                  {resendingOtp
                    ? "Resending OTP..."
                    : resendSecondsLeft > 0
                      ? `Resend OTP in ${resendSecondsLeft}s`
                      : "Resend OTP"}
                </button>

                <button
                  type="button"
                  className="login-button"
                  onClick={resetOtpStep}
                  style={{ marginTop: "12px", background: "#e2e8f0", color: "#0f172a" }}
                >
                  Use Different Credentials
                </button>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;
