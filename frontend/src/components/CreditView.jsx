import React, { useState, useEffect } from 'react';
import {
  fetchReceivables,
  fetchEligibleCreditSales,
  createCreditReceivable,
  settleCreditReceivable,
  fetchReceivableReceipts,
  fetchWriteOffs,
  fetchWriteOffVariants,
  createWriteOff,
  processWriteOff,
  fetchWriteOffMovements
} from '../api';
import {
  Scale,
  AlertTriangle,
  Receipt,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  CreditCard,
  DollarSign,
  AlertCircle,
  FileText,
  User,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';

export default function CreditView() {
  const [activeSubTab, setActiveSubTab] = useState('credit'); // 'credit' | 'writeoffs'
  const [loading, setLoading] = useState(true);

  // Banner feedback
  const [banner, setBanner] = useState(null); // { type: 'success' | 'error' | 'info', title, message }

  // Credit Receivables State
  const [receivables, setReceivables] = useState([]);
  const [eligibleSales, setEligibleSales] = useState([]);
  const [isNewReceivableOpen, setIsNewReceivableOpen] = useState(false);
  const [newReceivableForm, setNewReceivableForm] = useState({
    sale_id: '',
    due_date: ''
  });
  const [isSubmittingReceivable, setIsSubmittingReceivable] = useState(false);

  // Settlement Modal State
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState(null);
  const [settleForm, setSettleForm] = useState({
    payment_method: 'CASH',
    amount: '',
    transaction_reference: '',
    bank_reference_number: ''
  });
  const [isSubmittingSettle, setIsSubmittingSettle] = useState(false);

  // Receipt Details Modal State
  const [isReceiptsModalOpen, setIsReceiptsModalOpen] = useState(false);
  const [receivableReceipts, setReceivableReceipts] = useState([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  // Damaged Stock Write-offs State
  const [writeOffs, setWriteOffs] = useState([]);
  const [variants, setVariants] = useState([]);
  const [isNewWriteOffOpen, setIsNewWriteOffOpen] = useState(false);
  const [newWriteOffForm, setNewWriteOffForm] = useState({
    product_variant_id: '',
    quantity: '',
    unit_cost: '',
    reason: 'Shelf transit handling damage',
    write_off_date: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [isSubmittingWriteOff, setIsSubmittingWriteOff] = useState(false);

  // Process Write-off Confirmation Modal State
  const [isConfirmProcessOpen, setIsConfirmProcessOpen] = useState(false);
  const [writeOffToProcess, setWriteOffToProcess] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Stock Movement Ledger Modal State
  const [isMovementsModalOpen, setIsMovementsModalOpen] = useState(false);
  const [movementsList, setMovementsList] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  // Initial Data Load
  const loadData = async () => {
    setLoading(true);
    try {
      const [recvRes, eligRes, woRes, varRes] = await Promise.all([
        fetchReceivables(),
        fetchEligibleCreditSales(),
        fetchWriteOffs(),
        fetchWriteOffVariants()
      ]);

      setReceivables(recvRes.receivables || []);
      setEligibleSales(eligRes.eligibleSales || []);
      setWriteOffs(woRes.writeOffs || []);
      setVariants(varRes.variants || []);
    } catch (err) {
      console.error('Failed to load credit / write-off data:', err);
      setBanner({
        type: 'error',
        title: 'Data Load Error',
        message: err.message || 'Could not load credit and write-off data.'
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
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // --------------------------------------------------------------------------
  // Credit Receivable Actions
  // --------------------------------------------------------------------------

  const handleCreateReceivable = async (e) => {
    e.preventDefault();
    if (!newReceivableForm.sale_id) {
      setBanner({ type: 'error', title: 'Input Error', message: 'Please select an eligible credit sale.' });
      return;
    }

    setIsSubmittingReceivable(true);
    try {
      const res = await createCreditReceivable({
        sale_id: parseInt(newReceivableForm.sale_id, 10),
        due_date: newReceivableForm.due_date || null
      });

      setBanner({
        type: 'success',
        title: 'Credit Receivable Created',
        message: `Receivable #${res.data.receivableId} created for Sale ${res.data.saleNumber}. Outstanding: ${formatCurrency(res.data.outstandingAmount)}`
      });

      setIsNewReceivableOpen(false);
      setNewReceivableForm({ sale_id: '', due_date: '' });
      await loadData();
    } catch (err) {
      console.error('Failed to create receivable:', err);
      setBanner({
        type: 'error',
        title: 'Receivable Creation Failed',
        message: err.message || 'Database rejected credit receivable creation.'
      });
    } finally {
      setIsSubmittingReceivable(false);
    }
  };

  const openSettleModal = (recv) => {
    setSelectedReceivable(recv);
    setSettleForm({
      payment_method: 'CASH',
      amount: recv.outstanding_amount > 0 ? recv.outstanding_amount : '',
      transaction_reference: '',
      bank_reference_number: ''
    });
    setIsSettleModalOpen(true);
  };

  const handleSettleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedReceivable) return;

    const amt = parseFloat(settleForm.amount);
    if (isNaN(amt) || amt <= 0) {
      setBanner({ type: 'error', title: 'Validation Error', message: 'Settlement amount must be greater than zero.' });
      return;
    }

    if (amt > parseFloat(selectedReceivable.outstanding_amount)) {
      setBanner({
        type: 'error',
        title: 'Overpayment Protection',
        message: `Cannot pay ${formatCurrency(amt)}. Outstanding balance is only ${formatCurrency(selectedReceivable.outstanding_amount)}.`
      });
      return;
    }

    if (settleForm.payment_method === 'DIGITAL' && !(settleForm.transaction_reference || '').trim()) {
      setBanner({ type: 'error', title: 'Validation Error', message: 'Digital transaction reference is strictly required.' });
      return;
    }

    setIsSubmittingSettle(true);
    try {
      const res = await settleCreditReceivable(selectedReceivable.id, {
        payment_method: settleForm.payment_method,
        amount: amt,
        transaction_reference: (settleForm.transaction_reference || '').trim() || null,
        bank_reference_number: (settleForm.bank_reference_number || '').trim() || null
      });

      setBanner({
        type: 'success',
        title: 'Settlement Recorded Successfully',
        message: `Payment #${res.data.paymentId} issued receipt ${res.data.receiptNumber}. Remaining balance: ${formatCurrency(res.data.newOutstandingAmount)} (${res.data.receivableStatus}).`
      });

      setIsSettleModalOpen(false);
      setSelectedReceivable(null);
      await loadData();
    } catch (err) {
      console.error('Settlement error:', err);
      setBanner({
        type: 'error',
        title: 'Settlement Failed',
        message: err.message || 'Database rejected the receivable settlement.'
      });
    } finally {
      setIsSubmittingSettle(false);
    }
  };

  const openReceiptsModal = async (recv) => {
    setSelectedReceivable(recv);
    setIsReceiptsModalOpen(true);
    setLoadingReceipts(true);
    try {
      const res = await fetchReceivableReceipts(recv.id);
      setReceivableReceipts(res.receipts || []);
    } catch (err) {
      console.error('Failed to load receipts:', err);
      setReceivableReceipts([]);
    } finally {
      setLoadingReceipts(false);
    }
  };

  // --------------------------------------------------------------------------
  // Write-off Actions
  // --------------------------------------------------------------------------

  const handleVariantSelectChange = (variantId) => {
    const vId = parseInt(variantId, 10);
    const selVariant = variants.find(v => v.product_variant_id === vId);
    if (selVariant) {
      setNewWriteOffForm(prev => ({
        ...prev,
        product_variant_id: vId,
        unit_cost: selVariant.unit_cost
      }));
    } else {
      setNewWriteOffForm(prev => ({
        ...prev,
        product_variant_id: '',
        unit_cost: ''
      }));
    }
  };

  const handleCreateWriteOff = async (e) => {
    e.preventDefault();
    const vId = parseInt(newWriteOffForm.product_variant_id, 10);
    const qty = parseInt(newWriteOffForm.quantity, 10);
    const cost = parseFloat(newWriteOffForm.unit_cost);

    if (!vId) {
      setBanner({ type: 'error', title: 'Input Error', message: 'Please select a product variant.' });
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      setBanner({ type: 'error', title: 'Input Error', message: 'Damaged quantity must be greater than zero.' });
      return;
    }
    if (isNaN(cost) || cost < 0) {
      setBanner({ type: 'error', title: 'Input Error', message: 'Unit cost cannot be negative.' });
      return;
    }
    if (!newWriteOffForm.reason.trim()) {
      setBanner({ type: 'error', title: 'Input Error', message: 'Write-off reason is required.' });
      return;
    }

    const selVariant = variants.find(v => v.product_variant_id === vId);
    if (selVariant && qty > selVariant.live_qoh) {
      setBanner({
        type: 'error',
        title: 'Insufficient Stock',
        message: `Cannot write off ${qty} units. Live inventory is only ${selVariant.live_qoh} units.`
      });
      return;
    }

    setIsSubmittingWriteOff(true);
    try {
      const res = await createWriteOff({
        product_variant_id: vId,
        quantity: qty,
        unit_cost: cost,
        reason: newWriteOffForm.reason.trim(),
        write_off_date: newWriteOffForm.write_off_date,
        notes: newWriteOffForm.notes.trim() || null
      });

      setBanner({
        type: 'success',
        title: 'Write-Off Record Created',
        message: `Write-off #${res.data.id} recorded for ${res.data.quantity} units of ${res.data.productName} (${res.data.format}). Ready for confirmation.`
      });

      setIsNewWriteOffOpen(false);
      setNewWriteOffForm({
        product_variant_id: '',
        quantity: '',
        unit_cost: '',
        reason: 'Shelf transit handling damage',
        write_off_date: new Date().toISOString().split('T')[0],
        notes: ''
      });
      await loadData();
    } catch (err) {
      console.error('Failed to create write-off:', err);
      setBanner({
        type: 'error',
        title: 'Write-Off Creation Failed',
        message: err.message || 'Database rejected write-off creation.'
      });
    } finally {
      setIsSubmittingWriteOff(false);
    }
  };

  const openConfirmProcessModal = (wo) => {
    setWriteOffToProcess(wo);
    setIsConfirmProcessOpen(true);
  };

  const handleProcessWriteOff = async () => {
    if (!writeOffToProcess) return;

    setIsProcessing(true);
    try {
      const res = await processWriteOff(writeOffToProcess.id);

      setBanner({
        type: 'success',
        title: 'Write-Off Processed & Posted',
        message: `Stock updated: ${res.data.previousQoh} → ${res.data.newQoh} units. Movement #${res.data.stockMovementId} (${res.data.quantityMovement} units) posted to inventory ledger.`
      });

      setIsConfirmProcessOpen(false);
      setWriteOffToProcess(null);
      await loadData();
    } catch (err) {
      console.error('Failed to process write-off:', err);
      setBanner({
        type: 'error',
        title: 'Processing Failed',
        message: err.message || 'Database rejected write-off processing.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const openMovementsModal = async (wo) => {
    setWriteOffToProcess(wo);
    setIsMovementsModalOpen(true);
    setLoadingMovements(true);
    try {
      const res = await fetchWriteOffMovements(wo.id);
      setMovementsList(res.movements || []);
    } catch (err) {
      console.error('Failed to load movements:', err);
      setMovementsList([]);
    } finally {
      setLoadingMovements(false);
    }
  };

  // --------------------------------------------------------------------------
  // Metrics Calculations
  // --------------------------------------------------------------------------

  // Credit metrics
  const totalCreditExtended = receivables.reduce((sum, r) => sum + parseFloat(r.original_amount || 0), 0);
  const totalOutstanding = receivables.reduce((sum, r) => sum + parseFloat(r.outstanding_amount || 0), 0);
  const totalSettled = totalCreditExtended - totalOutstanding;
  const openReceivablesCount = receivables.filter(r => r.status === 'OPEN').length;
  const partialReceivablesCount = receivables.filter(r => r.status === 'PARTIAL').length;
  const paidReceivablesCount = receivables.filter(r => r.status === 'PAID').length;

  // Write-off metrics
  const totalWriteOffsCount = writeOffs.length;
  const processedWriteOffsCount = writeOffs.filter(w => w.is_processed === 1).length;
  const pendingWriteOffsCount = totalWriteOffsCount - processedWriteOffsCount;
  const totalWriteOffValuation = writeOffs.reduce((sum, w) => sum + parseFloat(w.total_cost || 0), 0);

  return (
    <div className="view-container">
      {/* View Header with Sub-tabs */}
      <div className="view-header" style={{ marginBottom: '16px' }}>
        <div>
          <h2>Credit & Write-offs Management</h2>
          <p className="view-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Customer credit receivables lifecycle, partial & final settlements, and damaged stock write-off adjustments.
          </p>
        </div>
      </div>

      {/* Top Header & Workflow Sub-tabs */}
      <div className="workflow-nav-bar">
        <div className="nav-pill-group">
          <button
            className={`nav-pill-btn ${activeSubTab === 'credit' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('credit')}
          >
            <Scale size={16} />
            <span>Credit & Receivables ({receivables.length})</span>
          </button>
          <button
            className={`nav-pill-btn ${activeSubTab === 'writeoffs' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('writeoffs')}
          >
            <AlertTriangle size={16} />
            <span>Stock Write-offs ({writeOffs.length})</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn btn-outline" 
            onClick={loadData}
            title="Refresh database records"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Refreshing...' : 'Refresh Records'}</span>
          </button>
          {activeSubTab === 'credit' ? (
            <button 
              className="btn btn-primary" 
              onClick={() => setIsNewReceivableOpen(true)}
            >
              + Establish Credit Account
            </button>
          ) : (
            <button 
              className="btn btn-primary" 
              onClick={() => setIsNewWriteOffOpen(true)}
            >
              + Record Write-off
            </button>
          )}
        </div>
      </div>

      {/* Banner Feedback */}
      {banner && (
        <div className={`alert-banner alert-${banner.type}`} style={{ marginBottom: '20px' }}>
          <div className="alert-content">
            <div className="alert-title">
              {banner.type === 'success' && <CheckCircle2 size={16} />}
              {banner.type === 'error' && <AlertCircle size={16} />}
              {banner.type === 'info' && <Clock size={16} />}
              <strong>{banner.title}</strong>
            </div>
            <p className="alert-message">{banner.message}</p>
          </div>
          <button className="alert-close" onClick={() => setBanner(null)}>×</button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 1: CREDIT & RECEIVABLES */}
      {/* ==================================================================== */}
      {activeSubTab === 'credit' && (
        <>
          {/* Key Metric Cards */}
          <div className="stats-grid" style={{ marginBottom: '24px' }}>
            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-title">Total Credit Extended</span>
                <span className="stat-icon-wrapper bg-blue-100 text-blue-600">
                  <CreditCard size={18} />
                </span>
              </div>
              <div className="stat-value">{formatCurrency(totalCreditExtended)}</div>
              <div className="stat-footer text-muted">
                Across {receivables.length} credit sale accounts
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-title">Outstanding Receivables</span>
                <span className="stat-icon-wrapper bg-amber-100 text-amber-600">
                  <DollarSign size={18} />
                </span>
              </div>
              <div className="stat-value" style={{ color: totalOutstanding > 0 ? '#b45309' : '#16a34a' }}>
                {formatCurrency(totalOutstanding)}
              </div>
              <div className="stat-footer text-muted">
                {openReceivablesCount} OPEN · {partialReceivablesCount} PARTIAL
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-title">Total Settled to Date</span>
                <span className="stat-icon-wrapper bg-green-100 text-green-600">
                  <CheckCircle2 size={18} />
                </span>
              </div>
              <div className="stat-value" style={{ color: '#16a34a' }}>
                {formatCurrency(totalSettled)}
              </div>
              <div className="stat-footer text-muted">
                {paidReceivablesCount} accounts fully settled (PAID)
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-title">Eligible Credit Sales</span>
                <span className="stat-icon-wrapper bg-purple-100 text-purple-600">
                  <FileText size={18} />
                </span>
              </div>
              <div className="stat-value">{eligibleSales.length}</div>
              <div className="stat-footer text-muted">
                Completed credit sales awaiting receivable setup
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Credit Receivables Ledger
            </h3>

            <button
              className="btn btn-primary btn-sm"
              onClick={() => setIsNewReceivableOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} />
              <span>Establish Credit Receivable</span>
            </button>
          </div>

          {/* Receivables Table */}
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Recv #</th>
                  <th>Sale Number</th>
                  <th>Customer</th>
                  <th>Sale Date</th>
                  <th>Due Date</th>
                  <th style={{ textAlign: 'right' }}>Original Amount</th>
                  <th style={{ textAlign: 'right' }}>Settled</th>
                  <th style={{ textAlign: 'right' }}>Outstanding</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Receipts</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && receivables.length === 0 ? (
                  <tr>
                    <td colSpan="11" style={{ textAlign: 'center', padding: '30px' }}>
                      <RefreshCw size={24} className="animate-spin text-muted" style={{ margin: '0 auto 8px' }} />
                      <p className="text-muted">Loading credit receivables from database...</p>
                    </td>
                  </tr>
                ) : receivables.length === 0 ? (
                  <tr>
                    <td colSpan="11" style={{ textAlign: 'center', padding: '40px' }} className="text-muted">
                      No credit receivables found. Click "Establish Credit Receivable" to setup a receivable for an eligible completed credit sale.
                    </td>
                  </tr>
                ) : (
                  receivables.map(recv => {
                    const isPaid = recv.status === 'PAID';
                    const isPartial = recv.status === 'PARTIAL';
                    return (
                      <tr key={recv.id}>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--primary)' }}>
                            #{recv.id}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            {recv.sale_number}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{recv.customer_name}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {recv.customer_phone || recv.customer_email || '—'}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{formatDate(recv.sale_date)}</td>
                        <td>
                          <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                            {formatDate(recv.due_date)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 500 }}>
                          {formatCurrency(recv.original_amount)}
                        </td>
                        <td style={{ textAlign: 'right', color: '#16a34a' }}>
                          {formatCurrency(recv.total_settled)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: isPaid ? '#16a34a' : '#b45309' }}>
                          {formatCurrency(recv.outstanding_amount)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge ${
                            isPaid ? 'badge-success' : isPartial ? 'badge-warning' : 'badge-info'
                          }`}>
                            {recv.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                            onClick={() => openReceiptsModal(recv)}
                          >
                            <Receipt size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                            {recv.receipts_count}
                          </button>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                            disabled={isPaid}
                            onClick={() => openSettleModal(recv)}
                          >
                            {isPaid ? 'Settled' : 'Settle Payment'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 2: DAMAGED STOCK WRITE-OFFS */}
      {/* ==================================================================== */}
      {activeSubTab === 'writeoffs' && (
        <>
          {/* Key Metric Cards */}
          <div className="stats-grid" style={{ marginBottom: '24px' }}>
            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-title">Total Write-Off Records</span>
                <span className="stat-icon-wrapper bg-amber-100 text-amber-600">
                  <AlertTriangle size={18} />
                </span>
              </div>
              <div className="stat-value">{totalWriteOffsCount}</div>
              <div className="stat-footer text-muted">
                {processedWriteOffsCount} posted · {pendingWriteOffsCount} draft
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-title">Posted Loss Valuation</span>
                <span className="stat-icon-wrapper bg-red-100 text-red-600">
                  <DollarSign size={18} />
                </span>
              </div>
              <div className="stat-value" style={{ color: '#dc2626' }}>
                {formatCurrency(totalWriteOffValuation)}
              </div>
              <div className="stat-footer text-muted">
                Recorded cost valuation of damaged inventory
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-title">Available Variants</span>
                <span className="stat-icon-wrapper bg-blue-100 text-blue-600">
                  <Layers size={18} />
                </span>
              </div>
              <div className="stat-value">{variants.length}</div>
              <div className="stat-footer text-muted">
                Live catalog variants available for write-off entry
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Damaged Stock Write-offs Register
            </h3>

            <button
              className="btn btn-primary btn-sm"
              onClick={() => setIsNewWriteOffOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} />
              <span>Record Damaged Stock</span>
            </button>
          </div>

          {/* Write-offs Table */}
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Write-off #</th>
                  <th>Product Title & Format</th>
                  <th>Write-Off Date</th>
                  <th style={{ textAlign: 'center' }}>Quantity</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Total Cost</th>
                  <th>Reason / Cause</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && writeOffs.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '30px' }}>
                      <RefreshCw size={24} className="animate-spin text-muted" style={{ margin: '0 auto 8px' }} />
                      <p className="text-muted">Loading write-offs from database...</p>
                    </td>
                  </tr>
                ) : writeOffs.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '40px' }} className="text-muted">
                      No write-off records found. Click "Record Damaged Stock" to create a new write-off entry.
                    </td>
                  </tr>
                ) : (
                  writeOffs.map(wo => {
                    const isProcessed = wo.is_processed === 1;
                    return (
                      <tr key={wo.id}>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--primary)' }}>
                            WO-#{wo.id}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{wo.product_name}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Format: {wo.format} · Category: {wo.category}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{formatDate(wo.write_off_date)}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>
                          <span style={{ color: '#dc2626' }}>-{wo.quantity}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(wo.unit_cost)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                          {formatCurrency(wo.total_cost)}
                        </td>
                        <td style={{ maxWidth: '240px', fontSize: '0.85rem' }}>
                          <div style={{ fontWeight: 500 }}>{wo.reason}</div>
                          {wo.notes && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {wo.notes}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge ${isProcessed ? 'badge-success' : 'badge-warning'}`}>
                            {isProcessed ? 'POSTED' : 'PENDING'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {isProcessed ? (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                              onClick={() => openMovementsModal(wo)}
                            >
                              <FileText size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                              View Movement
                            </button>
                          ) : (
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ padding: '3px 8px', fontSize: '0.75rem', background: '#dc2626', borderColor: '#b91c1c' }}
                              onClick={() => openConfirmProcessModal(wo)}
                            >
                              Confirm & Deduct
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ==================================================================== */}
      {/* MODAL 1: ESTABLISH CREDIT RECEIVABLE */}
      {/* ==================================================================== */}
      {isNewReceivableOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Establish Credit Receivable</h3>
              <button className="modal-close-btn" onClick={() => setIsNewReceivableOpen(false)}>×</button>
            </div>
            <form onSubmit={handleCreateReceivable}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="info-banner" style={{ background: '#eff6ff', padding: '12px', borderRadius: '6px', fontSize: '0.85rem', color: '#1e40af' }}>
                  Select an existing completed credit sale to establish customer receivable terms and payment schedule.
                </div>

                <div className="form-group">
                  <label className="form-label">Eligible Credit Sale *</label>
                  {eligibleSales.length === 0 ? (
                    <div style={{ padding: '12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      No unassigned completed credit sales found. To create one, go to <strong>Sales & Payments</strong>, create a sale with type <em>CREDIT</em>, and click <em>Complete Sale</em>.
                    </div>
                  ) : (
                    <select
                      className="form-input"
                      value={newReceivableForm.sale_id}
                      onChange={(e) => setNewReceivableForm(prev => ({ ...prev, sale_id: e.target.value }))}
                      required
                    >
                      <option value="">-- Select Completed Credit Sale --</option>
                      {eligibleSales.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.sale_number} — {s.customer_name} ({formatCurrency(s.net_payable)}) · {formatDate(s.sale_date)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Due Date (Optional - defaults to +30 days)</label>
                  <input
                    type="date"
                    className="form-input"
                    value={newReceivableForm.due_date}
                    onChange={(e) => setNewReceivableForm(prev => ({ ...prev, due_date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsNewReceivableOpen(false)}
                  disabled={isSubmittingReceivable}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingReceivable || eligibleSales.length === 0 || !newReceivableForm.sale_id}
                >
                  {isSubmittingReceivable ? 'Creating...' : 'Create Receivable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: SETTLE RECEIVABLE (CASH / DIGITAL) */}
      {/* ==================================================================== */}
      {isSettleModalOpen && selectedReceivable && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Settle Credit Receivable</h3>
              <button className="modal-close-btn" onClick={() => setIsSettleModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSettleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Account Summary */}
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span className="text-muted">Account:</span>
                    <strong>Receivable #{selectedReceivable.id} ({selectedReceivable.sale_number})</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span className="text-muted">Customer:</span>
                    <span>{selectedReceivable.customer_name}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span className="text-muted">Original Credit:</span>
                    <span>{formatCurrency(selectedReceivable.original_amount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px', marginTop: '6px' }}>
                    <span style={{ fontWeight: 600 }}>Outstanding Balance:</span>
                    <strong style={{ color: '#b45309', fontSize: '1rem' }}>
                      {formatCurrency(selectedReceivable.outstanding_amount)}
                    </strong>
                  </div>
                </div>

                {/* Payment Method Toggle */}
                <div className="form-group">
                  <label className="form-label">Payment Method *</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${settleForm.payment_method === 'CASH' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1 }}
                      onClick={() => setSettleForm(prev => ({ ...prev, payment_method: 'CASH' }))}
                    >
                      CASH Settlement
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${settleForm.payment_method === 'DIGITAL' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1 }}
                      onClick={() => setSettleForm(prev => ({ ...prev, payment_method: 'DIGITAL' }))}
                    >
                      DIGITAL (UPI / Card)
                    </button>
                  </div>
                </div>

                {/* Settlement Amount */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label">Settlement Amount (₹) *</label>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                      onClick={() => setSettleForm(prev => ({ ...prev, amount: selectedReceivable.outstanding_amount }))}
                    >
                      Pay Full ({formatCurrency(selectedReceivable.outstanding_amount)})
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={selectedReceivable.outstanding_amount}
                    className="form-input"
                    value={settleForm.amount}
                    onChange={(e) => setSettleForm(prev => ({ ...prev, amount: e.target.value }))}
                    required
                    placeholder="Enter amount to settle"
                  />
                </div>

                {/* Digital Reference Fields */}
                {settleForm.payment_method === 'DIGITAL' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Transaction Reference (UPI / UTR) *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={settleForm.transaction_reference}
                        onChange={(e) => setSettleForm(prev => ({ ...prev, transaction_reference: e.target.value }))}
                        required
                        placeholder="e.g. UPI-HDFC-998822"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Bank Reference Number (Optional)</label>
                      <input
                        type="text"
                        className="form-input"
                        value={settleForm.bank_reference_number}
                        onChange={(e) => setSettleForm(prev => ({ ...prev, bank_reference_number: e.target.value }))}
                        placeholder="e.g. BRN-884123"
                      />
                    </div>
                  </>
                )}

                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Validates against overpayment, records received settlement funds, decrements outstanding customer balance, and generates an official payment receipt.
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsSettleModalOpen(false)}
                  disabled={isSubmittingSettle}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingSettle || !settleForm.amount}
                >
                  {isSubmittingSettle ? 'Processing Settlement...' : 'Record Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: RECEIVABLE RECEIPTS DETAIL */}
      {/* ==================================================================== */}
      {isReceiptsModalOpen && selectedReceivable && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Sales Receipts for #{selectedReceivable.sale_number}</h3>
              <button className="modal-close-btn" onClick={() => setIsReceiptsModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '14px', fontSize: '0.85rem' }}>
                Customer: <strong>{selectedReceivable.customer_name}</strong> · Original Credit: <strong>{formatCurrency(selectedReceivable.original_amount)}</strong>
              </div>

              {loadingReceipts ? (
                <div style={{ textAlign: 'center', padding: '24px' }}>
                  <RefreshCw size={20} className="animate-spin text-muted" />
                  <p className="text-muted" style={{ marginTop: '8px' }}>Fetching official receipts...</p>
                </div>
              ) : receivableReceipts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', background: '#f8fafc', borderRadius: '6px' }} className="text-muted">
                  No settlement receipts issued yet for this receivable. Record a payment to issue a receipt.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {receivableReceipts.map(rcpt => (
                    <div 
                      key={rcpt.id} 
                      style={{ 
                        border: '1px solid #e2e8f0', 
                        borderRadius: '6px', 
                        padding: '12px 16px', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        background: '#ffffff'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--primary)' }}>
                            {rcpt.receipt_number}
                          </span>
                          <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                            {rcpt.payment_method}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Issued: {new Date(rcpt.issued_at).toLocaleString('en-IN')}
                          {rcpt.transaction_reference && ` · Ref: ${rcpt.transaction_reference}`}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: '#16a34a', fontSize: '1.05rem' }}>
                          {formatCurrency(rcpt.amount)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {rcpt.document_path}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setIsReceiptsModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 4: RECORD DAMAGED STOCK WRITE-OFF */}
      {/* ==================================================================== */}
      {isNewWriteOffOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Record Damaged Stock Write-off</h3>
              <button className="modal-close-btn" onClick={() => setIsNewWriteOffOpen(false)}>×</button>
            </div>
            <form onSubmit={handleCreateWriteOff}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Product Variant *</label>
                  <select
                    className="form-input"
                    value={newWriteOffForm.product_variant_id}
                    onChange={(e) => handleVariantSelectChange(e.target.value)}
                    required
                  >
                    <option value="">-- Select Product Variant to Write Off --</option>
                    {variants.map(v => (
                      <option key={v.product_variant_id} value={v.product_variant_id}>
                        {v.product_name} ({v.format}) — Stock: {v.live_qoh} units @ Cost: {formatCurrency(v.unit_cost)}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">Damaged Quantity *</label>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      value={newWriteOffForm.quantity}
                      onChange={(e) => setNewWriteOffForm(prev => ({ ...prev, quantity: e.target.value }))}
                      required
                      placeholder="e.g. 2"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Unit Purchase Cost (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-input"
                      value={newWriteOffForm.unit_cost}
                      onChange={(e) => setNewWriteOffForm(prev => ({ ...prev, unit_cost: e.target.value }))}
                      required
                      placeholder="e.g. 420.00"
                    />
                  </div>
                </div>

                {newWriteOffForm.quantity && newWriteOffForm.unit_cost && (
                  <div style={{ background: '#fef2f2', padding: '10px 14px', borderRadius: '6px', border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#991b1b', fontWeight: 500 }}>
                      Total Cost Valuation Impact:
                    </span>
                    <strong style={{ color: '#dc2626', fontSize: '1rem' }}>
                      {formatCurrency(parseInt(newWriteOffForm.quantity, 10) * parseFloat(newWriteOffForm.unit_cost))}
                    </strong>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Write-Off Reason *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newWriteOffForm.reason}
                    onChange={(e) => setNewWriteOffForm(prev => ({ ...prev, reason: e.target.value }))}
                    required
                    placeholder="e.g. Shelf transit display spine damage"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Date Discovered *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={newWriteOffForm.write_off_date}
                    onChange={(e) => setNewWriteOffForm(prev => ({ ...prev, write_off_date: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Audit Notes (Optional)</label>
                  <textarea
                    className="form-input"
                    rows="2"
                    value={newWriteOffForm.notes}
                    onChange={(e) => setNewWriteOffForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Detailed explanation of physical damage or inspection report..."
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsNewWriteOffOpen(false)}
                  disabled={isSubmittingWriteOff}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingWriteOff || !newWriteOffForm.product_variant_id || !newWriteOffForm.quantity}
                >
                  {isSubmittingWriteOff ? 'Saving...' : 'Save Draft Write-Off'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 5: CONFIRM & PROCESS WRITE-OFF */}
      {/* ==================================================================== */}
      {isConfirmProcessOpen && writeOffToProcess && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} />
                Confirm Stock Write-off
              </h3>
              <button className="modal-close-btn" onClick={() => setIsConfirmProcessOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                You are about to permanently write off damaged inventory and post a negative stock movement ledger record.
              </p>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span className="text-muted">Item:</span>
                  <strong>{writeOffToProcess.product_name} ({writeOffToProcess.format})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span className="text-muted">Reason:</span>
                  <span>{writeOffToProcess.reason}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span className="text-muted">Current Live Stock:</span>
                  <strong>{writeOffToProcess.live_qoh} units</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span className="text-muted">Quantity to Write Off:</span>
                  <strong style={{ color: '#dc2626' }}>-{writeOffToProcess.quantity} units</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px', marginTop: '6px' }}>
                  <span style={{ fontWeight: 600 }}>New Stock After Write-Off:</span>
                  <strong style={{ color: '#1e40af' }}>
                    {writeOffToProcess.live_qoh - writeOffToProcess.quantity} units
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                  <span style={{ fontWeight: 600 }}>Total Valuation Impact:</span>
                  <strong style={{ color: '#dc2626' }}>
                    {formatCurrency(writeOffToProcess.total_cost)}
                  </strong>
                </div>
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Applies inventory deduction, logs a stock write-off audit record, and updates damaged asset records.
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsConfirmProcessOpen(false)}
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#dc2626', borderColor: '#b91c1c' }}
                onClick={handleProcessWriteOff}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Confirm & Deduct Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 6: STOCK MOVEMENT LEDGER FOR WRITE-OFF */}
      {/* ==================================================================== */}
      {isMovementsModalOpen && writeOffToProcess && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3>Stock Movement Ledger (WO-#{writeOffToProcess.id})</h3>
              <button className="modal-close" onClick={() => setIsMovementsModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              {loadingMovements ? (
                <div style={{ textAlign: 'center', padding: '24px' }}>
                  <RefreshCw size={20} className="animate-spin text-muted" />
                  <p className="text-muted" style={{ marginTop: '8px' }}>Loading stock ledger movement...</p>
                </div>
              ) : movementsList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', background: '#f8fafc', borderRadius: '6px' }} className="text-muted">
                  No stock movements found for this write-off record.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {movementsList.map(m => (
                    <div 
                      key={m.id} 
                      style={{ 
                        border: '1px solid #e2e8f0', 
                        borderRadius: '6px', 
                        padding: '12px 16px', 
                        background: '#ffffff'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--primary)' }}>
                            Movement #{m.id}
                          </span>
                          <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                            {m.movement_type}
                          </span>
                        </div>
                        <div style={{ fontWeight: 700, color: '#dc2626', fontSize: '1rem' }}>
                          {m.quantity} units ({formatCurrency(m.total_cost)})
                        </div>
                      </div>

                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        <strong>Item:</strong> {m.product_name} ({m.format}) · <strong>Unit Cost:</strong> {formatCurrency(m.unit_cost)}
                      </div>

                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <strong>Remarks:</strong> {m.remarks}
                      </div>

                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Posted at: {new Date(m.movement_date).toLocaleString('en-IN')} · Ref: {m.reference_type} #{m.reference_id}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setIsMovementsModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
