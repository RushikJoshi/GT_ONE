import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";

const defaultCreateForm = {
  name: "",
  email: "",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
  products: []
};

function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
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

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

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

  if (loading) {
    return <div className="center-screen">Loading dashboard...</div>;
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>GT ONE Super Admin</h1>
          <p className="muted">{user?.email}</p>
        </div>
        <button onClick={handleLogout}>Logout</button>
      </header>

      <section className="grid two">
        <form className="card" onSubmit={submitCompany}>
          <h2>Create Company</h2>
          <label>Company Name</label>
          <input name="name" value={form.name} onChange={updateField} required />

          <label>Company Email</label>
          <input type="email" name="email" value={form.email} onChange={updateField} required />

          <label>Admin Name</label>
          <input name="adminName" value={form.adminName} onChange={updateField} required />

          <label>Admin Email</label>
          <input type="email" name="adminEmail" value={form.adminEmail} onChange={updateField} required />

          <label>Admin Password</label>
          <input
            type="password"
            name="adminPassword"
            value={form.adminPassword}
            onChange={updateField}
            required
          />

          <p className="muted">Assign Products</p>
          <div className="chips">
            {productNames.map((productName) => (
              <label key={productName} className="chip">
                <input
                  type="checkbox"
                  checked={form.products.includes(productName)}
                  onChange={() => toggleProduct(productName)}
                />
                {productName}
              </label>
            ))}
          </div>

          {message && <p className="success">{message}</p>}
          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create Company"}
          </button>
        </form>

        <div className="card">
          <h2>Companies</h2>
          {companies.length === 0 ? (
            <p className="muted">No companies created yet.</p>
          ) : (
            <div className="list">
              {companies.map((company) => (
                <article key={company._id} className="list-item">
                  <div>
                    <h3>{company.name}</h3>
                    <p className="muted">{company.email}</p>
                    <p className="muted">
                      Admin: {company.admin?.name || "-"} ({company.admin?.email || "-"})
                    </p>
                    <p className="muted">Products: {(company.products || []).join(", ") || "None"}</p>
                  </div>
                  <Link to={`/companies/${company._id}/products`} className="link-btn">
                    Open HRMS Config
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
