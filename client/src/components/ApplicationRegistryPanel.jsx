import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { appendActivity } from "../lib/activityLog";

const defaultForm = {
  key: "",
  name: "",
  description: "",
  baseUrl: "",
  loginUrl: "",
  logoutUrl: "",
  redirectUris: "",
  audience: "",
  clientAuthMethod: "client_secret_post",
  type: "first_party",
  category: "business",
  legacyProductName: "",
  supportsProvisioning: false,
  provisioningAdapter: ""
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 20,
  padding: 20,
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)"
};

const inputStyle = {
  width: "100%",
  border: "1px solid #dbe2ea",
  borderRadius: 12,
  padding: "11px 12px",
  fontSize: "0.9rem",
  fontWeight: 600,
  color: "#0f172a",
  background: "#ffffff",
  outline: "none"
};

const labelStyle = {
  fontSize: "0.72rem",
  fontWeight: 900,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 8,
  display: "block"
};

const normalizeProductName = (value) => String(value || "").trim().toUpperCase();
const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");
const buildClientSecretEnvVar = (applicationKey) =>
  `GTONE_${String(applicationKey || "").trim().toUpperCase()}_CLIENT_SECRET`;

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
};

const buildSsoAuthorizeUrl = (application) => {
  const redirectUri = Array.isArray(application?.redirectUris) ? application.redirectUris[0] : "";
  const apiBaseUrl = trimTrailingSlash(api?.defaults?.baseURL || "");

  if (!apiBaseUrl || !application?.key || !redirectUri) {
    return null;
  }

  const params = new URLSearchParams({
    app: application.key,
    redirect_uri: redirectUri
  });

  return `${apiBaseUrl}/sso/authorize?${params.toString()}`;
};

const buildFormFromApplication = (application) => ({
  key: application?.key || "",
  name: application?.name || "",
  description: application?.description || "",
  baseUrl: application?.baseUrl || "",
  loginUrl: application?.loginUrl || "",
  logoutUrl: application?.logoutUrl || "",
  redirectUris: Array.isArray(application?.redirectUris) ? application.redirectUris.join(", ") : "",
  audience: application?.audience || "",
  clientAuthMethod: application?.clientAuthMethod || "client_secret_post",
  type: application?.type || "first_party",
  category: application?.category || "business",
  legacyProductName: application?.legacyProductName || "",
  supportsProvisioning: Boolean(application?.supportsProvisioning),
  provisioningAdapter: application?.provisioningAdapter || ""
});

function ApplicationRegistryPanel({
  applications,
  companies,
  setApplications,
  setError,
  reloadData,
  section = "registry",
  initialApplication = null,
  onEditApplication
}) {
  const [form, setForm] = useState(defaultForm);
  const [editingAppId, setEditingAppId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [rotatingAppId, setRotatingAppId] = useState(null);
  const [message, setMessage] = useState("");
  const [generatedSecret, setGeneratedSecret] = useState(null);
  const [connectorTemplate, setConnectorTemplate] = useState(null);
  const [connectorLoading, setConnectorLoading] = useState(false);

  const isConfigurationSection = section === "configuration";
  const isRegistrySection = !isConfigurationSection;

  const applicationCards = useMemo(() => {
    const companiesList = Array.isArray(companies) ? companies : [];
    return (applications || []).map((application) => {
      const matchName = normalizeProductName(application.legacyProductName || application.name);
      const assignedCompanies = companiesList.filter((company) =>
        Array.isArray(company?.products) &&
        company.products.some((productName) => normalizeProductName(productName) === matchName)
      ).length;

      return {
        ...application,
        assignedCompanies
      };
    });
  }, [applications, companies]);

  const stats = useMemo(() => {
    const total = applicationCards.length;
    const active = applicationCards.filter((application) => application.status === "active").length;
    const provisioning = applicationCards.filter((application) => application.supportsProvisioning).length;
    const mapped = applicationCards.filter((application) => application.assignedCompanies > 0).length;
    const protectedApps = applicationCards.filter((application) => application.clientAuthMethod === "client_secret_post").length;
    const secretsReady = applicationCards.filter(
      (application) => application.clientAuthMethod === "client_secret_post" && application.clientSecretConfigured
    ).length;

    return { total, active, provisioning, mapped, protectedApps, secretsReady };
  }, [applicationCards]);

  const resetForm = () => {
    setForm(defaultForm);
    setEditingAppId(null);
  };

  useEffect(() => {
    if (!isConfigurationSection) return;

    if (initialApplication?.id) {
      setEditingAppId(initialApplication.id);
      setForm(buildFormFromApplication(initialApplication));
      return;
    }

    resetForm();
  }, [initialApplication, isConfigurationSection]);

  const showMessage = (text) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3000);
  };

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const toPayload = () => ({
    key: String(form.key || "").trim().toLowerCase(),
    name: String(form.name || "").trim(),
    description: String(form.description || "").trim(),
    baseUrl: String(form.baseUrl || "").trim(),
    loginUrl: String(form.loginUrl || "").trim() || null,
    logoutUrl: String(form.logoutUrl || "").trim() || null,
    redirectUris: String(form.redirectUris || "")
      .split(",")
      .map((item) => String(item || "").trim())
      .filter(Boolean),
    audience: String(form.audience || "").trim() || null,
    type: String(form.type || "first_party").trim().toLowerCase(),
    category: String(form.category || "").trim() || "business",
    legacyProductName: String(form.legacyProductName || "").trim().toUpperCase() || null,
    clientAuthMethod: String(form.clientAuthMethod || "client_secret_post").trim().toLowerCase(),
    supportsProvisioning: Boolean(form.supportsProvisioning),
    provisioningAdapter: String(form.provisioningAdapter || "").trim() || null
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      setSubmitting(true);
      const payload = toPayload();
      const response = editingAppId
        ? await api.put(`/applications/${editingAppId}`, payload)
        : await api.post("/applications", payload);
      const nextApplication = response?.data?.application || null;
      const generatedClientSecret = response?.data?.generatedClientSecret || null;

      if (nextApplication) {
        setApplications((prev) => {
          const items = Array.isArray(prev) ? prev : [];
          if (editingAppId) {
            return items.map((item) => (item.id === editingAppId ? nextApplication : item));
          }
          return [...items, nextApplication].sort((a, b) => String(a.name).localeCompare(String(b.name)));
        });
      } else {
        await reloadData();
      }

      if (generatedClientSecret && nextApplication) {
        setGeneratedSecret({
          applicationName: nextApplication.name,
          applicationKey: nextApplication.key,
          clientSecret: generatedClientSecret
        });
      } else {
        setGeneratedSecret(null);
      }

      appendActivity({
        type: editingAppId ? "application_update" : "application_create",
        title: editingAppId ? "Application Updated" : "Application Registered",
        description: `${payload.name} ${editingAppId ? "was updated" : "was added"} in GT ONE.`,
        details: {
          key: payload.key,
          name: payload.name,
          baseUrl: payload.baseUrl,
          legacyProductName: payload.legacyProductName
        }
      });

      showMessage(editingAppId ? "Product configuration updated successfully" : "Product configuration created successfully");
      resetForm();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to save product configuration");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (application) => {
    if (typeof onEditApplication === "function") {
      onEditApplication(application);
      return;
    }

    setEditingAppId(application.id);
    setForm(buildFormFromApplication(application));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleStatusToggle = async (application) => {
    setError("");
    try {
      const nextStatus = application.status === "active" ? "inactive" : "active";
      const response = await api.patch(`/applications/${application.id}/status`, {
        status: nextStatus
      });
      const nextApplication = response?.data?.application;

      setApplications((prev) =>
        (Array.isArray(prev) ? prev : []).map((item) =>
          item.id === application.id ? (nextApplication || { ...item, status: nextStatus }) : item
        )
      );

      appendActivity({
        type: "application_status",
        title: "Application Status Updated",
        description: `${application.name} was ${nextStatus === "active" ? "activated" : "deactivated"}.`,
        details: {
          key: application.key,
          status: nextStatus
        }
      });

      showMessage(`Application ${nextStatus === "active" ? "activated" : "deactivated"} successfully`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to update application status");
    }
  };

  const handleRemove = async (application) => {
    if (!window.confirm(`Soft delete ${application.name}? The app record stays in MongoDB, but it will be hidden and disconnected from companies.`)) return;
    setError("");
    try {
      await api.delete(`/applications/${application.id}`);
      setApplications((prev) => (Array.isArray(prev) ? prev : []).filter((item) => item.id !== application.id));
      appendActivity({
        type: "application_soft_delete",
        title: "Application Soft Deleted",
        description: `${application.name} was soft deleted from the registry.`,
        details: { key: application.key }
      });
      showMessage(`Application ${application.name} soft deleted successfully`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to soft delete application");
    }
  };

  const handleLegacySync = async () => {
    setError("");
    try {
      setSyncing(true);
      await api.post("/applications/legacy-sync");
      await reloadData();
      appendActivity({
        type: "application_sync",
        title: "Application Registry Synced",
        description: "Legacy product mappings were synced into the application registry.",
        details: {}
      });
      showMessage("Legacy product mappings synced successfully");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to sync application registry");
    } finally {
      setSyncing(false);
    }
  };

  const handleRotateSecret = async (application) => {
    setError("");
    try {
      setRotatingAppId(application.id);
      const response = await api.post(`/applications/${application.id}/rotate-secret`);
      const nextApplication = response?.data?.application || null;
      const generatedClientSecret = response?.data?.generatedClientSecret || null;

      if (nextApplication) {
        setApplications((prev) =>
          (Array.isArray(prev) ? prev : []).map((item) =>
            item.id === application.id ? nextApplication : item
          )
        );
      }

      if (generatedClientSecret) {
        setGeneratedSecret({
          applicationName: nextApplication?.name || application.name,
          applicationKey: nextApplication?.key || application.key,
          clientSecret: generatedClientSecret
        });
      }

      appendActivity({
        type: "application_secret_rotate",
        title: "Application Secret Rotated",
        description: `${application.name} client secret was rotated in GT ONE.`,
        details: {
          key: application.key
        }
      });

      showMessage(`Client secret rotated for ${application.name}`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to rotate application secret");
    } finally {
      setRotatingAppId(null);
    }
  };

  const handleCopyAuthorizeUrl = async (application) => {
    const authorizeUrl = buildSsoAuthorizeUrl(application);
    if (!authorizeUrl) {
      setError("Configure at least one redirect URI to generate an authorize URL");
      return;
    }

    try {
      await window.navigator.clipboard.writeText(authorizeUrl);
      showMessage(`Authorize URL copied for ${application.name}`);
    } catch {
      setError("Failed to copy authorize URL");
    }
  };

  const handleLoadConnectorTemplate = async (application) => {
    setError("");
    try {
      setConnectorLoading(true);
      const response = await api.get(`/applications/key/${application.key}/connector-template`);
      setConnectorTemplate(response.data);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to load connector template");
    } finally {
      setConnectorLoading(false);
    }
  };

  const handleCopyConnectorJson = async () => {
    if (!connectorTemplate) return;

    try {
      await window.navigator.clipboard.writeText(JSON.stringify(connectorTemplate, null, 2));
      showMessage(`Connector template copied for ${connectorTemplate.application?.name || "application"}`);
    } catch {
      setError("Failed to copy connector template");
    }
  };

  const handleCopyGeneratedSecret = async () => {
    if (!generatedSecret?.clientSecret) return;

    try {
      await window.navigator.clipboard.writeText(generatedSecret.clientSecret);
      showMessage(`Client secret copied for ${generatedSecret.applicationName}`);
    } catch {
      setError("Failed to copy client secret");
    }
  };

  const statsSection = (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <div style={{ ...cardStyle, flex: 1, minWidth: 200, borderLeft: "4px solid #2563eb", background: "linear-gradient(to right, #eff6ff, #ffffff)" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 900, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Registered Apps</div>
        <div style={{ marginTop: 10, fontSize: "1.9rem", fontWeight: 900, color: "#0f172a" }}>{stats.total}</div>
      </div>
      <div style={{ ...cardStyle, flex: 1, minWidth: 200, borderLeft: "4px solid #059669", background: "linear-gradient(to right, #ecfdf5, #ffffff)" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 900, color: "#047857", textTransform: "uppercase", letterSpacing: "0.05em" }}>Active Apps</div>
        <div style={{ marginTop: 10, fontSize: "1.9rem", fontWeight: 900, color: "#047857" }}>{stats.active}</div>
      </div>
      <div style={{ ...cardStyle, flex: 1, minWidth: 200, borderLeft: "4px solid #7c3aed", background: "linear-gradient(to right, #f5f3ff, #ffffff)" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 900, color: "#6d28d9", textTransform: "uppercase", letterSpacing: "0.05em" }}>Provisioned Apps</div>
        <div style={{ marginTop: 10, fontSize: "1.9rem", fontWeight: 900, color: "#6d28d9" }}>{stats.provisioning}</div>
      </div>
      <div style={{ ...cardStyle, flex: 1, minWidth: 200, borderLeft: "4px solid #f59e0b", background: "linear-gradient(to right, #fffbeb, #ffffff)" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 900, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.05em" }}>Mapped To Companies</div>
        <div style={{ marginTop: 10, fontSize: "1.9rem", fontWeight: 900, color: "#b45309" }}>{stats.mapped}</div>
      </div>
    </div>
  );

  const generatedSecretSection = generatedSecret ? (
    <div style={{ ...cardStyle, display: "grid", gap: 12, background: "#eff6ff", borderColor: "#bfdbfe" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "#1d4ed8" }}>
            Client Secret
          </div>
          <div style={{ marginTop: 6, fontSize: "1rem", fontWeight: 900, color: "#0f172a" }}>
            {generatedSecret.applicationName}
          </div>
          <div style={{ marginTop: 4, fontSize: "0.8rem", color: "#475569", fontWeight: 700 }}>
            Copy this once and store it in the product backend env as <span style={{ color: "#1d4ed8" }}>{buildClientSecretEnvVar(generatedSecret.applicationKey)}</span>.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleCopyGeneratedSecret}
            style={{ border: "1px solid #93c5fd", background: "#ffffff", color: "#1d4ed8", padding: "9px 12px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
          >
            Copy Secret
          </button>
          <button
            type="button"
            onClick={() => setGeneratedSecret(null)}
            style={{ border: "1px solid #dbe2ea", background: "#ffffff", color: "#475569", padding: "9px 12px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
          >
            Dismiss
          </button>
        </div>
      </div>

      <div style={{ padding: "14px 16px", borderRadius: 14, background: "#ffffff", border: "1px solid #dbeafe", fontSize: "0.88rem", fontWeight: 800, color: "#0f172a", wordBreak: "break-all" }}>
        {generatedSecret.clientSecret}
      </div>
    </div>
  ) : null;

  const registryInfoSection = isRegistrySection ? (
    <>
      <div style={{ ...cardStyle, padding: "14px 16px", background: "#f8fafc" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748b" }}>
          SSO Contract
        </div>
        <div style={{ marginTop: 8, fontSize: "0.85rem", color: "#0f172a", fontWeight: 700 }}>
          Browser authorize: <span style={{ color: "#2563eb" }}>GET {trimTrailingSlash(api?.defaults?.baseURL || "")}/sso/authorize</span>
        </div>
        <div style={{ marginTop: 6, fontSize: "0.85rem", color: "#0f172a", fontWeight: 700 }}>
          Product exchange: <span style={{ color: "#059669" }}>POST {trimTrailingSlash(api?.defaults?.baseURL || "")}/sso/exchange</span>
        </div>
        <div style={{ marginTop: 6, fontSize: "0.82rem", color: "#475569", fontWeight: 700 }}>
          Production mode: apps using <span style={{ color: "#92400e" }}>client_secret_post</span> must send their GT_ONE client secret during `/sso/exchange`.
        </div>
      </div>

      <div style={{ ...cardStyle, padding: "14px 16px", background: "#fffbeb", borderColor: "#fde68a" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "#92400e" }}>
          Security Overview
        </div>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div style={{ padding: "14px", borderRadius: 14, background: "#ffffff" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 900, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>Protected Apps</div>
            <div style={{ marginTop: 8, fontSize: "1.35rem", fontWeight: 900, color: "#0f172a" }}>{stats.protectedApps}</div>
          </div>
          <div style={{ padding: "14px", borderRadius: 14, background: "#ffffff" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 900, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>Secrets Ready</div>
            <div style={{ marginTop: 8, fontSize: "1.35rem", fontWeight: 900, color: "#0f172a" }}>{stats.secretsReady}</div>
          </div>
          <div style={{ padding: "14px", borderRadius: 14, background: "#ffffff" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 900, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>Needs Setup</div>
            <div style={{ marginTop: 8, fontSize: "1.35rem", fontWeight: 900, color: "#b45309" }}>
              {Math.max(stats.protectedApps - stats.secretsReady, 0)}
            </div>
          </div>
        </div>
      </div>
    </>
  ) : (
    <div style={{ ...cardStyle, padding: "16px 18px", background: "linear-gradient(135deg, #eff6ff, #ffffff)", borderColor: "#bfdbfe" }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "#1d4ed8" }}>
        Product Configuration
      </div>
      <div style={{ marginTop: 8, fontSize: "1rem", fontWeight: 900, color: "#0f172a" }}>
        {editingAppId ? "Update product connection settings" : "Register a new product connection"}
      </div>
      <div style={{ marginTop: 6, fontSize: "0.82rem", color: "#475569", fontWeight: 700 }}>
        Use this section for app key, redirect URLs, provisioning adapter, and SSO client-auth configuration.
      </div>
    </div>
  );

  const connectorTemplateSection = isRegistrySection && connectorTemplate ? (
    <div style={{ ...cardStyle, display: "grid", gap: 14, background: "#fffbeb", borderColor: "#fde68a" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "#92400e" }}>
            Product Connector Blueprint
          </div>
          <div style={{ marginTop: 6, fontSize: "1rem", fontWeight: 900, color: "#0f172a" }}>
            {connectorTemplate.application?.name}
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopyConnectorJson}
          style={{ border: "1px solid #f59e0b", background: "#ffffff", color: "#92400e", padding: "9px 12px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
        >
          Copy Connector JSON
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <div style={{ padding: "14px", borderRadius: 14, background: "#ffffff" }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 900, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>Callback URL</div>
          <div style={{ marginTop: 8, fontSize: "0.84rem", fontWeight: 700, color: "#0f172a", wordBreak: "break-all" }}>
            {connectorTemplate.sso?.callbackUrl || "-"}
          </div>
        </div>
        <div style={{ padding: "14px", borderRadius: 14, background: "#ffffff" }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 900, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>Browser Authorize</div>
          <div style={{ marginTop: 8, fontSize: "0.84rem", fontWeight: 700, color: "#0f172a", wordBreak: "break-all" }}>
            {connectorTemplate.sso?.browserAuthorizeUrl || "-"}
          </div>
        </div>
        <div style={{ padding: "14px", borderRadius: 14, background: "#ffffff" }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 900, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>Exchange Endpoint</div>
          <div style={{ marginTop: 8, fontSize: "0.84rem", fontWeight: 700, color: "#0f172a", wordBreak: "break-all" }}>
            {connectorTemplate.sso?.exchangeUrl || "-"}
          </div>
        </div>
        <div style={{ padding: "14px", borderRadius: 14, background: "#ffffff" }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 900, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>Client Auth</div>
          <div style={{ marginTop: 8, fontSize: "0.84rem", fontWeight: 700, color: "#0f172a" }}>
            {connectorTemplate.sso?.clientAuthentication?.method || "-"}
          </div>
          <div style={{ marginTop: 6, fontSize: "0.76rem", color: "#64748b", fontWeight: 700 }}>
            {connectorTemplate.sso?.clientAuthentication?.clientSecretRequired
              ? connectorTemplate.sso?.clientAuthentication?.clientSecretConfigured
                ? `Use env ${connectorTemplate.sso?.clientAuthentication?.clientSecretEnvVar}`
                : "Rotate a secret in GT_ONE before product exchange"
              : "No client secret required"}
          </div>
        </div>
      </div>

      {connectorTemplate.sso?.noCodeOidc ? (
        <div style={{ padding: "16px", borderRadius: 16, background: "#ffffff", border: "1px solid #fde68a", display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 900, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              No-Code OIDC Setup
            </div>
            <div style={{ marginTop: 6, fontSize: "0.82rem", color: "#475569", fontWeight: 700 }}>
              Use these values when the product supports OpenID Connect or generic OAuth login.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {[
              ["Discovery URL", connectorTemplate.sso.noCodeOidc.discoveryUrl],
              ["Client ID", connectorTemplate.sso.noCodeOidc.clientId],
              ["Client Secret Env", connectorTemplate.sso.noCodeOidc.clientSecretEnvVar],
              ["Scopes", (connectorTemplate.sso.noCodeOidc.scopes || []).join(" ")],
              ["Token Endpoint", connectorTemplate.sso.noCodeOidc.tokenEndpoint],
              ["UserInfo Endpoint", connectorTemplate.sso.noCodeOidc.userInfoEndpoint],
              ["JWKS URI", connectorTemplate.sso.noCodeOidc.jwksUri]
            ].map(([label, value]) => (
              <div key={label} style={{ padding: "12px", borderRadius: 12, background: "#fffbeb" }}>
                <div style={{ fontSize: "0.66rem", fontWeight: 900, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                <div style={{ marginTop: 7, fontSize: "0.82rem", fontWeight: 800, color: "#0f172a", wordBreak: "break-all" }}>{value || "-"}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        <div style={{ padding: "16px", borderRadius: 16, background: "#ffffff", border: "1px solid #fde68a" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 900, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            Local User Fields
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {(connectorTemplate.productDatabase?.localUser || []).map((item) => (
              <div key={item.field} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.82rem" }}>
                <span style={{ fontWeight: 800, color: "#0f172a" }}>{item.field}</span>
                <span style={{ color: "#64748b", textAlign: "right" }}>{item.source}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "16px", borderRadius: 16, background: "#ffffff", border: "1px solid #fde68a" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 900, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            Identity Link Fields
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {(connectorTemplate.productDatabase?.identityLink || []).map((item) => (
              <div key={item.field} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.82rem" }}>
                <span style={{ fontWeight: 800, color: "#0f172a" }}>{item.field}</span>
                <span style={{ color: "#64748b", textAlign: "right" }}>{item.source}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "16px", borderRadius: 16, background: "#ffffff", border: "1px solid #fde68a" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 900, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
          Product Sync Steps
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {(connectorTemplate.productDatabase?.syncSteps || []).map((step, index) => (
            <div key={step} style={{ display: "flex", gap: 10, fontSize: "0.84rem", color: "#0f172a" }}>
              <span style={{ fontWeight: 900, color: "#92400e" }}>{index + 1}.</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  const configurationFormSection = (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 760px)", gap: 18 }}>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 900, color: "#0f172a" }}>
              {editingAppId ? "Edit Product Configuration" : "Register Product Configuration"}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 4 }}>
              Add GT_ONE product metadata once, then reuse it across products.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {editingAppId ? (
              <button
                type="button"
                onClick={resetForm}
                style={{ border: "none", background: "#f1f5f9", color: "#475569", padding: "8px 12px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
              >
                Create New
              </button>
            ) : null}
            <button
              type="button"
              disabled={syncing}
              onClick={handleLegacySync}
              style={{ border: "1px solid #dbe2ea", background: "#ffffff", color: "#0f172a", padding: "8px 12px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
            >
              {syncing ? "Syncing..." : "Legacy Sync"}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>App Key</label>
              <input name="key" value={form.key} onChange={handleInputChange} placeholder="crm" style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>App Name</label>
              <input name="name" value={form.name} onChange={handleInputChange} placeholder="CRM" style={inputStyle} required />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Base URL</label>
            <input name="baseUrl" value={form.baseUrl} onChange={handleInputChange} placeholder="https://crm.example.com" style={inputStyle} required />
          </div>

          <div>
            <label style={labelStyle}>Redirect URIs</label>
            <input name="redirectUris" value={form.redirectUris} onChange={handleInputChange} placeholder="https://crm.example.com, https://crm.example.com/auth/callback" style={inputStyle} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Audience</label>
              <input name="audience" value={form.audience} onChange={handleInputChange} placeholder="crm" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Client Auth</label>
              <select name="clientAuthMethod" value={form.clientAuthMethod} onChange={handleInputChange} style={inputStyle}>
                <option value="client_secret_post">client_secret_post</option>
                <option value="none">none</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Legacy Product</label>
              <input name="legacyProductName" value={form.legacyProductName} onChange={handleInputChange} placeholder="CRM" style={inputStyle} />
            </div>
            <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 14, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#0f172a" }}>
                {form.clientAuthMethod === "client_secret_post" ? "Protected exchange" : "Open exchange"}
              </div>
              <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: 4 }}>
                {form.clientAuthMethod === "client_secret_post"
                  ? "Product backend must send its GT_ONE client secret during code exchange."
                  : "Use only for controlled internal or temporary integrations."}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select name="type" value={form.type} onChange={handleInputChange} style={inputStyle}>
                <option value="first_party">first_party</option>
                <option value="external">external</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <input name="category" value={form.category} onChange={handleInputChange} placeholder="business" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Login URL</label>
              <input name="loginUrl" value={form.loginUrl} onChange={handleInputChange} placeholder="https://crm.example.com/login" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Logout URL</label>
              <input name="logoutUrl" value={form.logoutUrl} onChange={handleInputChange} placeholder="https://crm.example.com/logout" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleInputChange}
              placeholder="Short description of this application"
              style={{ ...inputStyle, minHeight: 88, resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 14, border: "1px solid #e2e8f0" }}>
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#0f172a" }}>Supports provisioning</div>
              <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: 2 }}>Enable when GT_ONE should provision tenant/workspace data for this app.</div>
            </div>
            <input type="checkbox" name="supportsProvisioning" checked={form.supportsProvisioning} onChange={handleInputChange} />
          </div>

          {form.supportsProvisioning ? (
            <div>
              <label style={labelStyle}>Provisioning Adapter</label>
              <input name="provisioningAdapter" value={form.provisioningAdapter} onChange={handleInputChange} placeholder="hrms" style={inputStyle} />
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="submit"
              disabled={submitting}
              style={{ border: "none", background: "#2563eb", color: "#ffffff", padding: "12px 18px", borderRadius: 12, fontWeight: 900, cursor: "pointer", flex: 1 }}
            >
              {submitting ? "Saving..." : editingAppId ? "Update Product Configuration" : "Create Product Configuration"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const registryListSection = (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ ...cardStyle, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 900, color: "#0f172a" }}>Application Registry</div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 4 }}>
              These are the products GT_ONE can connect to using the registry.
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {applicationCards.length === 0 ? (
            <div style={{ padding: 28, border: "1px dashed #cbd5e1", borderRadius: 18, textAlign: "center", color: "#64748b", fontWeight: 700 }}>
              No applications registered yet.
            </div>
          ) : null}

          {applicationCards.map((application) => (
            <div
              key={application.id}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 18,
                padding: 18,
                background: application.status === "active" ? "#ffffff" : "#f8fafc"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 900, color: "#0f172a" }}>{application.name}</h3>
                    <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: "0.72rem", fontWeight: 900, background: application.status === "active" ? "#dcfce7" : "#fee2e2", color: application.status === "active" ? "#166534" : "#991b1b" }}>
                      {application.status}
                    </span>
                    <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: "0.72rem", fontWeight: 900, background: "#eff6ff", color: "#1d4ed8" }}>
                      {application.key}
                    </span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: "0.84rem", color: "#475569", fontWeight: 700, wordBreak: "break-all" }}>
                    {application.baseUrl}
                  </div>
                  {application.description ? (
                    <div style={{ marginTop: 8, fontSize: "0.8rem", color: "#64748b" }}>{application.description}</div>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => handleLoadConnectorTemplate(application)}
                    style={{ border: "1px solid #dbe2ea", background: "#fffbeb", color: "#92400e", padding: "9px 12px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
                  >
                    {connectorLoading && connectorTemplate?.application?.key === application.key ? "Loading..." : "Connector"}
                  </button>
                  {application.clientAuthMethod === "client_secret_post" ? (
                    <button
                      type="button"
                      onClick={() => handleRotateSecret(application)}
                      style={{ border: "1px solid #dbe2ea", background: "#eff6ff", color: "#1d4ed8", padding: "9px 12px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
                    >
                      {rotatingAppId === application.id ? "Rotating..." : "Rotate Secret"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleCopyAuthorizeUrl(application)}
                    style={{ border: "1px solid #dbe2ea", background: "#eff6ff", color: "#1d4ed8", padding: "9px 12px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
                  >
                    Copy SSO URL
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(application)}
                    style={{ border: "1px solid #dbe2ea", background: "#ffffff", color: "#0f172a", padding: "9px 12px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusToggle(application)}
                    style={{ border: "none", background: application.status === "active" ? "#fee2e2" : "#dcfce7", color: application.status === "active" ? "#991b1b" : "#166534", padding: "9px 12px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
                  >
                    {application.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(application)}
                    style={{ border: "none", background: "#fef2f2", color: "#b91c1c", padding: "9px 12px", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}
                  >
                    Soft Delete
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 16 }}>
                <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 14 }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Audience</div>
                  <div style={{ marginTop: 6, fontSize: "0.9rem", fontWeight: 800, color: "#0f172a" }}>{application.audience || "-"}</div>
                </div>
                <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 14 }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Client Auth</div>
                  <div style={{ marginTop: 6, fontSize: "0.9rem", fontWeight: 800, color: "#0f172a" }}>{application.clientAuthMethod || "-"}</div>
                </div>
                <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 14 }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Assigned Companies</div>
                  <div style={{ marginTop: 6, fontSize: "0.9rem", fontWeight: 800, color: "#0f172a" }}>{application.assignedCompanies}</div>
                </div>
                <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 14 }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Redirect URIs</div>
                  <div style={{ marginTop: 6, fontSize: "0.9rem", fontWeight: 800, color: "#0f172a" }}>
                    {Array.isArray(application.redirectUris) ? application.redirectUris.length : 0}
                  </div>
                </div>
                <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 14 }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Provisioning</div>
                  <div style={{ marginTop: 6, fontSize: "0.9rem", fontWeight: 800, color: application.supportsProvisioning ? "#6d28d9" : "#64748b" }}>
                    {application.supportsProvisioning ? application.provisioningAdapter || "Enabled" : "Disabled"}
                  </div>
                </div>
                <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 14 }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Secret Status</div>
                  <div style={{ marginTop: 6, fontSize: "0.9rem", fontWeight: 800, color: application.clientAuthMethod === "client_secret_post" ? (application.clientSecretConfigured ? "#166534" : "#b45309") : "#64748b" }}>
                    {application.clientAuthMethod === "client_secret_post"
                      ? application.clientSecretConfigured ? "Configured" : "Needs Rotation"
                      : "Not Required"}
                  </div>
                </div>
                <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 14 }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Last Rotated</div>
                  <div style={{ marginTop: 6, fontSize: "0.84rem", fontWeight: 800, color: "#0f172a" }}>
                    {formatDateTime(application.clientSecretLastRotatedAt)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="registry-workspace" style={{ display: "grid", gap: 18 }}>
      {statsSection}

      {message ? (
        <div style={{ ...cardStyle, padding: "12px 16px", background: "#ecfdf5", borderColor: "#bbf7d0", color: "#166534", fontWeight: 800 }}>
          {message}
        </div>
      ) : null}

      {generatedSecretSection}
      {registryInfoSection}
      {connectorTemplateSection}
      {isConfigurationSection ? configurationFormSection : registryListSection}
    </div>
  );
}

export default ApplicationRegistryPanel;
