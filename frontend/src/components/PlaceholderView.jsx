import React from 'react';
import { Truck, Receipt, Scale, Clock } from 'lucide-react';

export default function PlaceholderView({ section }) {
  const configs = {
    purchases: {
      icon: Truck,
      title: 'Purchases & Goods Receipt (GRN)',
      workflow: 'Procurement Workflow: Purchase Order → Shipment Dispatch → Goods Receipt Verification → Inventory Inward',
      description: 'Streamlined procurement and receiving management. Manage vendor purchase orders, track incoming shipments, and verify warehouse stock arrivals.'
    },
    sales: {
      icon: Receipt,
      title: 'Sales & Payment Processing',
      workflow: 'Sales Workflow: Retail Point-of-Sale → Instant Stock Deduction → Multi-Method Payment → Official Receipts',
      description: 'Point-of-sale transaction management supporting retail cash, digital UPI/gateway payments, split payments, and customer receipts.'
    },
    credit: {
      icon: Scale,
      title: 'Credit Receivables & Stock Write-Offs',
      workflow: 'Ledger Workflow: Credit Customer Terms → Accounts Receivable → Installment Settlements & Damaged Stock Deductions',
      description: 'Debtor receivables management, customer balance settlements, receipt re-issuance, and inventory write-off logging.'
    }
  };

  const current = configs[section] || configs.purchases;
  const Icon = current.icon;

  return (
    <div className="placeholder-container">
      <div className="placeholder-icon">
        <Icon size={32} />
      </div>

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12 }} className="badge badge-primary">
        <Clock size={13} />
        <span>Module Information</span>
      </div>

      <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: 8 }}>
        {current.title}
      </h2>

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 16 }}>
        {current.workflow}
      </p>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: 24 }}>
        {current.description}
      </p>
    </div>
  );
}
