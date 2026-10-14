/**
 * Damaged Stock Write-off Workflow Controller
 * SRC Bookstore Management System
 * Enforces least-privilege operations, transactional safety, and procedure execution
 * Reuses dbo.usp_ProcessWriteOff for live inventory deduction and ledger movement posting
 */

const { sql, getPool } = require('../config/db');

/**
 * GET /api/writeoffs
 * List all write-offs with product variant details, cost valuation, and ledger processing status
 */
async function getWriteOffs(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        wo.id,
        wo.product_variant_id,
        p.name AS product_name,
        pv.format,
        p.category,
        wo.quantity,
        wo.unit_cost,
        wo.total_cost,
        wo.reason,
        wo.write_off_date,
        wo.notes,
        CASE WHEN sm.id IS NOT NULL THEN 1 ELSE 0 END AS is_processed,
        sm.id AS stock_movement_id,
        sm.movement_date AS processed_at,
        sm.remarks AS movement_remarks,
        inv.quantity_on_hand AS live_qoh
      FROM dbo.write_offs wo
      JOIN dbo.product_variants pv ON wo.product_variant_id = pv.id
      JOIN dbo.products p ON pv.product_id = p.id
      LEFT JOIN dbo.inventory inv ON pv.id = inv.product_variant_id
      LEFT JOIN dbo.stock_movements sm 
        ON sm.reference_type = 'write_offs' 
        AND sm.reference_id = wo.id
      ORDER BY wo.id DESC;
    `);

    res.json({
      success: true,
      writeOffs: result.recordset
    });
  } catch (err) {
    console.error('[WriteOff Error - getWriteOffs]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve write-offs from database.'
    });
  }
}

/**
 * GET /api/writeoffs/variants
 * List active product variants with current live inventory quantity and purchase cost for write-off selection
 */
async function getWriteOffVariants(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        pv.id AS product_variant_id,
        p.name AS product_name,
        pv.format,
        p.category,
        pv.purchase_price AS unit_cost,
        pv.selling_price,
        ISNULL(inv.quantity_on_hand, 0) AS live_qoh,
        pv.minimum_stock
      FROM dbo.product_variants pv
      JOIN dbo.products p ON pv.product_id = p.id
      LEFT JOIN dbo.inventory inv ON pv.id = inv.product_variant_id
      WHERE pv.active = 1 AND p.active = 1
      ORDER BY p.name ASC, pv.format ASC;
    `);

    res.json({
      success: true,
      variants: result.recordset
    });
  } catch (err) {
    console.error('[WriteOff Error - getWriteOffVariants]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve variants for write-off.'
    });
  }
}

/**
 * POST /api/writeoffs
 * Creates a new write-off record adhering strictly to the dbo.write_offs schema
 */
async function createWriteOff(req, res, next) {
  const { product_variant_id, quantity, unit_cost, reason, write_off_date, notes } = req.body;

  const variantId = parseInt(product_variant_id, 10);
  if (isNaN(variantId) || variantId <= 0) {
    return res.status(400).json({ success: false, error: 'A valid product variant ID is required.' });
  }

  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ success: false, error: 'Damaged write-off quantity must be strictly greater than zero.' });
  }

  const cost = parseFloat(unit_cost);
  if (isNaN(cost) || cost < 0) {
    return res.status(400).json({ success: false, error: 'Unit cost cannot be negative.' });
  }

  if (!reason || reason.trim() === '') {
    return res.status(400).json({ success: false, error: 'Write-off reason is strictly required.' });
  }

  const totalCost = qty * cost;
  const woDate = write_off_date ? new Date(write_off_date) : new Date();

  try {
    const pool = await getPool();

    // Check variant exists and get current stock
    const varCheck = await pool.request()
      .input('variant_id', sql.BigInt, variantId)
      .query(`
        SELECT pv.id, p.name, pv.format, ISNULL(i.quantity_on_hand, 0) AS live_qoh
        FROM dbo.product_variants pv
        JOIN dbo.products p ON pv.product_id = p.id
        LEFT JOIN dbo.inventory i ON pv.id = i.product_variant_id
        WHERE pv.id = @variant_id AND pv.active = 1;
      `);

    if (varCheck.recordset.length === 0) {
      return res.status(400).json({ success: false, error: 'Specified product variant does not exist or is inactive.' });
    }

    const currentQoh = varCheck.recordset[0].live_qoh;
    if (qty > currentQoh) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock: Cannot create write-off for ${qty} units. Current stock is only ${currentQoh} units.`
      });
    }

    // Insert into dbo.write_offs
    const insertRes = await pool.request()
      .input('variant_id', sql.BigInt, variantId)
      .input('quantity', sql.Int, qty)
      .input('unit_cost', sql.Decimal(18, 2), cost)
      .input('total_cost', sql.Decimal(18, 2), totalCost)
      .input('reason', sql.VarChar(255), reason.trim())
      .input('write_off_date', sql.Date, woDate)
      .input('notes', sql.VarChar(sql.MAX), notes ? notes.trim() : null)
      .query(`
        INSERT INTO dbo.write_offs (
          product_variant_id, quantity, unit_cost, total_cost, reason, write_off_date, notes
        )
        VALUES (
          @variant_id, @quantity, @unit_cost, @total_cost, @reason, @write_off_date, @notes
        );
        SELECT SCOPE_IDENTITY() AS id;
      `);

    const newId = insertRes.recordset[0].id;

    res.status(201).json({
      success: true,
      message: 'Write-off record created successfully in draft state.',
      data: {
        id: newId,
        product_variant_id: variantId,
        productName: varCheck.recordset[0].name,
        format: varCheck.recordset[0].format,
        quantity: qty,
        unit_cost: cost,
        total_cost: totalCost,
        reason: reason.trim(),
        write_off_date: woDate.toISOString().split('T')[0],
        notes: notes ? notes.trim() : null,
        currentQoh
      }
    });
  } catch (err) {
    console.error('[WriteOff Error - createWriteOff]:', err.message);
    res.status(400).json({
      success: false,
      error: err.message || 'Failed to create write-off record.'
    });
  }
}

/**
 * POST /api/writeoffs/:id/process
 * Confirms and processes the write-off using dbo.usp_ProcessWriteOff
 * Deducts live inventory and inserts matching negative stock movement
 */
async function processWriteOff(req, res, next) {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Write-off ID is required for processing.' });
  }

  try {
    const pool = await getPool();
    const procReq = pool.request();
    procReq.input('write_off_id', sql.BigInt, id);

    // Outputs
    procReq.output('movement_id_out', sql.BigInt);
    procReq.output('new_qoh_out', sql.Int);

    const procRes = await procReq.execute('dbo.usp_ProcessWriteOff');

    const resultData = procRes.recordset && procRes.recordset.length > 0
      ? procRes.recordset[0]
      : {
          write_off_id: id,
          stock_movement_id: procRes.output.movement_id_out,
          new_quantity_on_hand: procRes.output.new_qoh_out,
          result_message: 'Damaged stock written off and inventory deducted successfully.'
        };

    res.json({
      success: true,
      message: resultData.result_message || 'Damaged stock written off and inventory deducted successfully.',
      data: {
        writeOffId: resultData.write_off_id,
        productVariantId: resultData.product_variant_id,
        stockMovementId: resultData.stock_movement_id,
        movementType: resultData.movement_type || 'WRITE_OFF',
        quantityMovement: resultData.quantity_movement,
        previousQoh: resultData.previous_quantity_on_hand,
        newQoh: resultData.new_quantity_on_hand,
        unitCost: resultData.unit_cost,
        totalValuationImpact: resultData.total_valuation_impact
      }
    });
  } catch (err) {
    console.error('[WriteOff Error - processWriteOff]:', err.message);
    res.status(400).json({
      success: false,
      error: err.message || 'Write-off processing failed.'
    });
  }
}

/**
 * GET /api/writeoffs/:id/movements
 * Retrieve the matching negative stock movement created for this write-off
 */
async function getWriteOffMovements(req, res, next) {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('write_off_id', sql.BigInt, id)
      .query(`
        SELECT 
          sm.id,
          sm.product_variant_id,
          p.name AS product_name,
          pv.format,
          sm.movement_type,
          sm.quantity,
          sm.unit_cost,
          sm.total_cost,
          sm.reference_type,
          sm.reference_id,
          sm.movement_date,
          sm.remarks
        FROM dbo.stock_movements sm
        JOIN dbo.product_variants pv ON sm.product_variant_id = pv.id
        JOIN dbo.products p ON pv.product_id = p.id
        WHERE sm.reference_type = 'write_offs' 
          AND sm.reference_id = @write_off_id
        ORDER BY sm.id DESC;
      `);

    res.json({
      success: true,
      movements: result.recordset
    });
  } catch (err) {
    console.error('[WriteOff Error - getWriteOffMovements]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve stock movements for write-off.'
    });
  }
}

module.exports = {
  getWriteOffs,
  getWriteOffVariants,
  createWriteOff,
  processWriteOff,
  getWriteOffMovements
};
