import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";

function ActivateAccount() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const purpose = useMemo(() => searchParams.get("purpose") || "activation", [searchParams]);
  const appKey = useMemo(() => searchParams.get("app") || "", [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.post("/auth/activate-account", {
        token,
        password,
        confirmPassword
      });
      setSuccess(res.data?.message || "Account activated successfully.");
      window.setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
        requestError?.message ||
        "Failed to complete account activation"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(circle at top left, rgba(37,99,235,0.16), transparent 35%), linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)",
        padding: "24px"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "#ffffff",
          borderRadius: "28px",
          border: "1px solid #dbeafe",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.12)",
          padding: "30px"
        }}
      >
        <div style={{ marginBottom: "22px" }}>
          <div style={{ fontSize: "0.8rem", color: "#2563eb", fontWeight: 900, letterSpacing: "0.14em" }}>
            GT_ONE ACCOUNT {purpose === "reset" ? "RESET" : "ACTIVATION"}
          </div>
          <h1 style={{ margin: "12px 0 8px", fontSize: "2rem", color: "#0f172a" }}>
            Set your GT_ONE password
          </h1>
          <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6 }}>
            Complete this step once and then use GT_ONE as the central sign-in for your assigned products
            {appKey ? `, including ${String(appKey).toUpperCase()}` : ""}.
          </p>
        </div>

        {!token ? (
          <div
            style={{
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              color: "#9a3412",
              padding: "14px 16px",
              borderRadius: "16px",
              fontWeight: 700
            }}
          >
            This activation link is missing its token.
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: "16px" }}>
            {error && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#b91c1c",
                  padding: "14px 16px",
                  borderRadius: "16px",
                  fontWeight: 700
                }}
              >
                {error}
              </div>
            )}

            {success && (
              <div
                style={{
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  color: "#065f46",
                  padding: "14px 16px",
                  borderRadius: "16px",
                  fontWeight: 700
                }}
              >
                {success}
              </div>
            )}

            <label style={{ display: "grid", gap: "8px", fontWeight: 800, color: "#334155" }}>
              New Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
                placeholder="At least 8 characters"
                style={{
                  padding: "14px 16px",
                  borderRadius: "14px",
                  border: "1px solid #dbeafe",
                  background: "#f8fbff",
                  outline: "none"
                }}
              />
            </label>

            <label style={{ display: "grid", gap: "8px", fontWeight: 800, color: "#334155" }}>
              Confirm Password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
                placeholder="Repeat the password"
                style={{
                  padding: "14px 16px",
                  borderRadius: "14px",
                  border: "1px solid #dbeafe",
                  background: "#f8fbff",
                  outline: "none"
                }}
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              style={{
                border: "none",
                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                color: "#ffffff",
                borderRadius: "14px",
                padding: "14px 18px",
                fontWeight: 900,
                cursor: "pointer"
              }}
            >
              {loading ? "Completing activation..." : purpose === "reset" ? "Reset GT_ONE Password" : "Activate GT_ONE Account"}
            </button>
          </form>
        )}

        <div style={{ marginTop: "18px", display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <Link to="/login" style={{ color: "#2563eb", fontWeight: 800, textDecoration: "none" }}>
            Back to login
          </Link>
          {appKey ? (
            <span style={{ color: "#64748b", fontWeight: 700 }}>Assigned app: {String(appKey).toUpperCase()}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default ActivateAccount;
