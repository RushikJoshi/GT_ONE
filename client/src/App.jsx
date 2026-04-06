import './App.css'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { verifySSO } from "./utils/verifySSO";
import SessionGuard from "./components/SessionGuard";

function MainApp() {
  const { login, restoreSession, user, loading, setLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkSSO = async () => {
      try {
        setLoading(true);
        // 🔥 Use the restoreSession from context
        const { user: ssoUser } = await restoreSession(verifySSO);

        if (ssoUser) {
          console.log("🔥 SSO Session Found - Logged in automatically.");
          // If already authenticated and at login, push to dashboard
          if (location.pathname === "/login" || location.pathname === "/") {
            navigate("/dashboard");
          }
        }
      } catch (err) {
        console.error("SSO check failed:", err);
      } finally {
        setLoading(false);
      }
    };

    checkSSO();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#f8fafc" }}>
        <div style={{ textAlign: "center" }}>
          <div className="spinner" style={{ marginBottom: "20px" }}></div>
          <h3 style={{ color: "#64748b", fontFamily: "Outfit, sans-serif" }}>Verifying Single Sign-On...</h3>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      
      <Route path="/dashboard" element={
        <SessionGuard>
          <Dashboard />
        </SessionGuard>
      } />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
