# 🚀 Deployment Guide - Render + Supabase PostgreSQL

This guide will help you deploy the Invoice Generator to Render with Supabase PostgreSQL.

---

## 📋 Prerequisites

1. **Render Account** - Sign up at [render.com](https://render.com)
2. **Supabase Account** - Sign up at [supabase.com](https://supabase.com)
3. **GitHub Repository** - To connect to Render

---

## 🗄 Step 1: Setup Supabase Database

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Database Connection String**:
   - Go to: **Project Settings → Database → Connection string**
   - Copy the `URI` connection string
   - It looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`

3. Run the SQL schema:
   - Go to: **SQL Editor → New Query**
   - Copy the entire contents of `database/schema.sql`
   - Paste and run it
   - This creates:
     - `serial_counters` table (for auto-generating serial numbers)
     - `documents` table (to store all generated PI and Invoices)
     - Seed data starting PI at #102 and Invoice at #101

---

## 🚀 Step 2: Deploy to Render

### Option A: Using Render Dashboard (Recommended)

1. **Push code to GitHub:**
   ```bash
   cd Pdf-generator
   git init
   git add .
   git commit -m "Initial commit with Supabase + Render support"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

2. **Create Web Service on Render:**
   - Go to [render.com](https://render.com) → **New → Web Service**
   - Connect your GitHub repo
   - Render will auto-detect the settings

3. **Configure the service:**
   - **Name:** `invoice-generator`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

4. **Add Environment Variables:**
   - Click **Environment** tab
   - Add these variables:
     - `DATABASE_URL` = Your Supabase connection string
     - `NODE_ENV` = `production`

5. **Deploy:**
   - Click **Create Web Service**
   - Render will build and deploy automatically

### Option B: Using render.yaml (Blueprint)

1. Push code to GitHub
2. Go to [render.com](https://render.com) → **New → Blueprint**
3. Connect your GitHub repo
4. Render will read `render.yaml` automatically
5. You'll need to set the `DATABASE_URL` environment variable when prompted

---

## 📝 How It Works

### Auto-Generated Serial Numbers

- **Tax Invoices:** Auto-generate as `DNI-IV-2026-102`, `DNI-IV-2026-103`, etc.
- **Proforma Invoices (PI):** Auto-generate as `DNI-PI-2026-103`, `DNI-PI-2026-104`, etc.
- The numbers increment automatically with each new document

### Ref PO / Ref PI Saving

- When you create a **PI**, its number becomes the **latest Ref PI** automatically
- When you create a **Tax Invoice**, it references the latest **Ref PO** and **Ref PI**
- All documents are saved to Supabase with their Ref PO and Ref PI numbers

### Database Tables

1. **serial_counters** - Tracks the next serial number for each document type
2. **documents** - Stores all generated invoices with full details:
   - Document number, type
   - Ref PO and Ref PI numbers
   - Buyer details
   - Items, totals, GST
   - PDF URL

---

## 🔧 Troubleshooting

### Puppeteer on Render

Render's free tier supports Puppeteer. The code already includes:
- `--no-sandbox` and `--disable-setuid-sandbox` flags
- These are required for running Chrome in a containerized environment

### Database Connection Issues

1. Check your `DATABASE_URL` is correct
2. Make sure the SQL schema has been run
3. Check Supabase's connection pooler settings if you get connection errors

### Getting Your Supabase Connection String

1. Log into [supabase.com](https://supabase.com)
2. Open your project
3. Go to **Project Settings** → **Database**
4. Under **Connection string**, copy the URI
5. Replace `[YOUR-PASSWORD]` with your database password

---

## 📊 Viewing Generated Documents

After deployment, you can access:
- **Main form:** `https://your-app.onrender.com/`
- **API - Latest refs:** `https://your-app.onrender.com/api/latest-refs`
- **API - All documents:** `https://your-app.onrender.com/api/documents`