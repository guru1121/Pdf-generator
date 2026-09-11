-- =====================================================
-- Invoice Generator - Supabase PostgreSQL Schema
-- =====================================================

-- Sequence counters for auto-generating serial numbers
CREATE TABLE IF NOT EXISTS serial_counters (
  id SERIAL PRIMARY KEY,
  doc_type TEXT NOT NULL UNIQUE,          -- 'PI' or 'INVOICE'
  year TEXT NOT NULL,                     -- e.g. '2026'
  last_number INTEGER NOT NULL DEFAULT 0, -- last used serial number
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store all generated documents (PI and Tax Invoices)
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  doc_type TEXT NOT NULL,                 -- 'PI' or 'INVOICE'
  doc_number TEXT NOT NULL UNIQUE,        -- e.g. DNI-PI-2026-102
  ref_po TEXT,                            -- Ref. PO Number
  ref_pi TEXT,                            -- Ref. PI Number
  buyer_name TEXT,
  buyer_gstin TEXT,
  buyer_address TEXT,
  invoice_date TEXT,
  place_of_supply TEXT,
  gst_rate NUMERIC,
  items JSONB,
  subtotal NUMERIC,
  gst_amount NUMERIC,
  grand_total NUMERIC,
  payment_method TEXT,
  payment_date TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_doc_number ON documents(doc_number);
CREATE INDEX IF NOT EXISTS idx_documents_ref_po ON documents(ref_po);
CREATE INDEX IF NOT EXISTS idx_documents_ref_pi ON documents(ref_pi);

-- Seed initial counters based on existing data
-- PI counter starts at 102 (since DNI-PI-2026-102 is the latest)
INSERT INTO serial_counters (doc_type, year, last_number)
VALUES ('PI', '2026', 102)
ON CONFLICT (doc_type) DO NOTHING;

-- Invoice counter starts at 101 (since DNI-IV-2026-101 is the latest)
INSERT INTO serial_counters (doc_type, year, last_number)
VALUES ('INVOICE', '2026', 101)
ON CONFLICT (doc_type) DO NOTHING;