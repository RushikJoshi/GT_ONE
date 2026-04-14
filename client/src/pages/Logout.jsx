import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Logout() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        await logout();
      } catch (_error) {
        // Best effort logout so we can always land back on login.
      } finally {
        if (active) {
          navigate("/login", { replace: true });
        }
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [logout, navigate]);

  return <div className="center-screen">Signing out...</div>;
}

export default Logout;
