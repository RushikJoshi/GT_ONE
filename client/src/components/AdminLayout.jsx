import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './AdminLayout.css';

const AdminLayout = ({ children, activeTab, setActiveTab }) => {
  const { logout, logoutEverywhere } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleLogoutEverywhere = async () => {
    await logoutEverywhere();
    navigate('/login');
  };

  const navItems = [
    { id: 'dashboard', label: 'DASHBOARD', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M4.75 4.75h5.5v5.5h-5.5v-5.5Zm9 0h5.5v5.5h-5.5v-5.5Zm-9 9h5.5v5.5h-5.5v-5.5Zm9 0h5.5v5.5h-5.5v-5.5Z"
        />
      </svg>
    )},
    { id: 'applications', label: 'APPLICATIONS', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M6.5 6.75h11a1.75 1.75 0 0 1 1.75 1.75v7a1.75 1.75 0 0 1-1.75 1.75h-11A1.75 1.75 0 0 1 4.75 15.5v-7A1.75 1.75 0 0 1 6.5 6.75Zm2 12.5h7"
        />
      </svg>
    )},
    { id: 'product-config', label: 'PRODUCT CONFIG', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M12 3.75 4.75 7.5v9L12 20.25l7.25-3.75v-9L12 3.75Zm0 0v16.5M7.75 9.25l8.5 4.5M16.25 9.25l-8.5 4.5"
        />
      </svg>
    )},
    { id: 'accounts', label: 'ACCOUNTS', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M16 19a4 4 0 0 0-8 0M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 7a4 4 0 0 0-3-3.87M17.5 12a3 3 0 1 0 0-6M4 19a4 4 0 0 1 3-3.87M6.5 12a3 3 0 1 1 0-6"
        />
      </svg>
    )},
    { id: 'company', label: 'COMPANIES', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M5.5 20V6.5c0-.966.784-1.75 1.75-1.75h9.5c.966 0 1.75.784 1.75 1.75V20M4 20h16M8.25 8.5h1.5M8.25 11.5h1.5M8.25 14.5h1.5M12.25 8.5h1.5M12.25 11.5h1.5M12.25 14.5h1.5"
        />
      </svg>
    )},
    { id: 'products', label: 'MODULES', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M7.5 9.5h9m-9 5h9M6.25 4.75h11.5c.966 0 1.75.784 1.75 1.75v11.5c0 .966-.784 1.75-1.75 1.75H6.25c-.966 0-1.75-.784-1.75-1.75V6.5c0-.966.784-1.75 1.75-1.75Z"
        />
      </svg>
    )},
    { id: 'activities', label: 'ACTIVITIES', icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M12 7.5v4.75l3 1.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    )},
  ];

  return (
    <div className="admin-container">
      <aside className="admin-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <img className="sidebar-logo" src="/sidebar-logo.png" alt="GITAKSHMI" />
            <span className="sidebar-brand-text">Super Admin</span>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <div className="icon-box">
                {item.icon}
              </div>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-actions">
            <button type="button" className="sidebar-action" aria-disabled="true" title="Notifications">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>

            <button type="button" className="sidebar-action" onClick={handleLogout} title="Logout">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>

            <button type="button" className="sidebar-action" onClick={handleLogoutEverywhere} title="Sign out everywhere">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364 6.364-2.121-2.121M7.757 7.757 5.636 5.636m12.728 0-2.121 2.121M7.757 16.243l-2.121 2.121" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <div className="main-content">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
