import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";

const TOAST_TIMEOUT = 2500;

function AssignProducts() {
  const navigate = useNavigate();
  const { companyId } = useParams();
  const [allProducts, setAllProducts] = useState([]);
  const [moduleKeys, setModuleKeys] = useState([]);
  const [company, setCompany] = useState(null);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [enabledModules, setEnabledModules] = useState({});
  const [activeTab, setActiveTab] = useState("products");
  const [loading, setLoading] = useState(true);
  const [savingProducts, setSavingProducts] = useState(false);
  const [savingModules, setSavingModules] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, TOAST_TIMEOUT);
  };

  useEffect(() => {
    const loadPage = async () => {
      try {
        setLoading(true);
        const [productsRes, companiesRes, hrmsModulesRes] = await Promise.all([
          api.get("/products"),
          api.get("/companies"),
          api.get(`/super-admin/companies/${companyId}/hrms-modules`)
        ]);

        const targetCompany = (companiesRes.data.companies || []).find(
          (item) => item._id === companyId
        );

        if (!targetCompany) {
          setError("Company not found");
          return;
        }

        setAllProducts(productsRes.data.products || []);
        setCompany(targetCompany);
        setSelectedProducts(targetCompany.products || []);
        setModuleKeys(hrmsModulesRes.data.moduleKeys || []);
        setEnabledModules(hrmsModulesRes.data.hrmsEnabledModules || {});
      } catch (requestError) {
        setError(requestError?.response?.data?.message || "Failed to load page");
      } finally {
        setLoading(false);
      }
    };

    loadPage();
  }, [companyId]);

  const toggleProduct = (name) => {
    setSelectedProducts((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const toggleModule = (key) => {
    setEnabledModules((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const saveProducts = async () => {
    setError("");

    try {
      setSavingProducts(true);
      await api.put(`/companies/${companyId}/products`, { products: selectedProducts });
      showToast("success", "Products updated successfully");
    } catch (requestError) {
      const message = requestError?.response?.data?.message || "Failed to update products";
      setError(message);
      showToast("error", message);
    } finally {
      setSavingProducts(false);
    }
  };

  const saveModules = async () => {
    setError("");

    try {
      setSavingModules(true);
      const res = await api.put(`/super-admin/companies/${companyId}/hrms-modules`, {
        hrmsEnabledModules: enabledModules
      });
      setEnabledModules(res.data.hrmsEnabledModules || {});
      setModuleKeys(res.data.moduleKeys || moduleKeys);
      showToast("success", "HRMS modules updated successfully");
    } catch (requestError) {
      const message = requestError?.response?.data?.message || "Failed to update HRMS modules";
      setError(message);
      showToast("error", message);
    } finally {
      setSavingModules(false);
    }
  };

  if (loading) {
    return <div className="center-screen">Loading company configuration...</div>;
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Company Configuration</h1>
          <p className="muted">{company?.name} ({company?.email})</p>
        </div>
        <div className="inline-actions">
          <Link className="link-btn" to="/dashboard">
            Back
          </Link>
          <button type="button" onClick={() => navigate("/dashboard")}>Close</button>
        </div>
      </header>

      <div className="tabs">
        <button
          type="button"
          className={activeTab === "products" ? "tab-btn active" : "tab-btn"}
          onClick={() => setActiveTab("products")}
        >
          Products
        </button>
        <button
          type="button"
          className={activeTab === "hrms" ? "tab-btn active" : "tab-btn"}
          onClick={() => setActiveTab("hrms")}
        >
          HRMS Modules
        </button>
      </div>

      {activeTab === "products" && (
        <div className="card">
          <h2>Assign Products</h2>
          <div className="chips">
            {allProducts.map((product) => (
              <label key={product._id} className="chip">
                <input
                  type="checkbox"
                  checked={selectedProducts.includes(product.name)}
                  onChange={() => toggleProduct(product.name)}
                />
                {product.name}
              </label>
            ))}
          </div>
          <button type="button" onClick={saveProducts} disabled={savingProducts}>
            {savingProducts ? "Saving..." : "Save Products"}
          </button>
        </div>
      )}

      {activeTab === "hrms" && (
        <div className="card">
          <h2>HRMS Product Module Configuration</h2>
          <p className="muted">Toggle modules enabled for this company in HRMS.</p>
          <div className="module-grid">
            {moduleKeys.map((key) => (
              <label key={key} className="module-item">
                <span>{key}</span>
                <input
                  type="checkbox"
                  checked={Boolean(enabledModules[key])}
                  onChange={() => toggleModule(key)}
                />
              </label>
            ))}
          </div>
          <button type="button" onClick={saveModules} disabled={savingModules}>
            {savingModules ? "Saving..." : "Save HRMS Modules"}
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {toast && (
        <div className={toast.type === "success" ? "toast success" : "toast error"}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default AssignProducts;
