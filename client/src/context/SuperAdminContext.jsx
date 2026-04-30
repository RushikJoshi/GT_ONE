import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../lib/api";

const SuperAdminContext = createContext(null);

export const SuperAdminProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  const loadData = useCallback(async (force = false) => {
    if (isLoaded && !force) return;
    
    try {
      setLoading(true);
      const [productsRes, companiesRes, applicationsRes] = await Promise.all([
        api.get("/products"),
        api.get("/companies"),
        api.get("/applications")
      ]);
      setProducts(productsRes.data.products || []);
      setCompanies(companiesRes.data.companies || []);
      setApplications(applicationsRes.data.applications || []);
      setIsLoaded(true);
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [isLoaded]);

  const value = {
    products,
    companies,
    applications,
    loading,
    error,
    isLoaded,
    loadData,
    setCompanies,
    setApplications,
    setProducts,
    setError
  };

  return (
    <SuperAdminContext.Provider value={value}>
      {children}
    </SuperAdminContext.Provider>
  );
};

export const useSuperAdmin = () => {
  const context = useContext(SuperAdminContext);
  if (!context) {
    throw new Error("useSuperAdmin must be used inside SuperAdminProvider");
  }
  return context;
};
