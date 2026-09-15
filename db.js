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
// Get next serial number for a document type (without incrementing)
// Used for preview/display purposes only
// =====================================================

async function getNextSerialNumber(docType) {
  const year = new Date().getFullYear().toString();

  const result = await pool.query(
    `SELECT last_number FROM serial_counters
     WHERE doc_type = $1 AND year = $2`,
    [docType, year]
  );

  let lastNumber = 0;
  if (result.rows.length > 0) {
    lastNumber = result.rows[0].last_number;
  }

  return {
    number: lastNumber + 1,
    year
  };
}

// =====================================================
// Get next document number (preview only, does not increment)
// =====================================================

async function getNextDocumentNumber(docType) {
  const { number, year } = await getNextSerialNumber(docType);

  const prefix = docType === 'PI' ? 'PI' : 'IV';

  return `DNI-${prefix}-${year}-${String(number).padStart(3, '0')}`;
}

// =====================================================
// Get next serial number for a document type
// Auto-increments the counter and returns the number
// =====================================================

async function getNextSerialNumberAndIncrement(docType) {
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
  const { number, year } = await getNextSerialNumberAndIncrement(docType);

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
// Get the latest Ref PO and Ref PI from ref_counters
// Ordered by year + auto-increment (increasing order)
// =====================================================

async function getLatestRefValues() {
  const year = new Date().getFullYear().toString();

  const predefinedSeeds = {
    PO: { '2025': '0198', '2026': '0199' },
    PI: { '2025': 'DNI-PI-2025-001', '2026': 'DNI-PI-2026-102' }
  };

  const result = await pool.query(
    `SELECT ref_type, last_value
     FROM ref_counters
     WHERE year = $1
     ORDER BY
       CASE ref_type WHEN 'PO' THEN 1 WHEN 'PI' THEN 2 END`,
    [year]
  );

  const refs = { refPo: '', refPi: '' };
  for (const row of result.rows) {
    if (row.ref_type === 'PO') refs.refPo = row.last_value;
    if (row.ref_type === 'PI') refs.refPi = row.last_value;
  }

  // Fallback to predefined seeds if no rows exist for current year
  if (!refs.refPo && predefinedSeeds.PO[year]) refs.refPo = predefinedSeeds.PO[year];
  if (!refs.refPi && predefinedSeeds.PI[year]) refs.refPi = predefinedSeeds.PI[year];

  return refs;
}


// =====================================================
// Issue the next Ref PO or Ref PI value
// Increments from the last_value and updates the counter
// Returns the newly issued value
// =====================================================

async function issueNextRefValue(refType) {
  const year = new Date().getFullYear().toString();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock and read the current counter row
    const current = await client.query(
      `SELECT last_value, predefined_value
       FROM ref_counters
       WHERE ref_type = $1 AND year = $2
       FOR UPDATE`,
      [refType, year]
    );

    if (current.rows.length === 0) {
      // First time for this year — seed from predefined values
      const predefinedSeeds = {
        PO: { '2025': '0198', '2026': '0199' },
        PI: { '2025': 'DNI-PI-2025-001', '2026': 'DNI-PI-2026-102' }
      };
      const seed = (predefinedSeeds[refType] && predefinedSeeds[refType][year]) || '0001';

      await client.query(
        `INSERT INTO ref_counters (ref_type, year, predefined_value, last_value)
         VALUES ($1, $2, $3, $3)
         ON CONFLICT (ref_type, year) DO UPDATE
         SET last_value = EXCLUDED.last_value`,
        [refType, year, seed]
      );

      await client.query('COMMIT');
      return seed;
    }

    const { last_value } = current.rows[0];

    // Derive next value
    let nextValue;
    if (refType === 'PO') {
      // Pure numeric, zero-padded to 4 digits: '0199' → '0200'
      const num = parseInt(last_value, 10) + 1;
      nextValue = String(num).padStart(4, '0');
    } else {
      // PI format: DNI-PI-YYYY-NNN → increment NNN
      const parts = last_value.split('-');
      const lastSegment = parts[parts.length - 1];
      const num = parseInt(lastSegment, 10) + 1;
      parts[parts.length - 1] = String(num);
      nextValue = parts.join('-');
    }

    // Save the new last_value
    await client.query(
      `UPDATE ref_counters
       SET last_value = $1, updated_at = NOW()
       WHERE ref_type = $2 AND year = $3`,
      [nextValue, refType, year]
    );

    await client.query('COMMIT');
    return nextValue;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
  getNextDocumentNumber,
  getNextSerialNumberAndIncrement,
  generateDocumentNumber,
  saveDocument,
  getAllDocuments,
  getLatestRefValues,
  issueNextRefValue
};
