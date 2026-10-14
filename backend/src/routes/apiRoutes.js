/**
 * Central API Routes
 * SRC Bookstore Management System
 */

const express = require('express');
const router = express.Router();

const { getHealth } = require('../controllers/healthController');
const { getDashboardStats, getRecentActivity } = require('../controllers/dashboardController');
const { getInventory, getCategories } = require('../controllers/inventoryController');

const {
  getSuppliers,
  getProductVariants,
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  createShipment,
  getGoodsReceipts,
  createGoodsReceipt,
  verifyGoodsReceipt
} = require('../controllers/purchasesController');

const {
  getCustomers,
  getSales,
  getSaleById,
  createDraftSale,
  completeSale,
  recordPayment,
  getSaleReceipts,
  getAllReceipts
} = require('../controllers/salesController');

const {
  getReceivables,
  getEligibleCreditSales,
  createReceivable,
  settleReceivable,
  getReceivableReceipts
} = require('../controllers/creditController');

const {
  getWriteOffs,
  getWriteOffVariants,
  createWriteOff,
  processWriteOff,
  getWriteOffMovements
} = require('../controllers/writeoffController');

// 1. Health & Diagnostics
router.get('/health', getHealth);

// 2. Dashboard Aggregates
router.get('/dashboard/stats', getDashboardStats);
router.get('/dashboard/recent-activity', getRecentActivity);

// 3. Inventory Catalog & Stock
router.get('/inventory', getInventory);
router.get('/inventory/categories', getCategories);

// 4. Purchases & GRN Workflow
router.get('/purchases/suppliers', getSuppliers);
router.get('/purchases/variants', getProductVariants);
router.get('/purchases/orders', getPurchaseOrders);
router.get('/purchases/orders/:id', getPurchaseOrderById);
router.post('/purchases/orders', createPurchaseOrder);
router.post('/purchases/shipments', createShipment);
router.get('/purchases/grns', getGoodsReceipts);
router.post('/purchases/grns', createGoodsReceipt);
router.post('/purchases/grns/:id/verify', verifyGoodsReceipt);

// 5. Sales & Payments Workflow
router.get('/sales/customers', getCustomers);
router.get('/sales/receipts', getAllReceipts);
router.get('/sales', getSales);
router.get('/sales/:id', getSaleById);
router.post('/sales', createDraftSale);
router.post('/sales/:id/complete', completeSale);
router.post('/sales/:id/payments', recordPayment);
router.get('/sales/:id/receipts', getSaleReceipts);

// 6. Credit & Receivables Workflow
router.get('/credit/receivables', getReceivables);
router.get('/credit/eligible-sales', getEligibleCreditSales);
router.post('/credit/receivables', createReceivable);
router.post('/credit/receivables/:id/settle', settleReceivable);
router.get('/credit/receivables/:id/receipts', getReceivableReceipts);

// 7. Damaged Stock Write-offs Workflow
router.get('/writeoffs', getWriteOffs);
router.get('/writeoffs/variants', getWriteOffVariants);
router.post('/writeoffs', createWriteOff);
router.post('/writeoffs/:id/process', processWriteOff);
router.get('/writeoffs/:id/movements', getWriteOffMovements);

module.exports = router;
