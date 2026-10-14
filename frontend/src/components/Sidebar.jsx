import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Truck, 
  Receipt, 
  Scale, 
  Database,
  BookOpen
} from 'lucide-react';

export default function Sidebar({ activeTab, onSelectTab, dbHealth }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: 'Live' },
    { id: 'inventory', label: 'Inventory', icon: Package, badge: 'Live' },
    { id: 'purchases', label: 'Purchases & GRN', icon: Truck, badge: 'Live' },
    { id: 'sales', label: 'Sales & Payments', icon: Receipt, badge: 'Live' },
    { id: 'credit', label: 'Credit & Write-offs', icon: Scale, badge: 'Live' }
  ];

  const isConnected = dbHealth?.connected === true;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <BookOpen size={20} />
        </div>
        <div className="sidebar-title">
          <h1>SRC Bookstore</h1>
          <p>Management System</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="nav-item-left">
                <Icon size={18} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="nav-badge">{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="db-status-pill">
          <span className={`status-dot ${isConnected ? '' : 'offline'}`} />
          <span>
            {isConnected 
              ? 'System: Online'
              : 'Connecting to Service...'}
          </span>
        </div>
      </div>
    </aside>
  );
}
