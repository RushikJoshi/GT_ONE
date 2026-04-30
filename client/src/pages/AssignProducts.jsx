import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { appendActivity } from "../lib/activityLog";
import "./AssignProducts.css";
import AdminLayout from "../components/AdminLayout";
import { useSuperAdmin } from "../context/SuperAdminContext";

const TOAST_TIMEOUT = 2500;

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

function ProductRowIcon({ productName }) {
  const key = String(productName || "").toUpperCase();

  if (key === "CRM") {
    return (
      <svg {...iconProps} aria-hidden>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  if (key === "HRMS") {
    return (
      <svg {...iconProps} aria-hidden>
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
        <path d="M6 12h12" />
        <path d="M6 16h12" />
        <path d="M10 6h.01" />
        <path d="M14 6h.01" />
      </svg>
    );
  }

  if (key === "PMS") {
    return (
      <svg {...iconProps} aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h8" />
        <path d="M8 9h2" />
      </svg>
    );
  }

  return (
    <svg {...iconProps} aria-hidden>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

function formatGtProductName(name) {
  const n = String(name || "").trim();
  if (!n) return "GT";
  return `GT ${n}`;
}

/** Matches server `HRMS_MODULE_KEYS` — used to filter modules per product in the UI. */
const ALL_HRMS_MODULE_KEYS = [
  "hr",
  "attendance",
  "leave",
  "payroll",
  "recruitment",
  "backgroundVerification",
  "documentManagement",
  "employeePortal",
  "socialMediaIntegration",
  "reports"
];

function getProductScopedModuleLabel(selectedProductName, moduleKey, fallbackLabel) {
  const upper = String(selectedProductName || "").toUpperCase();
  if (upper === "CRM" && moduleKey === "recruitment") return "CRM";
  if (upper === "PMS" && moduleKey === "documentManagement") return "PMS";
  if (upper === "DMS" && moduleKey === "documentManagement") return "DMS";
  return fallbackLabel;
}

const FALLBACK_MODULE_DEFINITIONS = {
  HRMS: ALL_HRMS_MODULE_KEYS.map((key) => ({ key, label: moduleLabelFallback(key) })),
  TMS: [
    { key: "projects", label: "Projects" },
    { key: "tasks", label: "Tasks" },
    { key: "timesheets", label: "Timesheets" },
    { key: "milestones", label: "Milestones" },
    { key: "reports", label: "Reports" }
  ],
  CRM: [
    { key: "leads", label: "Leads" },
    { key: "contacts", label: "Contacts" },
    { key: "deals", label: "Deals" },
    { key: "pipeline", label: "Pipeline" },
    { key: "activities", label: "Activities" },
    { key: "reports", label: "Reports" }
  ],
  PMS: [
    { key: "projects", label: "Projects" },
    { key: "tasks", label: "Tasks" },
    { key: "milestones", label: "Milestones" },
    { key: "files", label: "Files" },
    { key: "reports", label: "Reports" }
  ],
  PSA: [
    { key: "proposals", label: "Proposals" },
    { key: "resourcePlanning", label: "Resource Planning" },
    { key: "billing", label: "Billing" },
    { key: "projectAccounting", label: "Project Accounting" },
    { key: "reports", label: "Reports" }
  ],
  DMS: [
    { key: "documents", label: "Documents" },
    { key: "folders", label: "Folders" },
    { key: "sharing", label: "Sharing" },
    { key: "approvals", label: "Approvals" },
    { key: "auditTrail", label: "Audit Trail" }
  ]
};

const MODULE_COLORS = [
  "#2563eb",
  "#10b981",
  "#ef4444",
  "#f59e0b",
  "#6366f1",
  "#8b5cf6",
  "#7c3aed",
  "#a855f7",
  "#ec4899",
  "#14b8a6"
];

function moduleLabelFallback(key) {
  const labels = {
    hr: "HR Management",
    attendance: "Attendance",
    leave: "Leave Management",
    payroll: "Payroll System",
    recruitment: "Recruitment",
    backgroundVerification: "Background Verification",
    documentManagement: "Document Management",
    employeePortal: "Employee Portal",
    socialMediaIntegration: "Social Media Integration",
    reports: "Reports"
  };
  return labels[key] || key;
}

function normalizeProductKey(productName) {
  return String(productName || "").trim().toUpperCase();
}

function mapModuleDefinitions(definitions, productName) {
  const fallback = FALLBACK_MODULE_DEFINITIONS[normalizeProductKey(productName)] || [];
  const source = Array.isArray(definitions) && definitions.length ? definitions : fallback;
  return source.reduce((acc, item, index) => {
    acc[item.key] = {
      label: item.label || item.key,
      color: item.color || MODULE_COLORS[index % MODULE_COLORS.length]
    };
    return acc;
  }, {});
}

function AssignProducts() {
  const navigate = useNavigate();
  const { companyId } = useParams();

  const {
    products: allProducts,
    companies,
    isLoaded: isGlobalLoaded
  } = useSuperAdmin();

  const [productModuleConfigs, setProductModuleConfigs] = useState({});
  const [company, setCompany] = useState(null);
  const [enabledModules, setEnabledModules] = useState({});
  const [loading, setLoading] = useState(!isGlobalLoaded);
  const [savingModules, setSavingModules] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [selectedProductName, setSelectedProductName] = useState("");
  const [allCompaniesModuleStats, setAllCompaniesModuleStats] = useState({
    total: 0,
    active: 0,
    inactive: 0
  });

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, TOAST_TIMEOUT);
  };

  const [serverModules, setServerModules] = useState({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);

  const loadPage = useCallback(async () => {
    setError("");
    try {
      setLoading(true);

      // Always fetch latest data for this company specifically to ensure we are up to date
      const [productModulesRes, statsRes, companiesRes] = await Promise.all([
        api.get(`/super-admin/companies/${companyId}/product-modules`),
        api.get("/super-admin/module-stats"),
        api.get("/companies") // Fetch fresh companies to ensure product assignments are latest
      ]);

      const latestCompanies = companiesRes.data.companies || [];
      const targetCompany = latestCompanies.find((item) => item._id === companyId);

      if (!targetCompany) {
        setError("Company not found");
        return;
      }

      setCompany(targetCompany);
      const productModules = Array.isArray(productModulesRes.data?.products)
        ? productModulesRes.data.products
        : [];
      const configs = productModules.reduce((acc, item) => {
        const key = normalizeProductKey(item.productName);
        if (key) acc[key] = item;
        return acc;
      }, {});
      setProductModuleConfigs(configs);

      const serverStats = statsRes?.data || null;
      if (
        serverStats &&
        typeof serverStats.total === "number" &&
        typeof serverStats.active === "number" &&
        typeof serverStats.inactive === "number"
      ) {
        setAllCompaniesModuleStats(serverStats);
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to load page");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const filteredProducts = useMemo(() => {
    const products = allProducts || [];

    const companyProducts = Array.isArray(company?.products) ? company.products : null;
    // Only show products that are assigned to the selected company.
    // If none are assigned, show none (no fallback to all products).
    if (!companyProducts || companyProducts.length === 0) return [];

    const allowed = new Set(
      companyProducts.map((n) => String(n || "").trim().toUpperCase()).filter(Boolean)
    );
    return products.filter((p) => allowed.has(String(p?.name || "").trim().toUpperCase()));
  }, [allProducts, company]);

  useEffect(() => {
    if (!filteredProducts.length) {
      setSelectedProductName("");
      return;
    }
    setSelectedProductName((prev) => {
      if (prev && filteredProducts.some((p) => p.name === prev)) return prev;
      return filteredProducts[0].name;
    });
  }, [filteredProducts]);

  const selectedProductKey = normalizeProductKey(selectedProductName);
  const selectedModuleConfig = productModuleConfigs[selectedProductKey] || null;
  const moduleKeys = selectedModuleConfig?.moduleKeys || [];
  const moduleMeta = useMemo(
    () => mapModuleDefinitions(selectedModuleConfig?.moduleDefinitions, selectedProductName),
    [selectedModuleConfig, selectedProductName]
  );

  useEffect(() => {
    const modules = selectedModuleConfig?.enabledModules || {};
    setEnabledModules(modules);
    setServerModules(modules);
  }, [selectedModuleConfig]);

  const visibleModuleKeys = useMemo(
    () => moduleKeys,
    [moduleKeys]
  );

  const toggleModule = (key) => {
    setEnabledModules((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const getChangesSummary = (payload) => {
    const keysForDiff = Array.isArray(visibleModuleKeys) ? visibleModuleKeys : [];
    const activatedKeys = keysForDiff.filter((k) => !serverModules[k] && Boolean(payload[k]));
    const deactivatedKeys = keysForDiff.filter((k) => Boolean(serverModules[k]) && !payload[k]);
    
    return {
      activated: activatedKeys.map(k => moduleMeta[k]?.label || k),
      deactivated: deactivatedKeys.map(k => moduleMeta[k]?.label || k),
      hasChanges: activatedKeys.length > 0 || deactivatedKeys.length > 0
    };
  };

  const saveModules = async (overrideEnabledModules) => {
    setError("");

    try {
      const payload = overrideEnabledModules || pendingPayload || enabledModules;
      const { activated, deactivated, hasChanges } = getChangesSummary(payload);

      if (!hasChanges) {
        showToast("info", "No changes to save");
        return;
      }

      setSavingModules(true);
      const res = await api.put(`/super-admin/companies/${companyId}/products/${encodeURIComponent(selectedProductName)}/modules`, {
        enabledModules: payload
      });
      
      const nextModules = res.data.enabledModules || {};
      setEnabledModules(nextModules);
      setServerModules(nextModules);
      setProductModuleConfigs((prev) => ({
        ...prev,
        [normalizeProductKey(res.data.productName || selectedProductName)]: {
          ...(prev[normalizeProductKey(res.data.productName || selectedProductName)] || {}),
          productId: res.data.productId || selectedModuleConfig?.productId || null,
          productName: res.data.productName || selectedProductName,
          moduleDefinitions: res.data.moduleDefinitions || selectedModuleConfig?.moduleDefinitions || [],
          moduleKeys: res.data.moduleKeys || moduleKeys,
          enabledModules: nextModules,
          modules: res.data.modules || []
        }
      }));
      
      try {
        const statsRes = await api.get("/super-admin/module-stats");
        const serverStats = statsRes?.data || null;
        if (
          serverStats &&
          typeof serverStats.total === "number" &&
          typeof serverStats.active === "number" &&
          typeof serverStats.inactive === "number"
        ) {
          setAllCompaniesModuleStats(serverStats);
        }
      } catch {
        // ignore stats refresh failures
      }

      appendActivity({
        type: "product_module_update",
        title: "Product Modules Updated",
        description: `Updated ${formatGtProductName(selectedProductName)} modules for ${company?.name || "company"}.`,
        details: {
          companyName: company?.name || null,
          product: selectedProductName,
          activated,
          deactivated,
          allEnabled: Object.keys(nextModules).filter(k => nextModules[k]).map(k => moduleMeta[k]?.label || k)
        }
      });

      showToast("success", "Product modules updated successfully");
      setShowConfirmModal(false);
      setPendingPayload(null);
    } catch (requestError) {
      const message = requestError?.response?.data?.message || "Failed to update product modules";
      setError(message);
      showToast("error", message);
    } finally {
      setSavingModules(false);
    }
  };

  const handleInitialSave = () => {
    const payload = enabledModules;
    const { hasChanges } = getChangesSummary(payload);
    if (!hasChanges) {
      showToast("info", "No changes detected");
      return;
    }
    setPendingPayload(payload);
    setShowConfirmModal(true);
  };

  const activeCount = visibleModuleKeys.filter((key) => Boolean(enabledModules[key])).length;
  const inactiveCount = Math.max(0, visibleModuleKeys.length - activeCount);
  const allVisibleModulesEnabled =
    visibleModuleKeys.length > 0 && visibleModuleKeys.every((key) => Boolean(enabledModules[key]));
  const hasPendingChanges = getChangesSummary(enabledModules).hasChanges;

  const totalModulesAllCompanies = useMemo(() => {
    const list = Array.isArray(companies) ? companies : [];
    return list.reduce((sum, c) => {
      const companyProducts = Array.isArray(c?.products) ? c.products : [];
      const normalizedProducts = companyProducts
        .map((p) => normalizeProductKey(p))
        .filter(Boolean);

      const companyTotal = normalizedProducts.reduce((n, productName) => {
        const definitions = FALLBACK_MODULE_DEFINITIONS[productName] || [];
        return n + definitions.length;
      }, 0);

      return sum + companyTotal;
    }, 0);
  }, [companies]);

  const toggleAllModules = () => {
    setEnabledModules((prev) => {
      const keys = visibleModuleKeys;
      const allOn = keys.length > 0 && keys.every((key) => Boolean(prev[key]));
      const nextValue = !allOn;
      const next = { ...prev };
      keys.forEach((key) => {
        next[key] = nextValue;
      });
      return next;
    });
  };

  if (loading) {
    return <div className="center-screen">Loading company configuration...</div>;
  }

  return (
    <AdminLayout activeTab="products" setActiveTab={(id) => navigate("/dashboard", { state: { activeTab: id } })}>
      <div className="module-page module-page--flush">

        <div className="config-shell">
          {/* Top stats */}
          <div className="config-company-row stats-row">
            <div className="stat-card stat-card--total">
              <div className="stat-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2 2 7l10 5 10-5-10-5Z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="stat-main">
                <div className="stat-label">Total Modules</div>
                <div className="stat-value">{allCompaniesModuleStats.total || totalModulesAllCompanies}</div>
              </div>
              <div className="stat-meta" />
            </div>
            <div className="stat-card stat-card--active">
              <div className="stat-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <div className="stat-main">
                <div className="stat-label">Active Modules</div>
                <div className="stat-value">{allCompaniesModuleStats.active}</div>
              </div>
              <div className="stat-meta" />
            </div>
            <div className="stat-card stat-card--inactive">
              <div className="stat-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </div>
              <div className="stat-main">
                <div className="stat-label">Inactive Modules</div>
                <div className="stat-value">{allCompaniesModuleStats.inactive}</div>
              </div>
              <div className="stat-meta" />
            </div>
          </div>

          {/* Full-width company selector row */}
          <div className="config-company-row company-row">
            <div className="selected-company">
              <div className="selected-company-left">
                <div style={{ minWidth: 0, width: "100%" }}>
                  <select
                    className="company-select"
                    value={companyId || ""}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      if (!nextId) return;
                      navigate(`/companies/${nextId}/products`);
                    }}
                  >
                    {(companies || []).map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="company-actions">
                <button
                  type="button"
                  className="company-action company-action--secondary"
                  onClick={loadPage}
                  disabled={loading}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <path d="M21 3v6h-6" />
                  </svg>
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {/* Left: Products */}
          <div className="config-left">
            <div className="module-card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0", fontWeight: 900, color: "#0f172a" }}>
                Products
              </div>
              <div style={{ padding: 14, display: "grid", gap: 10 }}>
                {filteredProducts.map((product) => {
                  const isSelected = product.name === selectedProductName;
                  return (
                    <button
                      key={product._id}
                      type="button"
                      className={`product-option product-option--selectable${isSelected ? " product-option--selected" : ""}`}
                      onClick={() => setSelectedProductName(product.name)}
                    >
                      <span className="product-option-icon-wrap" aria-hidden>
                        <ProductRowIcon productName={product.name} />
                      </span>
                      <span className="product-option-label">{formatGtProductName(product.name)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Product Modules */}
          <div className="config-right">
            <div className="module-card module-card-pad">
              <div className="modules-head">
                <div className="modules-kpi">
                  <span style={{ opacity: 0.9 }}>
                    {activeCount} Active / {inactiveCount} Disabled
                    {selectedProductName ? (
                      <span className="modules-kpi-product"> · {formatGtProductName(selectedProductName)}</span>
                    ) : null}
                  </span>
                </div>
                <button
                  type="button"
                  className="ghost-action"
                  onClick={toggleAllModules}
                  disabled={savingModules || visibleModuleKeys.length === 0}
                >
                  {allVisibleModulesEnabled ? "Disable All" : "Enable All"}
                </button>
              </div>

              <div className="modules-grid">
                {visibleModuleKeys.length === 0 ? (
                  <p className="modules-empty">
                    {filteredProducts.length === 0 ? "No products assigned to this company." : "No modules for this product."}
                  </p>
                ) : null}
                {visibleModuleKeys.map((key) => {
                  const meta = moduleMeta[key] || { label: String(key), color: "#2563eb", icon: "file" };
                  const isOn = Boolean(enabledModules[key]);
                  const moduleLabel = meta.label || getProductScopedModuleLabel(selectedProductName, key, key);
                  return (
                    <div
                      key={key}
                      className="module-tile"
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleModule(key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleModule(key);
                        }
                      }}
                    >
                      <div className="module-left">
                        <div style={{ minWidth: 0 }}>
                          <div className="module-name">{moduleLabel}</div>
                          <div className={`module-status ${isOn ? "active" : "inactive"}`}>{isOn ? "Active" : "Inactive"}</div>
                        </div>
                      </div>
                      <input
                        className="module-switch"
                        type="checkbox"
                        checked={isOn}
                        onChange={() => toggleModule(key)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Toggle ${moduleLabel}`}
                      />
                    </div>
                  );
                })}
              </div>

              <div style={{ paddingTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="modules-save-btn"
                  onClick={handleInitialSave}
                  disabled={savingModules || !hasPendingChanges}
                >
                  {savingModules ? "Saving..." : hasPendingChanges ? "Save Modules" : "Synced"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {showConfirmModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.4)",
              backdropFilter: "blur(4px)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20
            }}
          >
            <div
              style={{
                background: "white",
                width: "100%",
                maxWidth: "460px",
                borderRadius: "24px",
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
                overflow: "hidden",
                animation: "fadeInDown 0.2s ease-out"
              }}
            >
              <div style={{ padding: "24px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 900, color: "#0f172a" }}>Confirm Changes</h3>
                <button onClick={() => setShowConfirmModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#64748b" }}>✕</button>
              </div>
              
              <div style={{ padding: "24px", maxHeight: "60vh", overflowY: "auto" }}>
                <p style={{ margin: "0 0 16px 0", fontSize: "0.95rem", color: "#475569", fontWeight: 600 }}>
                  Are you sure you want to update {formatGtProductName(selectedProductName)} modules for <strong>{company?.name}</strong>?
                </p>

                {(() => {
                  const { activated, deactivated } = getChangesSummary(pendingPayload);
                  return (
                    <div style={{ display: "grid", gap: "16px" }}>
                      {activated.length > 0 && (
                        <div style={{ padding: "16px", background: "#f0fdf4", borderRadius: "16px", border: "1px solid #bbf7d0" }}>
                          <div style={{ fontSize: "0.75rem", fontWeight: 900, color: "#15803d", textTransform: "uppercase", marginBottom: "8px", display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                            Enabling
                          </div>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            {activated.map(item => (
                              <span key={item} style={{ background: "white", padding: "4px 10px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 700, color: "#166534", border: "1px solid #dcfce7" }}>{item}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {deactivated.length > 0 && (
                        <div style={{ padding: "16px", background: "#fef2f2", borderRadius: "16px", border: "1px solid #fecaca" }}>
                          <div style={{ fontSize: "0.75rem", fontWeight: 900, color: "#b91c1c", textTransform: "uppercase", marginBottom: "8px", display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                            Disabling
                          </div>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            {deactivated.map(item => (
                              <span key={item} style={{ background: "white", padding: "4px 10px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 700, color: "#991b1b", border: "1px solid #fee2e2" }}>{item}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div style={{ padding: "20px 24px", background: "#f8fafc", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  style={{ padding: "10px 20px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "white", color: "#64748b", fontWeight: 800, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveModules()}
                  disabled={savingModules}
                  style={{
                    padding: "10px 24px", borderRadius: "12px", border: "none",
                    background: "#2563eb", color: "white", fontWeight: 800,
                    cursor: "pointer", boxShadow: "0 10px 15px -3px rgba(37, 99, 235, 0.25)"
                  }}
                >
                  {savingModules ? "Saving..." : "Confirm & Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        {toast && (
          <div className={toast.type === "success" ? "toast success" : "toast error"}>
            {toast.message}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default AssignProducts;
