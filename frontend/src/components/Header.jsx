import React from 'react';
import { Database, Server, RefreshCw } from 'lucide-react';

export default function Header({ activeTab, dbHealth, onRefresh, isRefreshing }) {
  const titles = {
    dashboard: 'Business Operations Dashboard',
    inventory: 'Live Inventory & Product Catalog',
    purchases: 'Purchases & Goods Receipt (GRN)',
    sales: 'Sales Orders & Payment Processing',
    credit: 'Credit Receivables & Stock Write-Offs'
  };

  const isConnected = dbHealth?.connected === true;

  return (
    <header className="top-header">
      <div>
        <h2>{titles[activeTab] || 'SRC Bookstore'}</h2>
      </div>

      <div className="header-meta">
        <button 
          onClick={onRefresh} 
          className="btn btn-outline"
          title="Refresh Live Data"
          disabled={isRefreshing}
        >
          <RefreshCw size={14} className={isRefreshing ? 'spinner' : ''} />
          <span>Refresh</span>
        </button>

        <div className="badge-engine">
          <Database size={13} />
          <span>
            {isConnected ? 'System: Online' : 'Connecting...'}
          </span>
        </div>
      </div>
    </header>
  );
}
