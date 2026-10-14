/**
 * Purchases & GRN Workflow Controller
 * SRC Bookstore Management System
 * Enforces least-privilege operations, transactional safety, and procedure execution
 */

const { sql, getPool } = require('../config/db');

/**
 * GET /api/purchases/suppliers
 * List active suppliers for PO creation
 */
async function getSuppliers(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        id, 
        name, 
        supplier_code, 
        gstin, 
        contact_person, 
        phone, 
        email, 
        address
      FROM dbo.suppliers
      WHERE active = 1
      ORDER BY name ASC;
    `);

    res.json({
      success: true,
      suppliers: result.recordset
    });
  } catch (err) {
    console.error('[Purchases Error - getSuppliers]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve suppliers from database.'
    });
  }
}

/**
 * GET /api/purchases/variants
 * List product variants with live stock for PO line item selection
 */
async function getProductVariants(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        pv.id AS variant_id,
        p.id AS product_id,
        p.name AS product_name,
        p.category,
        p.item_type,
        p.isbn,
        pv.format,
        pv.purchase_price,
        pv.selling_price,
        ISNULL(inv.quantity_on_hand, 0) AS quantity_on_hand
      FROM dbo.product_variants pv
      JOIN dbo.products p ON pv.product_id = p.id
      LEFT JOIN dbo.inventory inv ON pv.id = inv.product_variant_id
      ORDER BY p.name ASC, pv.format ASC;
    `);

    res.json({
      success: true,
      variants: result.recordset
    });
  } catch (err) {
    console.error('[Purchases Error - getProductVariants]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve product variants.'
    });
  }
}

/**
 * GET /api/purchases/orders
 * List purchase orders with linked shipment and GRN statuses
 */
async function getPurchaseOrders(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        po.id,
        po.order_number,
        po.supplier_id,
        s.name AS supplier_name,
        s.contact_person AS supplier_contact,
        s.phone AS supplier_phone,
        po.order_date,
        po.expected_delivery_date,
        po.status,
        po.total_amount,
        po.notes,
        po.created_at,
        po.updated_at,
        (SELECT COUNT(*) FROM dbo.purchase_order_items poi WHERE poi.purchase_order_id = po.id) AS items_count,
        (SELECT COUNT(*) FROM dbo.shipments sh WHERE sh.purchase_order_id = po.id) AS shipment_count,
        (SELECT TOP 1 sh.status FROM dbo.shipments sh WHERE sh.purchase_order_id = po.id ORDER BY sh.id DESC) AS latest_shipment_status,
        (SELECT TOP 1 sh.transport_document_no FROM dbo.shipments sh WHERE sh.purchase_order_id = po.id ORDER BY sh.id DESC) AS latest_shipment_tracking,
        (SELECT TOP 1 sh.id FROM dbo.shipments sh WHERE sh.purchase_order_id = po.id ORDER BY sh.id DESC) AS latest_shipment_id,
        (SELECT COUNT(*) FROM dbo.goods_receipts gr WHERE gr.purchase_order_id = po.id) AS grn_count,
        (SELECT TOP 1 gr.id FROM dbo.goods_receipts gr WHERE gr.purchase_order_id = po.id ORDER BY gr.id DESC) AS latest_grn_id,
        (SELECT TOP 1 gr.grn_number FROM dbo.goods_receipts gr WHERE gr.purchase_order_id = po.id ORDER BY gr.id DESC) AS latest_grn_number,
        (SELECT TOP 1 gr.verification_status FROM dbo.goods_receipts gr WHERE gr.purchase_order_id = po.id ORDER BY gr.id DESC) AS latest_grn_status
      FROM dbo.purchase_orders po
      JOIN dbo.suppliers s ON po.supplier_id = s.id
      ORDER BY po.id DESC;
    `);

    res.json({
      success: true,
      orders: result.recordset
    });
  } catch (err) {
    console.error('[Purchases Error - getPurchaseOrders]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve purchase orders.'
    });
  }
}

/**
 * GET /api/purchases/orders/:id
 * Retrieve single purchase order with items, shipments, and GRNs
 */
async function getPurchaseOrderById(req, res, next) {
  try {
    const { id } = req.params;
    const pool = await getPool();

    // 1. PO Header
    const poResult = await pool.request()
      .input('id', sql.BigInt, id)
      .query(`
        SELECT 
          po.id,
          po.order_number,
          po.supplier_id,
          s.name AS supplier_name,
          s.supplier_code,
          s.gstin AS supplier_gstin,
          s.contact_person,
          s.phone AS supplier_phone,
          s.email AS supplier_email,
          po.order_date,
          po.expected_delivery_date,
          po.status,
          po.total_amount,
          po.notes,
          po.created_at
        FROM dbo.purchase_orders po
        JOIN dbo.suppliers s ON po.supplier_id = s.id
        WHERE po.id = @id;
      `);

    if (poResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Purchase order #${id} not found.`
      });
    }

    const order = poResult.recordset[0];

    // 2. Line Items
    const itemsResult = await pool.request()
      .input('id', sql.BigInt, id)
      .query(`
        SELECT 
          poi.id,
          poi.purchase_order_id,
          poi.product_variant_id,
          p.name AS product_name,
          p.category,
          pv.format,
          p.isbn,
          poi.quantity_ordered,
          poi.unit_cost,
          poi.total_cost,
          ISNULL(inv.quantity_on_hand, 0) AS current_stock
        FROM dbo.purchase_order_items poi
        JOIN dbo.product_variants pv ON poi.product_variant_id = pv.id
        JOIN dbo.products p ON pv.product_id = p.id
        LEFT JOIN dbo.inventory inv ON pv.id = inv.product_variant_id
        WHERE poi.purchase_order_id = @id
        ORDER BY poi.id ASC;
      `);

    // 3. Linked Shipments
    const shipmentsResult = await pool.request()
      .input('id', sql.BigInt, id)
      .query(`
        SELECT 
          id,
          purchase_order_id,
          transport_document_no,
          shipment_date,
          expected_date,
          received_date,
          status
        FROM dbo.shipments
        WHERE purchase_order_id = @id
        ORDER BY id DESC;
      `);

    // 4. Linked Goods Receipts
    const grnResult = await pool.request()
      .input('id', sql.BigInt, id)
      .query(`
        SELECT 
          gr.id,
          gr.grn_number,
          gr.location,
          gr.shipment_id,
          gr.bill_number,
          gr.bill_date,
          gr.received_date,
          gr.received_by,
          gr.verification_status,
          gr.total_value,
          gr.notes,
          (SELECT COUNT(*) FROM dbo.goods_receipt_items gri WHERE gri.goods_receipt_id = gr.id) AS items_count,
          (SELECT ISNULL(SUM(gri.quantity_accepted), 0) FROM dbo.goods_receipt_items gri WHERE gri.goods_receipt_id = gr.id) AS total_accepted
        FROM dbo.goods_receipts gr
        WHERE gr.purchase_order_id = @id
        ORDER BY gr.id DESC;
      `);

    res.json({
      success: true,
      order: {
        ...order,
        items: itemsResult.recordset,
        shipments: shipmentsResult.recordset,
        goodsReceipts: grnResult.recordset
      }
    });
  } catch (err) {
    console.error('[Purchases Error - getPurchaseOrderById]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve purchase order details.'
    });
  }
}

/**
 * POST /api/purchases/orders
 * Transactional creation of Purchase Order and Items
 */
async function createPurchaseOrder(req, res, next) {
  const { supplier_id, order_date, expected_delivery_date, notes, items } = req.body;

  // Validation
  if (!supplier_id) {
    return res.status(400).json({ success: false, error: 'Supplier is required.' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'At least one line item is required.' });
  }

  // Validate items
  let calculatedTotal = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.product_variant_id) {
      return res.status(400).json({ success: false, error: `Item #${i + 1}: Product variant is required.` });
    }
    const qty = parseInt(it.quantity_ordered, 10);
    const cost = parseFloat(it.unit_cost);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, error: `Item #${i + 1}: Quantity must be greater than zero.` });
    }
    if (isNaN(cost) || cost < 0) {
      return res.status(400).json({ success: false, error: `Item #${i + 1}: Unit cost must be non-negative.` });
    }
    calculatedTotal += (qty * cost);
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Generate next PO Number sequentially (e.g. PO-2026-004)
    const seqReq = new sql.Request(transaction);
    const seqRes = await seqReq.query(`
      SELECT ISNULL(MAX(id), 0) + 1 AS next_id FROM dbo.purchase_orders WITH (TABLOCKX, HOLDLOCK);
    `);
    const nextId = seqRes.recordset[0].next_id;
    const year = new Date().getFullYear();
    const orderNumber = `PO-${year}-${String(nextId).padStart(3, '0')}`;

    const poDate = order_date || new Date().toISOString().slice(0, 10);

    // 2. Insert PO Header
    const poReq = new sql.Request(transaction);
    poReq.input('order_number', sql.VarChar(50), orderNumber);
    poReq.input('supplier_id', sql.BigInt, supplier_id);
    poReq.input('order_date', sql.Date, poDate);
    poReq.input('expected_delivery_date', sql.Date, expected_delivery_date || null);
    poReq.input('status', sql.VarChar(30), 'PENDING');
    poReq.input('total_amount', sql.Decimal(18, 2), calculatedTotal);
    poReq.input('notes', sql.VarChar(sql.MAX), notes || null);

    const insertPoRes = await poReq.query(`
      INSERT INTO dbo.purchase_orders (
        order_number, supplier_id, order_date, expected_delivery_date, 
        status, total_amount, notes, created_at, updated_at
      )
      OUTPUT INSERTED.id
      VALUES (
        @order_number, @supplier_id, @order_date, @expected_delivery_date, 
        @status, @total_amount, @notes, SYSUTCDATETIME(), SYSUTCDATETIME()
      );
    `);

    const newPoId = insertPoRes.recordset[0].id;

    // 3. Insert PO Items
    for (const it of items) {
      const qty = parseInt(it.quantity_ordered, 10);
      const cost = parseFloat(it.unit_cost);
      const lineCost = qty * cost;

      const itemReq = new sql.Request(transaction);
      itemReq.input('po_id', sql.BigInt, newPoId);
      itemReq.input('variant_id', sql.BigInt, it.product_variant_id);
      itemReq.input('qty', sql.Int, qty);
      itemReq.input('cost', sql.Decimal(18, 2), cost);
      itemReq.input('line_cost', sql.Decimal(18, 2), lineCost);

      await itemReq.query(`
        INSERT INTO dbo.purchase_order_items (
          purchase_order_id, product_variant_id, quantity_ordered, unit_cost, total_cost
        )
        VALUES (
          @po_id, @variant_id, @qty, @cost, @line_cost
        );
      `);
    }

    // Commit transaction
    await transaction.commit();

    res.status(201).json({
      success: true,
      message: `Purchase Order ${orderNumber} created successfully.`,
      orderId: newPoId,
      orderNumber,
      totalAmount: calculatedTotal,
      itemsCount: items.length
    });
  } catch (err) {
    try {
      await transaction.rollback();
    } catch (rbErr) {
      // rollback error ignore
    }
    console.error('[Purchases Error - createPurchaseOrder]:', err.message);
    res.status(400).json({
      success: false,
      error: 'Failed to create purchase order: ' + err.message
    });
  }
}

/**
 * POST /api/purchases/shipments
 * Record a shipment against a purchase order
 */
async function createShipment(req, res, next) {
  const { purchase_order_id, transport_document_no, shipment_date, expected_date, received_date, status } = req.body;

  if (!purchase_order_id) {
    return res.status(400).json({ success: false, error: 'Purchase Order ID is required.' });
  }

  try {
    const pool = await getPool();

    // Verify PO exists
    const chkPo = await pool.request()
      .input('po_id', sql.BigInt, purchase_order_id)
      .query(`SELECT id, status FROM dbo.purchase_orders WHERE id = @po_id;`);

    if (chkPo.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Purchase order not found.' });
    }

    const shipDate = shipment_date || new Date().toISOString().slice(0, 10);
    const shipStatus = status || 'IN_TRANSIT';

    const insertReq = pool.request();
    insertReq.input('po_id', sql.BigInt, purchase_order_id);
    insertReq.input('transport_no', sql.VarChar(100), transport_document_no || null);
    insertReq.input('ship_date', sql.Date, shipDate);
    insertReq.input('exp_date', sql.Date, expected_date || null);
    insertReq.input('recv_date', sql.Date, received_date || null);
    insertReq.input('status', sql.VarChar(30), shipStatus);

    const result = await insertReq.query(`
      INSERT INTO dbo.shipments (
        purchase_order_id, transport_document_no, shipment_date, expected_date, received_date, status
      )
      OUTPUT INSERTED.id
      VALUES (
        @po_id, @transport_no, @ship_date, @exp_date, @recv_date, @status
      );
    `);

    const newShipmentId = result.recordset[0].id;

    res.status(201).json({
      success: true,
      message: 'Shipment recorded successfully.',
      shipmentId: newShipmentId,
      status: shipStatus
    });
  } catch (err) {
    console.error('[Purchases Error - createShipment]:', err.message);
    res.status(400).json({
      success: false,
      error: 'Failed to record shipment: ' + err.message
    });
  }
}

/**
 * GET /api/purchases/grns
 * List all Goods Receipt Notes
 */
async function getGoodsReceipts(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        gr.id,
        gr.grn_number,
        gr.location,
        gr.purchase_order_id,
        po.order_number,
        s.name AS supplier_name,
        gr.shipment_id,
        sh.transport_document_no,
        gr.bill_number,
        gr.bill_date,
        gr.received_date,
        gr.received_by,
        gr.verification_status,
        gr.total_value,
        gr.notes,
        (SELECT COUNT(*) FROM dbo.goods_receipt_items gri WHERE gri.goods_receipt_id = gr.id) AS items_count,
        (SELECT ISNULL(SUM(gri.quantity_accepted), 0) FROM dbo.goods_receipt_items gri WHERE gri.goods_receipt_id = gr.id) AS total_accepted,
        (SELECT ISNULL(SUM(gri.quantity_rejected), 0) FROM dbo.goods_receipt_items gri WHERE gri.goods_receipt_id = gr.id) AS total_rejected
      FROM dbo.goods_receipts gr
      JOIN dbo.purchase_orders po ON gr.purchase_order_id = po.id
      JOIN dbo.suppliers s ON po.supplier_id = s.id
      LEFT JOIN dbo.shipments sh ON gr.shipment_id = sh.id
      ORDER BY gr.id DESC;
    `);

    res.json({
      success: true,
      goodsReceipts: result.recordset
    });
  } catch (err) {
    console.error('[Purchases Error - getGoodsReceipts]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve Goods Receipt Notes.'
    });
  }
}

/**
 * POST /api/purchases/grns
 * Transactional creation of Goods Receipt Note and Items in PENDING status
 */
async function createGoodsReceipt(req, res, next) {
  const {
    purchase_order_id,
    shipment_id,
    location,
    bill_number,
    bill_date,
    received_date,
    received_by,
    notes,
    items
  } = req.body;

  if (!purchase_order_id) {
    return res.status(400).json({ success: false, error: 'Purchase Order ID is required.' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'At least one receipt line item is required.' });
  }

  // Validate items
  let totalValue = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const accepted = parseInt(it.quantity_accepted, 10);
    const rejected = parseInt(it.quantity_rejected || 0, 10);
    const received = parseInt(it.quantity_received, 10);
    const rate = parseFloat(it.purchase_rate);

    if (isNaN(accepted) || accepted < 0) {
      return res.status(400).json({ success: false, error: `Item #${i + 1}: Accepted quantity cannot be negative.` });
    }
    if (isNaN(rejected) || rejected < 0) {
      return res.status(400).json({ success: false, error: `Item #${i + 1}: Rejected quantity cannot be negative.` });
    }
    if (isNaN(rate) || rate < 0) {
      return res.status(400).json({ success: false, error: `Item #${i + 1}: Purchase rate must be non-negative.` });
    }
    totalValue += (accepted * rate);
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Verify PO status
    const poChkReq = new sql.Request(transaction);
    poChkReq.input('po_id', sql.BigInt, purchase_order_id);
    const poChk = await poChkReq.query(`
      SELECT id, order_number, status FROM dbo.purchase_orders WHERE id = @po_id;
    `);

    if (poChk.recordset.length === 0) {
      throw new Error(`Purchase Order #${purchase_order_id} does not exist.`);
    }

    if (poChk.recordset[0].status === 'CANCELLED') {
      throw new Error(`Cannot create GRN for a CANCELLED Purchase Order.`);
    }

    // 2. Generate next sequential GRN Number (e.g. GRN-2026-004)
    const grnSeqReq = new sql.Request(transaction);
    const grnSeqRes = await grnSeqReq.query(`
      SELECT ISNULL(MAX(id), 0) + 1 AS next_id FROM dbo.goods_receipts;
    `);
    const nextGrnId = grnSeqRes.recordset[0].next_id;
    const year = new Date().getFullYear();
    const grnNumber = `GRN-${year}-${String(nextGrnId).padStart(3, '0')}`;

    const recvDate = received_date || new Date().toISOString().slice(0, 10);
    const recvBy = received_by ? received_by.trim() : 'Store Receiving Dock';
    const loc = location ? location.trim() : 'Main Bookstore Receiving Dock';
    const billNum = bill_number ? bill_number.trim() : `CHALLAN-${Date.now().toString().slice(-6)}`;

    // 3. Insert GRN Header in PENDING verification status
    const grnReq = new sql.Request(transaction);
    grnReq.input('grn_number', sql.VarChar(50), grnNumber);
    grnReq.input('location', sql.VarChar(255), loc);
    grnReq.input('po_id', sql.BigInt, purchase_order_id);
    grnReq.input('shipment_id', sql.BigInt, shipment_id || null);
    grnReq.input('bill_number', sql.VarChar(100), billNum);
    grnReq.input('bill_date', sql.Date, bill_date || null);
    grnReq.input('received_date', sql.Date, recvDate);
    grnReq.input('received_by', sql.VarChar(255), recvBy);
    grnReq.input('verification_status', sql.VarChar(30), 'PENDING');
    grnReq.input('net_grn_value', sql.Decimal(18, 2), totalValue);
    grnReq.input('total_value', sql.Decimal(18, 2), totalValue);
    grnReq.input('notes', sql.VarChar(sql.MAX), notes || null);

    const insertGrnRes = await grnReq.query(`
      INSERT INTO dbo.goods_receipts (
        grn_number, location, purchase_order_id, shipment_id, bill_number, bill_date,
        received_date, received_by, verification_status, net_grn_value, cgst_amount, 
        sgst_amount, igst_amount, other_charges, total_value, notes
      )
      OUTPUT INSERTED.id
      VALUES (
        @grn_number, @location, @po_id, @shipment_id, @bill_number, @bill_date,
        @received_date, @received_by, @verification_status, @net_grn_value, 0.00,
        0.00, 0.00, 0.00, @total_value, @notes
      );
    `);

    const newGrnId = insertGrnRes.recordset[0].id;

    // 4. Insert Line Items
    for (const it of items) {
      const ordered = parseInt(it.quantity_ordered, 10) || 0;
      const received = parseInt(it.quantity_received, 10) || ordered;
      const accepted = parseInt(it.quantity_accepted, 10);
      const rejected = parseInt(it.quantity_rejected || 0, 10);
      const rate = parseFloat(it.purchase_rate);
      const lineAmt = accepted * rate;

      const itemReq = new sql.Request(transaction);
      itemReq.input('grn_id', sql.BigInt, newGrnId);
      itemReq.input('variant_id', sql.BigInt, it.product_variant_id);
      itemReq.input('batch_no', sql.VarChar(100), it.batch_no || `BATCH-${year}-${newGrnId}`);
      itemReq.input('qty_ordered', sql.Int, ordered);
      itemReq.input('qty_received', sql.Int, received);
      itemReq.input('qty_accepted', sql.Int, accepted);
      itemReq.input('qty_rejected', sql.Int, rejected);
      itemReq.input('purchase_rate', sql.Decimal(18, 2), rate);
      itemReq.input('line_amount', sql.Decimal(18, 2), lineAmt);

      await itemReq.query(`
        INSERT INTO dbo.goods_receipt_items (
          goods_receipt_id, product_variant_id, batch_no, expiry_date,
          quantity_ordered, quantity_received, free_quantity, quantity_accepted, quantity_rejected,
          discount_amount, cgst_percent, sgst_percent, igst_percent, purchase_rate,
          epr, mrp, line_amount
        )
        VALUES (
          @grn_id, @variant_id, @batch_no, NULL,
          @qty_ordered, @qty_received, 0, @qty_accepted, @qty_rejected,
          0.00, 0.00, 0.00, 0.00, @purchase_rate,
          NULL, NULL, @line_amount
        );
      `);
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: `Goods Receipt Note ${grnNumber} created successfully in PENDING status.`,
      grnId: newGrnId,
      grnNumber,
      totalValue,
      itemsCount: items.length
    });
  } catch (err) {
    try {
      await transaction.rollback();
    } catch (rbErr) {
      // ignore
    }
    console.error('[Purchases Error - createGoodsReceipt]:', err.message);
    res.status(400).json({
      success: false,
      error: 'Failed to create Goods Receipt Note: ' + err.message
    });
  }
}

/**
 * POST /api/purchases/grns/:id/verify
 * Calls dbo.sp_VerifyGoodsReceipt to verify GRN, increase inventory, and post stock movements.
 * Enforces idempotence and business rules via database stored procedure.
 */
async function verifyGoodsReceipt(req, res, next) {
  const { id } = req.params;
  const { verified_by } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'GRN ID is required.' });
  }

  try {
    const pool = await getPool();

    // Check pre-flight status to give clear friendly response if already verified
    const preChk = await pool.request()
      .input('id', sql.BigInt, id)
      .query(`
        SELECT id, grn_number, verification_status, purchase_order_id
        FROM dbo.goods_receipts
        WHERE id = @id;
      `);

    if (preChk.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Goods Receipt Note #${id} not found.`
      });
    }

    const currentRecord = preChk.recordset[0];
    if (currentRecord.verification_status === 'VERIFIED') {
      return res.status(400).json({
        success: false,
        error: `GRN '${currentRecord.grn_number}' has ALREADY been verified and posted. Double-posting is strictly rejected.`
      });
    }

    // Call stored procedure dbo.sp_VerifyGoodsReceipt
    const procReq = pool.request();
    procReq.input('grn_id', sql.BigInt, id);
    procReq.input('verified_by', sql.VarChar(255), verified_by ? verified_by.trim() : 'SRC Store Operations');

    const procRes = await procReq.execute('dbo.sp_VerifyGoodsReceipt');

    const resultData = procRes.recordset && procRes.recordset.length > 0
      ? procRes.recordset[0]
      : { grn_id: id, new_status: 'VERIFIED', result_message: 'GRN successfully verified.' };

    res.json({
      success: true,
      message: resultData.result_message || 'GRN verified and inventory posted successfully.',
      data: {
        grnId: resultData.grn_id,
        grnNumber: resultData.grn_number,
        newStatus: resultData.new_status,
        itemsProcessed: resultData.items_processed,
        acceptedQuantity: resultData.accepted_quantity,
        rejectedQuantity: resultData.rejected_quantity,
        inventoryValueAdded: resultData.inventory_value_added
      }
    });
  } catch (err) {
    console.error('[Purchases Error - verifyGoodsReceipt]:', err.message);
    res.status(400).json({
      success: false,
      error: err.message || 'Stored procedure execution failed.'
    });
  }
}

module.exports = {
  getSuppliers,
  getProductVariants,
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  createShipment,
  getGoodsReceipts,
  createGoodsReceipt,
  verifyGoodsReceipt
};
