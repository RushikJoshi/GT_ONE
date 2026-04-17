import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import { appendActivity, readActivities } from "../lib/activityLog";
import AdminLayout from "../components/AdminLayout";

const defaultCreateForm = {
  name: "",
  email: "",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
  phone: "",
  companyType: "",
  gstNumber: "",
  panNumber: "",
  registrationNo: "",
  district: "",
  country: "",
  state: "",
  officeAddress: "",
  subCompanyLimit: "",
  products: []
};

const DISTRICT_AUTOFILL = {
  // Gujarat
  ahmedabad: { state: "Gujarat", country: "India" },
  surat: { state: "Gujarat", country: "India" },
  vadodara: { state: "Gujarat", country: "India" },
  baroda: { state: "Gujarat", country: "India" },
  rajkot: { state: "Gujarat", country: "India" },
  gandhinagar: { state: "Gujarat", country: "India" },
  jamnagar: { state: "Gujarat", country: "India" },
  bhavnagar: { state: "Gujarat", country: "India" },
  junagadh: { state: "Gujarat", country: "India" },
  mehsana: { state: "Gujarat", country: "India" },
  bharuch: { state: "Gujarat", country: "India" },
  anand: { state: "Gujarat", country: "India" },
  valsad: { state: "Gujarat", country: "India" },
  navsari: { state: "Gujarat", country: "India" },
  kheda: { state: "Gujarat", country: "India" },
  patan: { state: "Gujarat", country: "India" },
  // Maharashtra
  mumbai: { state: "Maharashtra", country: "India" },
  pune: { state: "Maharashtra", country: "India" },
  nagpur: { state: "Maharashtra", country: "India" },
  // Delhi
  delhi: { state: "Delhi", country: "India" }
};

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("company");
  const [products, setProducts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(defaultCreateForm);
  const [companyLogoPreview, setCompanyLogoPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const productNames = useMemo(() => products.map((item) => item.name), [products]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [productsRes, companiesRes] = await Promise.all([
        api.get("/products"),
        api.get("/companies")
      ]);
      setProducts(productsRes.data.products || []);
      setCompanies(companiesRes.data.companies || []);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When user opens MODULES tab, jump directly to the manage screen (2nd screenshot UI).
  // "Change Company" on that page can bring them back to list/dashboard.
  const didAutoOpenModulesRef = React.useRef(false);
  useEffect(() => {
    if (activeTab !== "products") return;
    if (didAutoOpenModulesRef.current) return;
    const firstCompanyId = companies?.[0]?._id;
    if (!firstCompanyId) return;
    didAutoOpenModulesRef.current = true;
    navigate(`/companies/${firstCompanyId}/products`);
  }, [activeTab, companies, navigate]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((prev) => {
      if (name === "name" || name === "adminName") {
        const cleaned = String(value || "")
          .replace(/[^a-zA-Z\s.]/g, "")
          .replace(/\s+/g, " ")
          .trimStart();
        return { ...prev, [name]: cleaned };
      }

      if (name === "phone") {
        const digits = String(value || "").replace(/\D/g, "").slice(0, 15);
        return { ...prev, phone: digits };
      }

      if (name === "district") {
        const cleaned = String(value || "")
          .replace(/[^a-zA-Z\s]/g, "")
          .replace(/\s+/g, " ")
          .trimStart();
        const key = cleaned.trim().toLowerCase();
        const match = DISTRICT_AUTOFILL[key];
        if (match) {
          return { ...prev, district: cleaned, state: match.state, country: match.country };
        }
        // If district typed and country empty, default to India (can be edited)
        const nextCountry = prev.country ? prev.country : cleaned.trim() ? "India" : prev.country;
        return { ...prev, district: cleaned, country: nextCountry };
      }

      if (name === "country" || name === "state") {
        const cleaned = String(value || "")
          .replace(/[^a-zA-Z\s]/g, "")
          .replace(/\s+/g, " ")
          .trimStart();
        return { ...prev, [name]: cleaned };
      }

      if (name === "subCompanyLimit") {
        const digits = String(value || "").replace(/\D/g, "");
        return { ...prev, subCompanyLimit: digits };
      }

      return { ...prev, [name]: value };
    });
  };

  const toggleProduct = (productName) => {
    setForm((prev) => ({
      ...prev,
      products: prev.products.includes(productName)
        ? prev.products.filter((value) => value !== productName)
        : [...prev.products, productName]
    }));
  };

  const submitCompany = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");

    try {
      setSubmitting(true);
      await api.post("/companies", { ...form, adminEmail: form.adminEmail || form.email });
      appendActivity({
        type: "company_create",
        title: "Company Created",
        description: `${String(form.name || "Company").trim()} was created.`,
        details: {
          companyName: String(form.name || "").trim(),
          companyEmail: String(form.email || "").trim(),
          products: Array.isArray(form.products) ? form.products : []
        }
      });
      setForm(defaultCreateForm);
      setCompanyLogoPreview("");
      setMessage("Company created successfully");
      await loadData();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to create company");
    } finally {
      setSubmitting(false);
    }
  };

  const [selectedCompany, setSelectedCompany] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editCompany, setEditCompany] = useState(null);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    adminName: "",
    adminPassword: "",
    code: "",
    phone: "",
    companyType: "",
    gstNumber: "",
    panNumber: "",
    registrationNo: "",
    district: "",
    country: "",
    state: "",
    officeAddress: "",
    subCompanyLimit: "",
    products: []
  });
  const [editCompanyLogoPreview, setEditCompanyLogoPreview] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [companyPage, setCompanyPage] = useState(1);
  const [dashboardCompanyPage, setDashboardCompanyPage] = useState(1);
  const [expandedCompanyProducts, setExpandedCompanyProducts] = useState(() => new Set());
  const [currentActivityPage, setCurrentActivityPage] = useState(1);
  const [activitySearch, setActivitySearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productTabCompany, setProductTabCompany] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editProducts, setEditProducts] = useState([]);
  const activitiesPerPage = 10;

  const renderInBody = (node) => {
    if (typeof document === "undefined") return null;
    return createPortal(node, document.body);
  };

  if (loading) {
    return (
      <div className="center-screen" style={{ background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ marginBottom: '16px' }}>
            <circle cx="12" cy="12" r="10" stroke="#e2e8f0" strokeWidth="4" />
            <path d="M12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.0434 16.4527" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <p style={{ color: '#64748b', fontWeight: 600 }}>Loading GT ONE...</p>
        </div>
      </div>
    );
  }

  const handleSelectCompany = (company) => {
    setSelectedCompany(company);
    setIsEditing(false);
    setEditProducts(company.products || []);
  };

  const startEditing = () => {
    setEditProducts(selectedCompany.products || []);
    setIsEditing(true);
  };

  const toggleEditProduct = (pName) => {
    if (!isEditing) return;
    setEditProducts(prev => 
      prev.includes(pName) 
        ? prev.filter(p => p !== pName) 
        : [...prev, pName]
    );
  };

  const saveProductChanges = async () => {
    try {
      setSubmitting(true);
      const previousProducts = Array.isArray(selectedCompany?.products) ? selectedCompany.products : [];
      const res = await api.put(`/companies/${selectedCompany._id}/products`, {
        products: editProducts
      });
      
      // Update local companies state
      setCompanies(prev => prev.map(c => 
        c._id === selectedCompany._id ? { ...c, products: editProducts } : c
      ));
      
      // Update selected company
      setSelectedCompany(prev => ({ ...prev, products: editProducts }));
      
      setIsEditing(false);
      setMessage("Configuration updated successfully");
      setTimeout(() => setMessage(""), 3000);

      const prevSet = new Set(previousProducts.map((p) => String(p).toUpperCase()));
      const nextSet = new Set((editProducts || []).map((p) => String(p).toUpperCase()));
      const added = [...nextSet].filter((p) => !prevSet.has(p));
      const removed = [...prevSet].filter((p) => !nextSet.has(p));
      appendActivity({
        type: "product_update",
        title: "Products Updated",
        description: `Updated products for ${selectedCompany?.name || "company"}.`,
        details: {
          companyName: selectedCompany?.name,
          added,
          removed,
          products: editProducts
        }
      });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update configuration");
    } finally {
      setSubmitting(false);
    }
  };

  const openEditCompany = (company) => {
    setEditCompany(company);
    setEditForm({
      name: company?.name || "",
      email: company?.email || "",
      adminName: company?.admin?.name || "",
      adminPassword: "",
      code: company?.code || company?.companyCode || "",
      phone: company?.phone || "",
      companyType: company?.companyType || "",
      gstNumber: company?.gstNumber || "",
      panNumber: company?.panNumber || "",
      registrationNo: company?.registrationNo || "",
      district: company?.district || "",
      country: company?.country || "",
      state: company?.state || "",
      officeAddress: company?.officeAddress || "",
      subCompanyLimit:
        company?.subCompanyLimit === null || company?.subCompanyLimit === undefined
          ? ""
          : String(company.subCompanyLimit)
      ,
      products: Array.isArray(company?.products) ? company.products : []
    });
    setEditCompanyLogoPreview("");
    setShowEditModal(true);
  };

  const saveCompanyEdits = async (event) => {
    event?.preventDefault?.();
    if (!editCompany?._id) return;
    setMessage("");
    setError("");

    try {
      setSubmitting(true);
      const previousSnapshot = editCompany
        ? {
            name: editCompany?.name,
            email: editCompany?.email,
            adminName: editCompany?.admin?.name || null,
            phone: editCompany?.phone || null,
            companyType: editCompany?.companyType || null,
            gstNumber: editCompany?.gstNumber || null,
            panNumber: editCompany?.panNumber || null,
            registrationNo: editCompany?.registrationNo || null,
            country: editCompany?.country || null,
            state: editCompany?.state || null,
            officeAddress: editCompany?.officeAddress || null,
            subCompanyLimit: editCompany?.subCompanyLimit ?? null
          }
        : null;
      const normalizedName = String(editForm.name || "").trim();
      const normalizedEmail = String(editForm.email || "")
        .trim()
        .toLowerCase();
      const payload = {
        name: normalizedName,
        email: normalizedEmail,
        phone: String(editForm.phone || "").trim(),
        companyType: String(editForm.companyType || "").trim(),
        gstNumber: String(editForm.gstNumber || "").trim(),
        panNumber: String(editForm.panNumber || "").trim(),
        registrationNo: String(editForm.registrationNo || "").trim(),
        district: String(editForm.district || "").trim(),
        country: String(editForm.country || "").trim(),
        state: String(editForm.state || "").trim(),
        officeAddress: String(editForm.officeAddress || "").trim(),
        subCompanyLimit:
          String(editForm.subCompanyLimit ?? "").trim() === ""
            ? null
            : String(editForm.subCompanyLimit).trim(),
        adminName: String(editForm.adminName || "").trim(),
        adminPassword: String(editForm.adminPassword || "").trim()
      };

      if (!payload.name || !payload.email) {
        setError("Company name and email are required");
        return;
      }

      const [companyResult, productsResult] = await Promise.allSettled([
        api.put(`/companies/${editCompany._id}`, payload),
        api.put(`/companies/${editCompany._id}/products`, { products: editForm.products || [] })
      ]);

      if (companyResult.status === "rejected") {
        throw companyResult.reason;
      }
      if (productsResult.status === "rejected") {
        throw productsResult.reason;
      }

      const res = companyResult.value;
      const productsRes = productsResult.value;

      const updated = res?.data?.company;
      if (updated?._id) {
        const nextProducts = productsRes?.data?.products || editForm.products || [];
        const mergeCompanyForUi = (c) =>
          c?._id === updated._id
            ? {
                ...c,
                ...updated,
                status: updated.isActive ? "ACTIVE" : "INACTIVE",
                products: nextProducts,
                admin: c?.admin ? { ...c.admin, name: editForm.adminName || c.admin.name } : c.admin
              }
            : c;

        // Update list + any selected/active views so UI reflects saved edits immediately.
        setCompanies((prev) => prev.map(mergeCompanyForUi));
        setSelectedCompany((prev) => (prev?._id === updated._id ? mergeCompanyForUi(prev) : prev));
        setProductTabCompany((prev) => (prev?._id === updated._id ? mergeCompanyForUi(prev) : prev));

        const changes = [];
        if (previousSnapshot) {
          const nextSnapshot = {
            name: payload.name,
            email: payload.email,
            adminName: payload.adminName,
            phone: payload.phone || null,
            companyType: payload.companyType || null,
            gstNumber: payload.gstNumber || null,
            panNumber: payload.panNumber || null,
            registrationNo: payload.registrationNo || null,
            country: payload.country || null,
            state: payload.state || null,
            officeAddress: payload.officeAddress || null,
            subCompanyLimit: payload.subCompanyLimit ?? null
          };
          for (const key of Object.keys(nextSnapshot)) {
            if (String(previousSnapshot[key] ?? "") !== String(nextSnapshot[key] ?? "")) {
              changes.push({ field: key, from: previousSnapshot[key] ?? "", to: nextSnapshot[key] ?? "" });
            }
          }
          if (payload.adminPassword) {
            changes.push({ field: "adminPassword", from: "••••••", to: "updated" });
          }
        }

        appendActivity({
          type: "company_update",
          title: "Company Updated",
          description: `Updated company details for ${payload.name}.`,
          details: {
            companyName: payload.name,
            changes
          }
        });
      } else {
        await loadData();
      }
      setShowEditModal(false);
      setEditCompany(null);
      setMessage("Company updated successfully");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update company");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteCompanyById = async (company) => {
    if (!company?._id) return;
    const ok = window.confirm(`Delete company "${company.name}"? This will remove the company and its admin users.`);
    if (!ok) return;

    setMessage("");
    setError("");
    try {
      setSubmitting(true);
      await api.delete(`/companies/${company._id}`);
      setCompanies((prev) => prev.filter((c) => c._id !== company._id));
      if (selectedCompany?._id === company._id) setSelectedCompany(null);
      if (productTabCompany?._id === company._id) setProductTabCompany(null);
      setMessage("Company deleted successfully");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete company");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCompanyActive = async (company) => {
    if (!company?._id) return;
    setMessage("");
    setError("");
    try {
      setSubmitting(true);
      const nextActive = !company.isActive;
      const res = await api.patch(`/companies/${company._id}/status`, { isActive: nextActive });
      const updated = res?.data?.company;
      setCompanies((prev) =>
        prev.map((c) =>
          c._id === company._id
            ? { ...c, ...updated, status: nextActive ? "ACTIVE" : "INACTIVE" }
            : c
        )
      );
      appendActivity({
        type: "company_status",
        title: "Company Status Updated",
        description: `${company.name} is now ${nextActive ? "ACTIVE" : "INACTIVE"}.`,
        details: {
          companyName: company.name,
          status: nextActive ? "ACTIVE" : "INACTIVE"
        }
      });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update status");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleExpandedProducts = (companyId) => {
    setExpandedCompanyProducts((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "dashboard":
        const activeCompanies = companies.filter(c => (c.products || []).length > 0).length;
        const inactiveCompanies = companies.length - activeCompanies;
        
        const productCounts = products.map(p => ({
          name: p.name,
          count: companies.filter(c => (c.products || []).includes(p.name)).length
        }));

        return (
          <div style={{ display: 'grid', gap: '16px' }}>
            {/* Top Stat Bar */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div className="card" style={{ flex: 1, minWidth: '220px', padding: '12px 16px', borderLeft: '4px solid #2563eb', background: 'linear-gradient(to right, #eff6ff, #ffffff)' }}>
                <p className="stat-label" style={{ fontSize: '0.7rem', marginBottom: '2px' }}>Total Companies</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <strong style={{ fontSize: '1.5rem' }}>{companies.length}</strong>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Registered</span>
                </div>
              </div>
              <div className="card" style={{ flex: 1, minWidth: '220px', padding: '12px 16px', borderLeft: '4px solid #059669', background: 'linear-gradient(to right, #f0fdf4, #ffffff)' }}>
                <p className="stat-label" style={{ fontSize: '0.7rem', marginBottom: '2px' }}>Active Companies</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <strong style={{ fontSize: '1.5rem', color: '#059669' }}>{activeCompanies}</strong>
                  <span style={{ fontSize: '0.7rem', color: '#059669' }}>Configured</span>
                </div>
              </div>
              <div className="card" style={{ flex: 1, minWidth: '220px', padding: '12px 16px', borderLeft: '4px solid #f59e0b', background: 'linear-gradient(to right, #fffbeb, #ffffff)' }}>
                <p className="stat-label" style={{ fontSize: '0.7rem', marginBottom: '2px' }}>Pending Setups</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <strong style={{ fontSize: '1.5rem', color: '#d97706' }}>{inactiveCompanies}</strong>
                  <span style={{ fontSize: '0.7rem', color: '#d97706' }}>Awaiting</span>
                </div>
              </div>
            </div>

            {/* Middle Section */}
            <div className="grid two" style={{ gap: '12px' }}>
              <div className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '0.95rem' }}>Product Adoption</h3>
                  <span className="status-pill" style={{ background: '#eff6ff', color: '#2563eb', fontSize: '0.7rem' }}>Module Usage</span>
                </div>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {productCounts.map(item => (
                    <div key={item.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '0.75rem' }}>
                         <span style={{ fontWeight: 600 }}>{item.name}</span>
                         <span className="muted">{item.count} Cos</span>
                      </div>
                      <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ 
                          height: '100%', 
                          background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)', 
                          width: `${companies.length ? (item.count / companies.length) * 100 : 0}%`,
                          transition: 'width 1s ease-out'
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ 
                    width: '48px', height: '48px', background: '#dcfce7', color: '#166534', 
                    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 10px'
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '1rem', marginBottom: '2px' }}>Core Services Healthy</h3>
                  <p className="muted" style={{ fontSize: '0.75rem' }}>SSO & Gateway services running at peak performance.</p>
                </div>
              </div>
            </div>

            {/* Bottom Companies List */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '0.95rem' }}>Registered Entities</h3>
                <button 
                  className="link-btn" 
                  style={{ background: '#f1f5f9', color: '#1e40af', padding: '4px 10px', fontSize: '0.7rem', borderRadius: '6px', fontWeight: 700 }}
                  onClick={() => {
                    setActiveTab('company');
                    setCompanyPage(1);
                  }}
                >
                  Manage All
                </button>
              </div>
              {(() => {
                const companiesPerPage = 10;
                const totalPages = Math.max(1, Math.ceil((companies || []).length / companiesPerPage));
                const safePage = Math.min(dashboardCompanyPage, totalPages);
                const start = (safePage - 1) * companiesPerPage;
                const paged = (companies || []).slice(start, start + companiesPerPage);

                return (
                  <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                {paged.map((company) => (
                  <div 
                    key={company._id} 
                    onClick={() => setSelectedCompany(company)}
                    style={{ 
                      padding: '10px', background: '#ffffff', borderRadius: '10px', 
                      border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px',
                      cursor: 'pointer', transition: 'transform 0.2s',
                    }}
                    onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    <div style={{ 
                      width: '32px', height: '32px', background: '#f1f5f9', color: '#1e40af', 
                      borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem'
                    }}>
                      {company.name[0]}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <h4 style={{ margin: 0, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{company.name}</h4>
                      <p className="muted" style={{ fontSize: '0.7rem', margin: 0 }}>{(company.products || []).length} Modules</p>
                    </div>
                    {(company.products || []).length > 0 ? (
                      <div style={{ width: '6px', height: '6px', background: '#22c55e', borderRadius: '50%' }} />
                    ) : (
                      <div style={{ width: '6px', height: '6px', background: '#cbd5e1', borderRadius: '50%' }} />
                    )}
                  </div>
                ))}
              </div>

              {((companies || []).length > companiesPerPage) && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 14 }}>
                  <button
                    type="button"
                    disabled={safePage === 1}
                    onClick={() => setDashboardCompanyPage((p) => Math.max(1, p - 1))}
                    style={{
                      minWidth: 44,
                      height: 40,
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      background: safePage === 1 ? "#f8fafc" : "#ffffff",
                      color: "#64748b",
                      fontWeight: 800,
                      fontSize: "1rem",
                      cursor: safePage === 1 ? "not-allowed" : "pointer"
                    }}
                  >
                    ‹
                  </button>

                  <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#475569" }}>
                    Page {safePage} of {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={safePage === totalPages}
                    onClick={() => setDashboardCompanyPage((p) => Math.min(totalPages, p + 1))}
                    style={{
                      minWidth: 44,
                      height: 40,
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      background: safePage === totalPages ? "#f8fafc" : "#ffffff",
                      color: "#64748b",
                      fontWeight: 800,
                      fontSize: "1rem",
                      cursor: safePage === totalPages ? "not-allowed" : "pointer"
                    }}
                  >
                    ›
                  </button>
                </div>
              )}
                  </>
                );
              })()}
            </div>

            {/* Selection Modal */}
            {selectedCompany && (
               <div style={{ 
                 position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', 
                 zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' 
               }} onClick={() => setSelectedCompany(null)}>
                  <div style={{ 
                    background: 'white', padding: '32px', borderRadius: '20px', width: '90%', maxWidth: '500px',
                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', animation: 'fadeInDown 0.3s ease-out'
                  }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                      <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>Company Profile</h2>
                      <button onClick={() => setSelectedCompany(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}>✕</button>
                    </div>

                    <div style={{ display: 'grid', gap: '20px' }}>
                        <div>
                          <p className="muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Entity Name</p>
                          <strong style={{ fontSize: '1.25rem' }}>{selectedCompany.name}</strong>
                        </div>
                        <div>
                          <p className="muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Contact Email</p>
                          <strong>{selectedCompany.email}</strong>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '16px', background: '#f8fafc', borderRadius: '12px' }}>
                          <div>
                            <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '2px' }}>Admin Name</p>
                            <span style={{ fontWeight: 600 }}>{selectedCompany.admin?.name || "N/A"}</span>
                          </div>
                          <div>
                            <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '2px' }}>Admin Email</p>
                            <span style={{ fontWeight: 600 }}>{selectedCompany.admin?.email || "N/A"}</span>
                          </div>
                        </div>
                        <div>
                          <p className="muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Active Modules</p>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                             {selectedCompany.products?.length > 0 ? selectedCompany.products.map(p => (
                               <span key={p} className="status-pill status-active">{p}</span>
                             )) : <span className="muted">No products assigned yet.</span>}
                          </div>
                        </div>
                        <Link 
                          to={`/companies/${selectedCompany._id}/products`} 
                          onClick={() => setSelectedCompany(null)}
                          className="login-button" 
                          style={{ textAlign: 'center', display: 'block' }}
                        >
                          Modify Configurations
                        </Link>
                    </div>
                  </div>
               </div>
            )}
          </div>
        );
      case "company":
        if (!selectedCompany) {
          const searchValue = String(companySearch || "").trim().toLowerCase();
          const filteredCompanies = searchValue
            ? companies.filter((company) => {
                const name = String(company?.name || "").toLowerCase();
                const code = String(company?.code || company?.companyCode || "").toLowerCase();
                return name.includes(searchValue) || code.includes(searchValue);
              })
            : companies;

          const companiesPerPage = 10;
          const totalCompanyPages = Math.max(1, Math.ceil(filteredCompanies.length / companiesPerPage));
          const safeCompanyPage = Math.min(companyPage, totalCompanyPages);
          const companyStartIndex = (safeCompanyPage - 1) * companiesPerPage;
          const pagedCompanies = filteredCompanies.slice(companyStartIndex, companyStartIndex + companiesPerPage);

          const totalCompanies = companies.length;
          const activeCompanies = companies.filter((c) => c.isActive ?? c.status === 'ACTIVE').length;
          const inactiveCompanies = totalCompanies - activeCompanies;
          const totalProducts = products.length;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
                <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #2563eb', background: 'linear-gradient(to right, #eff6ff, #ffffff)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', color: '#64748b', textTransform: 'uppercase' }}>Total Company</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>{totalCompanies}</div>
                </div>
                <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #059669', background: 'linear-gradient(to right, #f0fdf4, #ffffff)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', color: '#64748b', textTransform: 'uppercase' }}>Active Company</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#059669', marginTop: '4px' }}>{activeCompanies}</div>
                </div>
                <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #f59e0b', background: 'linear-gradient(to right, #fffbeb, #ffffff)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', color: '#64748b', textTransform: 'uppercase' }}>Inactive Company</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#d97706', marginTop: '4px' }}>{inactiveCompanies}</div>
                </div>
                <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid #4f46e5', background: 'linear-gradient(to right, #eef2ff, #ffffff)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', color: '#64748b', textTransform: 'uppercase' }}>Total Product</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#4f46e5', marginTop: '4px' }}>{totalProducts}</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', padding: '0 0 6px', borderRadius: 0, border: 'none' }}>
                 <div style={{ flex: 1, maxWidth: '520px' }}>
                    <input
                      value={companySearch}
                      onChange={(e) => {
                        setCompanySearch(e.target.value);
                        setCompanyPage(1);
                      }}
                      placeholder="Search by company name or code"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        background: '#ffffff',
                        outline: 'none',
                        fontWeight: 600,
                        color: '#0f172a'
                      }}
                    />
                 </div>
                 <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button 
                      onClick={() => setShowCreateModal(true)}
                      style={{ 
                        background: '#2563eb', color: 'white', padding: '10px 16px', borderRadius: '10px', 
                        fontWeight: 800, fontSize: '0.85rem', border: 'none', cursor: 'pointer', 
                        display: 'flex', alignItems: 'center', gap: '8px'
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Create Company
                    </button>
                 </div>
              </div>

              <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid #eef2f6', borderRadius: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 120px 1.2fr 1fr 120px 200px', padding: '10px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', gap: '12px' }}>
                   <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Company Name</div>
                   <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Code</div>
                   <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Company Mail</div>
                   <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Products</div>
                   <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Status</div>
                   <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Action</div>
                </div>
                <div style={{ overflow: 'visible' }}>
                  {pagedCompanies.map((company) => (
                    <div 
                      key={company._id} 
                      style={{ 
                        display: 'grid',
                        gridTemplateColumns: '1.3fr 120px 1.2fr 1fr 120px 200px',
                        gap: '12px',
                        padding: '16px 24px',
                        alignItems: 'center',
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.2s ease'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                         <div style={{ 
                           width: '36px', height: '36px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', 
                           color: '#2563eb', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                           fontWeight: 800, fontSize: '0.95rem' 
                         }}>
                           {company.name[0]}
                         </div>
                         <div style={{ overflow: 'hidden' }}>
                           <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{company.name}</h4>
                         </div>
                      </div>

                      <div style={{ fontSize: '10px', fontWeight: 800, color: '#0f172a' }}>
                        {company.code || company.companyCode || "—"}
                      </div>

                      <div style={{ fontSize: '0.85rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {company.email}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                        {(company.products || []).length === 0 ? (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>—</span>
                        ) : (
                          <>
                            {(expandedCompanyProducts.has(company._id)
                              ? (company.products || [])
                              : (company.products || []).slice(0, 3)
                            ).map((p) => (
                              <span
                                key={p}
                                style={{
                                  fontSize: '0.62rem',
                                  fontWeight: 800,
                                  padding: '3px 7px',
                                  borderRadius: '999px',
                                  background: '#eff6ff',
                                  color: '#2563eb',
                                  border: '1px solid #dbeafe'
                                }}
                              >
                                {p}
                              </span>
                            ))}
                            {(company.products || []).length > 3 && !expandedCompanyProducts.has(company._id) && (
                              <button
                                type="button"
                                onClick={() => toggleExpandedProducts(company._id)}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  padding: 0,
                                  fontSize: '0.62rem',
                                  fontWeight: 900,
                                  color: '#64748b'
                                }}
                                title="Show all products"
                              >
                                +{(company.products || []).length - 3}
                              </button>
                            )}

                            {(company.products || []).length > 3 && expandedCompanyProducts.has(company._id) && (
                              <button
                                type="button"
                                onClick={() => toggleExpandedProducts(company._id)}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  padding: 0,
                                  fontSize: '0.62rem',
                                  fontWeight: 900,
                                  color: '#64748b'
                                }}
                                title="Show less"
                              >
                                Less
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      <div>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '4px 8px',
                            borderRadius: '999px',
                            border: '1px solid',
                            borderColor: (company.isActive ?? company.status === 'ACTIVE') ? '#bbf7d0' : '#e2e8f0',
                            background: (company.isActive ?? company.status === 'ACTIVE') ? '#f0fdf4' : '#f8fafc',
                            color: (company.isActive ?? company.status === 'ACTIVE') ? '#166534' : '#64748b'
                          }}
                        >
                          <span
                            style={{
                              width: '5px',
                              height: '5px',
                              borderRadius: '50%',
                              background: (company.isActive ?? company.status === 'ACTIVE') ? '#22c55e' : '#94a3b8'
                            }}
                          />
                          {(company.isActive ?? company.status === 'ACTIVE') ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: 0,
                            borderRadius: 0,
                            background: 'transparent',
                            border: 'none'
                          }}
                        >
                          {/* View */}
                          <button
                            type="button"
                            title="View"
                            onClick={() => handleSelectCompany(company)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              padding: 0,
                              color: '#64748b',
                              display: 'inline-flex'
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="12" height="12" style={{ display: 'block' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                            </svg>
                          </button>

                          {/* Edit */}
                          <button
                            type="button"
                            title="Edit"
                            onClick={() => openEditCompany(company)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              padding: 0,
                              color: '#64748b',
                              display: 'inline-flex'
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="12" height="12" style={{ display: 'block' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 20h9" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                            </svg>
                          </button>

                          {/* Settings / Modules */}
                          <button
                            type="button"
                            title="Modules"
                            onClick={() => {
                              setProductTabCompany(company);
                              setActiveTab('products');
                            }}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              padding: 0,
                              color: '#64748b',
                              display: 'inline-flex'
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="12" height="12" style={{ display: 'block' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>

                          {/* Active / Deactive */}
                          <button
                            type="button"
                            title={(company.isActive ?? true) ? "Deactivate" : "Activate"}
                            onClick={() => toggleCompanyActive(company)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              padding: 0,
                              color: '#64748b',
                              display: 'inline-flex',
                              opacity: submitting ? 0.7 : 1
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="12" height="12" style={{ display: 'block' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 2L3 14h7l-1 8 10-12h-7l1-8Z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {filteredCompanies.length > companiesPerPage && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderTop: '1px solid #f1f5f9',
                      background: '#ffffff',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                  >
                    <button
                      type="button"
                      disabled={safeCompanyPage === 1}
                      onClick={() => setCompanyPage((p) => Math.max(1, p - 1))}
                      style={{
                        minWidth: '44px',
                        height: '40px',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        background: safeCompanyPage === 1 ? '#f8fafc' : '#ffffff',
                        color: '#64748b',
                        fontWeight: 800,
                        fontSize: '1rem',
                        cursor: safeCompanyPage === 1 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      ‹
                    </button>

                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569' }}>
                      Page {safeCompanyPage} of {totalCompanyPages}
                    </span>

                    <button
                      type="button"
                      disabled={safeCompanyPage === totalCompanyPages}
                      onClick={() => setCompanyPage((p) => Math.min(totalCompanyPages, p + 1))}
                      style={{
                        minWidth: '44px',
                        height: '40px',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        background: safeCompanyPage === totalCompanyPages ? '#f8fafc' : '#ffffff',
                        color: '#64748b',
                        fontWeight: 800,
                        fontSize: '1rem',
                        cursor: safeCompanyPage === totalCompanyPages ? 'not-allowed' : 'pointer'
                      }}
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeInRight 0.3s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
               <button 
                onClick={() => setSelectedCompany(null)}
                style={{ 
                  background: 'transparent', color: '#1e293b', width: '44px', height: '44px', borderRadius: '14px', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
               >
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                   <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                 </svg>
               </button>
               <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>{selectedCompany.name}</h2>
               </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) 1fr', gap: '20px', alignItems: 'start' }}>
               {/* Content Area */}
               <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Module Management */}
                  <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                       <div>
                          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#1e293b' }}>GT Product</h3>
                       </div>
                       <div style={{ display: 'flex', gap: '10px' }}>
                          {isEditing ? (
                            <>
                              <button onClick={() => setIsEditing(false)} style={{ background: '#f1f5f9', color: '#64748b', border: 'none', padding: '10px 20px', borderRadius: '12px', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                              <button onClick={saveProductChanges} style={{ background: '#059669', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '12px', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', boxShadow: '0 4px 10px rgba(5, 150, 105, 0.2)' }}>{submitting ? 'Applying...' : 'Apply Changes'}</button>
                            </>
                          ) : (
                            <button onClick={startEditing} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '12px', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', boxShadow: '0 4px 10px rgba(37, 99, 235, 0.2)' }}>Edit Configuration</button>
                          )}
                       </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                       {products
                         .filter((p) => String(p?.name || "").trim().toUpperCase() !== "TMS")
                         .map((p) => {
                         const isActive = isEditing 
                            ? editProducts.includes(p.name)
                            : (selectedCompany.products || []).includes(p.name);
                         
                         return (
                            <div 
                              key={p._id} 
                              onClick={() => toggleEditProduct(p.name)}
                              style={{ 
                                padding: '20px', borderRadius: '24px', border: '2px solid',
                                borderColor: isActive ? '#22c55e' : '#f1f5f9',
                                background: isActive ? '#f0fdf4' : '#ffffff',
                                cursor: isEditing ? 'pointer' : 'default', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                position: 'relative'
                              }}
                            >
                               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                  <div style={{ width: '40px', height: '40px', background: isActive ? '#dcfce7' : '#f8fafc', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? '#166534' : '#94a3b8' }}>
                                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round" />
                                     </svg>
                                  </div>
                                  {isEditing && (
                                     <div style={{ 
                                       width: '20px', height: '20px', borderRadius: '50%', border: '2px solid',
                                       borderColor: isActive ? '#22c55e' : '#cbd5e1', background: isActive ? '#22c55e' : 'transparent',
                                       display: 'flex', alignItems: 'center', justifyContent: 'center'
                                     }}>
                                       {isActive && <span style={{ color: 'white', fontSize: '10px', fontWeight: 900 }}>✓</span>}
                                     </div>
                                  )}
                               </div>
                               <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>{p.name}</h4>
                               <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isActive ? '#059669' : '#94a3b8' }}>
                                 {isActive ? 'License Active' : 'Not Licensed'}
                               </div>
                            </div>
                         );
                       })}
                    </div>
                  </div>
               </div>

               {/* Sidebar Area */}
               <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="card" style={{ padding: '24px' }}>
                     <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '20px', color: '#1e293b' }}>Entity Identity</h3>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ padding: '16px', background: '#eff6ff', borderRadius: '16px', border: '1px solid #dbeafe' }}>
                           <p className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', fontWeight: 800 }}>Account Owner</p>
                           <strong style={{ fontSize: '1rem', color: '#1e40af' }}>{selectedCompany.admin?.name || 'N/A'}</strong>
                        </div>
                        <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #eef2f6' }}>
                           <p className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', fontWeight: 800 }}>Primary Email</p>
                           <strong style={{ fontSize: '0.9rem', color: '#475569', wordBreak: 'break-all' }}>{selectedCompany.email}</strong>
                        </div>
                        <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #eef2f6' }}>
                           <p className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', fontWeight: 800 }}>Unique Identifier</p>
                           <code style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{selectedCompany._id}</code>
                        </div>
                     </div>
                  </div>

                  <div className="card" style={{ padding: '24px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: 'white', border: 'none' }}>
                     <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '20px' }}>Security Status</h3>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '12px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>SSO Integration Active</span>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        );
      case "activities":
        const activityItems = readActivities().sort(
          (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
        );

        const typeMeta = (type) => {
          const t = String(type || "").toLowerCase();
          if (t === "company_create") {
            return {
              color: "#2563eb",
              icon: (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              )
            };
          }
          if (t === "company_update") {
            return {
              color: "#7c3aed",
              icon: (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20h9" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5Z" />
                </svg>
              )
            };
          }
          if (t === "product_update") {
            return {
              color: "#059669",
              icon: (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2 2 7l10 5 10-5-10-5Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 17l10 5 10-5" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 12l10 5 10-5" />
                </svg>
              )
            };
          }
          if (t === "module_update" || t === "hrms_module_update") {
            return {
              color: "#0ea5e9",
              icon: (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.154-2.046-.441-2.992z" />
                </svg>
              )
            };
          }
          if (t === "company_status") {
            return {
              color: "#f97316",
              icon: (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 2L3 14h7l-1 8 10-12h-7l1-8Z" />
                </svg>
              )
            };
          }
          return {
            color: "#64748b",
            icon: (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
              </svg>
            )
          };
        };

        const search = String(activitySearch || "").trim().toLowerCase();
        const filteredActivities = search
          ? activityItems.filter((a) => {
              const hay = `${a.title || ""} ${a.description || ""}`.toLowerCase();
              return hay.includes(search);
            })
          : activityItems;

        const totalPages = Math.ceil(filteredActivities.length / activitiesPerPage);
        const startIndex = (currentActivityPage - 1) * activitiesPerPage;
        const pagedActivities = filteredActivities.slice(startIndex, startIndex + activitiesPerPage);

        const totalRecords = filteredActivities.length;
        const securityAlerts = filteredActivities.filter((a) => a.type === "security").length;
        const logVol24h = filteredActivities.filter((a) => {
          const t = new Date(a.time).getTime();
          return Number.isFinite(t) && Date.now() - t <= 24 * 60 * 60 * 1000;
        }).length;

        return (
          <div style={{ background: '#ffffff', padding: 0, height: '100%', width: '100%', margin: '-16px -16px -16px -8px' }}>
            <div className="card" style={{ padding: '0', overflow: 'hidden', height: '100%', width: '100%', display: 'flex', flexDirection: 'column', border: 'none', borderRadius: 0 }}>
            <div style={{ padding: '18px 18px 12px', background: '#ffffff', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
                <div style={{ borderRadius: '14px', border: '1px solid #eef2f6', background: '#ffffff', padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: 2, width: '100%', background: 'linear-gradient(90deg, #ec4899 0%, #a855f7 100%)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 12, background: '#fce7f3', color: '#be185d', display: 'grid', placeItems: 'center' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2 2 7l10 5 10-5-10-5Z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>Total Records</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a' }}>{totalRecords.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                <div style={{ borderRadius: '14px', border: '1px solid #eef2f6', background: '#ffffff', padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: 2, width: '100%', background: 'linear-gradient(90deg, #06b6d4 0%, #3b82f6 100%)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 12, background: '#e0f2fe', color: '#0369a1', display: 'grid', placeItems: 'center' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>Security Alerts</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a' }}>{String(securityAlerts).padStart(2, "0")}</div>
                    </div>
                  </div>
                </div>

                <div style={{ borderRadius: '14px', border: '1px solid #eef2f6', background: '#ffffff', padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: 2, width: '100%', background: 'linear-gradient(90deg, #fb923c 0%, #f97316 100%)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 12, background: '#ffedd5', color: '#9a3412', display: 'grid', placeItems: 'center' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19V5" />
                        <path d="M4 19h16" />
                        <path d="M8 15v-4" />
                        <path d="M12 15V7" />
                        <path d="M16 15v-6" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>24H Log Vol</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a' }}>{logVol24h.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    value={activitySearch}
                    onChange={(e) => {
                      setActivitySearch(e.target.value);
                      setCurrentActivityPage(1);
                    }}
                    placeholder="Search..."
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      outline: 'none',
                      fontWeight: 600,
                      color: '#0f172a'
                    }}
                  />
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    await loadData();
                    setCurrentActivityPage(1);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    fontWeight: 900,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontSize: '12px',
                    color: '#0f172a',
                    cursor: 'pointer'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <path d="M21 3v6h-6" />
                  </svg>
                  Refresh History
                </button>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '4px', background: '#f1f5f9', borderRadius: '10px' }}>
                  <button
                    disabled={currentActivityPage === 1}
                    onClick={() => setCurrentActivityPage(p => p - 1)}
                    style={{
                      width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                      background: currentActivityPage === 1 ? 'transparent' : 'white',
                      color: '#64748b', cursor: currentActivityPage === 1 ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: currentActivityPage === 1 ? 'none' : '0 1px 3px rgba(0,0,0,0.08)'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', padding: '0 8px' }}>Page {currentActivityPage} of {totalPages || 1}</span>
                  <button
                    disabled={currentActivityPage === totalPages || totalPages === 0}
                    onClick={() => setCurrentActivityPage(p => p + 1)}
                    style={{
                      width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                      background: (currentActivityPage === totalPages || totalPages === 0) ? 'transparent' : 'white',
                      color: '#64748b', cursor: (currentActivityPage === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: (currentActivityPage === totalPages || totalPages === 0) ? 'none' : '0 1px 3px rgba(0,0,0,0.08)'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            
            <div style={{ padding: '24px', flex: 1, position: 'relative' }}>
              {pagedActivities.length === 0 ? (
                <div style={{ padding: '60px 40px', textAlign: 'center', background: '#f8fafc', borderRadius: '20px', border: '2px dashed #e2e8f0' }}>
                  <p style={{ color: '#94a3b8', fontWeight: 500 }}>No system activities recorded yet.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '14px', position: 'relative' }}>
                  {pagedActivities.map((activity) => (
                    <details
                      key={activity.id}
                      style={{
                        borderRadius: 14,
                        background: "#ffffff",
                        border: "1px solid #eef2f6",
                        padding: 12
                      }}
                    >
                      <summary
                        style={{
                          listStyle: "none",
                          display: "flex",
                          gap: 20,
                          cursor: "pointer",
                          alignItems: "flex-start"
                        }}
                      >
                      <div style={{ 
                        width: '36px', height: '36px', background: 'white', border: `2px solid ${typeMeta(activity.type).color}33`, 
                        borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        color: typeMeta(activity.type).color, flexShrink: 0, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                        fontSize: '14px'
                      }}>
                        {typeMeta(activity.type).icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                           <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{activity.title}</h4>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '4px', height: '4px', background: '#cbd5e1', borderRadius: '50%' }} />
                              <span className="muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                {new Date(activity.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                           </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <p className="muted" style={{ fontSize: '0.85rem', margin: 0, color: '#64748b' }}>{activity.description}</p>
                           <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>{new Date(activity.time).toLocaleDateString()}</span>
                        </div>
                      </div>
                      </summary>

                      {activity.details ? (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9" }}>
                          <div style={{ display: "grid", gap: 8 }}>
                            {activity.details.companyName ? (
                              <div style={{ fontSize: 12, color: "#334155", fontWeight: 800 }}>
                                Company: <span style={{ fontWeight: 700 }}>{activity.details.companyName}</span>
                              </div>
                            ) : null}
                            {activity.details.product ? (
                              <div style={{ fontSize: 12, color: "#334155", fontWeight: 800 }}>
                                Product: <span style={{ fontWeight: 700 }}>{activity.details.product}</span>
                              </div>
                            ) : null}

                            {Array.isArray(activity.details.added) && activity.details.added.length ? (
                              <div style={{ fontSize: 12, color: "#166534", fontWeight: 800 }}>
                                Added: <span style={{ fontWeight: 700 }}>{activity.details.added.join(", ")}</span>
                              </div>
                            ) : null}
                            {Array.isArray(activity.details.removed) && activity.details.removed.length ? (
                              <div style={{ fontSize: 12, color: "#991b1b", fontWeight: 800 }}>
                                Removed: <span style={{ fontWeight: 700 }}>{activity.details.removed.join(", ")}</span>
                              </div>
                            ) : null}

                            {Array.isArray(activity.details.activated) && activity.details.activated.length ? (
                              <div style={{ fontSize: 12, color: "#166534", fontWeight: 800 }}>
                                Activated: <span style={{ fontWeight: 700 }}>{activity.details.activated.join(", ")}</span>
                              </div>
                            ) : null}
                            {Array.isArray(activity.details.deactivated) && activity.details.deactivated.length ? (
                              <div style={{ fontSize: 12, color: "#991b1b", fontWeight: 800 }}>
                                Deactivated: <span style={{ fontWeight: 700 }}>{activity.details.deactivated.join(", ")}</span>
                              </div>
                            ) : null}

                            {Array.isArray(activity.details.changes) && activity.details.changes.length ? (
                              <div style={{ display: "grid", gap: 6 }}>
                                <div style={{ fontSize: 12, color: "#334155", fontWeight: 900 }}>
                                  Changes
                                </div>
                                <div style={{ display: "grid", gap: 6 }}>
                                  {activity.details.changes.slice(0, 12).map((c, idx) => (
                                    <div key={idx} style={{ fontSize: 12, color: "#475569" }}>
                                      <span style={{ fontWeight: 900, color: "#0f172a" }}>{c.field}</span>:{" "}
                                      <span style={{ color: "#64748b" }}>{String(c.from)}</span> →{" "}
                                      <span style={{ color: "#0f172a", fontWeight: 800 }}>{String(c.to)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </details>
                  ))}
                </div>
              )}
            </div>
            
            {totalPages > 1 && (
              <div style={{ 
                padding: '16px 24px', 
                borderTop: '1px solid #f1f5f9', 
                background: '#ffffff', 
                display: 'flex', 
                justifyContent: 'center', 
                gap: '8px' 
              }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentActivityPage(page)}
                    style={{
                      minWidth: '32px', height: '32px', borderRadius: '8px', border: 'none',
                      background: currentActivityPage === page ? '#2563eb' : 'transparent',
                      color: currentActivityPage === page ? 'white' : '#64748b',
                      fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: currentActivityPage === page ? '0 4px 12px rgba(37, 99, 235, 0.3)' : 'none'
                    }}
                  >
                    {page}
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>
        );
      case "products":
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>
                  Module Entitlements
                </h2>
              </div>
            </div>

            <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.5fr) minmax(150px, 1fr) 100px', padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Organization</div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Modules Active</div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Action</div>
              </div>

              <div style={{ overflow: 'visible' }}>
                {companies.map((company) => {
                  const visibleProducts = (company.products || []).filter((p) => String(p).toUpperCase() !== "TMS");
                  return (
                    <div
                      key={company._id}
                      onClick={() => navigate(`/companies/${company._id}/products`)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(200px, 1.5fr) minmax(150px, 1fr) 100px',
                        padding: '16px 24px',
                        alignItems: 'center',
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        background: '#ffffff'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseOut={(e) => (e.currentTarget.style.background = '#ffffff')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '1.1rem' }}>
                          {company.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {company.name}
                          </div>
                          <div className="muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {company.email}
                          </div>
                        </div>
                      </div>

                      <div>
                        {visibleProducts.length > 0 ? (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {visibleProducts.map((p) => (
                              <span key={p} style={{ fontSize: '0.7rem', padding: '4px 10px', background: '#f0fdf4', color: '#166534', borderRadius: '6px', fontWeight: 700 }}>
                                {p}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="muted" style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>None Provisioned</span>
                        )}
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <Link
                          to={`/companies/${company._id}/products`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ background: '#eff6ff', color: '#2563eb', padding: '6px 14px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, border: 'none', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}
                        >
                          Manage
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <AdminLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {error ? (
        <div style={{ padding: "14px 22px 0 22px" }}>
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              padding: "12px 14px",
              borderRadius: 14,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12
            }}
          >
            <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {error}
            </div>
            <button
              type="button"
              onClick={() => setError("")}
              style={{
                border: "none",
                background: "transparent",
                color: "#991b1b",
                fontWeight: 900,
                cursor: "pointer",
                padding: "6px 10px",
                borderRadius: 10
              }}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      {!error && message ? (
        <div
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 2000,
            background: "#ecfdf5",
            border: "1px solid #bbf7d0",
            color: "#065f46",
            padding: "12px 14px",
            borderRadius: 14,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            minWidth: 260,
            maxWidth: 420,
            boxShadow: "0 18px 40px rgba(15, 23, 42, 0.14)"
          }}
          role="status"
          aria-live="polite"
        >
          <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {message}
          </div>
          <button
            type="button"
            onClick={() => setMessage("")}
            style={{
              border: "none",
              background: "transparent",
              color: "#065f46",
              fontWeight: 900,
              cursor: "pointer",
              padding: "6px 10px",
              borderRadius: 10
            }}
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      ) : null}

      {renderTabContent()}

      {showEditModal &&
        renderInBody(
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              left: 88,
              background: "rgba(0,0,0,0.4)",
              zIndex: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(4px)",
              padding: 20
            }}
            onClick={() => setShowEditModal(false)}
          >
            <div
              style={{
                background: "white",
                width: "100%",
                height: "100%",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.2)",
                overflow: "hidden"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  padding: "20px",
                  borderBottom: "1px solid #f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <div style={{ fontSize: "1.35rem", fontWeight: 900, color: "#0f172a" }}>Edit Company</div>
              </div>

              <form autoComplete="off" onSubmit={saveCompanyEdits}>
                {/* Prevent browser autofill from injecting saved credentials */}
                <input
                  type="text"
                  name="gtone_edit_fake_username"
                  autoComplete="username"
                  tabIndex={-1}
                  style={{ position: "absolute", opacity: 0, height: 0, width: 0, pointerEvents: "none" }}
                />
                <input
                  type="password"
                  name="gtone_edit_fake_password"
                  autoComplete="current-password"
                  tabIndex={-1}
                  style={{ position: "absolute", opacity: 0, height: 0, width: 0, pointerEvents: "none" }}
                />

                <div style={{ padding: "20px" }}>
                  {/* Logo left + 6 inputs on right (2 rows x 3) */}
                  <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "18px", alignItems: "start" }}>
                    <div style={{ display: "flex", alignItems: "flex-start" }}>
                      <label
                        style={{
                          width: "120px",
                          height: "120px",
                          borderRadius: "22px",
                          border: "1.5px dashed #cbd5e1",
                          background: "#f8fafc",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          position: "relative",
                          overflow: "hidden"
                        }}
                      >
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(ev) => {
                            const file = ev.target.files?.[0];
                            if (!file) return;
                            const url = URL.createObjectURL(file);
                            setEditCompanyLogoPreview(url);
                          }}
                        />
                        {editCompanyLogoPreview ? (
                          <img src={editCompanyLogoPreview} alt="Company logo preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ textAlign: "center" }}>
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 14,
                                background: "#eef2ff",
                                color: "#4f46e5",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                margin: "0 auto 10px"
                              }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="20" height="20">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4-4a3 5 0 0 1 4 0l4 4" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2 20h20" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 10a4 4 0 0 1 10 0" />
                              </svg>
                            </div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#64748b" }}>UPLOAD LOGO</div>
                          </div>
                        )}

                        <div
                          style={{
                            position: "absolute",
                            right: 12,
                            bottom: 12,
                            width: 34,
                            height: 34,
                            borderRadius: 14,
                            background: "#4f46e5",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 10px 20px rgba(79, 70, 229, 0.25)"
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 20h9" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                          </svg>
                        </div>
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "14px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: "8px" }}>
                          COMPANY NAME
                        </label>
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                          required
                          placeholder="Company name"
                          autoComplete="off"
                          style={{ width: "100%", padding: "12px 14px", borderRadius: "14px", border: "1px solid transparent", outline: "none", background: "#f8fafc" }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: "8px" }}>
                          ADMIN NAME
                        </label>
                        <input
                          value={editForm.adminName}
                          onChange={(e) => setEditForm((p) => ({ ...p, adminName: e.target.value }))}
                          required
                          placeholder="Admin full name"
                          autoComplete="off"
                          style={{ width: "100%", padding: "12px 14px", borderRadius: "14px", border: "1px solid transparent", outline: "none", background: "#f8fafc" }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: "8px" }}>
                          COMPANY EMAIL
                        </label>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                          required
                          placeholder="company@example.com"
                          autoComplete="off"
                          style={{ width: "100%", padding: "12px 14px", borderRadius: "14px", border: "1px solid transparent", outline: "none", background: "#f8fafc" }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: "8px" }}>
                          PASSWORD
                        </label>
                        <div style={{ position: "relative" }}>
                          <input
                            type={showEditPassword ? "text" : "password"}
                            value={editForm.adminPassword}
                            onChange={(e) => setEditForm((p) => ({ ...p, adminPassword: e.target.value }))}
                            placeholder="Enter new password (optional)"
                            autoComplete="new-password"
                            style={{
                              width: "100%",
                              padding: "12px 44px 12px 14px",
                              borderRadius: "14px",
                              border: "1px solid transparent",
                              outline: "none",
                              background: "#f8fafc"
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditPassword((v) => !v)}
                            style={{
                              position: "absolute",
                              right: 10,
                              top: "50%",
                              transform: "translateY(-50%)",
                              width: 32,
                              height: 32,
                              borderRadius: 12,
                              border: "none",
                              background: "transparent",
                              color: "#64748b",
                              cursor: "pointer",
                              display: "grid",
                              placeItems: "center",
                              boxShadow: "none"
                            }}
                            aria-label={showEditPassword ? "Hide password" : "Show password"}
                          >
                            {showEditPassword ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.11 1 12c.62-1.47 1.53-2.87 2.68-4.11" />
                                <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                                <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.89 11 8-1.02 2.43-2.8 4.58-5.06 5.94" />
                                <path d="M1 1l22 22" />
                              </svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: "8px" }}>
                          PHONE NUMBER
                        </label>
                        <input
                          value={editForm.phone}
                          onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                          placeholder="+91 98765 43210"
                          style={{ width: "100%", padding: "12px 14px", borderRadius: "14px", border: "1px solid transparent", outline: "none", background: "#f8fafc" }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: "8px" }}>
                          SUB COMPANY LIMIT
                        </label>
                        <input
                          value={editForm.subCompanyLimit}
                          onChange={(e) => setEditForm((p) => ({ ...p, subCompanyLimit: e.target.value }))}
                          placeholder="10"
                          style={{ width: "100%", padding: "12px 14px", borderRadius: "14px", border: "1px solid transparent", outline: "none", background: "#f8fafc" }}
                        />
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "14px",
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: "14px"
                    }}
                  >
                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: "8px" }}>
                        COMPANY TYPE
                      </label>
                      <select
                        value={editForm.companyType}
                        onChange={(e) => setEditForm((p) => ({ ...p, companyType: e.target.value }))}
                        style={{ width: "100%", padding: "12px 14px", borderRadius: "14px", border: "1px solid transparent", outline: "none", background: "#f8fafc" }}
                      >
                        <option value="">Select Type</option>
                        <option value="PRIVATE">Private</option>
                        <option value="PUBLIC">Public</option>
                        <option value="PARTNERSHIP">Partnership</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: "8px" }}>
                        GST NUMBER
                      </label>
                      <input
                        value={editForm.gstNumber}
                        onChange={(e) => setEditForm((p) => ({ ...p, gstNumber: e.target.value }))}
                        placeholder="GSTIN (optional)"
                        style={{ width: "100%", padding: "12px 14px", borderRadius: "14px", border: "1px solid transparent", outline: "none", background: "#f8fafc" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: "8px" }}>
                        PAN NUMBER
                      </label>
                      <input
                        value={editForm.panNumber}
                        onChange={(e) => setEditForm((p) => ({ ...p, panNumber: e.target.value }))}
                        placeholder="PAN (optional)"
                        style={{ width: "100%", padding: "12px 14px", borderRadius: "14px", border: "1px solid transparent", outline: "none", background: "#f8fafc" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: "8px" }}>
                        REGISTRATION NO
                      </label>
                      <input
                        value={editForm.registrationNo}
                        onChange={(e) => setEditForm((p) => ({ ...p, registrationNo: e.target.value }))}
                        placeholder="Registration no. (optional)"
                        style={{ width: "100%", padding: "12px 14px", borderRadius: "14px", border: "1px solid transparent", outline: "none", background: "#f8fafc" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: "8px" }}>
                        DISTRICT
                      </label>
                      <input
                        value={editForm.district}
                        onChange={(e) => {
                          const cleaned = String(e.target.value || "")
                            .replace(/[^a-zA-Z\s]/g, "")
                            .replace(/\s+/g, " ")
                            .trimStart();
                          const key = cleaned.trim().toLowerCase();
                          const match = DISTRICT_AUTOFILL[key];
                          if (match) {
                            setEditForm((p) => ({ ...p, district: cleaned, state: match.state, country: match.country }));
                          } else {
                            setEditForm((p) => ({ ...p, district: cleaned }));
                          }
                        }}
                        placeholder="District (optional)"
                        style={{ width: "100%", padding: "12px 14px", borderRadius: "14px", border: "1px solid transparent", outline: "none", background: "#f8fafc" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: "8px" }}>
                        COUNTRY
                      </label>
                      <input
                        value={editForm.country}
                        onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value }))}
                        placeholder="Country (optional)"
                        style={{ width: "100%", padding: "12px 14px", borderRadius: "14px", border: "1px solid transparent", outline: "none", background: "#f8fafc" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: "8px" }}>
                        STATE
                      </label>
                      <input
                        value={editForm.state}
                        onChange={(e) => setEditForm((p) => ({ ...p, state: e.target.value }))}
                        placeholder="State (optional)"
                        style={{ width: "100%", padding: "12px 14px", borderRadius: "14px", border: "1px solid transparent", outline: "none", background: "#f8fafc" }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: "14px" }}>
                    <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.12em", color: "#94a3b8", marginBottom: "8px" }}>
                      OFFICE ADDRESS
                    </label>
                    <input
                      value={editForm.officeAddress}
                      onChange={(e) => setEditForm((p) => ({ ...p, officeAddress: e.target.value }))}
                      placeholder="Office address (optional)"
                      style={{ width: "100%", padding: "12px 14px", borderRadius: "14px", border: "1px solid transparent", outline: "none", background: "#f8fafc" }}
                    />
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 900, color: "#475569", marginBottom: "10px" }}>
                      Product Select
                    </div>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      {["CRM", "HRMS", "PMS"].map((productName) => (
                        <label
                          key={productName}
                          style={{
                            padding: "10px 18px",
                            cursor: "pointer",
                            borderRadius: "14px",
                            border: "1px solid",
                            borderColor: (editForm.products || []).includes(productName) ? "#2563eb" : "#e2e8f0",
                            background: (editForm.products || []).includes(productName) ? "#eff6ff" : "#ffffff",
                            color: (editForm.products || []).includes(productName) ? "#1d4ed8" : "#64748b",
                            fontSize: "0.9rem",
                            fontWeight: 700,
                            transition: "all 0.2s ease"
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={(editForm.products || []).includes(productName)}
                            onChange={() =>
                              setEditForm((p) => ({
                                ...p,
                                products: (p.products || []).includes(productName)
                                  ? (p.products || []).filter((v) => v !== productName)
                                  : [...(p.products || []), productName]
                              }))
                            }
                            style={{ display: "none" }}
                          />
                          {productName}
                        </label>
                      ))}
                    </div>
                  </div>

                  {error ? (
                    <div
                      style={{
                        marginTop: 14,
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        color: "#991b1b",
                        padding: "10px 12px",
                        borderRadius: 14,
                        fontWeight: 800
                      }}
                    >
                      {error}
                    </div>
                  ) : null}

                  <div style={{ marginTop: "22px", display: "flex", justifyContent: "flex-end", gap: "14px" }}>
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    style={{
                      background: "#ffffff",
                      color: "#64748b",
                      padding: "12px 18px",
                      borderRadius: "14px",
                      fontWeight: 900,
                      letterSpacing: "0.02em",
                      border: "1px solid #e2e8f0",
                      cursor: "pointer",
                      minWidth: "140px"
                    }}
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      background: "#2563eb",
                      color: "white",
                      padding: "12px 20px",
                      borderRadius: "14px",
                      fontWeight: 900,
                      letterSpacing: "0.02em",
                      border: "none",
                      cursor: "pointer",
                      minWidth: "220px",
                      boxShadow: "0 14px 28px rgba(37, 99, 235, 0.22)",
                      opacity: submitting ? 0.85 : 1
                    }}
                  >
                    {submitting ? "SAVING..." : "SAVE CHANGES"}
                  </button>
                </div>
                </div>
              </form>
            </div>
          </div>
        )}

      {/* Create Company Modal stays global */}
      {showCreateModal &&
        renderInBody(
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              left: 88,
              background: "rgba(15, 23, 42, 0.45)",
              zIndex: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(6px)",
              padding: 20
            }}
            onClick={() => setShowCreateModal(false)}
          >
            <div
              style={{
                background: "#ffffff",
                width: "100%",
                height: "100%",
                borderRadius: "0px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 40px 80px rgba(15, 23, 42, 0.18)",
                overflow: "hidden"
              }}
              onClick={(e) => e.stopPropagation()}
            >
            <div
              style={{
                padding: '20px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a' }}>
                  New Company Create
                </div>
              </div>
            </div>

            <form
              autoComplete="off"
              onSubmit={async (e) => {
                e.preventDefault();
                await submitCompany(e);
                setShowCreateModal(false);
              }}
            >
              {/* Prevent browser autofill from injecting saved credentials */}
              <input
                type="text"
                name="gtone_fake_username"
                autoComplete="username"
                tabIndex={-1}
                style={{ position: 'absolute', opacity: 0, height: 0, width: 0, pointerEvents: 'none' }}
              />
              <input
                type="password"
                name="gtone_fake_password"
                autoComplete="current-password"
                tabIndex={-1}
                style={{ position: 'absolute', opacity: 0, height: 0, width: 0, pointerEvents: 'none' }}
              />
              <div style={{ padding: '20px' }}>
                {/* Logo left + 6 inputs on right (2 rows x 3) */}
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '18px', alignItems: 'start' }}>
                  {/* Logo Upload */}
                  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <label
                      style={{
                        width: '120px',
                        height: '120px',
                        borderRadius: '22px',
                        border: '1.5px dashed #cbd5e1',
                        background: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(ev) => {
                          const file = ev.target.files?.[0];
                          if (!file) return;
                          const url = URL.createObjectURL(file);
                          setCompanyLogoPreview(url);
                        }}
                      />
                      {companyLogoPreview ? (
                        <img src={companyLogoPreview} alt="Company logo preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ width: 40, height: 40, borderRadius: 14, background: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="20" height="20">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4-4a3 5 0 0 1 4 0l4 4" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2 20h20" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 10a4 4 0 0 1 10 0" />
                            </svg>
                          </div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b' }}>UPLOAD LOGO</div>
                        </div>
                      )}

                      <div
                        style={{
                          position: 'absolute',
                          right: 12,
                          bottom: 12,
                          width: 34,
                          height: 34,
                          borderRadius: 14,
                          background: '#4f46e5',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 10px 20px rgba(79, 70, 229, 0.25)'
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 20h9" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                        </svg>
                      </div>
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px' }}>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#94a3b8', marginBottom: '8px' }}>
                      COMPANY NAME
                    </label>
                    <input
                      name="name"
                      value={form.name}
                      onChange={updateField}
                      required
                        placeholder="Company name"
                      autoComplete="off"
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '14px', border: '1px solid transparent', outline: 'none', background: '#f8fafc' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#94a3b8', marginBottom: '8px' }}>
                      ADMIN NAME
                    </label>
                    <input
                      name="adminName"
                      value={form.adminName}
                      onChange={updateField}
                      required
                        placeholder="Admin full name"
                      autoComplete="off"
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '14px', border: '1px solid transparent', outline: 'none', background: '#f8fafc' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#94a3b8', marginBottom: '8px' }}>
                      COMPANY EMAIL
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={updateField}
                      required
                        placeholder="company@example.com"
                      autoComplete="off"
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '14px', border: '1px solid transparent', outline: 'none', background: '#f8fafc' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#94a3b8', marginBottom: '8px' }}>
                      PASSWORD
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showCreatePassword ? "text" : "password"}
                        name="adminPassword"
                        value={form.adminPassword}
                        onChange={updateField}
                        required
                        placeholder="Create a password"
                        autoComplete="new-password"
                        style={{
                          width: "100%",
                          padding: "12px 44px 12px 14px",
                          borderRadius: "14px",
                          border: "1px solid transparent",
                          outline: "none",
                          background: "#f8fafc"
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCreatePassword((v) => !v)}
                        style={{
                          position: "absolute",
                          right: 10,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 32,
                          height: 32,
                          borderRadius: 12,
                          border: "none",
                          background: "transparent",
                          color: "#64748b",
                          cursor: "pointer",
                          display: "grid",
                          placeItems: "center",
                          boxShadow: "none"
                        }}
                        aria-label={showCreatePassword ? "Hide password" : "Show password"}
                      >
                        {showCreatePassword ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.11 1 12c.62-1.47 1.53-2.87 2.68-4.11" />
                            <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                            <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.89 11 8-1.02 2.43-2.8 4.58-5.06 5.94" />
                            <path d="M1 1l22 22" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#94a3b8', marginBottom: '8px' }}>
                      PHONE NUMBER
                    </label>
                    <input
                      name="phone"
                      value={form.phone}
                      onChange={updateField}
                      inputMode="numeric"
                      maxLength={15}
                      placeholder="9876543210"
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '14px', border: '1px solid transparent', outline: 'none', background: '#f8fafc' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#94a3b8', marginBottom: '8px' }}>
                      SUB COMPANY LIMIT
                    </label>
                    <input
                      name="subCompanyLimit"
                      value={form.subCompanyLimit}
                      onChange={updateField}
                        placeholder="10"
                      style={{ width: '100%', padding: '12px 14px', borderRadius: '14px', border: '1px solid transparent', outline: 'none', background: '#f8fafc' }}
                    />
                  </div>
                  </div>

                  <div
                    style={{
                      gridColumn: '1 / -1',
                      marginTop: '14px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      gap: '14px'
                    }}
                  >
                  <div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#94a3b8', marginBottom: '8px' }}>
                          COMPANY TYPE
                        </label>
                        <select
                          name="companyType"
                          value={form.companyType}
                          onChange={updateField}
                          style={{ width: '100%', padding: '12px 14px', borderRadius: '14px', border: '1px solid transparent', outline: 'none', background: '#f8fafc' }}
                        >
                          <option value="">Select Type</option>
                          <option value="PRIVATE">Private</option>
                          <option value="PUBLIC">Public</option>
                          <option value="PARTNERSHIP">Partnership</option>
                        </select>
                      </div>
                  </div>
                  <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#94a3b8', marginBottom: '8px' }}>
                          GST NUMBER
                        </label>
                        <input
                          name="gstNumber"
                          value={form.gstNumber}
                          onChange={updateField}
                          placeholder="GSTIN (optional)"
                          style={{ width: '100%', padding: '12px 14px', borderRadius: '14px', border: '1px solid transparent', outline: 'none', background: '#f8fafc' }}
                        />
                      </div>
                  <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#94a3b8', marginBottom: '8px' }}>
                          PAN NUMBER
                        </label>
                        <input
                          name="panNumber"
                          value={form.panNumber}
                          onChange={updateField}
                          placeholder="PAN (optional)"
                          style={{ width: '100%', padding: '12px 14px', borderRadius: '14px', border: '1px solid transparent', outline: 'none', background: '#f8fafc' }}
                        />
                      </div>
                  <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#94a3b8', marginBottom: '8px' }}>
                          REGISTRATION NO
                        </label>
                        <input
                          name="registrationNo"
                          value={form.registrationNo}
                          onChange={updateField}
                          placeholder="Registration no. (optional)"
                          style={{ width: '100%', padding: '12px 14px', borderRadius: '14px', border: '1px solid transparent', outline: 'none', background: '#f8fafc' }}
                        />
                      </div>
                  <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#94a3b8', marginBottom: '8px' }}>
                          DISTRICT
                        </label>
                        <input
                          name="district"
                          value={form.district}
                          onChange={updateField}
                          placeholder="District (optional)"
                          style={{ width: '100%', padding: '12px 14px', borderRadius: '14px', border: '1px solid transparent', outline: 'none', background: '#f8fafc' }}
                        />
                      </div>
                  <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#94a3b8', marginBottom: '8px' }}>
                          COUNTRY
                        </label>
                        <input
                          name="country"
                          value={form.country}
                          onChange={updateField}
                          placeholder="Country (optional)"
                          style={{ width: '100%', padding: '12px 14px', borderRadius: '14px', border: '1px solid transparent', outline: 'none', background: '#f8fafc' }}
                        />
                      </div>
                  </div>

                  {/* State + Office Address on one line */}
                  <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#94a3b8', marginBottom: '8px' }}>
                        STATE
                      </label>
                      <input
                        name="state"
                        value={form.state}
                        onChange={updateField}
                        placeholder="State (optional)"
                        style={{ width: '100%', padding: '12px 14px', borderRadius: '14px', border: '1px solid transparent', outline: 'none', background: '#f8fafc' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#94a3b8', marginBottom: '8px' }}>
                        OFFICE ADDRESS
                      </label>
                      <input
                        name="officeAddress"
                        value={form.officeAddress}
                        onChange={updateField}
                        placeholder="Office address (optional)"
                        style={{ width: '100%', padding: '12px 14px', borderRadius: '14px', border: '1px solid transparent', outline: 'none', background: '#f8fafc' }}
                      />
                    </div>
                  </div>

                    <div style={{ marginTop: '10px', gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 900, color: '#475569', marginBottom: '10px' }}>
                        Product Select
                      </div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {['CRM', 'HRMS', 'PMS'].map((productName) => (
                          <label
                            key={productName}
                            style={{
                              padding: '10px 18px',
                              cursor: 'pointer',
                              borderRadius: '14px',
                              border: '1px solid',
                              borderColor: form.products.includes(productName) ? '#2563eb' : '#e2e8f0',
                              background: form.products.includes(productName) ? '#eff6ff' : '#ffffff',
                              color: form.products.includes(productName) ? '#1d4ed8' : '#64748b',
                              fontSize: '0.9rem',
                              fontWeight: 700,
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={form.products.includes(productName)}
                              onChange={() => toggleProduct(productName)}
                              style={{ display: 'none' }}
                            />
                            {productName}
                          </label>
                        ))}
                      </div>
                    </div>
                </div>

                <div style={{ marginTop: '22px', display: 'flex', justifyContent: 'flex-end', gap: '14px' }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    style={{
                      background: '#ffffff',
                      color: '#64748b',
                      padding: '12px 18px',
                      borderRadius: '14px',
                      fontWeight: 900,
                      letterSpacing: '0.02em',
                      border: '1px solid #e2e8f0',
                      cursor: 'pointer',
                      minWidth: '140px'
                    }}
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      background: '#4f46e5',
                      color: 'white',
                      padding: '12px 20px',
                      borderRadius: '14px',
                      fontWeight: 900,
                      letterSpacing: '0.02em',
                      border: 'none',
                      cursor: 'pointer',
                      minWidth: '220px',
                      boxShadow: '0 14px 28px rgba(79, 70, 229, 0.25)',
                      opacity: submitting ? 0.85 : 1
                    }}
                  >
                    {submitting ? "CREATING..." : "CREATE COMPANY  +"}
                  </button>
                </div>
              </div>
            </form>
          </div>
          </div>
        )}
    </AdminLayout>
  );
}

export default Dashboard;
