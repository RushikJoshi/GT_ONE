import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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

function Launcher() {
  const navigate = useNavigate();
  const {
    user,
    launcherApplications,
    launcherLoading,
    loadLauncherSession,
    logout,
    logoutEverywhere
  } = useAuth();
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [autoLaunchAttempted, setAutoLaunchAttempted] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        await loadLauncherSession();
      } catch (requestError) {
        if (active) {
          setError(requestError?.response?.data?.message || "Failed to load assigned applications");
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [loadLauncherSession]);

  const sortedApplications = useMemo(
    () =>
      [...launcherApplications].sort((left, right) =>
        String(left?.name || "").localeCompare(String(right?.name || ""))
      ),
    [launcherApplications]
  );

  useEffect(() => {
    if (launcherLoading) return;
    if (autoLaunchAttempted) return;
    if (isSuperAdminUser(user)) return;
    if (sortedApplications.length !== 1) return;

    setAutoLaunchAttempted(true);
    handleLaunch(sortedApplications[0]);
  }, [autoLaunchAttempted, launcherLoading, sortedApplications, user]);

  const handleLaunch = (application) => {
    const launchUrl = application?.launchUrl || application?.loginUrl || application?.baseUrl;
    if (!launchUrl) {
      setError(`No launch URL configured for ${application?.name || "this application"}.`);
      return;
    }
    window.location.assign(launchUrl);
  };

  const handleLogout = async () => {
    try {
      setActionLoading("logout");
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setActionLoading("");
    }
  };

  const handleLogoutEverywhere = async () => {
    try {
      setActionLoading("global");
      await logoutEverywhere();
      navigate("/login", { replace: true });
    } finally {
      setActionLoading("");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(59,130,246,0.14), transparent 35%), linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%)",
        padding: "32px"
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "grid",
          gap: "20px"
        }}
      >
        <div
          style={{
            background: "#0f172a",
            color: "#ffffff",
            borderRadius: "28px",
            padding: "28px 32px",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: "20px",
            boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)"
          }}
        >
          <div style={{ maxWidth: "640px" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 800, letterSpacing: "0.16em", color: "#93c5fd" }}>
              GT_ONE LAUNCHER
            </div>
            <h1 style={{ margin: "10px 0 8px", fontSize: "2.4rem", lineHeight: 1.05 }}>
              One sign-in for your full product ecosystem
            </h1>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", fontSize: "1rem", lineHeight: 1.6 }}>
              GT_ONE manages identity and access centrally. Your business data stays inside each product,
              and assigned apps open without another password prompt.
            </p>
          </div>

          <div
            style={{
              minWidth: "280px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "20px",
              padding: "18px 20px",
              display: "grid",
              gap: "10px",
              alignContent: "start"
            }}
          >
            <div style={{ fontSize: "0.78rem", letterSpacing: "0.12em", color: "#bfdbfe", fontWeight: 800 }}>
              CURRENT SESSION
            </div>
            <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>{user?.name || user?.email || "GT_ONE User"}</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.95rem" }}>{user?.email || "No email"}</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.85rem" }}>
              Role: <strong style={{ color: "#ffffff" }}>{String(user?.role || "user").replace(/_/g, " ")}</strong>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "8px" }}>
              {isSuperAdminUser(user) && (
                <Link
                  to="/dashboard"
                  style={{
                    textDecoration: "none",
                    background: "#ffffff",
                    color: "#0f172a",
                    padding: "10px 14px",
                    borderRadius: "12px",
                    fontWeight: 800,
                    fontSize: "0.9rem"
                  }}
                >
                  Open Admin Console
                </Link>
              )}
              <button
                type="button"
                onClick={handleLogout}
                disabled={actionLoading === "logout"}
                style={{
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "transparent",
                  color: "#ffffff",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  fontWeight: 800,
                  cursor: "pointer"
                }}
              >
                {actionLoading === "logout" ? "Signing out..." : "Logout from GT_ONE"}
              </button>
              <button
                type="button"
                onClick={handleLogoutEverywhere}
                disabled={actionLoading === "global"}
                style={{
                  border: "none",
                  background: "#2563eb",
                  color: "#ffffff",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  fontWeight: 800,
                  cursor: "pointer"
                }}
              >
                {actionLoading === "global" ? "Signing out everywhere..." : "Sign out everywhere"}
              </button>
            </div>
          </div>
        </div>

        {error && (
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
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px"
          }}
        >
          <div>
            <div style={{ fontSize: "1.35rem", fontWeight: 900, color: "#0f172a" }}>Assigned Applications</div>
            <div style={{ color: "#64748b", marginTop: "4px" }}>
              Launch any assigned product using the current GT_ONE session.
            </div>
          </div>
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #dbeafe",
              borderRadius: "999px",
              color: "#2563eb",
              padding: "10px 14px",
              fontWeight: 800
            }}
          >
            {sortedApplications.length} App{sortedApplications.length === 1 ? "" : "s"}
          </div>
        </div>

        {launcherLoading ? (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              padding: "32px",
              border: "1px solid #e2e8f0",
              color: "#475569",
              fontWeight: 700
            }}
          >
            Loading your application access...
          </div>
        ) : sortedApplications.length === 0 ? (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              padding: "32px",
              border: "1px solid #e2e8f0",
              color: "#475569"
            }}
          >
            No applications are assigned to this GT_ONE account yet.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "18px"
            }}
          >
            {sortedApplications.map((application) => (
              <div
                key={application.id}
                style={{
                  background: "#ffffff",
                  borderRadius: "24px",
                  padding: "22px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
                  display: "grid",
                  gap: "14px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
                  <div>
                    <div style={{ fontSize: "1.12rem", fontWeight: 900, color: "#0f172a" }}>
                      {application.name}
                    </div>
                    <div style={{ marginTop: "6px", color: "#64748b", fontSize: "0.92rem", minHeight: "42px" }}>
                      {application.description || "Connected GT_ONE application"}
                    </div>
                  </div>
                  <span
                    style={{
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      padding: "6px 10px",
                      borderRadius: "999px",
                      fontWeight: 800,
                      fontSize: "0.75rem",
                      textTransform: "uppercase"
                    }}
                  >
                    {application.key}
                  </span>
                </div>

                <div style={{ display: "grid", gap: "8px", fontSize: "0.86rem", color: "#475569" }}>
                  <div>
                    Audience: <strong>{application.audience}</strong>
                  </div>
                  <div>
                    Status:{" "}
                    <strong style={{ color: String(application.status).toLowerCase() === "active" ? "#059669" : "#b45309" }}>
                      {application.status}
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleLaunch(application)}
                  style={{
                    border: "none",
                    background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                    color: "#ffffff",
                    borderRadius: "14px",
                    padding: "14px 16px",
                    fontWeight: 900,
                    cursor: "pointer"
                  }}
                >
                  Open {application.name}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Launcher;
