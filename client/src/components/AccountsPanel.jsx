import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";

const formatRole = (value) =>
  String(value || "user")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

function AccountsPanel() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [submittingId, setSubmittingId] = useState("");
  const [previewLinks, setPreviewLinks] = useState({});
  const [message, setMessage] = useState("");

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const res = await api.get("/auth/accounts");
      setAccounts(Array.isArray(res.data?.accounts) ? res.data.accounts : []);
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to load GT_ONE accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  const filteredAccounts = useMemo(() => {
    const query = String(search || "").trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((account) =>
      [account.name, account.email, account.role, account.importedFromAppKey, account.company?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [accounts, search]);

  const requestAccountLink = async (account, purpose) => {
    try {
      setSubmittingId(account.id);
      const res = await api.post("/auth/request-activation-reset", {
        userId: account.id,
        purpose
      });
      setPreviewLinks((prev) => ({
        ...prev,
        [account.id]: res.data?.previewUrl || ""
      }));
      setMessage(res.data?.message || "Account action link issued successfully.");
      await loadAccounts();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to issue account link");
    } finally {
      setSubmittingId("");
    }
  };

  const softDeleteAccount = async (account) => {
    if (!account?.id) return;
    const ok = window.confirm(`Soft delete account "${account.email}"? The user stays in MongoDB, but sign-in will be disabled and the row will be hidden.`);
    if (!ok) return;

    try {
      setSubmittingId(account.id);
      await api.delete(`/auth/accounts/${account.id}`);
      setAccounts((prev) => prev.filter((item) => item.id !== account.id));
      setMessage("Account soft deleted successfully.");
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to soft delete account");
    } finally {
      setSubmittingId("");
    }
  };

  const totals = useMemo(
    () => ({
      total: accounts.length,
      pending: accounts.filter((account) => account.accountStatus === "pending_activation").length,
      active: accounts.filter((account) => account.accountStatus === "active").length,
      imported: accounts.filter((account) => account.authSource === "imported").length
    }),
    [accounts]
  );

  return (
    <div className="accounts-workspace" style={{ display: "grid", gap: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.3rem", color: "#0f172a" }}>Identity Accounts</h2>
          <p style={{ margin: "6px 0 0", color: "#64748b" }}>
            GT_ONE is the central identity source. Imported users activate once, then use GT_ONE across products.
          </p>
        </div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by email, app, role, company"
          style={{
            minWidth: "280px",
            padding: "12px 14px",
            borderRadius: "14px",
            border: "1px solid #dbeafe",
            background: "#ffffff",
            outline: "none"
          }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
        {[
          { label: "Total Accounts", value: totals.total, color: "#2563eb" },
          { label: "Pending Activation", value: totals.pending, color: "#d97706" },
          { label: "Active", value: totals.active, color: "#059669" },
          { label: "Imported", value: totals.imported, color: "#7c3aed" }
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: "#ffffff",
              borderRadius: "18px",
              padding: "18px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 12px 28px rgba(15, 23, 42, 0.05)"
            }}
          >
            <div style={{ fontSize: "0.75rem", fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>
              {item.label}
            </div>
            <div style={{ marginTop: "10px", fontSize: "1.85rem", fontWeight: 900, color: item.color }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {(error || message) && (
        <div
          style={{
            background: error ? "#fef2f2" : "#ecfdf5",
            border: `1px solid ${error ? "#fecaca" : "#a7f3d0"}`,
            color: error ? "#b91c1c" : "#065f46",
            padding: "14px 16px",
            borderRadius: "16px",
            fontWeight: 700
          }}
        >
          {error || message}
        </div>
      )}

      <div
        style={{
          background: "#ffffff",
          borderRadius: "24px",
          border: "1px solid #e2e8f0",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(240px, 1.6fr) minmax(120px, .8fr) minmax(140px, .9fr) minmax(180px, 1fr) minmax(160px, 1fr) minmax(240px, 1.2fr)",
            gap: "12px",
            padding: "16px 18px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            fontSize: "0.72rem",
            fontWeight: 900,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.08em"
          }}
        >
          <div>Identity</div>
          <div>Status</div>
          <div>Source</div>
          <div>Company</div>
          <div>Last Login</div>
          <div>Actions</div>
        </div>

        {loading ? (
          <div style={{ padding: "22px 18px", color: "#475569", fontWeight: 700 }}>Loading GT_ONE accounts...</div>
        ) : filteredAccounts.length === 0 ? (
          <div style={{ padding: "22px 18px", color: "#475569" }}>No GT_ONE accounts matched this filter.</div>
        ) : (
          filteredAccounts.map((account) => {
            const isPending = account.accountStatus === "pending_activation";
            const previewUrl = previewLinks[account.id];
            return (
              <div
                key={account.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(240px, 1.6fr) minmax(120px, .8fr) minmax(140px, .9fr) minmax(180px, 1fr) minmax(160px, 1fr) minmax(240px, 1.2fr)",
                  gap: "12px",
                  padding: "18px",
                  borderBottom: "1px solid #eef2f7",
                  alignItems: "start"
                }}
              >
                <div>
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>{account.name || "Unnamed User"}</div>
                  <div style={{ marginTop: "6px", color: "#64748b" }}>{account.email}</div>
                  <div style={{ marginTop: "8px", color: "#475569", fontSize: "0.84rem" }}>
                    Role: <strong>{formatRole(account.role)}</strong>
                    {account.importedFromAppKey ? ` • Imported from ${String(account.importedFromAppKey).toUpperCase()}` : ""}
                  </div>
                </div>

                <div>
                  <span
                    style={{
                      display: "inline-flex",
                      padding: "7px 10px",
                      borderRadius: "999px",
                      fontWeight: 800,
                      fontSize: "0.76rem",
                      background: isPending ? "#fffbeb" : "#eff6ff",
                      color: isPending ? "#b45309" : "#1d4ed8"
                    }}
                  >
                    {account.accountStatus}
                  </span>
                </div>

                <div style={{ color: "#475569", fontWeight: 700 }}>{account.authSource}</div>
                <div style={{ color: "#475569" }}>{account.company?.name || "Unassigned"}</div>
                <div style={{ color: "#475569" }}>{formatDateTime(account.lastSuccessfulLoginAt)}</div>

                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => requestAccountLink(account, isPending ? "activation" : "reset")}
                      disabled={submittingId === account.id}
                      style={{
                        border: "none",
                        background: "#2563eb",
                        color: "#ffffff",
                        borderRadius: "10px",
                        padding: "10px 12px",
                        fontWeight: 800,
                        cursor: "pointer"
                      }}
                    >
                      {submittingId === account.id
                        ? "Sending..."
                        : isPending
                        ? "Send Activation"
                        : "Send Reset"}
                    </button>
                    <button
                      type="button"
                      onClick={() => softDeleteAccount(account)}
                      disabled={submittingId === account.id}
                      style={{
                        border: "1px solid #fecaca",
                        background: "#fef2f2",
                        color: "#b91c1c",
                        borderRadius: "10px",
                        padding: "10px 12px",
                        fontWeight: 800,
                        cursor: "pointer"
                      }}
                    >
                      Soft Delete
                    </button>
                  </div>

                  {previewUrl ? (
                    <a href={previewUrl} style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline" }}>
                      Open local preview link
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default AccountsPanel;
