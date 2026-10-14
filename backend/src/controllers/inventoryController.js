/**
 * Inventory Controller
 * Read-only inventory catalog queries using parameterized SQL Server queries
 */

const { getPool, sql } = require('../config/db');

/**
 * GET /api/inventory
 * Retrieves list of inventory items with product variant details and stock levels
 * Query parameters: search, category, status (ALL | LOW_STOCK | HEALTHY), sortBy, sortDir
 */
async function getInventory(req, res) {
  try {
    const {
      search = '',
      category = '',
      status = 'ALL',
      sortBy = 'product_name',
      sortDir = 'ASC'
    } = req.query;

    const pool = await getPool();
    const request = pool.request();

    let whereClauses = ['p.active = 1', 'pv.active = 1'];

    // 1. Search filter (Product name, ISBN, or format)
    if (search && search.trim() !== '') {
      request.input('searchTerm', sql.NVarChar(100), `%${search.trim()}%`);
      whereClauses.push('(p.name LIKE @searchTerm OR p.isbn LIKE @searchTerm OR pv.format LIKE @searchTerm)');
    }

    // 2. Category filter
    if (category && category.trim() !== '' && category !== 'ALL') {
      request.input('categoryFilter', sql.NVarChar(100), category.trim());
      whereClauses.push('p.category = @categoryFilter');
    }

    // 3. Stock status filter
    if (status === 'LOW_STOCK') {
      whereClauses.push('i.quantity_on_hand <= pv.minimum_stock');
    } else if (status === 'HEALTHY') {
      whereClauses.push('i.quantity_on_hand > pv.minimum_stock');
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Validate sort parameters to prevent SQL injection
    const allowedSortCols = {
      product_name: 'p.name',
      quantity_on_hand: 'i.quantity_on_hand',
      selling_price: 'pv.selling_price',
      purchase_price: 'pv.purchase_price',
      format: 'pv.format',
      category: 'p.category'
    };
    const sortColumn = allowedSortCols[sortBy] || 'p.name';
    const sortDirection = sortDir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const query = `
      SELECT
        i.id AS inventory_id,
        pv.id AS variant_id,
        p.id AS product_id,
        p.name AS product_name,
        p.category,
        p.item_type,
        ISNULL(p.isbn, 'N/A') AS isbn,
        pv.format,
        pv.selling_price,
        pv.purchase_price,
        pv.minimum_stock,
        i.quantity_on_hand,
        CAST((i.quantity_on_hand * pv.purchase_price) AS DECIMAL(18,2)) AS stock_valuation,
        CASE
          WHEN i.quantity_on_hand <= pv.minimum_stock THEN 'LOW_STOCK'
          ELSE 'HEALTHY'
        END AS stock_status,
        i.updated_at
      FROM dbo.inventory i
      JOIN dbo.product_variants pv ON i.product_variant_id = pv.id
      JOIN dbo.products p ON pv.product_id = p.id
      ${whereSql}
      ORDER BY ${sortColumn} ${sortDirection}, pv.format ASC;
    `;

    const result = await request.query(query);

    // Calculate in-memory aggregates for current result set
    const items = result.recordset || [];
    const totalUnits = items.reduce((sum, item) => sum + (item.quantity_on_hand || 0), 0);
    const totalValuation = items.reduce((sum, item) => sum + (parseFloat(item.stock_valuation) || 0), 0);
    const lowStockCount = items.filter(item => item.stock_status === 'LOW_STOCK').length;

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: items.length,
      summary: {
        totalUnits,
        totalValuation,
        lowStockCount
      },
      items
    });
  } catch (err) {
    console.error('[Inventory Query Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve inventory records.'
    });
  }
}

/**
 * GET /api/inventory/categories
 * Returns distinct active product categories
 */
async function getCategories(req, res) {
  try {
    const pool = await getPool();
    const query = `
      SELECT DISTINCT category
      FROM dbo.products
      WHERE active = 1 AND category IS NOT NULL AND LTRIM(RTRIM(category)) <> ''
      ORDER BY category ASC;
    `;
    const result = await pool.request().query(query);
    const categories = result.recordset.map(row => row.category);

    return res.json({
      success: true,
      categories
    });
  } catch (err) {
    console.error('[Categories Query Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve product categories.'
    });
  }
}

module.exports = {
  getInventory,
  getCategories
};
