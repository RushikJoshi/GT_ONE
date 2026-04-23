import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Logout from "./pages/Logout";
import AssignProducts from "./pages/AssignProducts";
import Unauthorized from "./pages/Unauthorized";
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
      <Route path="/login" element={<Login />} />
      <Route path="/logout" element={<Logout />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Super Admin Routes wrapped in a single Provider for data persistence */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <SuperAdminRoute>
              <SuperAdminProvider>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/companies/:companyId/products" element={<AssignProducts />} />
                  
                  {/* Product locked routes (placeholders) */}
                  <Route
                    path="/hrms/*"
                    element={
                      <ProductRoute product="HRMS">
                        <div className="center-screen">HRMS app shell mounts here.</div>
                      </ProductRoute>
                    }
                  />
                  <Route
                    path="/psa/*"
                    element={
                      <ProductRoute product="PSA">
                        <div className="center-screen">PSA app shell mounts here.</div>
                      </ProductRoute>
                    }
                  />
                  
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </SuperAdminProvider>
            </SuperAdminRoute>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
