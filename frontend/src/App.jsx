import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardView from './components/DashboardView';
import InventoryView from './components/InventoryView';
import PurchasesView from './components/PurchasesView';
import SalesView from './components/SalesView';
import CreditView from './components/CreditView';
import { fetchHealth } from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dbHealth, setDbHealth] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Check health on mount and periodically
  const checkConnection = async () => {
    try {
      const data = await fetchHealth();
      setDbHealth(data.database);
    } catch (err) {
      console.warn('Health check failed:', err.message);
      setDbHealth({ connected: false, error: err.message });
    }
  };

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 30000); // 30s heartbeat
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await checkConnection();
    setRefreshKey(prev => prev + 1);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        onSelectTab={setActiveTab} 
        dbHealth={dbHealth} 
      />

      {/* Main Content Area */}
      <div className="main-wrapper">
        <Header 
          activeTab={activeTab} 
          dbHealth={dbHealth} 
          onRefresh={handleManualRefresh}
          isRefreshing={isRefreshing}
        />

        <main className="content-body">
          {activeTab === 'dashboard' && (
            <DashboardView 
              key={`dashboard-${refreshKey}`}
              onNavigateToInventory={() => setActiveTab('inventory')} 
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryView 
              key={`inventory-${refreshKey}`} 
            />
          )}

          {activeTab === 'purchases' && (
            <PurchasesView 
              key={`purchases-${refreshKey}`} 
            />
          )}

          {activeTab === 'sales' && (
            <SalesView 
              key={`sales-${refreshKey}`} 
            />
          )}

          {activeTab === 'credit' && (
            <CreditView 
              key={`credit-${refreshKey}`} 
            />
          )}
        </main>
      </div>
    </div>
  );
}
