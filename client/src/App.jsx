import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Logout from "./pages/Logout";
import AssignProducts from "./pages/AssignProducts";
import Unauthorized from "./pages/Unauthorized";
import Launcher from "./pages/Launcher";
import ActivateAccount from "./pages/ActivateAccount";
import { useAuth } from "./context/AuthContext";
import SessionGuard from "./components/SessionGuard";
import { SuperAdminProvider } from "./context/SuperAdminContext";

const ProtectedRoute = ({ children }) => (
  <SessionGuard>{children}</SessionGuard>
);

const ProductRoute = ({ product, children }) => {
  const { user, loading, isAuthChecked } = useAuth();
  if (loading || !isAuthChecked) return <div className="center-screen">Checking session...</div>;
  if (!user) return <Navigate to="/login" replace />;

  const normalized = String(user?.product || "").trim().toUpperCase();
  if (normalized && product && normalized !== String(product).toUpperCase()) {
    return <Navigate to="/unauthorized" replace />;
  }
  return children;
};

const isSuperAdminUser = (user) => {
  const normalizedRole = String(user?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const normalizedEmail = String(user?.email || "").trim().toLowerCase();
  return (
    normalizedRole === "super_admin" ||
    normalizedRole === "superadmin" ||
    normalizedEmail === "admin@example.com"
  );
};

const SuperAdminRoute = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!isSuperAdminUser(user)) {
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

const HomeRedirect = () => {
  const { user } = useAuth();
  return <Navigate to={isSuperAdminUser(user) ? "/dashboard" : "/launcher"} replace />;
};

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/logout" element={<Logout />} />
      <Route path="/activate-account" element={<ActivateAccount />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomeRedirect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/launcher"
        element={
          <ProtectedRoute>
            <Launcher />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <SuperAdminRoute>
              <SuperAdminProvider>
                <Dashboard />
              </SuperAdminProvider>
            </SuperAdminRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/companies/:companyId/products"
        element={
          <ProtectedRoute>
            <SuperAdminRoute>
              <SuperAdminProvider>
                <AssignProducts />
              </SuperAdminProvider>
            </SuperAdminRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/hrms/*"
        element={
          <ProtectedRoute>
            <ProductRoute product="HRMS">
              <div className="center-screen">HRMS app shell mounts here.</div>
            </ProductRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/psa/*"
        element={
          <ProtectedRoute>
            <ProductRoute product="PSA">
              <div className="center-screen">PSA app shell mounts here.</div>
            </ProductRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <HomeRedirect />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
