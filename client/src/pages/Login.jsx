import { useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

// 🔥 Ensure cookies are sent
axios.defaults.withCredentials = true;

function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleLogin = async () => {
        if (!email || !password) {
            alert("Please enter email and password");
            return;
        }

        try {
            setLoading(true);

            // ✅ 🔥 CALL SSO BACKEND DIRECTLY (MAIN FIX)
            const res = await axios.post(
                "http://localhost:5000/api/auth/login", // ⚠️ CHANGE PORT IF DIFFERENT
                { email, password },
                { withCredentials: true }
            );

            console.log("✅ Login success:", res.data);

            const { user, token, redirect } = res.data;

            // 🔥 Sync SSO context (optional but good)
            if (token && user) {
                await login(token, user);
            }

            console.log("🔁 Redirecting to:", redirect);

            // ✅ 🔥 REDIRECT TO CRM
            window.location.href = redirect || "http://localhost:5173";

        } catch (err) {
            console.error("❌ Login error:", err);
            alert(err?.response?.data?.msg || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: 50, textAlign: "center", fontFamily: "Segoe UI, sans-serif" }}>
            <div style={{ maxWidth: 400, margin: "auto", background: "white", padding: 40, borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                <h2>SSO Login</h2>
                <p style={{ color: "#666", marginBottom: 30 }}>Access your CRM centrally</p>

                <div style={{ textAlign: "left", marginBottom: 20 }}>
                    <label>Email</label>
                    <input
                        style={{ width: "100%", padding: 12, marginTop: 5, borderRadius: 5, border: "1px solid #ddd" }}
                        placeholder="admin@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <div style={{ textAlign: "left", marginBottom: 30 }}>
                    <label>Password</label>
                    <input
                        type="password"
                        style={{ width: "100%", padding: 12, marginTop: 5, borderRadius: 5, border: "1px solid #ddd" }}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </div>

                <button
                    onClick={handleLogin}
                    disabled={loading}
                    style={{ width: "100%", padding: 14, background: "#007bff", color: "white", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 16, fontWeight: "bold" }}
                >
                    {loading ? "Verifying..." : "Sign In"}
                </button>

                <p style={{ marginTop: 20, fontSize: 14, color: "#999" }}>
                    © 2026 Central SSO Identity Provider
                </p>
            </div>
        </div>
    );
}

export default Login;