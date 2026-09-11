// =====================================================
// Supabase PostgreSQL Database Helper
// =====================================================

const { Pool } = require('pg');

// Create connection pool using Supabase connection string
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// =====================================================
// Get next serial number for a document type
// Auto-increments the counter and returns the number
// =====================================================

async function getNextSerialNumber(docType) {
  const year = new Date().getFullYear().toString();

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the row for this doc_type + year to prevent race conditions
    const result = await client.query(
      `INSERT INTO serial_counters (doc_type, year, last_number)
       VALUES ($1, $2, 0)
       ON CONFLICT (doc_type) DO UPDATE
       SET last_number = serial_counters.last_number
       RETURNING last_number`,
      [docType, year]
    );

    let lastNumber = result.rows[0].last_number;

    // Increment the counter
    const updated = await client.query(
      `UPDATE serial_counters
       SET last_number = last_number + 1,
           updated_at = NOW()
       WHERE doc_type = $1 AND year = $2
       RETURNING last_number`,
      [docType, year]
    );

    lastNumber = updated.rows[0].last_number;

    await client.query('COMMIT');

    return {
      number: lastNumber,
      year
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// =====================================================
// Generate a document number
// PI:      DNI-PI-2026-102
// Invoice: DNI-IV-2026-101
// =====================================================

async function generateDocumentNumber(docType) {
  const { number, year } = await getNextSerialNumber(docType);

  const prefix = docType === 'PI' ? 'PI' : 'IV';

  return `DNI-${prefix}-${year}-${String(number).padStart(3, '0')}`;
}

// =====================================================
// Save a generated document to the database
// =====================================================

async function saveDocument({
  docType,
  docNumber,
  refPo,
  refPi,
  buyerName,
  buyerGstin,
  buyerAddress,
  invoiceDate,
  placeOfSupply,
  gstRate,
  items,
  subtotal,
  gstAmount,
  grandTotal,
  paymentMethod,
  paymentDate,
  pdfUrl
}) {
  const result = await pool.query(
    `INSERT INTO documents (
       doc_type, doc_number, ref_po, ref_pi,
       buyer_name, buyer_gstin, buyer_address,
       invoice_date, place_of_supply, gst_rate,
       items, subtotal, gst_amount, grand_total,
       payment_method, payment_date, pdf_url
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [
      docType, docNumber, refPo, refPi,
      buyerName, buyerGstin, buyerAddress,
      invoiceDate, placeOfSupply, gstRate,
      JSON.stringify(items), subtotal, gstAmount, grandTotal,
      paymentMethod, paymentDate, pdfUrl
    ]
  );

  return result.rows[0];
}

// =====================================================
// Get the latest Ref PO and Ref PI numbers
// =====================================================

async function getLatestRefs() {
  const result = await pool.query(
    `SELECT
       (SELECT ref_po FROM documents ORDER BY id DESC LIMIT 1) AS latest_ref_po,
       (SELECT ref_pi FROM documents ORDER BY id DESC LIMIT 1) AS latest_ref_pi`
  );

  return result.rows[0];
}

// =====================================================
// Get all documents (for history view)
// =====================================================

async function getAllDocuments() {
  const result = await pool.query(
    `SELECT * FROM documents ORDER BY id DESC`
  );

  return result.rows;
}

module.exports = {
  pool,
  getNextSerialNumber,
  generateDocumentNumber,
  saveDocument,
  getLatestRefs,
  getAllDocuments
};