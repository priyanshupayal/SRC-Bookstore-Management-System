/**
 * Sales & Payments Workflow Controller
 * SRC Bookstore Management System
 * Enforces least-privilege operations, transactional safety, and procedure execution
 */

const { sql, getPool } = require('../config/db');

/**
 * GET /api/sales/customers
 * List customers for sales dropdown
 */
async function getCustomers(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        id, 
        name, 
        phone, 
        email, 
        address
      FROM dbo.customers
      WHERE active = 1
      ORDER BY name ASC;
    `);

    res.json({
      success: true,
      customers: result.recordset
    });
  } catch (err) {
    console.error('[Sales Error - getCustomers]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve customers from database.'
    });
  }
}

/**
 * GET /api/sales
 * List all sales (both DRAFT and COMPLETED) with real payment metrics
 */
async function getSales(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        s.id,
        s.sale_number,
        s.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        s.sale_date,
        s.gross_total,
        s.discount_total,
        s.net_payable,
        s.sale_type,
        s.status,
        (SELECT COUNT(*) FROM dbo.sale_items si WHERE si.sale_id = s.id) AS items_count,
        (SELECT ISNULL(SUM(p.amount), 0.00) FROM dbo.payments p WHERE p.sale_id = s.id AND p.status = 'COMPLETED') AS total_paid,
        (s.net_payable - (SELECT ISNULL(SUM(p.amount), 0.00) FROM dbo.payments p WHERE p.sale_id = s.id AND p.status = 'COMPLETED')) AS unpaid_balance,
        (SELECT COUNT(*) FROM dbo.sales_receipts sr WHERE sr.sale_id = s.id) AS receipts_count,
        CASE 
          WHEN (SELECT ISNULL(SUM(p.amount), 0.00) FROM dbo.payments p WHERE p.sale_id = s.id AND p.status = 'COMPLETED') = 0.00 THEN 'UNPAID'
          WHEN (SELECT ISNULL(SUM(p.amount), 0.00) FROM dbo.payments p WHERE p.sale_id = s.id AND p.status = 'COMPLETED') >= s.net_payable THEN 'PAID'
          ELSE 'PARTIALLY_PAID'
        END AS payment_status
      FROM dbo.sales s
      LEFT JOIN dbo.customers c ON s.customer_id = c.id
      ORDER BY s.id DESC;
    `);

    res.json({
      success: true,
      sales: result.recordset
    });
  } catch (err) {
    console.error('[Sales Error - getSales]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sales records.'
    });
  }
}

/**
 * GET /api/sales/:id
 * Retrieve single sale details with line items, payments, receipts, and unpaid balance
 */
async function getSaleById(req, res, next) {
  try {
    const { id } = req.params;
    const pool = await getPool();

    // 1. Sale Header
    const saleRes = await pool.request()
      .input('id', sql.BigInt, id)
      .query(`
        SELECT 
          s.id,
          s.sale_number,
          s.customer_id,
          c.name AS customer_name,
          c.phone AS customer_phone,
          c.email AS customer_email,
          c.address AS customer_address,
          s.sale_date,
          s.gross_total,
          s.discount_total,
          s.net_payable,
          s.sale_type,
          s.status
        FROM dbo.sales s
        LEFT JOIN dbo.customers c ON s.customer_id = c.id
        WHERE s.id = @id;
      `);

    if (saleRes.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Sale record #${id} not found.`
      });
    }

    const sale = saleRes.recordset[0];

    // 2. Line Items
    const itemsRes = await pool.request()
      .input('id', sql.BigInt, id)
      .query(`
        SELECT 
          si.id,
          si.sale_id,
          si.product_variant_id,
          p.name AS product_name,
          p.category,
          p.isbn,
          pv.format,
          si.quantity,
          si.unit_price,
          si.gross_total,
          si.deduction_type,
          si.deduction_amount,
          si.net_amount,
          ISNULL(inv.quantity_on_hand, 0) AS current_stock
        FROM dbo.sale_items si
        JOIN dbo.product_variants pv ON si.product_variant_id = pv.id
        JOIN dbo.products p ON pv.product_id = p.id
        LEFT JOIN dbo.inventory inv ON pv.id = inv.product_variant_id
        WHERE si.sale_id = @id
        ORDER BY si.id ASC;
      `);

    // 3. Payments
    const paymentsRes = await pool.request()
      .input('id', sql.BigInt, id)
      .query(`
        SELECT 
          p.id,
          p.sale_id,
          p.payment_method,
          p.amount,
          p.transaction_reference,
          p.bank_reference_number,
          p.payment_date,
          p.status,
          sr.receipt_number,
          sr.issued_at
        FROM dbo.payments p
        LEFT JOIN dbo.sales_receipts sr ON p.id = sr.payment_id
        WHERE p.sale_id = @id
        ORDER BY p.id ASC;
      `);

    // 4. Receipts
    const receiptsRes = await pool.request()
      .input('id', sql.BigInt, id)
      .query(`
        SELECT 
          sr.id,
          sr.sale_id,
          sr.payment_id,
          sr.receipt_number,
          sr.payment_method,
          sr.amount,
          sr.issued_at,
          p.transaction_reference
        FROM dbo.sales_receipts sr
        JOIN dbo.payments p ON sr.payment_id = p.id
        WHERE sr.sale_id = @id
        ORDER BY sr.id ASC;
      `);

    // Calculate metrics
    const totalPaid = paymentsRes.recordset
      .filter(p => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const unpaidBalance = Math.max(0, parseFloat(sale.net_payable) - totalPaid);
    const paymentStatus = totalPaid === 0 ? 'UNPAID' : (totalPaid >= parseFloat(sale.net_payable) ? 'PAID' : 'PARTIALLY_PAID');

    res.json({
      success: true,
      sale: {
        ...sale,
        total_paid: totalPaid,
        unpaid_balance: unpaidBalance,
        payment_status: paymentStatus,
        items: itemsRes.recordset,
        payments: paymentsRes.recordset,
        receipts: receiptsRes.recordset
      }
    });
  } catch (err) {
    console.error('[Sales Error - getSaleById]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sale details.'
    });
  }
}

/**
 * POST /api/sales
 * Transactional creation of a DRAFT sale with items
 */
async function createDraftSale(req, res, next) {
  const { customer_id, sale_type, items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'At least one sale item is required.' });
  }

  // Validate items
  let grossTotal = 0;
  let discountTotal = 0;
  let netPayable = 0;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.product_variant_id) {
      return res.status(400).json({ success: false, error: `Item #${i + 1}: Product variant is required.` });
    }
    const qty = parseInt(it.quantity, 10);
    const price = parseFloat(it.unit_price);
    const disc = parseFloat(it.deduction_amount || 0);

    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, error: `Item #${i + 1}: Quantity must be greater than zero.` });
    }
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ success: false, error: `Item #${i + 1}: Unit price must be non-negative.` });
    }
    if (isNaN(disc) || disc < 0) {
      return res.status(400).json({ success: false, error: `Item #${i + 1}: Discount amount cannot be negative.` });
    }

    const itemGross = qty * price;
    if (disc > itemGross) {
      return res.status(400).json({ success: false, error: `Item #${i + 1}: Discount cannot exceed gross line total.` });
    }

    grossTotal += itemGross;
    discountTotal += disc;
    netPayable += (itemGross - disc);
  }

  const stype = sale_type ? sale_type.trim() : 'RETAIL';
  const custId = customer_id ? parseInt(customer_id, 10) : null;

  if (stype === 'CREDIT' && !custId) {
    return res.status(400).json({
      success: false,
      error: 'A registered customer is strictly required for CREDIT sales.'
    });
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // 1. Generate next sequential sale number (e.g. SALE-2026-006)
      const seqReq = new sql.Request(transaction);
      const seqRes = await seqReq.query(`
        SELECT ISNULL(MAX(id), 0) + 1 AS next_id FROM dbo.sales WITH (TABLOCKX, HOLDLOCK);
      `);
      const nextId = seqRes.recordset[0].next_id;
      const year = new Date().getFullYear();
      const saleNumber = `SALE-${year}-${String(nextId).padStart(3, '0')}`;

    // 2. Insert Sale Header in DRAFT status
    const saleReq = new sql.Request(transaction);
    saleReq.input('sale_number', sql.VarChar(50), saleNumber);
    saleReq.input('customer_id', sql.BigInt, custId);
    saleReq.input('gross_total', sql.Decimal(18, 2), grossTotal);
    saleReq.input('discount_total', sql.Decimal(18, 2), discountTotal);
    saleReq.input('net_payable', sql.Decimal(18, 2), netPayable);
    saleReq.input('sale_type', sql.VarChar(30), stype);
    saleReq.input('status', sql.VarChar(30), 'DRAFT');

    const insertSaleRes = await saleReq.query(`
      INSERT INTO dbo.sales (
        sale_number, customer_id, sale_date, gross_total, discount_total, 
        net_payable, sale_type, status
      )
      OUTPUT INSERTED.id
      VALUES (
        @sale_number, @customer_id, SYSUTCDATETIME(), @gross_total, @discount_total,
        @net_payable, @sale_type, @status
      );
    `);

    const newSaleId = insertSaleRes.recordset[0].id;

    // 3. Insert Line Items
    for (const it of items) {
      const qty = parseInt(it.quantity, 10);
      const price = parseFloat(it.unit_price);
      const disc = parseFloat(it.deduction_amount || 0);
      const itemGross = qty * price;
      const itemNet = itemGross - disc;

      const itemReq = new sql.Request(transaction);
      itemReq.input('sale_id', sql.BigInt, newSaleId);
      itemReq.input('variant_id', sql.BigInt, it.product_variant_id);
      itemReq.input('qty', sql.Int, qty);
      itemReq.input('price', sql.Decimal(18, 2), price);
      itemReq.input('item_gross', sql.Decimal(18, 2), itemGross);
      itemReq.input('ded_type', sql.VarChar(30), disc > 0 ? 'DISCOUNT' : null);
      itemReq.input('ded_amount', sql.Decimal(18, 2), disc);
      itemReq.input('item_net', sql.Decimal(18, 2), itemNet);

      await itemReq.query(`
        INSERT INTO dbo.sale_items (
          sale_id, product_variant_id, quantity, unit_price, gross_total,
          deduction_type, deduction_amount, net_amount
        )
        VALUES (
          @sale_id, @variant_id, @qty, @price, @item_gross,
          @ded_type, @ded_amount, @item_net
        );
      `);
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: `Draft Sale ${saleNumber} created successfully.`,
      saleId: newSaleId,
      saleNumber,
      grossTotal,
      discountTotal,
      netPayable,
      itemsCount: items.length
    });
  } catch (err) {
    try {
      await transaction.rollback();
    } catch (rbErr) {
      // ignore
    }
    console.error('[Sales Error - createDraftSale]:', err.message);
    res.status(400).json({
      success: false,
      error: 'Failed to create draft sale: ' + err.message
    });
  }
}

/**
 * POST /api/sales/:id/complete
 * Invokes dbo.sp_CompleteSale to validate stock, deduct inventory, and post stock movements
 */
async function completeSale(req, res, next) {
  const { id } = req.params;
  const { completed_by } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Sale ID is required.' });
  }

  try {
    const pool = await getPool();

    // Check pre-flight status
    const preChk = await pool.request()
      .input('id', sql.BigInt, id)
      .query(`
        SELECT id, sale_number, status, net_payable
        FROM dbo.sales
        WHERE id = @id;
      `);

    if (preChk.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Sale #${id} not found.`
      });
    }

    const currentSale = preChk.recordset[0];
    if (currentSale.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: `Sale '${currentSale.sale_number}' has ALREADY been completed. Duplicate completion is strictly rejected.`
      });
    }

    if (currentSale.status !== 'DRAFT') {
      return res.status(400).json({
        success: false,
        error: `Sale '${currentSale.sale_number}' cannot be completed because its current status is '${currentSale.status}'.`
      });
    }

    // Call stored procedure dbo.sp_CompleteSale
    const procReq = pool.request();
    procReq.input('sale_id', sql.BigInt, id);
    procReq.input('completed_by', sql.VarChar(255), completed_by ? completed_by.trim() : 'Store Cashier');

    const procRes = await procReq.execute('dbo.sp_CompleteSale');

    const resultData = procRes.recordset && procRes.recordset.length > 0
      ? procRes.recordset[0]
      : { sale_id: id, new_status: 'COMPLETED', result_message: 'Sale successfully completed.' };

    res.json({
      success: true,
      message: resultData.result_message || 'Sale completed and inventory deducted successfully.',
      data: {
        saleId: resultData.sale_id,
        saleNumber: resultData.sale_number,
        newStatus: resultData.new_status,
        lineItemsProcessed: resultData.line_items_processed,
        variantsAffected: resultData.variants_affected,
        totalUnitsDeducted: resultData.total_units_deducted,
        netSaleAmount: resultData.net_sale_amount
      }
    });
  } catch (err) {
    console.error('[Sales Error - completeSale]:', err.message);
    res.status(400).json({
      success: false,
      error: err.message || 'Stored procedure execution failed.'
    });
  }
}

/**
 * POST /api/sales/:id/payments
 * Records a Cash or Digital payment via dbo.usp_RecordSalePayment
 */
async function recordPayment(req, res, next) {
  const { id } = req.params;
  const { payment_method, amount, transaction_reference, bank_reference_number } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Sale ID is required.' });
  }

  const payMethod = payment_method ? payment_method.trim().toUpperCase() : '';
  if (!['CASH', 'DIGITAL'].includes(payMethod)) {
    return res.status(400).json({ success: false, error: 'Invalid payment method. Only CASH and DIGITAL are supported.' });
  }

  const payAmount = parseFloat(amount);
  if (isNaN(payAmount) || payAmount <= 0) {
    return res.status(400).json({ success: false, error: 'Payment amount must be strictly greater than zero.' });
  }

  if (payMethod === 'DIGITAL' && (!transaction_reference || transaction_reference.trim() === '')) {
    return res.status(400).json({ success: false, error: 'Transaction reference is strictly required for DIGITAL payments.' });
  }

  try {
    const pool = await getPool();

    // Critical: Check if this sale has an active credit receivable to preserve financial consistency
    const checkRecvRes = await pool.request()
      .input('sale_id', sql.BigInt, id)
      .query(`
        SELECT id, status, outstanding_amount 
        FROM dbo.receivables 
        WHERE sale_id = @sale_id;
      `);

    if (checkRecvRes.recordset.length > 0) {
      const recv = checkRecvRes.recordset[0];
      // Route payment through dbo.usp_SettleCreditReceivable to preserve financial integrity
      const settleReq = pool.request();
      settleReq.input('receivable_id', sql.BigInt, recv.id);
      settleReq.input('payment_method', sql.VarChar(30), payMethod);
      settleReq.input('amount', sql.Decimal(18, 2), payAmount);
      settleReq.input('transaction_reference', sql.VarChar(100), transaction_reference ? transaction_reference.trim() : null);
      settleReq.input('bank_reference_number', sql.VarChar(100), bank_reference_number ? bank_reference_number.trim() : null);

      const settleRes = await settleReq.execute('dbo.usp_SettleCreditReceivable');
      const settleRecord = (settleRes.recordsets && settleRes.recordsets.length > 1 && settleRes.recordsets[1].length > 0)
        ? settleRes.recordsets[1][0]
        : (settleRes.recordset && settleRes.recordset.length > 0 ? settleRes.recordset[0] : {});

      return res.json({
        success: true,
        message: settleRecord.result_message || 'Credit receivable settlement payment recorded and receipt issued successfully.',
        data: {
          saleId: settleRecord.sale_id,
          saleNumber: settleRecord.sale_number,
          paymentId: settleRecord.payment_id,
          receiptNumber: settleRecord.receipt_number,
          paymentMethod: settleRecord.payment_method || payMethod,
          paymentAmount: settleRecord.settlement_amount || payAmount,
          remainingBalance: settleRecord.remaining_outstanding !== undefined ? settleRecord.remaining_outstanding : settleRecord.remaining_balance,
          transactionReference: transaction_reference ? transaction_reference.trim() : null,
          receivableStatus: settleRecord.receivable_status
        }
      });
    }

    // Call stored procedure dbo.usp_RecordSalePayment for non-credit or direct sales
    const procReq = pool.request();
    procReq.input('sale_id', sql.BigInt, id);
    procReq.input('payment_method', sql.VarChar(30), payMethod);
    procReq.input('amount', sql.Decimal(18, 2), payAmount);
    procReq.input('transaction_reference', sql.VarChar(100), transaction_reference ? transaction_reference.trim() : null);
    procReq.input('bank_reference_number', sql.VarChar(100), bank_reference_number ? bank_reference_number.trim() : null);

    const procRes = await procReq.execute('dbo.usp_RecordSalePayment');

    const resultData = procRes.recordset && procRes.recordset.length > 0
      ? procRes.recordset[0]
      : { sale_id: id, payment_amount: payAmount, result_message: 'Payment recorded successfully.' };

    res.json({
      success: true,
      message: resultData.result_message || 'Payment recorded and receipt issued successfully.',
      data: {
        saleId: resultData.sale_id,
        saleNumber: resultData.sale_number,
        paymentId: resultData.payment_id,
        receiptId: resultData.receipt_id,
        receiptNumber: resultData.receipt_number,
        paymentMethod: resultData.payment_method,
        paymentAmount: resultData.payment_amount,
        remainingBalance: resultData.remaining_balance,
        transactionReference: resultData.transaction_reference
      }
    });
  } catch (err) {
    console.error('[Sales Error - recordPayment]:', err.message);
    res.status(400).json({
      success: false,
      error: err.message || 'Payment processing failed.'
    });
  }
}

/**
 * GET /api/sales/:id/receipts
 * Retrieve receipts linked to a sale
 */
async function getSaleReceipts(req, res, next) {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('id', sql.BigInt, id)
      .query(`
        SELECT 
          sr.id,
          sr.sale_id,
          sr.payment_id,
          sr.receipt_number,
          sr.payment_method,
          sr.amount,
          sr.issued_at,
          p.transaction_reference,
          p.bank_reference_number
        FROM dbo.sales_receipts sr
        JOIN dbo.payments p ON sr.payment_id = p.id
        WHERE sr.sale_id = @id
        ORDER BY sr.id ASC;
      `);

    res.json({
      success: true,
      receipts: result.recordset
    });
  } catch (err) {
    console.error('[Sales Error - getSaleReceipts]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve receipts.'
    });
  }
}

/**
 * GET /api/sales/receipts
 * Retrieve all sales receipts ledger with customer & sale details
 */
async function getAllReceipts(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        sr.id,
        sr.receipt_number,
        sr.sale_id,
        s.sale_number,
        s.sale_type,
        c.name AS customer_name,
        c.phone AS customer_phone,
        sr.payment_id,
        sr.payment_method,
        sr.amount,
        sr.issued_at,
        p.transaction_reference,
        p.bank_reference_number
      FROM dbo.sales_receipts sr
      JOIN dbo.sales s ON sr.sale_id = s.id
      LEFT JOIN dbo.customers c ON s.customer_id = c.id
      LEFT JOIN dbo.payments p ON sr.payment_id = p.id
      ORDER BY sr.id DESC;
    `);

    res.json({
      success: true,
      receipts: result.recordset
    });
  } catch (err) {
    console.error('[Sales Error - getAllReceipts]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve receipts ledger.'
    });
  }
}

module.exports = {
  getCustomers,
  getSales,
  getSaleById,
  createDraftSale,
  completeSale,
  recordPayment,
  getSaleReceipts,
  getAllReceipts
};
