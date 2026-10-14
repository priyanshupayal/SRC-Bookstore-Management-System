/**
 * Dashboard Controller
 * Read-only aggregation endpoints for SRC Bookstore Management System
 */

const { getPool, sql } = require('../config/db');

/**
 * GET /api/dashboard/stats
 * Aggregated key metrics across core business entities
 */
async function getDashboardStats(req, res) {
  try {
    const pool = await getPool();

    const statsQuery = `
      SELECT
        -- Inventory & Catalog
        (SELECT COUNT(*) FROM dbo.products WHERE active = 1) AS total_products,
        (SELECT COUNT(*) FROM dbo.product_variants WHERE active = 1) AS total_variants,
        (SELECT ISNULL(SUM(quantity_on_hand), 0) FROM dbo.inventory) AS total_physical_stock,
        (
          SELECT ISNULL(SUM(i.quantity_on_hand * pv.purchase_price), 0.00)
          FROM dbo.inventory i
          JOIN dbo.product_variants pv ON i.product_variant_id = pv.id
        ) AS total_inventory_valuation,
        (
          SELECT COUNT(*)
          FROM dbo.inventory i
          JOIN dbo.product_variants pv ON i.product_variant_id = pv.id
          WHERE i.quantity_on_hand <= pv.minimum_stock
        ) AS low_stock_alerts,

        -- Sales & Revenue
        (SELECT COUNT(*) FROM dbo.sales WHERE status = 'COMPLETED') AS completed_sales_count,
        (SELECT ISNULL(SUM(net_payable), 0.00) FROM dbo.sales WHERE status = 'COMPLETED') AS total_sales_revenue,
        (SELECT COUNT(*) FROM dbo.payments WHERE status = 'COMPLETED') AS completed_payments_count,

        -- Procurement & Inward GRN
        (SELECT COUNT(*) FROM dbo.purchase_orders) AS total_purchase_orders,
        (SELECT COUNT(*) FROM dbo.purchase_orders WHERE status = 'RECEIVED') AS received_purchase_orders,
        (SELECT COUNT(*) FROM dbo.goods_receipts WHERE verification_status = 'VERIFIED') AS verified_grns_count,

        -- Credit & Receivables
        (SELECT COUNT(*) FROM dbo.receivables WHERE status IN ('OPEN', 'PARTIAL')) AS pending_receivables_count,
        (SELECT ISNULL(SUM(outstanding_amount), 0.00) FROM dbo.receivables WHERE status IN ('OPEN', 'PARTIAL')) AS total_outstanding_credit,

        -- Damaged Stock Write-offs
        (SELECT COUNT(*) FROM dbo.write_offs) AS total_writeoffs_count,
        (SELECT ISNULL(SUM(total_cost), 0.00) FROM dbo.write_offs) AS total_writeoffs_valuation
    `;

    const result = await pool.request().query(statsQuery);
    const row = result.recordset[0] || {};

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        inventory: {
          totalProducts: row.total_products || 0,
          totalVariants: row.total_variants || 0,
          totalStockUnits: row.total_physical_stock || 0,
          inventoryValuation: parseFloat(row.total_inventory_valuation || 0),
          lowStockAlerts: row.low_stock_alerts || 0
        },
        sales: {
          completedSalesCount: row.completed_sales_count || 0,
          totalRevenue: parseFloat(row.total_sales_revenue || 0),
          completedPaymentsCount: row.completed_payments_count || 0
        },
        procurement: {
          totalPurchaseOrders: row.total_purchase_orders || 0,
          receivedPurchaseOrders: row.received_purchase_orders || 0,
          verifiedGrnsCount: row.verified_grns_count || 0
        },
        credit: {
          pendingReceivablesCount: row.pending_receivables_count || 0,
          totalOutstandingCredit: parseFloat(row.total_outstanding_credit || 0)
        },
        writeoffs: {
          totalWriteoffsCount: row.total_writeoffs_count || 0,
          totalWriteoffsValuation: parseFloat(row.total_writeoffs_valuation || 0)
        }
      }
    });
  } catch (err) {
    console.error('[Dashboard Stats Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard statistics from database.'
    });
  }
}

/**
 * GET /api/dashboard/recent-activity
 * Returns recent stock movements and sales transactions
 */
async function getRecentActivity(req, res) {
  try {
    const pool = await getPool();

    // 1. Recent Stock Movements
    const movementsQuery = `
      SELECT TOP 8
        sm.id,
        sm.movement_type,
        sm.quantity,
        sm.unit_cost,
        sm.total_cost,
        sm.reference_type,
        sm.reference_id,
        sm.movement_date,
        sm.remarks,
        p.name AS product_name,
        pv.format
      FROM dbo.stock_movements sm
      JOIN dbo.product_variants pv ON sm.product_variant_id = pv.id
      JOIN dbo.products p ON pv.product_id = p.id
      ORDER BY sm.movement_date DESC, sm.id DESC;
    `;

    // 2. Recent Completed Sales
    const salesQuery = `
      SELECT TOP 5
        s.id,
        s.sale_number,
        s.sale_date,
        s.net_payable,
        s.sale_type,
        s.status,
        ISNULL(c.name, 'Walk-in Retail Customer') AS customer_name
      FROM dbo.sales s
      LEFT JOIN dbo.customers c ON s.customer_id = c.id
      WHERE s.status = 'COMPLETED'
      ORDER BY s.sale_date DESC, s.id DESC;
    `;

    // 3. Low Stock Items
    const lowStockQuery = `
      SELECT
        i.id,
        p.name AS product_name,
        p.category,
        pv.format,
        i.quantity_on_hand,
        pv.minimum_stock,
        pv.selling_price
      FROM dbo.inventory i
      JOIN dbo.product_variants pv ON i.product_variant_id = pv.id
      JOIN dbo.products p ON pv.product_id = p.id
      WHERE i.quantity_on_hand <= pv.minimum_stock
      ORDER BY (i.quantity_on_hand - pv.minimum_stock) ASC;
    `;

    const [movementsRes, salesRes, lowStockRes] = await Promise.all([
      pool.request().query(movementsQuery),
      pool.request().query(salesQuery),
      pool.request().query(lowStockQuery)
    ]);

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      recentMovements: movementsRes.recordset,
      recentSales: salesRes.recordset,
      lowStockAlerts: lowStockRes.recordset
    });
  } catch (err) {
    console.error('[Dashboard Activity Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve recent activity.'
    });
  }
}

module.exports = {
  getDashboardStats,
  getRecentActivity
};
