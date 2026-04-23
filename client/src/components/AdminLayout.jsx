import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './AdminLayout.css';

const AdminLayout = ({ children, activeTab, setActiveTab }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
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
            <button type="button" className="sidebar-action" aria-disabled="true">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span>Notifications</span>
            </button>

            <button type="button" className="sidebar-action" onClick={handleLogout}>
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Logout</span>
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
