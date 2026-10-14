import React, { useEffect, useState } from 'react';
import { 
  Package, 
  DollarSign, 
  AlertTriangle, 
  TrendingUp, 
  Truck, 
  Scale, 
  ArrowUpRight, 
  ArrowDownRight,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { fetchDashboardStats, fetchRecentActivity } from '../api';

export default function DashboardView({ onNavigateToInventory }) {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, activityData] = await Promise.all([
        fetchDashboardStats(),
        fetchRecentActivity()
      ]);
      setStats(statsData.stats);
      setActivity(activityData);
    } catch (err) {
      console.error('Dashboard load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="state-box">
        <div className="spinner" />
        <p>Loading dashboard metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="state-box error">
        <AlertTriangle size={36} />
        <h3>Failed to load Dashboard data</h3>
        <p>{error}</p>
        <button onClick={loadData} className="btn btn-primary" style={{ marginTop: 12 }}>
          Retry
        </button>
      </div>
    );
  }

  const inv = stats?.inventory || {};
  const sales = stats?.sales || {};
  const credit = stats?.credit || {};
  const proc = stats?.procurement || {};
  const writeoffs = stats?.writeoffs || {};

  return (
    <div>
      {/* Low Stock Warning Banner if items need reorder */}
      {inv.lowStockAlerts > 0 && (
        <div style={{
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 'var(--radius-lg)',
          padding: '14px 20px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={20} color="#d97706" />
            <div>
              <strong style={{ color: '#92400e', fontSize: '0.9rem' }}>
                Inventory Alert: {inv.lowStockAlerts} product {inv.lowStockAlerts === 1 ? 'variant is' : 'variants are'} at or below minimum stock threshold!
              </strong>
              <p style={{ color: '#b45309', fontSize: '0.8rem', marginTop: 2 }}>
                Replenishment recommended to prevent stockouts during retail sales.
              </p>
            </div>
          </div>
          <button 
            onClick={onNavigateToInventory} 
            className="btn btn-outline"
            style={{ fontSize: '0.8rem', borderColor: '#fde68a', backgroundColor: '#ffffff' }}
          >
            Review Stock
          </button>
        </div>
      )}

      {/* Top Stat Cards Grid */}
      <div className="stats-grid">
        {/* Card 1: Total Stock & Valuation */}
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Live Inventory</span>
            <div className="stat-icon" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
              <Package size={18} />
            </div>
          </div>
          <div className="stat-card-value">
            {inv.totalStockUnits.toLocaleString()} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>units</span>
          </div>
          <div className="stat-card-sub">
            Valuation: <strong>₹{inv.inventoryValuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
          </div>
        </div>

        {/* Card 2: Catalog Size */}
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Product Catalog</span>
            <div className="stat-icon" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="stat-card-value">
            {inv.totalVariants} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>variants</span>
          </div>
          <div className="stat-card-sub">
            Across <strong>{inv.totalProducts} master publications</strong>
          </div>
        </div>

        {/* Card 3: Total Sales Revenue */}
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Completed Sales</span>
            <div className="stat-icon" style={{ backgroundColor: '#fdf4ff', color: '#9333ea' }}>
              <DollarSign size={18} />
            </div>
          </div>
          <div className="stat-card-value">
            ₹{sales.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="stat-card-sub">
            <strong>{sales.completedSalesCount} sales orders</strong> ({sales.completedPaymentsCount} payments)
          </div>
        </div>

        {/* Card 4: Outstanding Credit Receivables */}
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">Outstanding Credit</span>
            <div className="stat-icon" style={{ backgroundColor: '#fff7ed', color: '#ea580c' }}>
              <Scale size={18} />
            </div>
          </div>
          <div className="stat-card-value">
            ₹{credit.totalOutstandingCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="stat-card-sub">
            <strong>{credit.pendingReceivablesCount} active receivable(s)</strong> awaiting settlement
          </div>
        </div>
      </div>

      {/* Two Column Layout for Activity and System Status */}
      <div className="dashboard-columns">
        {/* Left Column: Recent Stock Movements Ledger */}
        <div className="card">
          <div className="card-header">
            <h3>Recent Stock Movements Ledger</h3>
            <span className="badge badge-neutral">Audit Log</span>
          </div>
          <div style={{ padding: 0 }}>
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Book / Item</th>
                    <th>Format</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Total Value</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {activity?.recentMovements?.length > 0 ? (
                    activity.recentMovements.map(m => {
                      const isPositive = m.quantity > 0;
                      return (
                        <tr key={m.id}>
                          <td>
                            <span className={`badge ${
                              m.movement_type === 'PURCHASE_RECEIPT' ? 'badge-success' :
                              m.movement_type === 'SALE' ? 'badge-primary' :
                              m.movement_type === 'WRITE_OFF' ? 'badge-danger' : 'badge-neutral'
                            }`}>
                              {m.movement_type}
                            </span>
                          </td>
                          <td style={{ fontWeight: 500 }}>{m.product_name}</td>
                          <td>
                            <span className="badge badge-neutral">{m.format}</span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: isPositive ? 'var(--success)' : 'var(--text-main)' }}>
                            {isPositive ? `+${m.quantity}` : m.quantity}
                          </td>
                          <td style={{ textAlign: 'right' }} className="font-mono">
                            ₹{parseFloat(m.total_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {m.reference_type} #{m.reference_id}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                        No stock movement records logged yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Workflow Overview & Integrity */}
        <div className="card">
          <div className="card-header">
            <h3>Operational Status</h3>
            <span className="badge badge-success">
              <ShieldCheck size={12} /> All Modules Active
            </span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border-light)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Purchases & GRN</span>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                {proc.verifiedGrnsCount} Verified / {proc.totalPurchaseOrders} POs
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border-light)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Completed Sales</span>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                {sales.completedSalesCount} Orders (₹{sales.totalRevenue.toLocaleString('en-IN')})
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border-light)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Active Receivables</span>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                {credit.pendingReceivablesCount} Open (₹{credit.totalOutstandingCredit.toLocaleString('en-IN')})
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border-light)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Damaged Write-Offs</span>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                {writeoffs.totalWriteoffsCount} Logged (₹{writeoffs.totalWriteoffsValuation.toLocaleString('en-IN')})
              </span>
            </div>

            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              marginTop: 4
            }}>
              <strong style={{ color: 'var(--text-main)' }}>Data Integrity Assurance:</strong> All transactions enforce atomic ledger reconciliation, double-entry audit trails, and automated stock protection.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
