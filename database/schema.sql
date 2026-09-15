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

-- =====================================================
-- Ref PO / Ref PI Counter Table (predefined + auto-increment)
-- =====================================================

CREATE TABLE IF NOT EXISTS ref_counters (
  id SERIAL PRIMARY KEY,
  ref_type TEXT NOT NULL,            -- 'PO' or 'PI'
  year      TEXT NOT NULL,           -- e.g. '2026'
  predefined_value TEXT NOT NULL,    -- starting value, e.g. '0199' or 'DNI-PI-2026-103'
  last_value TEXT NOT NULL,          -- last issued value (auto-incremented from predefined)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (ref_type, year)            -- one counter per ref_type per year
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ref_counters_type_year ON ref_counters(ref_type, year);

-- Seed predefined starting values (only if the row doesn't already exist)
-- 2025: starting values for the 2025 fiscal year
INSERT INTO ref_counters (ref_type, year, predefined_value, last_value)
VALUES
  ('PO', '2025', '0198',  '0198'),
  ('PI', '2025', 'DNI-PI-2025-001', 'DNI-PI-2025-001')
ON CONFLICT (ref_type, year) DO NOTHING;

-- 2026: starting values for the 2026 fiscal year
INSERT INTO ref_counters (ref_type, year, predefined_value, last_value)
VALUES
  ('PO', '2026', '0199',  '0199'),
  ('PI', '2026', 'DNI-PI-2026-102', 'DNI-PI-2026-102')
ON CONFLICT (ref_type, year) DO NOTHING;