import React, { useState, useEffect } from 'react';
import {
  fetchSuppliers,
  fetchProductVariants,
  fetchPurchaseOrders,
  fetchPurchaseOrderById,
  createPurchaseOrder,
  createShipment,
  fetchGoodsReceipts,
  createGoodsReceipt,
  verifyGoodsReceipt,
  fetchInventory
} from '../api';

export default function PurchasesView() {
  const [subTab, setSubTab] = useState('orders'); // 'orders' | 'grns' | 'stock'
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [grns, setGrns] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [variants, setVariants] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  
  // Feedback Banner
  const [banner, setBanner] = useState(null); // { type, title, message, data }

  // Modals state
  const [isPoModalOpen, setIsPoModalOpen] = useState(false);
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
  const [selectedPoForShipment, setSelectedPoForShipment] = useState(null);
  
  const [isGrnModalOpen, setIsGrnModalOpen] = useState(false);
  const [selectedPoForGrn, setSelectedPoForGrn] = useState(null);
  const [grnFormItems, setGrnFormItems] = useState([]);

  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [selectedGrnForVerify, setSelectedGrnForVerify] = useState(null);
  const [verifiedByName, setVerifiedByName] = useState('Store Manager');
  const [isVerifying, setIsVerifying] = useState(false);

  // Form states - Create PO
  const [poForm, setPoForm] = useState({
    supplier_id: '',
    order_date: new Date().toISOString().slice(0, 10),
    expected_delivery_date: '',
    notes: '',
    items: []
  });
  const [isSubmittingPo, setIsSubmittingPo] = useState(false);

  // Form states - Create Shipment
  const [shipmentForm, setShipmentForm] = useState({
    transport_document_no: '',
    shipment_date: new Date().toISOString().slice(0, 10),
    expected_date: '',
    status: 'DELIVERED'
  });
  const [isSubmittingShipment, setIsSubmittingShipment] = useState(false);

  // Form states - Create GRN
  const [grnForm, setGrnForm] = useState({
    location: 'Main Bookstore Receiving Bay',
    bill_number: '',
    bill_date: new Date().toISOString().slice(0, 10),
    received_date: new Date().toISOString().slice(0, 10),
    received_by: 'Store Staff',
    notes: ''
  });
  const [isSubmittingGrn, setIsSubmittingGrn] = useState(false);

  // Load initial data
  const loadData = async () => {
    setLoading(true);
    try {
      const [suppData, varData, ordersData, grnsData, invData] = await Promise.all([
        fetchSuppliers(),
        fetchProductVariants(),
        fetchPurchaseOrders(),
        fetchGoodsReceipts(),
        fetchInventory()
      ]);

      setSuppliers(suppData.suppliers || []);
      setVariants(varData.variants || []);
      setOrders(ordersData.orders || []);
      setGrns(grnsData.goodsReceipts || []);
      setInventoryList(invData.items || []);
    } catch (err) {
      console.error('Failed to load purchases data:', err);
      setBanner({
        type: 'error',
        title: 'Data Load Failed',
        message: err.message || 'Could not load procurement data.'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Format currency
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // =========================================================================
  // CREATE PO HANDLERS
  // =========================================================================
  const handleOpenCreatePo = () => {
    if (variants.length === 0 || suppliers.length === 0) return;
    const defaultVar = variants[0];
    setPoForm({
      supplier_id: suppliers[0]?.id || '',
      order_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      notes: 'New restocking order via SRC portal',
      items: [
        {
          product_variant_id: defaultVar.variant_id,
          quantity_ordered: 10,
          unit_cost: defaultVar.purchase_price
        }
      ]
    });
    setIsPoModalOpen(true);
  };

  const handleAddPoItem = () => {
    const defaultVar = variants[0];
    setPoForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_variant_id: defaultVar.variant_id,
          quantity_ordered: 5,
          unit_cost: defaultVar.purchase_price
        }
      ]
    }));
  };

  const handleRemovePoItem = (index) => {
    if (poForm.items.length <= 1) return;
    setPoForm(prev => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }));
  };

  const handlePoItemChange = (index, field, value) => {
    setPoForm(prev => {
      const nextItems = [...prev.items];
      const item = { ...nextItems[index] };

      if (field === 'product_variant_id') {
        item.product_variant_id = value;
        const matched = variants.find(v => String(v.variant_id) === String(value));
        if (matched) {
          item.unit_cost = matched.purchase_price;
        }
      } else if (field === 'quantity_ordered') {
        item.quantity_ordered = parseInt(value, 10) || 0;
      } else if (field === 'unit_cost') {
        item.unit_cost = parseFloat(value) || 0;
      }

      nextItems[index] = item;
      return { ...prev, items: nextItems };
    });
  };

  const handleSubmitPo = async (e) => {
    e.preventDefault();
    setIsSubmittingPo(true);
    setBanner(null);

    try {
      const payload = {
        supplier_id: parseInt(poForm.supplier_id, 10),
        order_date: poForm.order_date,
        expected_delivery_date: poForm.expected_delivery_date || null,
        notes: poForm.notes,
        items: poForm.items.map(it => ({
          product_variant_id: parseInt(it.product_variant_id, 10),
          quantity_ordered: parseInt(it.quantity_ordered, 10),
          unit_cost: parseFloat(it.unit_cost)
        }))
      };

      const result = await createPurchaseOrder(payload);
      setIsPoModalOpen(false);
      setBanner({
        type: 'success',
        title: 'Purchase Order Created',
        message: `${result.orderNumber} successfully created with ${result.itemsCount} line items totaling ${formatCurrency(result.totalAmount)}.`
      });
      await loadData();
    } catch (err) {
      setBanner({
        type: 'error',
        title: 'PO Creation Failed',
        message: err.message
      });
    } finally {
      setIsSubmittingPo(false);
    }
  };

  // =========================================================================
  // CREATE SHIPMENT HANDLERS
  // =========================================================================
  const handleOpenShipmentModal = (po) => {
    setSelectedPoForShipment(po);
    setShipmentForm({
      transport_document_no: `LR-${po.order_number}-${Date.now().toString().slice(-4)}`,
      shipment_date: new Date().toISOString().slice(0, 10),
      expected_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      status: 'DELIVERED'
    });
    setIsShipmentModalOpen(true);
  };

  const handleSubmitShipment = async (e) => {
    e.preventDefault();
    if (!selectedPoForShipment) return;
    setIsSubmittingShipment(true);
    setBanner(null);

    try {
      const payload = {
        purchase_order_id: selectedPoForShipment.id,
        transport_document_no: shipmentForm.transport_document_no,
        shipment_date: shipmentForm.shipment_date,
        expected_date: shipmentForm.expected_date,
        received_date: shipmentForm.shipment_date,
        status: shipmentForm.status
      };

      const result = await createShipment(payload);
      setIsShipmentModalOpen(false);
      setBanner({
        type: 'success',
        title: 'Shipment Recorded',
        message: `Shipment for ${selectedPoForShipment.order_number} recorded with consignment #${shipmentForm.transport_document_no} (Status: ${result.status}).`
      });
      await loadData();
    } catch (err) {
      setBanner({
        type: 'error',
        title: 'Shipment Failed',
        message: err.message
      });
    } finally {
      setIsSubmittingShipment(false);
    }
  };

  // =========================================================================
  // CREATE GRN HANDLERS
  // =========================================================================
  const handleOpenCreateGrn = async (po) => {
    try {
      setLoading(true);
      const detail = await fetchPurchaseOrderById(po.id);
      setSelectedPoForGrn(detail.order);

      // Pre-fill items from PO items
      const prefilledItems = (detail.order.items || []).map((it, idx) => ({
        product_variant_id: it.product_variant_id,
        product_name: it.product_name,
        format: it.format,
        isbn: it.isbn,
        quantity_ordered: it.quantity_ordered,
        quantity_received: it.quantity_ordered,
        quantity_accepted: it.quantity_ordered,
        quantity_rejected: 0,
        batch_no: `BATCH-2026-${String(it.product_variant_id).padStart(2, '0')}`,
        purchase_rate: it.unit_cost
      }));

      setGrnFormItems(prefilledItems);
      setGrnForm({
        location: 'Main Bookstore Receiving Dock',
        bill_number: `BILL-${po.order_number.replace('PO-', '')}-${Date.now().toString().slice(-4)}`,
        bill_date: new Date().toISOString().slice(0, 10),
        received_date: new Date().toISOString().slice(0, 10),
        received_by: 'Prakash Chandra (Receiving)',
        notes: `Physically received and counted against ${po.order_number}`
      });

      setIsGrnModalOpen(true);
    } catch (err) {
      setBanner({
        type: 'error',
        title: 'Failed to prepare GRN',
        message: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGrnItemQtyChange = (index, field, val) => {
    setGrnFormItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      const parsedVal = parseInt(val, 10) || 0;

      if (field === 'quantity_accepted') {
        item.quantity_accepted = Math.max(0, parsedVal);
        item.quantity_rejected = Math.max(0, item.quantity_received - item.quantity_accepted);
      } else if (field === 'quantity_rejected') {
        item.quantity_rejected = Math.max(0, parsedVal);
        item.quantity_accepted = Math.max(0, item.quantity_received - item.quantity_rejected);
      } else if (field === 'quantity_received') {
        item.quantity_received = Math.max(0, parsedVal);
        item.quantity_accepted = item.quantity_received;
        item.quantity_rejected = 0;
      } else if (field === 'batch_no') {
        item.batch_no = val;
      }

      updated[index] = item;
      return updated;
    });
  };

  const handleSubmitGrn = async (e) => {
    e.preventDefault();
    if (!selectedPoForGrn) return;
    setIsSubmittingGrn(true);
    setBanner(null);

    try {
      const payload = {
        purchase_order_id: selectedPoForGrn.id,
        shipment_id: selectedPoForGrn.shipments?.[0]?.id || null,
        location: grnForm.location,
        bill_number: grnForm.bill_number,
        bill_date: grnForm.bill_date,
        received_date: grnForm.received_date,
        received_by: grnForm.received_by,
        notes: grnForm.notes,
        items: grnFormItems.map(it => ({
          product_variant_id: it.product_variant_id,
          quantity_ordered: it.quantity_ordered,
          quantity_received: it.quantity_received,
          quantity_accepted: it.quantity_accepted,
          quantity_rejected: it.quantity_rejected,
          batch_no: it.batch_no,
          purchase_rate: it.purchase_rate
        }))
      };

      const result = await createGoodsReceipt(payload);
      setIsGrnModalOpen(false);
      setBanner({
        type: 'info',
        title: 'GRN Draft Created (Pending Verification)',
        message: `${result.grnNumber} created with ${result.itemsCount} line items. Status is PENDING. Click "Verify & Post GRN" to confirm physical receipt and update inventory stock.`
      });
      await loadData();
      setSubTab('grns'); // Switch to GRN tab so user immediately sees it
    } catch (err) {
      setBanner({
        type: 'error',
        title: 'GRN Creation Failed',
        message: err.message
      });
    } finally {
      setIsSubmittingGrn(false);
    }
  };

  // =========================================================================
  // VERIFY GRN MODAL & EXECUTION
  // =========================================================================
  const handleOpenVerifyModal = (grn) => {
    setSelectedGrnForVerify(grn);
    setVerifiedByName('Store Manager');
    setIsVerifyModalOpen(true);
  };

  const handleExecuteVerification = async () => {
    if (!selectedGrnForVerify) return;
    setIsVerifying(true);
    setBanner(null);

    try {
      const result = await verifyGoodsReceipt(selectedGrnForVerify.id, verifiedByName);
      setIsVerifyModalOpen(false);

      setBanner({
        type: 'success',
        title: 'GRN Successfully Verified & Inventory Posted!',
        message: `${result.message || 'Inventory levels updated and stock movement posted.'}`,
        data: result.data
      });

      await loadData();
    } catch (err) {
      setIsVerifyModalOpen(false);
      setBanner({
        type: 'error',
        title: 'Verification Rejected',
        message: err.message || 'Verification failed.'
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Calculate totals for PO Form
  const poTotalItems = poForm.items.reduce((sum, it) => sum + (parseInt(it.quantity_ordered, 10) || 0), 0);
  const poTotalAmount = poForm.items.reduce((sum, it) => {
    const qty = parseInt(it.quantity_ordered, 10) || 0;
    const cost = parseFloat(it.unit_cost) || 0;
    return sum + (qty * cost);
  }, 0);

  // Calculate totals for GRN Form
  const grnTotalAccepted = grnFormItems.reduce((sum, it) => sum + (parseInt(it.quantity_accepted, 10) || 0), 0);
  const grnTotalRejected = grnFormItems.reduce((sum, it) => sum + (parseInt(it.quantity_rejected, 10) || 0), 0);
  const grnTotalValue = grnFormItems.reduce((sum, it) => sum + (it.quantity_accepted * it.purchase_rate), 0);

  return (
    <div className="purchases-view">
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
                <span>Status: <strong>{banner.data.newStatus}</strong></span> &nbsp;•&nbsp;
                <span>Accepted Units: <strong>+{banner.data.acceptedQuantity}</strong></span> &nbsp;•&nbsp;
                <span>Value Added: <strong>{formatCurrency(banner.data.inventoryValueAdded)}</strong></span>
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

      {/* Top Header & Action Controls */}
      <div className="workflow-nav-bar">
        <div className="nav-pill-group">
          <button 
            className={`nav-pill-btn ${subTab === 'orders' ? 'active' : ''}`}
            onClick={() => setSubTab('orders')}
          >
            📋 Purchase Orders ({orders.length})
          </button>
          <button 
            className={`nav-pill-btn ${subTab === 'grns' ? 'active' : ''}`}
            onClick={() => setSubTab('grns')}
          >
            📦 Goods Receipts (GRN) ({grns.length})
          </button>
          <button 
            className={`nav-pill-btn ${subTab === 'stock' ? 'active' : ''}`}
            onClick={() => setSubTab('stock')}
          >
            📊 Live Stock Preview ({inventoryList.length})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-outline" onClick={loadData} disabled={loading}>
            {loading ? 'Refreshing...' : '🔄 Refresh Data'}
          </button>
          <button className="btn btn-primary" onClick={handleOpenCreatePo}>
            + Create Purchase Order
          </button>
        </div>
      </div>

      {/* TAB 1: PURCHASE ORDERS LISTING */}
      {subTab === 'orders' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 className="card-title">Purchase Orders Registry</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Track PO status, shipments, and initiate Goods Receipt Notes (GRN).
              </p>
            </div>
            <span className="badge badge-neutral font-mono">{orders.length} Records</span>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-container" style={{ border: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Supplier</th>
                    <th>Order Date</th>
                    <th>Status</th>
                    <th>Items</th>
                    <th>Total Value</th>
                    <th>Shipment</th>
                    <th>GRN Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                        No purchase orders found. Click "+ Create Purchase Order" to begin.
                      </td>
                    </tr>
                  ) : (
                    orders.map(po => {
                      const isReceived = po.status === 'RECEIVED';
                      const hasShipment = po.shipment_count > 0;
                      const hasGrn = po.grn_count > 0;

                      return (
                        <tr key={po.id}>
                          <td className="font-mono" style={{ fontWeight: 600 }}>{po.order_number}</td>
                          <td>
                            <div><strong>{po.supplier_name}</strong></div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{po.supplier_contact}</div>
                          </td>
                          <td>{formatDate(po.order_date)}</td>
                          <td>
                            <span className={`badge ${
                              po.status === 'RECEIVED' ? 'badge-success' :
                              po.status === 'ORDERED' ? 'badge-primary' : 'badge-warning'
                            }`}>
                              {po.status}
                            </span>
                          </td>
                          <td>{po.items_count} items</td>
                          <td style={{ fontWeight: 600 }}>{formatCurrency(po.total_amount)}</td>
                          <td>
                            {hasShipment ? (
                              <span className="badge badge-neutral" title={`Tracking: ${po.latest_shipment_tracking || 'N/A'}`}>
                                🚚 {po.latest_shipment_status || 'DELIVERED'}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No shipment</span>
                            )}
                          </td>
                          <td>
                            {hasGrn ? (
                              <span className={`badge ${po.latest_grn_status === 'VERIFIED' ? 'badge-success' : 'badge-warning'}`}>
                                {po.latest_grn_status === 'VERIFIED' ? '✓ Verified' : '⏳ Pending GRN'}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No GRN</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              {!hasShipment && !isReceived && (
                                <button 
                                  className="btn btn-outline" 
                                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  onClick={() => handleOpenShipmentModal(po)}
                                  title="Record shipment dispatch/tracking"
                                >
                                  🚚 Ship
                                </button>
                              )}

                              {!hasGrn && !isReceived && (
                                <button 
                                  className="btn btn-primary" 
                                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                  onClick={() => handleOpenCreateGrn(po)}
                                  title="Create Goods Receipt Note (GRN)"
                                >
                                  📦 Create GRN
                                </button>
                              )}

                              {isReceived && (
                                <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                                  ✓ Stock Ingested
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

      {/* TAB 2: GOODS RECEIPT NOTES (GRN) LISTING */}
      {subTab === 'grns' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 className="card-title">Goods Receipt Notes (GRN) Registry</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Physical receiving log. Verifying will post accepted quantities directly into live stock and update inventory records.
              </p>
            </div>
            <span className="badge badge-neutral font-mono">{grns.length} Records</span>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-container" style={{ border: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>GRN Number</th>
                    <th>Purchase Order</th>
                    <th>Supplier</th>
                    <th>Challan / Bill</th>
                    <th>Received Date</th>
                    <th>Accepted / Rejected</th>
                    <th>Total Value</th>
                    <th>Verification Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grns.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                        No Goods Receipt Notes generated yet. Go to Purchase Orders to create a GRN.
                      </td>
                    </tr>
                  ) : (
                    grns.map(grn => {
                      const isVerified = grn.verification_status === 'VERIFIED';

                      return (
                        <tr key={grn.id} style={{ backgroundColor: !isVerified ? '#fefce8' : 'transparent' }}>
                          <td className="font-mono" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                            {grn.grn_number}
                          </td>
                          <td className="font-mono">{grn.order_number}</td>
                          <td><strong>{grn.supplier_name}</strong></td>
                          <td>
                            <div>{grn.bill_number || '—'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>By: {grn.received_by}</div>
                          </td>
                          <td>{formatDate(grn.received_date)}</td>
                          <td>
                            <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                              +{grn.total_accepted} accepted
                            </span>
                            {grn.total_rejected > 0 && (
                              <span style={{ marginLeft: '6px', color: 'var(--danger)', fontSize: '0.8rem' }}>
                                ({grn.total_rejected} rejected)
                              </span>
                            )}
                          </td>
                          <td style={{ fontWeight: 600 }}>{formatCurrency(grn.total_value)}</td>
                          <td>
                            <span className={`badge ${isVerified ? 'badge-success' : 'badge-warning'}`}>
                              {isVerified ? '✓ VERIFIED' : '⏳ PENDING'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {isVerified ? (
                              <span className="badge badge-success" style={{ padding: '6px 12px' }}>
                                ✓ Inventory Posted
                              </span>
                            ) : (
                              <button 
                                className="btn btn-primary"
                                style={{ padding: '5px 12px', fontSize: '0.8rem', backgroundColor: '#d97706', borderColor: '#d97706' }}
                                onClick={() => handleOpenVerifyModal(grn)}
                                title="Verify goods receipt and post stock to inventory"
                              >
                                ⚡ Verify & Post GRN
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
          </div>
        </div>
      )}

      {/* TAB 3: LIVE STOCK PREVIEW */}
      {subTab === 'stock' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 className="card-title">Live Inventory Postings</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Real-time inventory snapshot reflecting verified receipts and current stock on hand.
              </p>
            </div>
            <button className="btn btn-outline" onClick={loadData}>Refresh Stock</button>
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-container" style={{ border: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product Title</th>
                    <th>Category</th>
                    <th>Format</th>
                    <th>Purchase Rate</th>
                    <th>Selling Price</th>
                    <th>Quantity On Hand</th>
                    <th>Stock Valuation</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryList.map(item => (
                    <tr key={item.inventory_id}>
                      <td style={{ fontWeight: 600 }}>{item.product_name}</td>
                      <td>{item.category}</td>
                      <td><span className="badge badge-neutral">{item.format}</span></td>
                      <td>{formatCurrency(item.purchase_price)}</td>
                      <td>{formatCurrency(item.selling_price)}</td>
                      <td style={{ fontWeight: 700, fontSize: '0.95rem' }}>{item.quantity_on_hand} units</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(item.stock_valuation)}</td>
                      <td>
                        <span className={`badge ${item.stock_status === 'HEALTHY' ? 'badge-success' : 'badge-danger'}`}>
                          {item.stock_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: CREATE PURCHASE ORDER
          ===================================================================== */}
      {isPoModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card modal-card-lg">
            <div className="modal-header">
              <h3 className="modal-title">📋 Create New Purchase Order</h3>
              <button className="modal-close-btn" onClick={() => setIsPoModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleSubmitPo}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Supplier *</label>
                    <select 
                      className="form-select"
                      value={poForm.supplier_id}
                      onChange={e => setPoForm({ ...poForm, supplier_id: e.target.value })}
                      required
                    >
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.supplier_code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Order Date *</label>
                    <input 
                      type="date" 
                      className="form-input"
                      value={poForm.order_date}
                      onChange={e => setPoForm({ ...poForm, order_date: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Expected Delivery Date</label>
                    <input 
                      type="date" 
                      className="form-input"
                      value={poForm.expected_delivery_date}
                      onChange={e => setPoForm({ ...poForm, expected_delivery_date: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <input 
                      type="text" 
                      className="form-input"
                      placeholder="Optional procurement notes..."
                      value={poForm.notes}
                      onChange={e => setPoForm({ ...poForm, notes: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    PO Line Items ({poForm.items.length})
                  </h4>
                  <button type="button" className="btn btn-outline" onClick={handleAddPoItem} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                    + Add Line Item
                  </button>
                </div>

                <table className="item-edit-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45%' }}>Product Variant</th>
                      <th style={{ width: '20%' }}>Quantity</th>
                      <th style={{ width: '20%' }}>Unit Cost (₹)</th>
                      <th style={{ width: '15%' }}>Line Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {poForm.items.map((item, idx) => {
                      const matched = variants.find(v => String(v.variant_id) === String(item.product_variant_id));
                      const lineTotal = (parseInt(item.quantity_ordered, 10) || 0) * (parseFloat(item.unit_cost) || 0);

                      return (
                        <tr key={idx}>
                          <td>
                            <select 
                              value={item.product_variant_id}
                              onChange={e => handlePoItemChange(idx, 'product_variant_id', e.target.value)}
                            >
                              {variants.map(v => (
                                <option key={v.variant_id} value={v.variant_id}>
                                  {v.product_name} ({v.format}) — Stock: {v.quantity_on_hand}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input 
                              type="number" 
                              min="1" 
                              value={item.quantity_ordered}
                              onChange={e => handlePoItemChange(idx, 'quantity_ordered', e.target.value)}
                              required
                            />
                          </td>
                          <td>
                            <input 
                              type="number" 
                              step="0.01" 
                              min="0" 
                              value={item.unit_cost}
                              onChange={e => handlePoItemChange(idx, 'unit_cost', e.target.value)}
                              required
                            />
                          </td>
                          <td style={{ fontWeight: 600 }}>{formatCurrency(lineTotal)}</td>
                          <td>
                            <button 
                              type="button" 
                              className="btn-icon"
                              disabled={poForm.items.length <= 1}
                              onClick={() => handleRemovePoItem(idx)}
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
                    <span className="stat-label">Total Ordered Units: </span>
                    <strong>{poTotalItems} units</strong>
                  </div>
                  <div>
                    <span className="stat-label">Total Purchase Amount: </span>
                    <span className="stat-val">{formatCurrency(poTotalAmount)}</span>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setIsPoModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmittingPo}>
                  {isSubmittingPo ? 'Creating Purchase Order...' : 'Save Purchase Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: RECORD SHIPMENT
          ===================================================================== */}
      {isShipmentModalOpen && selectedPoForShipment && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">🚚 Record Shipment for {selectedPoForShipment.order_number}</h3>
              <button className="modal-close-btn" onClick={() => setIsShipmentModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleSubmitShipment}>
              <div className="modal-body">
                <div style={{ marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                  <div><strong>Supplier:</strong> {selectedPoForShipment.supplier_name}</div>
                  <div><strong>PO Total:</strong> {formatCurrency(selectedPoForShipment.total_amount)}</div>
                </div>

                <div className="form-grid">
                  <div className="form-group col-span-2">
                    <label className="form-label">Transport Document / Consignment No *</label>
                    <input 
                      type="text"
                      className="form-input"
                      value={shipmentForm.transport_document_no}
                      onChange={e => setShipmentForm({ ...shipmentForm, transport_document_no: e.target.value })}
                      required
                      placeholder="e.g. VRL-LR-987654 or GATI-AWB-112233"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Shipment Date *</label>
                    <input 
                      type="date"
                      className="form-input"
                      value={shipmentForm.shipment_date}
                      onChange={e => setShipmentForm({ ...shipmentForm, shipment_date: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Expected Date</label>
                    <input 
                      type="date"
                      className="form-input"
                      value={shipmentForm.expected_date}
                      onChange={e => setShipmentForm({ ...shipmentForm, expected_date: e.target.value })}
                    />
                  </div>

                  <div className="form-group col-span-2">
                    <label className="form-label">Shipment Status</label>
                    <select 
                      className="form-select"
                      value={shipmentForm.status}
                      onChange={e => setShipmentForm({ ...shipmentForm, status: e.target.value })}
                    >
                      <option value="DELIVERED">DELIVERED (Ready for Receiving Dock)</option>
                      <option value="IN_TRANSIT">IN_TRANSIT (Dispatched by Supplier)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setIsShipmentModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmittingShipment}>
                  {isSubmittingShipment ? 'Saving...' : 'Record Shipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: CREATE GOODS RECEIPT NOTE (GRN)
          ===================================================================== */}
      {isGrnModalOpen && selectedPoForGrn && (
        <div className="modal-overlay">
          <div className="modal-card modal-card-lg">
            <div className="modal-header">
              <h3 className="modal-title">📦 Generate Goods Receipt Note for {selectedPoForGrn.order_number}</h3>
              <button className="modal-close-btn" onClick={() => setIsGrnModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleSubmitGrn}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Receiving Location *</label>
                    <input 
                      type="text" 
                      className="form-input"
                      value={grnForm.location}
                      onChange={e => setGrnForm({ ...grnForm, location: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Supplier Bill / Challan No *</label>
                    <input 
                      type="text" 
                      className="form-input"
                      value={grnForm.bill_number}
                      onChange={e => setGrnForm({ ...grnForm, bill_number: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Received Date *</label>
                    <input 
                      type="date" 
                      className="form-input"
                      value={grnForm.received_date}
                      onChange={e => setGrnForm({ ...grnForm, received_date: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Received By (Staff Name) *</label>
                    <input 
                      type="text" 
                      className="form-input"
                      value={grnForm.received_by}
                      onChange={e => setGrnForm({ ...grnForm, received_by: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '16px' }}>
                  Received Item Verification & Batch Entry
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Specify accepted and rejected quantities. Only accepted units will increase live inventory upon verification.
                </p>

                <table className="item-edit-table">
                  <thead>
                    <tr>
                      <th>Product & Format</th>
                      <th>Ordered</th>
                      <th>Received</th>
                      <th>Accepted</th>
                      <th>Rejected</th>
                      <th>Batch No</th>
                      <th>Rate (₹)</th>
                      <th>Net Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grnFormItems.map((item, idx) => {
                      const lineNet = item.quantity_accepted * item.purchase_rate;

                      return (
                        <tr key={idx}>
                          <td>
                            <strong>{item.product_name}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.format}</div>
                          </td>
                          <td style={{ textAlign: 'center' }}>{item.quantity_ordered}</td>
                          <td style={{ width: '80px' }}>
                            <input 
                              type="number"
                              min="0"
                              value={item.quantity_received}
                              onChange={e => handleGrnItemQtyChange(idx, 'quantity_received', e.target.value)}
                              required
                            />
                          </td>
                          <td style={{ width: '80px' }}>
                            <input 
                              type="number"
                              min="0"
                              value={item.quantity_accepted}
                              onChange={e => handleGrnItemQtyChange(idx, 'quantity_accepted', e.target.value)}
                              required
                            />
                          </td>
                          <td style={{ width: '80px' }}>
                            <input 
                              type="number"
                              min="0"
                              value={item.quantity_rejected}
                              onChange={e => handleGrnItemQtyChange(idx, 'quantity_rejected', e.target.value)}
                            />
                          </td>
                          <td style={{ width: '140px' }}>
                            <input 
                              type="text"
                              value={item.batch_no}
                              onChange={e => handleGrnItemQtyChange(idx, 'batch_no', e.target.value)}
                              placeholder="Batch #"
                            />
                          </td>
                          <td>{formatCurrency(item.purchase_rate)}</td>
                          <td style={{ fontWeight: 600, color: 'var(--success)' }}>{formatCurrency(lineNet)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="summary-callout">
                  <div>
                    <span className="stat-label">Accepted: </span>
                    <strong style={{ color: 'var(--success)' }}>+{grnTotalAccepted} units</strong>
                    {grnTotalRejected > 0 && (
                      <span style={{ color: 'var(--danger)', marginLeft: '8px' }}>
                        ({grnTotalRejected} rejected)
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="stat-label">Total GRN Value: </span>
                    <span className="stat-val">{formatCurrency(grnTotalValue)}</span>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setIsGrnModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmittingGrn}>
                  {isSubmittingGrn ? 'Generating GRN...' : 'Save GRN in PENDING Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: CONFIRMATION BEFORE POSTING INVENTORY
          ===================================================================== */}
      {isVerifyModalOpen && selectedGrnForVerify && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header" style={{ backgroundColor: '#fffbeb', borderBottomColor: '#fde68a' }}>
              <h3 className="modal-title" style={{ color: '#92400e' }}>
                Confirm Stock Posting to Inventory
              </h3>
              <button className="modal-close-btn" onClick={() => setIsVerifyModalOpen(false)}>×</button>
            </div>

            <div className="modal-body">
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '14px', marginBottom: '18px', fontSize: '0.875rem', color: '#92400e' }}>
                <strong>Inventory Verification Summary:</strong>
                <p style={{ marginTop: '4px' }}>
                  Verifying this goods receipt will formally accept the items and update stock records:
                </p>
                <ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
                  <li>Current warehouse inventory will be incremented by accepted quantities.</li>
                  <li>Inward stock movement audit records will be permanently logged.</li>
                  <li>Associated purchase order will be marked as fulfilled/received.</li>
                  <li>Goods receipt status will be locked to prevent duplicate posting.</li>
                </ul>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '6px', fontSize: '0.875rem' }}>
                <div><strong>GRN Number:</strong> <span className="font-mono">{selectedGrnForVerify.grn_number}</span></div>
                <div><strong>Purchase Order:</strong> <span className="font-mono">{selectedGrnForVerify.order_number}</span></div>
                <div><strong>Supplier:</strong> {selectedGrnForVerify.supplier_name}</div>
                <div><strong>Units to Ingest:</strong> <strong style={{ color: 'var(--success)' }}>+{selectedGrnForVerify.total_accepted} units</strong></div>
                <div style={{ gridColumn: 'span 2' }}>
                  <strong>Inventory Value Added:</strong> <strong style={{ color: 'var(--primary)' }}>{formatCurrency(selectedGrnForVerify.total_value)}</strong>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label">Verifier Staff Signature / Name *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={verifiedByName} 
                  onChange={e => setVerifiedByName(e.target.value)}
                  placeholder="e.g. Store Manager / Senior Receiver"
                  required
                />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setIsVerifyModalOpen(false)} disabled={isVerifying}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ backgroundColor: '#d97706', borderColor: '#d97706' }}
                onClick={handleExecuteVerification}
                disabled={isVerifying}
              >
                {isVerifying ? 'Verifying & Posting Inventory...' : 'Confirm & Post Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
