/**
 * API Service Client
 * Handles communication between React UI and Express Backend
 */

const API_BASE = '/api';

/**
 * Fetch system health and SQL Server connection info
 */
export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) {
    throw new Error(`Health check failed with HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch aggregated dashboard metrics
 */
export async function fetchDashboardStats() {
  const res = await fetch(`${API_BASE}/dashboard/stats`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch dashboard stats (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Fetch recent activity (stock movements, sales, alerts)
 */
export async function fetchRecentActivity() {
  const res = await fetch(`${API_BASE}/dashboard/recent-activity`);
  if (!res.ok) {
    throw new Error(`Failed to fetch recent activity (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Fetch live inventory items with filtering & search
 */
export async function fetchInventory({ search = '', category = '', status = 'ALL', sortBy = 'product_name', sortDir = 'ASC' } = {}) {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (category && category !== 'ALL') params.append('category', category);
  if (status && status !== 'ALL') params.append('status', status);
  if (sortBy) params.append('sortBy', sortBy);
  if (sortDir) params.append('sortDir', sortDir);

  const res = await fetch(`${API_BASE}/inventory?${params.toString()}`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch inventory (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Fetch product categories for filtering dropdown
 */
export async function fetchCategories() {
  const res = await fetch(`${API_BASE}/inventory/categories`);
  if (!res.ok) {
    throw new Error(`Failed to fetch categories (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Purchases & GRN APIs
 */

export async function fetchSuppliers() {
  const res = await fetch(`${API_BASE}/purchases/suppliers`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch suppliers (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchProductVariants() {
  const res = await fetch(`${API_BASE}/purchases/variants`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch product variants (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchPurchaseOrders() {
  const res = await fetch(`${API_BASE}/purchases/orders`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch purchase orders (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchPurchaseOrderById(id) {
  const res = await fetch(`${API_BASE}/purchases/orders/${id}`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch purchase order #${id} (HTTP ${res.status})`);
  }
  return res.json();
}

export async function createPurchaseOrder(poData) {
  const res = await fetch(`${API_BASE}/purchases/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(poData)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Failed to create purchase order (HTTP ${res.status})`);
  }
  return data;
}

export async function createShipment(shipmentData) {
  const res = await fetch(`${API_BASE}/purchases/shipments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(shipmentData)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Failed to record shipment (HTTP ${res.status})`);
  }
  return data;
}

export async function fetchGoodsReceipts() {
  const res = await fetch(`${API_BASE}/purchases/grns`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch goods receipts (HTTP ${res.status})`);
  }
  return res.json();
}

export async function createGoodsReceipt(grnData) {
  const res = await fetch(`${API_BASE}/purchases/grns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(grnData)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Failed to create goods receipt (HTTP ${res.status})`);
  }
  return data;
}

export async function verifyGoodsReceipt(grnId, verifiedBy = 'Store Staff') {
  const res = await fetch(`${API_BASE}/purchases/grns/${grnId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verified_by: verifiedBy })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Failed to verify GRN (HTTP ${res.status})`);
  }
  return data;
}

/**
 * Sales & Payments APIs
 */

export async function fetchCustomers() {
  const res = await fetch(`${API_BASE}/sales/customers`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch customers (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchSales() {
  const res = await fetch(`${API_BASE}/sales`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch sales (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchSaleById(id) {
  const res = await fetch(`${API_BASE}/sales/${id}`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch sale #${id} (HTTP ${res.status})`);
  }
  return res.json();
}

export async function createDraftSale(saleData) {
  const res = await fetch(`${API_BASE}/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(saleData)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Failed to create draft sale (HTTP ${res.status})`);
  }
  return data;
}

export async function completeSale(saleId, completedBy = 'Store Cashier') {
  const res = await fetch(`${API_BASE}/sales/${saleId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed_by: completedBy })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Failed to complete sale (HTTP ${res.status})`);
  }
  return data;
}

export async function recordSalePayment(saleId, paymentData) {
  const res = await fetch(`${API_BASE}/sales/${saleId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paymentData)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Failed to record payment (HTTP ${res.status})`);
  }
  return data;
}

export async function fetchSaleReceipts(saleId) {
  const res = await fetch(`${API_BASE}/sales/${saleId}/receipts`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch receipts (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Fetch all sales receipts across all orders (Receipts Registry)
 */
export async function fetchAllReceipts() {
  const res = await fetch(`${API_BASE}/sales/receipts`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch receipts ledger (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Credit & Receivables APIs
 */

export async function fetchReceivables() {
  const res = await fetch(`${API_BASE}/credit/receivables`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch receivables (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchEligibleCreditSales() {
  const res = await fetch(`${API_BASE}/credit/eligible-sales`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch eligible credit sales (HTTP ${res.status})`);
  }
  return res.json();
}

export async function createCreditReceivable(data) {
  const res = await fetch(`${API_BASE}/credit/receivables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const resData = await res.json();
  if (!res.ok) {
    throw new Error(resData.error || `Failed to create credit receivable (HTTP ${res.status})`);
  }
  return resData;
}

export async function settleCreditReceivable(receivableId, data) {
  const res = await fetch(`${API_BASE}/credit/receivables/${receivableId}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const resData = await res.json();
  if (!res.ok) {
    throw new Error(resData.error || `Failed to settle credit receivable (HTTP ${res.status})`);
  }
  return resData;
}

export async function fetchReceivableReceipts(receivableId) {
  const res = await fetch(`${API_BASE}/credit/receivables/${receivableId}/receipts`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch receivable receipts (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Damaged Stock Write-offs APIs
 */

export async function fetchWriteOffs() {
  const res = await fetch(`${API_BASE}/writeoffs`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch write-offs (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchWriteOffVariants() {
  const res = await fetch(`${API_BASE}/writeoffs/variants`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch write-off product variants (HTTP ${res.status})`);
  }
  return res.json();
}

export async function createWriteOff(data) {
  const res = await fetch(`${API_BASE}/writeoffs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const resData = await res.json();
  if (!res.ok) {
    throw new Error(resData.error || `Failed to create write-off record (HTTP ${res.status})`);
  }
  return resData;
}

export async function processWriteOff(writeOffId) {
  const res = await fetch(`${API_BASE}/writeoffs/${writeOffId}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const resData = await res.json();
  if (!res.ok) {
    throw new Error(resData.error || `Failed to process write-off (HTTP ${res.status})`);
  }
  return resData;
}

export async function fetchWriteOffMovements(writeOffId) {
  const res = await fetch(`${API_BASE}/writeoffs/${writeOffId}/movements`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch write-off stock movements (HTTP ${res.status})`);
  }
  return res.json();
}

