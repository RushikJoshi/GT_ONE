import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Logout from "./pages/Logout";
import AssignProducts from "./pages/AssignProducts";
import { useAuth } from "./context/AuthContext";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="center-screen">Checking session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const SuperAdminRoute = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const normalizedRole = String(user?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const normalizedEmail = String(user?.email || "").trim().toLowerCase();
  const isSuperAdminUser =
    normalizedRole === "super_admin" ||
    normalizedRole === "superadmin" ||
    normalizedEmail === "admin@gitakshmi.com";

  if (!isSuperAdminUser) {
    return (
      <div className="center-screen">
        <div className="card simple-card">
          <h2>Access Denied</h2>
          <p>This panel is available only for super admin users.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                await logout();
                navigate("/login", { replace: true });
              }}
            >
              Switch account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
};

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <SuperAdminRoute>
              <Dashboard />
            </SuperAdminRoute>
          </ProtectedRoute>
        }
      />
      <Route path="/login" element={<Login />} />
      <Route path="/logout" element={<Logout />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <SuperAdminRoute>
              <Dashboard />
            </SuperAdminRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/companies/:companyId/products"
        element={
          <ProtectedRoute>
            <SuperAdminRoute>
              <AssignProducts />
            </SuperAdminRoute>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
