import { useAuth } from "../context/AuthContext";
import { Navigate, useLocation } from "react-router-dom";

/**
 * SessionGuard
 * Protects routes by checking if user is logged in.
 * If not authenticated, redirects to /login.
 */
const SessionGuard = ({ children }) => {
  const { user, loading, isAuthChecked } = useAuth();
  const location = useLocation();

  if (loading || !isAuthChecked) {
    return <div style={{ padding: "100px", textAlign: "center" }}><h3>Loading SSO Session...</h3></div>;
  }

  if (!user) {
    // Save current location to redirect after login (optional)
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default SessionGuard;
