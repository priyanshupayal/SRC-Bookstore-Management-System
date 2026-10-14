/**
 * Credit & Receivables Workflow Controller
 * SRC Bookstore Management System
 * Enforces least-privilege operations, transactional safety, and procedure execution
 * Reuses dbo.usp_CreateCreditReceivable and dbo.usp_SettleCreditReceivable
 */

const { sql, getPool } = require('../config/db');

/**
 * GET /api/credit/receivables
 * List all credit receivables with customer details, original/outstanding balance, and status
 */
async function getReceivables(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        r.id,
        r.sale_id,
        s.sale_number,
        s.sale_date,
        s.net_payable,
        r.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.email AS customer_email,
        r.original_amount,
        r.outstanding_amount,
        (r.original_amount - r.outstanding_amount) AS total_settled,
        r.due_date,
        r.status,
        r.created_at,
        r.updated_at,
        (SELECT COUNT(*) FROM dbo.sales_receipts sr WHERE sr.sale_id = r.sale_id) AS receipts_count,
        (SELECT COUNT(*) FROM dbo.payments p WHERE p.sale_id = r.sale_id AND p.status = 'COMPLETED') AS payments_count
      FROM dbo.receivables r
      JOIN dbo.sales s ON r.sale_id = s.id
      JOIN dbo.customers c ON r.customer_id = c.id
      ORDER BY r.id DESC;
    `);

    res.json({
      success: true,
      receivables: result.recordset
    });
  } catch (err) {
    console.error('[Credit Error - getReceivables]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve credit receivables from database.'
    });
  }
}

/**
 * GET /api/credit/eligible-sales
 * List COMPLETED credit sales that have no receivable created yet
 */
async function getEligibleCreditSales(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        s.id,
        s.sale_number,
        s.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.email AS customer_email,
        s.sale_date,
        s.gross_total,
        s.discount_total,
        s.net_payable,
        s.sale_type,
        s.status,
        (SELECT ISNULL(SUM(p.amount), 0.00) FROM dbo.payments p WHERE p.sale_id = s.id AND p.status = 'COMPLETED') AS total_paid,
        (s.net_payable - (SELECT ISNULL(SUM(p.amount), 0.00) FROM dbo.payments p WHERE p.sale_id = s.id AND p.status = 'COMPLETED')) AS unpaid_balance
      FROM dbo.sales s
      JOIN dbo.customers c ON s.customer_id = c.id
      WHERE s.sale_type = 'CREDIT'
        AND s.status = 'COMPLETED'
        AND NOT EXISTS (
          SELECT 1 FROM dbo.receivables r WHERE r.sale_id = s.id
        )
      ORDER BY s.id DESC;
    `);

    res.json({
      success: true,
      eligibleSales: result.recordset
    });
  } catch (err) {
    console.error('[Credit Error - getEligibleCreditSales]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve eligible credit sales.'
    });
  }
}

/**
 * POST /api/credit/receivables
 * Creates a credit receivable using dbo.usp_CreateCreditReceivable
 */
async function createReceivable(req, res, next) {
  const { sale_id, due_date } = req.body;

  if (!sale_id) {
    return res.status(400).json({ success: false, error: 'Sale ID is required to create a credit receivable.' });
  }

  try {
    const pool = await getPool();
    const procReq = pool.request();
    procReq.input('sale_id', sql.BigInt, sale_id);
    procReq.input('due_date', sql.Date, due_date ? new Date(due_date) : null);

    // Outputs
    procReq.output('receivable_id_out', sql.BigInt);
    procReq.output('outstanding_amount_out', sql.Decimal(18, 2));

    const procRes = await procReq.execute('dbo.usp_CreateCreditReceivable');

    const resultData = procRes.recordset && procRes.recordset.length > 0
      ? procRes.recordset[0]
      : {
          receivable_id: procRes.output.receivable_id_out,
          outstanding_amount: procRes.output.outstanding_amount_out,
          result_message: 'Credit receivable successfully created.'
        };

    res.status(201).json({
      success: true,
      message: resultData.result_message || 'Credit receivable successfully created.',
      data: {
        receivableId: resultData.receivable_id,
        saleId: resultData.sale_id,
        saleNumber: resultData.sale_number,
        customerId: resultData.customer_id,
        originalAmount: resultData.original_amount,
        outstandingAmount: resultData.outstanding_amount,
        dueDate: resultData.due_date,
        status: resultData.status
      }
    });
  } catch (err) {
    console.error('[Credit Error - createReceivable]:', err.message);
    res.status(400).json({
      success: false,
      error: err.message || 'Failed to create credit receivable.'
    });
  }
}

/**
 * POST /api/credit/receivables/:id/settle
 * Partial or full settlement of an outstanding credit receivable using dbo.usp_SettleCreditReceivable
 */
async function settleReceivable(req, res, next) {
  const { id } = req.params;
  const { payment_method, amount, transaction_reference, bank_reference_number } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Receivable ID is required for settlement.' });
  }

  const payMethod = payment_method ? payment_method.trim().toUpperCase() : '';
  if (!['CASH', 'DIGITAL'].includes(payMethod)) {
    return res.status(400).json({ success: false, error: 'Invalid payment method. Only CASH and DIGITAL are supported.' });
  }

  const settleAmount = parseFloat(amount);
  if (isNaN(settleAmount) || settleAmount <= 0) {
    return res.status(400).json({ success: false, error: 'Settlement amount must be strictly greater than zero.' });
  }

  if (payMethod === 'DIGITAL' && (!transaction_reference || transaction_reference.trim() === '')) {
    return res.status(400).json({ success: false, error: 'Transaction reference is strictly required for DIGITAL settlements.' });
  }

  try {
    const pool = await getPool();
    const procReq = pool.request();
    procReq.input('receivable_id', sql.BigInt, id);
    procReq.input('payment_method', sql.VarChar(30), payMethod);
    procReq.input('amount', sql.Decimal(18, 2), settleAmount);
    procReq.input('transaction_reference', sql.VarChar(100), transaction_reference ? transaction_reference.trim() : null);
    procReq.input('bank_reference_number', sql.VarChar(100), bank_reference_number ? bank_reference_number.trim() : null);

    // Outputs
    procReq.output('payment_id_out', sql.BigInt);
    procReq.output('receipt_number_out', sql.VarChar(50));
    procReq.output('new_outstanding_amount_out', sql.Decimal(18, 2));
    procReq.output('receivable_status_out', sql.VarChar(30));

    const procRes = await procReq.execute('dbo.usp_SettleCreditReceivable');

    // When dbo.usp_SettleCreditReceivable runs, procRes.recordsets has:
    // recordsets[0]: from internal EXEC dbo.usp_RecordSalePayment
    // recordsets[1]: from dbo.usp_SettleCreditReceivable
    const settleRecord = (procRes.recordsets && procRes.recordsets.length > 1 && procRes.recordsets[1].length > 0)
      ? procRes.recordsets[1][0]
      : (procRes.recordset && procRes.recordset.length > 0 ? procRes.recordset[0] : {});

    const newOutstanding = procRes.output.new_outstanding_amount_out !== undefined && procRes.output.new_outstanding_amount_out !== null
      ? procRes.output.new_outstanding_amount_out
      : (settleRecord.remaining_outstanding !== undefined ? settleRecord.remaining_outstanding : settleRecord.remaining_balance);

    const recvStatus = procRes.output.receivable_status_out || settleRecord.receivable_status;

    res.json({
      success: true,
      message: settleRecord.result_message || 'Credit receivable payment recorded and receipt issued successfully.',
      data: {
        receivableId: parseInt(id, 10),
        saleId: settleRecord.sale_id,
        saleNumber: settleRecord.sale_number,
        paymentId: procRes.output.payment_id_out || settleRecord.payment_id,
        receiptNumber: procRes.output.receipt_number_out || settleRecord.receipt_number,
        paymentMethod: payMethod,
        settlementAmount: settleAmount,
        newOutstandingAmount: newOutstanding,
        receivableStatus: recvStatus
      }
    });
  } catch (err) {
    console.error('[Credit Error - settleReceivable]:', err.message);
    res.status(400).json({
      success: false,
      error: err.message || 'Settlement processing failed.'
    });
  }
}

/**
 * GET /api/credit/receivables/:id/receipts
 * Retrieve sales receipts associated with a receivable's underlying sale
 */
async function getReceivableReceipts(req, res, next) {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input('receivable_id', sql.BigInt, id)
      .query(`
        SELECT 
          sr.id,
          sr.sale_id,
          sr.payment_id,
          sr.receipt_number,
          sr.payment_method,
          sr.amount,
          sr.issued_at,
          sr.document_path,
          p.transaction_reference,
          p.bank_reference_number
        FROM dbo.sales_receipts sr
        JOIN dbo.receivables r ON sr.sale_id = r.sale_id
        LEFT JOIN dbo.payments p ON sr.payment_id = p.id
        WHERE r.id = @receivable_id
        ORDER BY sr.id DESC;
      `);

    res.json({
      success: true,
      receipts: result.recordset
    });
  } catch (err) {
    console.error('[Credit Error - getReceivableReceipts]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve receivable receipts.'
    });
  }
}

module.exports = {
  getReceivables,
  getEligibleCreditSales,
  createReceivable,
  settleReceivable,
  getReceivableReceipts
};
