import React, { useState, useEffect } from 'react';
import {
  fetchCustomers,
  fetchSales,
  fetchSaleById,
  createDraftSale,
  completeSale,
  recordSalePayment,
  fetchProductVariants,
  fetchInventory,
  fetchAllReceipts
} from '../api';

export default function SalesView() {
  const [subTab, setSubTab] = useState('sales'); // 'sales' | 'receipts'
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [variants, setVariants] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [allReceipts, setAllReceipts] = useState([]);

  // Banner notification
  const [banner, setBanner] = useState(null); // { type, title, message, data }

  // Modals state
  const [isNewSaleOpen, setIsNewSaleOpen] = useState(false);
  const [selectedSaleDetail, setSelectedSaleDetail] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [saleToComplete, setSaleToComplete] = useState(null);
  const [cashierName, setCashierName] = useState('Store Cashier');
  const [isCompleting, setIsCompleting] = useState(false);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [saleForPayment, setSaleForPayment] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    payment_method: 'CASH',
    amount: '',
    transaction_reference: '',
    bank_reference_number: ''
  });
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // New Sale Form State
  const [newSaleForm, setNewSaleForm] = useState({
    customer_id: '',
    sale_type: 'RETAIL',
    items: []
  });
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);

  // Initial Data Load
  const loadData = async () => {
    setLoading(true);
    try {
      const [salesData, custData, varData, invData, receiptsData] = await Promise.all([
        fetchSales(),
        fetchCustomers(),
        fetchProductVariants(),
        fetchInventory(),
        fetchAllReceipts()
      ]);

      setSales(salesData.sales || []);
      setCustomers(custData.customers || []);
      setVariants(varData.variants || []);
      setInventoryList(invData.items || []);
      setAllReceipts(receiptsData.receipts || []);
    } catch (err) {
      console.error('Failed to load sales data:', err);
      setBanner({
        type: 'error',
        title: 'Data Load Error',
        message: err.message || 'Could not load sales records from database.'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Formatters
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(val || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // =========================================================================
  // CREATE DRAFT SALE HANDLERS
  // =========================================================================
  const handleOpenNewSale = () => {
    if (variants.length === 0) return;
    const defaultVar = variants[0];
    setNewSaleForm({
      customer_id: '',
      sale_type: 'RETAIL',
      items: [
        {
          product_variant_id: defaultVar.variant_id,
          quantity: 1,
          unit_price: defaultVar.selling_price,
          deduction_amount: 0
        }
      ]
    });
    setIsNewSaleOpen(true);
  };

  const handleAddSaleItem = () => {
    const defaultVar = variants[0];
    setNewSaleForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_variant_id: defaultVar.variant_id,
          quantity: 1,
          unit_price: defaultVar.selling_price,
          deduction_amount: 0
        }
      ]
    }));
  };

  const handleRemoveSaleItem = (index) => {
    if (newSaleForm.items.length <= 1) return;
    setNewSaleForm(prev => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }));
  };

  const handleSaleItemChange = (index, field, value) => {
    setNewSaleForm(prev => {
      const nextItems = [...prev.items];
      const item = { ...nextItems[index] };

      if (field === 'product_variant_id') {
        item.product_variant_id = value;
        const matched = variants.find(v => String(v.variant_id) === String(value));
        if (matched) {
          item.unit_price = matched.selling_price;
        }
      } else if (field === 'quantity') {
        item.quantity = parseInt(value, 10) || 0;
      } else if (field === 'unit_price') {
        item.unit_price = parseFloat(value) || 0;
      } else if (field === 'deduction_amount') {
        item.deduction_amount = parseFloat(value) || 0;
      }

      nextItems[index] = item;
      return { ...prev, items: nextItems };
    });
  };

  const handleSubmitNewSale = async (e) => {
    e.preventDefault();
    setIsSubmittingSale(true);
    setBanner(null);

    // Enforce customer selection for CREDIT sales
    if (newSaleForm.sale_type === 'CREDIT' && !newSaleForm.customer_id) {
      setBanner({
        type: 'error',
        title: 'Customer Required for Credit',
        message: 'A registered customer is strictly required for CREDIT sales. Walk-in sales cannot be placed on credit.'
      });
      setIsSubmittingSale(false);
      return;
    }

    // Check available stock in frontend before submit
    for (let i = 0; i < newSaleForm.items.length; i++) {
      const it = newSaleForm.items[i];
      const matched = variants.find(v => String(v.variant_id) === String(it.product_variant_id));
      if (matched && it.quantity > matched.quantity_on_hand) {
        setBanner({
          type: 'error',
          title: 'Insufficient Inventory',
          message: `Item '${matched.product_name} (${matched.format})' has only ${matched.quantity_on_hand} units available in stock, but ${it.quantity} were requested.`
        });
        setIsSubmittingSale(false);
        return;
      }
    }

    try {
      const payload = {
        customer_id: newSaleForm.customer_id ? parseInt(newSaleForm.customer_id, 10) : null,
        sale_type: newSaleForm.sale_type,
        items: newSaleForm.items.map(it => ({
          product_variant_id: parseInt(it.product_variant_id, 10),
          quantity: parseInt(it.quantity, 10),
          unit_price: parseFloat(it.unit_price),
          deduction_amount: parseFloat(it.deduction_amount || 0)
        }))
      };

      const result = await createDraftSale(payload);
      setIsNewSaleOpen(false);
      setBanner({
        type: 'info',
        title: 'Draft Sale Created',
        message: `${result.saleNumber} created in DRAFT status (${formatCurrency(result.netPayable)}). Click "Complete Sale" to deduct live inventory.`
      });
      await loadData();
    } catch (err) {
      setBanner({
        type: 'error',
        title: 'Failed to Create Sale',
        message: err.message
      });
    } finally {
      setIsSubmittingSale(false);
    }
  };

  // =========================================================================
  // VIEW SALE DETAILS
  // =========================================================================
  const handleViewSale = async (saleId) => {
    try {
      setLoading(true);
      const data = await fetchSaleById(saleId);
      setSelectedSaleDetail(data.sale);
      setIsDetailOpen(true);
    } catch (err) {
      setBanner({
        type: 'error',
        title: 'Load Details Failed',
        message: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  // =========================================================================
  // COMPLETE SALE HANDLERS
  // =========================================================================
  const handleOpenCompleteModal = (sale) => {
    setSaleToComplete(sale);
    setCashierName('Store Cashier');
    setIsCompleteModalOpen(true);
  };

  const handleExecuteCompleteSale = async () => {
    if (!saleToComplete) return;
    setIsCompleting(true);
    setBanner(null);

    try {
      const result = await completeSale(saleToComplete.id, cashierName);
      setIsCompleteModalOpen(false);

      setBanner({
        type: 'success',
        title: 'Sale Completed & Inventory Deducted!',
        message: result.message || 'Inventory decreased and stock movement recorded.',
        data: result.data
      });

      await loadData();
      if (isDetailOpen && selectedSaleDetail?.id === saleToComplete.id) {
        await handleViewSale(saleToComplete.id);
      }
    } catch (err) {
      setIsCompleteModalOpen(false);
      setBanner({
        type: 'error',
        title: 'Completion Rejected',
        message: err.message || 'Sale completion failed.'
      });
    } finally {
      setIsCompleting(false);
    }
  };

  // =========================================================================
  // RECORD PAYMENT HANDLERS
  // =========================================================================
  const handleOpenPaymentModal = (sale) => {
    setSaleForPayment(sale);
    setPaymentForm({
      payment_method: 'CASH',
      amount: String(sale.unpaid_balance || sale.net_payable),
      transaction_reference: '',
      bank_reference_number: ''
    });
    setIsPaymentModalOpen(true);
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!saleForPayment) return;
    setIsSubmittingPayment(true);
    setBanner(null);

    try {
      const payload = {
        payment_method: paymentForm.payment_method,
        amount: parseFloat(paymentForm.amount),
        transaction_reference: paymentForm.payment_method === 'DIGITAL' ? paymentForm.transaction_reference.trim() : null,
        bank_reference_number: paymentForm.bank_reference_number ? paymentForm.bank_reference_number.trim() : null
      };

      const result = await recordSalePayment(saleForPayment.id, payload);
      setIsPaymentModalOpen(false);

      setBanner({
        type: 'success',
        title: 'Payment Recorded & Receipt Issued!',
        message: `Receipt #${result.data.receiptNumber} generated for ${formatCurrency(result.data.paymentAmount)} via ${result.data.paymentMethod}. Remaining Balance: ${formatCurrency(result.data.remainingBalance)}.`,
        data: result.data
      });

      await loadData();
      if (isDetailOpen && selectedSaleDetail?.id === saleForPayment.id) {
        await handleViewSale(saleForPayment.id);
      }
    } catch (err) {
      setBanner({
        type: 'error',
        title: 'Payment Rejected',
        message: err.message || 'Payment processing failed.'
      });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Calculations for New Sale Form
  const newSaleGross = newSaleForm.items.reduce((sum, it) => sum + (it.quantity * it.unit_price), 0);
  const newSaleDiscount = newSaleForm.items.reduce((sum, it) => sum + (parseFloat(it.deduction_amount) || 0), 0);
  const newSaleNet = Math.max(0, newSaleGross - newSaleDiscount);

  return (
    <div className="sales-view">
      {/* Banner Notifications */}
      {banner && (
        <div className={`banner banner-${banner.type}`}>
          <div className="banner-icon">
            {banner.type === 'success' && '✓'}
            {banner.type === 'error' && '✕'}
            {banner.type === 'info' && 'ℹ'}
          </div>
          <div className="banner-content">
            <strong>{banner.title}</strong>
            <p>{banner.message}</p>
            {banner.data && (
              <div style={{ marginTop: '8px', fontSize: '0.8rem', opacity: 0.9 }}>
                {banner.data.receiptNumber && <span>Receipt: <strong>{banner.data.receiptNumber}</strong> &nbsp;•&nbsp; </span>}
                {banner.data.remainingBalance !== undefined && <span>Remaining Unpaid: <strong>{formatCurrency(banner.data.remainingBalance)}</strong> &nbsp;•&nbsp; </span>}
                {banner.data.totalUnitsDeducted && <span>Units Deducted: <strong>-{banner.data.totalUnitsDeducted}</strong></span>}
              </div>
            )}
          </div>
          <button 
            onClick={() => setBanner(null)} 
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'inherit' }}
          >
            ×
          </button>
        </div>
      )}

      {/* Top Header & Actions */}
      <div className="workflow-nav-bar">
        <div className="nav-pill-group">
          <button 
            className={`nav-pill-btn ${subTab === 'sales' ? 'active' : ''}`}
            onClick={() => setSubTab('sales')}
          >
            🛒 Sales Orders ({sales.length})
          </button>
          <button 
            className={`nav-pill-btn ${subTab === 'receipts' ? 'active' : ''}`}
            onClick={() => setSubTab('receipts')}
          >
            🧾 Issued Receipts ({allReceipts.length})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-outline" onClick={loadData} disabled={loading}>
            {loading ? 'Refreshing...' : '🔄 Refresh Data'}
          </button>
          <button className="btn btn-primary" onClick={handleOpenNewSale}>
            + New Sale Order
          </button>
        </div>
      </div>

      {/* TAB 1: SALES LISTING */}
      {subTab === 'sales' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 className="card-title">Sales Order Registry</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Lifecycle: Draft Sale → Complete (Instant Inventory Deduction) → Record Payment & Issue Official Receipt.
              </p>
            </div>
            <span className="badge badge-neutral font-mono">{sales.length} Records</span>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-container" style={{ border: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sale Number</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Net Payable</th>
                    <th>Paid</th>
                    <th>Unpaid Balance</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                        No sales found. Click "+ New Sale Order" to create one.
                      </td>
                    </tr>
                  ) : (
                    sales.map(s => {
                      const isDraft = s.status === 'DRAFT';
                      const isCompleted = s.status === 'COMPLETED';
                      const isPaid = s.payment_status === 'PAID';
                      const hasUnpaid = s.unpaid_balance > 0;

                      return (
                        <tr key={s.id} style={{ backgroundColor: isDraft ? '#fffbeb' : 'transparent' }}>
                          <td className="font-mono" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                            {s.sale_number}
                          </td>
                          <td>
                            <div><strong>{s.customer_name || 'Walk-in Customer'}</strong></div>
                            {s.customer_phone && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.customer_phone}</div>}
                          </td>
                          <td>{formatDate(s.sale_date)}</td>
                          <td style={{ fontWeight: 600 }}>{formatCurrency(s.net_payable)}</td>
                          <td style={{ color: 'var(--success)', fontWeight: 600 }}>{formatCurrency(s.total_paid)}</td>
                          <td style={{ color: hasUnpaid ? 'var(--danger)' : 'var(--text-muted)', fontWeight: hasUnpaid ? 700 : 400 }}>
                            {formatCurrency(s.unpaid_balance)}
                          </td>
                          <td>
                            <span className={`badge ${isCompleted ? 'badge-success' : 'badge-warning'}`}>
                              {s.status}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${
                              s.payment_status === 'PAID' ? 'badge-success' :
                              s.payment_status === 'PARTIALLY_PAID' ? 'badge-warning' : 'badge-danger'
                            }`}>
                              {s.payment_status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button 
                                className="btn btn-outline"
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                onClick={() => handleViewSale(s.id)}
                                title="View sale items and receipt records"
                              >
                                👁 Details
                              </button>

                              {isDraft && (
                                <button 
                                  className="btn btn-primary"
                                  style={{ padding: '4px 10px', fontSize: '0.75rem', backgroundColor: '#d97706', borderColor: '#d97706' }}
                                  onClick={() => handleOpenCompleteModal(s)}
                                  title="Complete sale and deduct inventory"
                                >
                                  ⚡ Complete Sale
                                </button>
                              )}

                              {isCompleted && hasUnpaid && (
                                <button 
                                  className="btn btn-primary"
                                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                  onClick={() => handleOpenPaymentModal(s)}
                                  title="Record Cash or Digital Payment"
                                >
                                  💳 Pay ({formatCurrency(s.unpaid_balance)})
                                </button>
                              )}

                              {isCompleted && isPaid && (
                                <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                                  ✓ Settled
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RECEIPTS REGISTRY */}
      {subTab === 'receipts' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 className="card-title">Sales Receipts Ledger</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Official sequential receipt records issued per payment transaction with audit references.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span className="badge badge-success" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                Total Collected: <strong>₹{allReceipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
              </span>
              <span className="badge badge-neutral" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                Receipts: <strong>{allReceipts.length}</strong>
              </span>
            </div>
          </div>

          <div style={{ padding: 0 }}>
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Receipt #</th>
                    <th>Sale Order</th>
                    <th>Customer</th>
                    <th>Payment Method</th>
                    <th>Reference</th>
                    <th style={{ textAlign: 'right' }}>Amount Paid</th>
                    <th>Issued At</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {allReceipts.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                        No official payment receipts have been issued yet.
                      </td>
                    </tr>
                  ) : (
                    allReceipts.map(rcpt => (
                      <tr key={rcpt.id}>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary)' }}>
                            {rcpt.receipt_number}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            {rcpt.sale_number}
                          </span>
                          <span className={`badge ${rcpt.sale_type === 'CREDIT' ? 'badge-warning' : 'badge-neutral'}`} style={{ marginLeft: '6px', fontSize: '0.675rem' }}>
                            {rcpt.sale_type}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: 'var(--text-main)' }}>
                            {rcpt.customer_name || 'Walk-in Retail Customer'}
                          </strong>
                          {rcpt.customer_phone && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rcpt.customer_phone}</div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${rcpt.payment_method === 'CASH' ? 'badge-success' : 'badge-primary'}`}>
                            {rcpt.payment_method}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {rcpt.transaction_reference ? (
                            <span>Ref: <strong style={{ color: 'var(--text-main)' }}>{rcpt.transaction_reference}</strong></span>
                          ) : (
                            'Cash Direct'
                          )}
                          {rcpt.bank_reference_number && (
                            <div style={{ fontSize: '0.725rem' }}>Bank: {rcpt.bank_reference_number}</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }} className="font-mono">
                          ₹{parseFloat(rcpt.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {formatDate(rcpt.issued_at)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="btn btn-outline"
                            onClick={() => handleViewSale(rcpt.sale_id)}
                            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                            title="Inspect underlying sale details"
                          >
                            Inspect Sale
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: CREATE NEW DRAFT SALE
          ===================================================================== */}
      {isNewSaleOpen && (
        <div className="modal-overlay">
          <div className="modal-card modal-card-lg">
            <div className="modal-header">
              <h3 className="modal-title">🛒 New Retail Sale Order</h3>
              <button className="modal-close-btn" onClick={() => setIsNewSaleOpen(false)}>×</button>
            </div>

            <form onSubmit={handleSubmitNewSale}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">
                      Customer {newSaleForm.sale_type === 'CREDIT' ? <span style={{ color: 'var(--danger)' }}>* (Required for Credit)</span> : '(Optional)'}
                    </label>
                    <select 
                      className="form-select"
                      value={newSaleForm.customer_id}
                      onChange={e => setNewSaleForm({ ...newSaleForm, customer_id: e.target.value })}
                      required={newSaleForm.sale_type === 'CREDIT'}
                    >
                      <option value="">{newSaleForm.sale_type === 'CREDIT' ? '-- Select Registered Customer for Credit --' : 'Walk-in Retail Customer (No registered account)'}</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ''}
                        </option>
                      ))}
                    </select>
                    {newSaleForm.sale_type === 'CREDIT' && !newSaleForm.customer_id && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '3px' }}>
                        * A registered customer is required to establish credit accounts & receivables.
                      </p>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Sale Type</label>
                    <select 
                      className="form-select"
                      value={newSaleForm.sale_type}
                      onChange={e => setNewSaleForm({ ...newSaleForm, sale_type: e.target.value })}
                    >
                      <option value="RETAIL">RETAIL Counter Sale</option>
                      <option value="INSTITUTIONAL">INSTITUTIONAL Order</option>
                      <option value="CREDIT">CREDIT (Customer Account)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    Sale Items ({newSaleForm.items.length})
                  </h4>
                  <button type="button" className="btn btn-outline" onClick={handleAddSaleItem} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                    + Add Product
                  </button>
                </div>

                <table className="item-edit-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40%' }}>Product Variant & Stock</th>
                      <th style={{ width: '15%' }}>Quantity</th>
                      <th style={{ width: '15%' }}>Unit Price (₹)</th>
                      <th style={{ width: '15%' }}>Discount (₹)</th>
                      <th style={{ width: '15%' }}>Net Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {newSaleForm.items.map((item, idx) => {
                      const matched = variants.find(v => String(v.variant_id) === String(item.product_variant_id));
                      const itemGross = (parseInt(item.quantity, 10) || 0) * (parseFloat(item.unit_price) || 0);
                      const itemDisc = parseFloat(item.deduction_amount) || 0;
                      const itemNet = Math.max(0, itemGross - itemDisc);
                      const isOverStock = matched && item.quantity > matched.quantity_on_hand;

                      return (
                        <tr key={idx} style={{ backgroundColor: isOverStock ? '#fef2f2' : 'transparent' }}>
                          <td>
                            <select 
                              value={item.product_variant_id}
                              onChange={e => handleSaleItemChange(idx, 'product_variant_id', e.target.value)}
                            >
                              {variants.map(v => (
                                <option key={v.variant_id} value={v.variant_id}>
                                  {v.product_name} ({v.format}) — QOH: {v.quantity_on_hand}
                                </option>
                              ))}
                            </select>
                            {isOverStock && (
                              <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '4px' }}>
                                ⚠️ Exceeds available stock ({matched.quantity_on_hand} available)
                              </div>
                            )}
                          </td>
                          <td>
                            <input 
                              type="number" 
                              min="1" 
                              value={item.quantity}
                              onChange={e => handleSaleItemChange(idx, 'quantity', e.target.value)}
                              required
                            />
                          </td>
                          <td>
                            <input 
                              type="number" 
                              step="0.01" 
                              min="0" 
                              value={item.unit_price}
                              onChange={e => handleSaleItemChange(idx, 'unit_price', e.target.value)}
                              required
                            />
                          </td>
                          <td>
                            <input 
                              type="number" 
                              step="0.01" 
                              min="0" 
                              value={item.deduction_amount}
                              onChange={e => handleSaleItemChange(idx, 'deduction_amount', e.target.value)}
                            />
                          </td>
                          <td style={{ fontWeight: 600 }}>{formatCurrency(itemNet)}</td>
                          <td>
                            <button 
                              type="button" 
                              className="btn-icon"
                              disabled={newSaleForm.items.length <= 1}
                              onClick={() => handleRemoveSaleItem(idx)}
                              title="Remove item"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="summary-callout">
                  <div>
                    <span className="stat-label">Gross Total: </span>
                    <strong>{formatCurrency(newSaleGross)}</strong>
                    {newSaleDiscount > 0 && (
                      <span style={{ color: 'var(--success)', marginLeft: '12px' }}>
                        (Discount: -{formatCurrency(newSaleDiscount)})
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="stat-label">Net Payable: </span>
                    <span className="stat-val">{formatCurrency(newSaleNet)}</span>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setIsNewSaleOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmittingSale}>
                  {isSubmittingSale ? 'Creating Sale Order...' : 'Create Draft Sale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: SALE DETAILS & RECEIPT INSPECTOR
          ===================================================================== */}
      {isDetailOpen && selectedSaleDetail && (
        <div className="modal-overlay">
          <div className="modal-card modal-card-lg">
            <div className="modal-header">
              <h3 className="modal-title">
                📋 Sale Details: <span className="font-mono">{selectedSaleDetail.sale_number}</span>
              </h3>
              <button className="modal-close-btn" onClick={() => setIsDetailOpen(false)}>×</button>
            </div>

            <div className="modal-body">
              {/* Header Info Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '18px' }}>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CUSTOMER</div>
                  <strong>{selectedSaleDetail.customer_name || 'Walk-in Retail'}</strong>
                </div>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>STATUS</div>
                  <span className={`badge ${selectedSaleDetail.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}`}>
                    {selectedSaleDetail.status}
                  </span>
                </div>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>NET PAYABLE</div>
                  <strong>{formatCurrency(selectedSaleDetail.net_payable)}</strong>
                </div>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>UNPAID BALANCE</div>
                  <strong style={{ color: selectedSaleDetail.unpaid_balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {formatCurrency(selectedSaleDetail.unpaid_balance)}
                  </strong>
                </div>
              </div>

              {/* Items Table */}
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Purchased Items</h4>
              <table className="data-table" style={{ marginBottom: '20px' }}>
                <thead>
                  <tr>
                    <th>Product Title</th>
                    <th>Format</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Discount</th>
                    <th>Net Amount</th>
                    <th>Available Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSaleDetail.items?.map(it => (
                    <tr key={it.id}>
                      <td><strong>{it.product_name}</strong></td>
                      <td><span className="badge badge-neutral">{it.format}</span></td>
                      <td>{it.quantity}</td>
                      <td>{formatCurrency(it.unit_price)}</td>
                      <td>{it.deduction_amount > 0 ? `-${formatCurrency(it.deduction_amount)}` : '—'}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(it.net_amount)}</td>
                      <td>{it.current_stock} units</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Payments & Receipts Table */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                  Recorded Payments & Receipts ({selectedSaleDetail.payments?.length || 0})
                </h4>
                {selectedSaleDetail.status === 'COMPLETED' && selectedSaleDetail.unpaid_balance > 0 && (
                  <button 
                    className="btn btn-primary"
                    style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                    onClick={() => handleOpenPaymentModal(selectedSaleDetail)}
                  >
                    + Record Payment
                  </button>
                )}
              </div>

              {selectedSaleDetail.payments?.length === 0 ? (
                <div style={{ padding: '16px', background: '#f8fafc', textAlign: 'center', borderRadius: '6px', color: 'var(--text-muted)' }}>
                  No payments recorded yet.
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Receipt #</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Transaction Reference</th>
                      <th>Payment Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSaleDetail.payments?.map(p => (
                      <tr key={p.id}>
                        <td className="font-mono" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                          {p.receipt_number || '—'}
                        </td>
                        <td><span className="badge badge-neutral">{p.payment_method}</span></td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(p.amount)}</td>
                        <td className="font-mono">{p.transaction_reference || 'N/A (Cash)'}</td>
                        <td>{formatDate(p.payment_date)}</td>
                        <td><span className="badge badge-success">✓ {p.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal-footer">
              {selectedSaleDetail.status === 'DRAFT' && (
                <button 
                  type="button" 
                  className="btn btn-primary"
                  style={{ backgroundColor: '#d97706', borderColor: '#d97706' }}
                  onClick={() => handleOpenCompleteModal(selectedSaleDetail)}
                >
                  ⚡ Complete Sale & Deduct Stock
                </button>
              )}
              {selectedSaleDetail.status === 'COMPLETED' && selectedSaleDetail.unpaid_balance > 0 && (
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={() => handleOpenPaymentModal(selectedSaleDetail)}
                >
                  💳 Record Payment ({formatCurrency(selectedSaleDetail.unpaid_balance)})
                </button>
              )}
              <button type="button" className="btn btn-outline" onClick={() => setIsDetailOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: CONFIRM SALE COMPLETION
          ===================================================================== */}
      {isCompleteModalOpen && saleToComplete && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header" style={{ backgroundColor: '#fffbeb', borderBottomColor: '#fde68a' }}>
              <h3 className="modal-title" style={{ color: '#92400e' }}>
                Confirm Sale Completion & Stock Deduction
              </h3>
              <button className="modal-close-btn" onClick={() => setIsCompleteModalOpen(false)}>×</button>
            </div>

            <div className="modal-body">
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '14px', marginBottom: '18px', fontSize: '0.875rem', color: '#92400e' }}>
                <strong>Sale Completion Summary:</strong>
                <p style={{ marginTop: '4px' }}>
                  Completing this sale will finalize the transaction and deduct inventory:
                </p>
                <ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
                  <li>Live stock will be permanently deducted from inventory.</li>
                  <li>Outward stock movement audit records will be logged.</li>
                  <li>Overselling protection: operation will stop if available stock is insufficient.</li>
                  <li>Sale status will transition from Draft to Completed.</li>
                </ul>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '6px', fontSize: '0.875rem' }}>
                <div><strong>Sale Number:</strong> <span className="font-mono">{saleToComplete.sale_number}</span></div>
                <div><strong>Net Amount:</strong> <strong style={{ color: 'var(--primary)' }}>{formatCurrency(saleToComplete.net_payable)}</strong></div>
                <div><strong>Customer:</strong> {saleToComplete.customer_name || 'Walk-in Retail'}</div>
                <div><strong>Items Count:</strong> {saleToComplete.items_count} line items</div>
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label">Cashier Staff Signature / Name *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={cashierName} 
                  onChange={e => setCashierName(e.target.value)}
                  placeholder="e.g. Store Cashier"
                  required
                />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setIsCompleteModalOpen(false)} disabled={isCompleting}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ backgroundColor: '#d97706', borderColor: '#d97706' }}
                onClick={handleExecuteCompleteSale}
                disabled={isCompleting}
              >
                {isCompleting ? 'Completing Sale & Deducting Stock...' : 'Confirm & Complete Sale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: RECORD PAYMENT (CASH / DIGITAL / SPLIT)
          ===================================================================== */}
      {isPaymentModalOpen && saleForPayment && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">
                💳 Record Payment for {saleForPayment.sale_number}
              </h3>
              <button className="modal-close-btn" onClick={() => setIsPaymentModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleSubmitPayment}>
              <div className="modal-body">
                {/* Balance Callout */}
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '14px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#166534' }}>REMAINING UNPAID BALANCE</div>
                    <strong style={{ fontSize: '1.25rem', color: '#14532d' }}>
                      {formatCurrency(saleForPayment.unpaid_balance)}
                    </strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: '#166534' }}>NET PAYABLE</div>
                    <strong>{formatCurrency(saleForPayment.net_payable)}</strong>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group col-span-2">
                    <label className="form-label">Payment Method *</label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '10px 16px', border: '1px solid var(--border-light)', borderRadius: '6px', flex: 1, background: paymentForm.payment_method === 'CASH' ? '#eff6ff' : '#fff' }}>
                        <input 
                          type="radio" 
                          name="payment_method" 
                          value="CASH"
                          checked={paymentForm.payment_method === 'CASH'}
                          onChange={() => setPaymentForm({ ...paymentForm, payment_method: 'CASH' })}
                        />
                        <span>💵 CASH Payment</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '10px 16px', border: '1px solid var(--border-light)', borderRadius: '6px', flex: 1, background: paymentForm.payment_method === 'DIGITAL' ? '#eff6ff' : '#fff' }}>
                        <input 
                          type="radio" 
                          name="payment_method" 
                          value="DIGITAL"
                          checked={paymentForm.payment_method === 'DIGITAL'}
                          onChange={() => setPaymentForm({ ...paymentForm, payment_method: 'DIGITAL' })}
                        />
                        <span>📱 DIGITAL (UPI / Card / NetBanking)</span>
                      </label>
                    </div>
                  </div>

                  <div className="form-group col-span-2">
                    <label className="form-label">Payment Amount (₹) *</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0.01" 
                      max={saleForPayment.unpaid_balance}
                      className="form-input"
                      value={paymentForm.amount}
                      onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                      required
                    />
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      💡 For <strong>Split Payments</strong>, enter a partial amount now. You can make subsequent payments with another method until the balance reaches ₹0.
                    </div>
                  </div>

                  {paymentForm.payment_method === 'DIGITAL' && (
                    <>
                      <div className="form-group col-span-2">
                        <label className="form-label">Digital Transaction Reference (Required) *</label>
                        <input 
                          type="text" 
                          className="form-input font-mono"
                          value={paymentForm.transaction_reference}
                          onChange={e => setPaymentForm({ ...paymentForm, transaction_reference: e.target.value })}
                          placeholder="e.g. UPI-GPAY-982183 or PAYTM-TXN-44211"
                          required
                        />
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Must be unique. System will reject duplicate digital transaction references.
                        </div>
                      </div>

                      <div className="form-group col-span-2">
                        <label className="form-label">Bank Reference / Gateway ID (Optional)</label>
                        <input 
                          type="text" 
                          className="form-input font-mono"
                          value={paymentForm.bank_reference_number}
                          onChange={e => setPaymentForm({ ...paymentForm, bank_reference_number: e.target.value })}
                          placeholder="e.g. BRN-HDFC-99218"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setIsPaymentModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmittingPayment}>
                  {isSubmittingPayment ? 'Processing Payment...' : `Pay ${formatCurrency(parseFloat(paymentForm.amount) || 0)} & Issue Receipt`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
