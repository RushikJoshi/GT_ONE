import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div style={{ padding: "50px", fontFamily: "Outfit, sans-serif", backgroundColor: "#f8fafc", minHeight: "100vh" }}>
      <header style={{ 
        borderBottom: "1px solid #e2e8f0", 
        marginBottom: "30px", 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        paddingBottom: "20px"
      }}>
        <h1 style={{ color: "#1e293b", fontWeight: 700 }}>CRM Central</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontWeight: 600, color: "#475569", margin: 0 }}>{user?.name}</p>
            <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>{user?.role}</p>
          </div>
          <button 
            onClick={handleLogout} 
            style={{ 
              padding: "10px 20px", 
              background: "#ef4444", 
              color: "white", 
              border: "none", 
              borderRadius: "8px", 
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <main style={{ 
        background: "white", 
        padding: "40px", 
        borderRadius: "16px", 
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)" 
      }}>
        <h2 style={{ color: "#1e293b", marginBottom: "10px" }}>Hello, {user?.name}!</h2>
        <p style={{ color: "#64748b", fontSize: "16px", marginBottom: "30px" }}>Logged in as: <code style={{ color: "#6366f1" }}>{user?.email}</code></p>
        
        <div style={{ marginTop: "40px" }}>
          <h3 style={{ color: "#334155", fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "15px" }}>
            Application Access
          </h3>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {(user?.allowedApps || []).length > 0 ? (
                user.allowedApps.map(app => (
                <div key={app} style={{ 
                    background: "#f1f5f9", 
                    border: "1px solid #e2e8f0", 
                    padding: "12px 24px", 
                    borderRadius: "12px", 
                    fontSize: "15px", 
                    color: "#475569",
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                }}>
                    <span style={{ width: "8px", height: "8px", background: "#10b981", borderRadius: "50%" }}></span>
                    {app}
                </div>
                ))
            ) : (
                <p style={{ color: "#94a3b8", fontStyle: "italic" }}>No specific applications assigned.</p>
            )}
          </div>
        </div>

        <div style={{ 
          marginTop: "60px", 
          padding: "24px", 
          background: "#ecfdf5", 
          border: "1px solid #a7f3d0", 
          color: "#065f46", 
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          gap: "15px"
        }}>
          <div style={{ fontSize: "24px" }}>🛡️</div>
          <div>
            <strong style={{ display: "block" }}>SSO Authenticated</strong>
            <span>You have been automatically logged in using your central identity credentials.</span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
