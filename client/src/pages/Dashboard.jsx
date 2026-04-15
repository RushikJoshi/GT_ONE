import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import AdminLayout from "../components/AdminLayout";

const defaultCreateForm = {
  name: "",
  email: "",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
  products: []
};

function Dashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("company");
  const [products, setProducts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(defaultCreateForm);
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

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
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
      await api.post("/companies", form);
      setForm(defaultCreateForm);
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
  const [currentActivityPage, setCurrentActivityPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productTabCompany, setProductTabCompany] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editProducts, setEditProducts] = useState([]);
  const activitiesPerPage = 10;

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
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update configuration");
    } finally {
      setSubmitting(false);
    }
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
                  onClick={() => setActiveTab('company')}
                >
                  Manage All
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                {companies.map((company) => (
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
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '16px 24px', borderRadius: '0px', border: '1px solid #e2e8f0' }}>
                 <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Registered Organizations</h2>
                 </div>
                 <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button 
                      onClick={() => setShowCreateModal(true)}
                      style={{ 
                        background: '#2563eb', color: 'white', padding: '10px 16px', borderRadius: '10px', 
                        fontWeight: 800, fontSize: '0.85rem', border: 'none', cursor: 'pointer', 
                        display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Register Company
                    </button>
                    <div style={{ width: '1px', height: '32px', background: '#e2e8f0', margin: '0 4px' }} />
                    <div style={{ textAlign: 'right' }}>
                       <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#2563eb' }}>{companies.reduce((acc, c) => acc + (c.products?.length || 0), 0)}</div>
                       <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Active Licenses</div>
                    </div>
                 </div>
              </div>

              <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid #eef2f6', borderRadius: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 120px', padding: '12px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                   <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Client Entity</div>
                   <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Module Suite</div>
                   <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Management</div>
                </div>
                <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                  {companies.map((company) => (
                    <div 
                      key={company._id} 
                      onClick={() => handleSelectCompany(company)}
                      style={{ 
                        display: 'grid', gridTemplateColumns: '1.5fr 1fr 120px', padding: '16px 24px', 
                        alignItems: 'center', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                         <div style={{ 
                           width: '44px', height: '44px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', 
                           color: '#2563eb', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                           fontWeight: 800, fontSize: '1.1rem' 
                         }}>
                           {company.name[0]}
                         </div>
                         <div style={{ overflow: 'hidden' }}>
                           <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{company.name}</h4>
                           <p className="muted" style={{ fontSize: '0.75rem', margin: 0 }}>{company.email}</p>
                         </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {(company.products || []).slice(0, 3).map(p => (
                          <span key={p} style={{ fontSize: '10px', fontWeight: 800, padding: '4px 8px', borderRadius: '6px', background: '#f0fdf4', color: '#166534', border: '1.5px solid #dcfce7' }}>{p}</span>
                        ))}
                        {(company.products || []).length > 3 && (
                          <span style={{ fontSize: '10px', fontWeight: 800, padding: '4px 8px', borderRadius: '6px', background: '#eff6ff', color: '#2563eb' }}>+{(company.products || []).length - 3}</span>
                        )}
                        {(company.products || []).length === 0 && <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>None Assigned</span>}
                      </div>

                      <div style={{ textAlign: 'right' }}>
                         <button style={{ background: '#2563eb', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.1)' }}>Open Profile</button>
                      </div>
                    </div>
                  ))}
                </div>
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
                  background: '#ffffff', color: '#1e293b', width: '44px', height: '44px', borderRadius: '14px', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #e2e8f0', cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = '#2563eb'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
               >
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                   <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                 </svg>
               </button>
               <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>{selectedCompany.name}</h2>
                  <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>Corporate Resource Management</p>
               </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) 1fr', gap: '20px', alignItems: 'start' }}>
               {/* Content Area */}
               <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Module Management */}
                  <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                       <div>
                          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#1e293b' }}>Module Suite</h3>
                          <p className="muted" style={{ fontSize: '0.75rem', margin: '4px 0 0 0' }}>Configure license entitlements for this entity</p>
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
                       {products.map(p => {
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
        // Generate mock activities from companies data
        const activities = companies.flatMap(company => {
          const events = [];
          
          // Registration event
          events.push({
            id: `reg-${company._id}`,
            type: 'registration',
            title: 'New Company Registered',
            description: `${company.name} joined the platform.`,
            time: company.createdAt,
            icon: (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            ),
            color: '#2563eb'
          });

          // Configuration events (mocked based on products)
          (company.products || []).forEach(product => {
            events.push({
              id: `conf-${company._id}-${product}`,
              type: 'configuration',
              title: 'Module Configured',
              description: `Assigned ${product} module to ${company.name}.`,
              time: company.updatedAt,
              icon: (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.154-2.046-.441-2.992z" />
                </svg>
              ),
              color: '#059669'
            });
          });

          return events;
        }).sort((a, b) => new Date(b.time) - new Date(a.time));

        const totalPages = Math.ceil(activities.length / activitiesPerPage);
        const startIndex = (currentActivityPage - 1) * activitiesPerPage;
        const pagedActivities = activities.slice(startIndex, startIndex + activitiesPerPage);

        return (
          <div className="card" style={{ padding: '0', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', border: '1px solid #eef2f6', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.02)' }}>
            <div style={{ 
              padding: '20px 24px', 
              background: 'linear-gradient(to right, #ffffff, #f8fafc)', 
              borderBottom: '1px solid #f1f5f9', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center' 
            }}>
               <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#1e293b', letterSpacing: '-0.02em' }}>Audit Logs</h3>
                  <p className="muted" style={{ fontSize: '0.8rem', margin: '2px 0 0 0' }}>Comprehensive system event tracking</p>
               </div>
               <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '4px', background: '#f1f5f9', borderRadius: '10px' }}>
                  <button 
                    disabled={currentActivityPage === 1}
                    onClick={() => setCurrentActivityPage(p => p - 1)}
                    className="icon-btn"
                    style={{ 
                      width: '32px', height: '32px', borderRadius: '8px', border: 'none', 
                      background: currentActivityPage === 1 ? 'transparent' : 'white', 
                      color: '#64748b', cursor: currentActivityPage === 1 ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: currentActivityPage === 1 ? 'none' : '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', padding: '0 8px' }}>Page {currentActivityPage} of {totalPages || 1}</span>
                  <button 
                    disabled={currentActivityPage === totalPages || totalPages === 0}
                    onClick={() => setCurrentActivityPage(p => p + 1)}
                    className="icon-btn"
                    style={{ 
                      width: '32px', height: '32px', borderRadius: '8px', border: 'none', 
                      background: (currentActivityPage === totalPages || totalPages === 0) ? 'transparent' : 'white', 
                      color: '#64748b', cursor: (currentActivityPage === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: (currentActivityPage === totalPages || totalPages === 0) ? 'none' : '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
               </div>
            </div>
            
            <div style={{ padding: '24px', flex: 1, position: 'relative' }}>
              {pagedActivities.length === 0 ? (
                <div style={{ padding: '60px 40px', textAlign: 'center', background: '#f8fafc', borderRadius: '20px', border: '2px dashed #e2e8f0' }}>
                  <p style={{ color: '#94a3b8', fontWeight: 500 }}>No system activities recorded yet.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '14px', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '17px', top: '10px', bottom: '10px', width: '2px', background: 'linear-gradient(to bottom, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)' }} />
                  
                  {pagedActivities.map((activity) => (
                    <div key={activity.id} className="activity-row" style={{ 
                      display: 'flex', gap: '20px', position: 'relative', zIndex: 1,
                      padding: '12px', borderRadius: '12px', transition: 'all 0.2s ease',
                    }}>
                      <div style={{ 
                        width: '36px', height: '36px', background: 'white', border: `2px solid ${activity.color}33`, 
                        borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        color: activity.color, flexShrink: 0, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                        fontSize: '14px'
                      }}>
                        {activity.icon}
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
                    </div>
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
        );
      case "products":
        
        const toggleProductStatus = async (productName, currentProducts) => {
          if (!productTabCompany) return;
          try {
            setSubmitting(true);
            const hasProduct = currentProducts.includes(productName);
            const newProducts = hasProduct 
              ? currentProducts.filter(p => p !== productName)
              : [...currentProducts, productName];
            
            await api.put(`/companies/${productTabCompany._id}/products`, { products: newProducts });
            
            // Update global state and local tab state
            setCompanies(prev => prev.map(c => 
              c._id === productTabCompany._id ? { ...c, products: newProducts } : c
            ));
            setProductTabCompany(prev => ({ ...prev, products: newProducts }));
            
            setMessage(`${productName} ${hasProduct ? 'revoked from' : 'assigned to'} ${productTabCompany.name}`);
            setTimeout(() => setMessage(""), 3000);
          } catch (err) {
            setError("Failed to update module entitlement");
          } finally {
            setSubmitting(false);
          }
        };

        if (!productTabCompany) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>Module Entitlements</h2>
                    <p className="muted" style={{ fontSize: '0.9rem' }}>Select an organization to manage their product suite</p>
                 </div>
              </div>

              <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.5fr) minmax(150px, 1fr) 100px', padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                   <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Organization</div>
                   <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Modules Active</div>
                   <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Action</div>
                </div>
                <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
                  {companies.map((company) => (
                    <div 
                      key={company._id} 
                      onClick={() => setProductTabCompany(company)}
                      style={{ 
                        display: 'grid', gridTemplateColumns: 'minmax(200px, 1.5fr) minmax(150px, 1fr) 100px', 
                        padding: '16px 24px', alignItems: 'center', borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer', transition: 'background 0.2s', background: '#ffffff'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                      onMouseOut={(e) => e.currentTarget.style.background = '#ffffff'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                         <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '1.1rem' }}>
                           {company.name.charAt(0).toUpperCase()}
                         </div>
                         <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{company.name}</div>
                            <div className="muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{company.email}</div>
                         </div>
                      </div>
                      <div>
                        {company.products && company.products.length > 0 ? (
                           <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                             {company.products.map(p => (
                               <span key={p} style={{ fontSize: '0.7rem', padding: '4px 10px', background: '#f0fdf4', color: '#166534', borderRadius: '6px', fontWeight: 700 }}>{p}</span>
                             ))}
                           </div>
                        ) : (
                          <span className="muted" style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>None Provisioned</span>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <button style={{ background: '#eff6ff', color: '#2563eb', padding: '6px 14px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                          Manage
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeInRight 0.3s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
               <button 
                onClick={() => setProductTabCompany(null)}
                style={{ 
                  background: '#ffffff', color: '#0f172a', width: '44px', height: '44px', borderRadius: '12px', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)'
                }}
               >
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                   <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                 </svg>
               </button>
               <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{productTabCompany.name}</h2>
                  <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>Managing product suite assignments</p>
               </div>
            </div>

            <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
               <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Product Suite</h3>
                    <p className="muted" style={{ fontSize: '0.85rem', margin: '4px 0 0 0' }}>Toggle individual modules on or off</p>
                  </div>
                  <div style={{ padding: '8px 16px', background: '#eff6ff', color: '#2563eb', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800 }}>
                    {productTabCompany.products?.length || 0} / {products.length} Active Modules
                  </div>
               </div>
               
               <div style={{ padding: '32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                  {products.map(p => {
                    const isActive = (productTabCompany.products || []).includes(p.name);
                    return (
                      <div 
                        key={p._id}
                        style={{ 
                          padding: '20px', borderRadius: '16px', border: isActive ? '2px solid #2563eb' : '1px solid #e2e8f0',
                          background: isActive ? '#f8fafc' : '#ffffff',
                          display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative'
                        }}
                      >
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                               <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: isActive ? '#eff6ff' : '#f1f5f9', color: isActive ? '#2563eb' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                               </div>
                               <div>
                                  <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{p.name}</h4>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isActive ? '#059669' : '#94a3b8' }}>
                                    {isActive ? 'ACTIVE MODULE' : 'DISABLED'}
                                  </span>
                               </div>
                            </div>
                         </div>
                         
                         <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              disabled={submitting}
                              onClick={() => toggleProductStatus(p.name, productTabCompany.products || [])}
                              style={{ 
                                padding: '8px 16px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 800, border: 'none', cursor: 'pointer',
                                background: isActive ? '#fee2e2' : '#2563eb',
                                color: isActive ? '#ef4444' : '#ffffff',
                                transition: 'all 0.2s', width: '100%'
                              }}
                            >
                              {isActive ? 'Revoke Access' : 'Provision Module'}
                            </button>
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
      {renderTabContent()}

      {/* Create Company Modal stays global */}
      {showCreateModal && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', 
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' 
        }} onClick={() => setShowCreateModal(false)}>
            <div style={{ 
              background: 'white', padding: '32px', borderRadius: '24px', width: '90%', maxWidth: '600px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.2)', animation: 'fadeInScale 0.3s ease-out',
              maxHeight: '90vh', overflowY: 'auto'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>Register New Company</h2>
                <button onClick={() => setShowCreateModal(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
              </div>

              <form onSubmit={async (e) => { e.preventDefault(); await submitCompany(e); setShowCreateModal(false); }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label style={{ fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>Company Name</label>
                    <input name="name" value={form.name} onChange={updateField} required style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }} placeholder="e.g. Acme Corp" />
                  </div>
                  <div className="form-group">
                    <label style={{ fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>Contact Email</label>
                    <input type="email" name="email" value={form.email} onChange={updateField} required style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }} placeholder="contact@acme.com" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                  <div className="form-group">
                    <label style={{ fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>Admin Name</label>
                    <input name="adminName" value={form.adminName} onChange={updateField} required style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>Admin Email</label>
                    <input type="email" name="adminEmail" value={form.adminEmail} onChange={updateField} required style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label style={{ fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>Master Password</label>
                  <input type="password" name="adminPassword" value={form.adminPassword} onChange={updateField} required style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }} placeholder="••••••••" />
                </div>

                <div style={{ marginTop: '20px' }}>
                  <label style={{ fontWeight: 700, color: '#475569', fontSize: '0.85rem', display: 'block', marginBottom: '8px' }}>Assign Initial Modules</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {productNames.map((productName) => (
                      <label key={productName} style={{ 
                        padding: '8px 16px', cursor: 'pointer', borderRadius: '10px', border: '1px solid',
                        borderColor: form.products.includes(productName) ? '#2563eb' : '#e2e8f0',
                        background: form.products.includes(productName) ? '#eff6ff' : 'white',
                        color: form.products.includes(productName) ? '#1d4ed8' : '#64748b',
                        fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.2s'
                      }}>
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

                <button 
                  type="submit" 
                  disabled={submitting} 
                  style={{ 
                    marginTop: '24px', width: '100%', background: '#2563eb', color: 'white', 
                    padding: '14px', borderRadius: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' 
                  }}
                >
                  {submitting ? "Processing..." : "Finish & Create Company"}
                </button>
              </form>
            </div>
        </div>
      )}
    </AdminLayout>
  );
}

export default Dashboard;
