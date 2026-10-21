// =====================================================
// Invoice Generator - Main Application
// =====================================================

require('dotenv').config();

const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const ejs = require('ejs');
const path = require('path');

const db = require('./db');

const app = express();
app.use(express.json());

const port = process.env.PORT || 4000;

app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

// Ensure generatedPdf directory exists
const pdfDir = path.join(__dirname, 'generatedPdf');

if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
}

// Serve form
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve generated PDFs
app.use(
    '/generatedPdf',
    express.static(path.join(__dirname, 'generatedPdf'))
);


// =====================================================
// API: Get latest Ref PO and Ref PI numbers
// =====================================================

app.get('/api/latest-refs', async (req, res) => {
    try {
        const refs = await db.getLatestRefValues();

        res.status(200).json({
            refPo: refs.refPo || '',
            refPi: refs.refPi || ''
        });
    } catch (err) {
        console.error('Failed to fetch latest refs:', err);

        res.status(500).json({
            error: 'Failed to fetch latest refs'
        });
    }
});

// =====================================================
// API: Get next document number (preview only, does not increment)
// =====================================================

app.get('/api/next-number/:docType', async (req, res) => {
    try {
        const { docType } = req.params;
        const nextNumber = await db.getNextDocumentNumber(docType);

        res.status(200).json({
            nextNumber
        });
    } catch (err) {
        console.error('Failed to fetch next number:', err);

        res.status(500).json({
            error: 'Failed to fetch next number'
        });
    }
});


// =====================================================
// API: Get all documents (history)
// =====================================================

app.get('/api/documents', async (req, res) => {
    try {
        const documents = await db.getAllDocuments();

        res.status(200).json(documents);
    } catch (err) {
        console.error('Failed to fetch documents:', err);

        res.status(500).json({
            error: 'Failed to fetch documents'
        });
    }
});


// =====================================================
// Helper function to load images
// =====================================================

function getImages() {
    const logoPath = path.join(
        __dirname,
        'public',
        'images',
        'Indo.png'
    );

    const signPath = path.join(
        __dirname,
        'public',
        'images',
        'dir_sign.png'
    );

    const logoBuffer = fs.readFileSync(logoPath);
    const signBuffer = fs.readFileSync(signPath);

    const logoImage =
        'data:image/png;base64,' +
        logoBuffer.toString('base64');

    const dirSignImage =
        'data:image/png;base64,' +
        signBuffer.toString('base64');

    return {
        logoImage,
        dirSignImage
    };
}


// =====================================================
// Helper: Calculate totals
// =====================================================

function calculateTotals(items, gstRate) {
    const subtotal = items.reduce(
        (sum, item) =>
            sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
        0
    );

    const gstAmount = +(subtotal * gstRate / 100).toFixed(2);
    const grandTotal = subtotal + gstAmount;

    return {
        subtotal,
        gstAmount,
        grandTotal
    };
}


// =====================================================
// Preview - Normal Invoice
// =====================================================

app.get('/preview', async (req, res) => {
    try {
        const { logoImage, dirSignImage } = getImages();

        const sampleData = {
            documentType: 'invoice',

            seller: {
                name: 'INDO DICTIONARY NETWORKS PRIVATE LIMITED',
                addressLine1:
                    '12/1, Nandbagh Sector D, Army Head Quarter, Indore,',
                addressLine2:
                    'Indore, Madhya Pradesh, India - 452006',
                city: 'Indore',
                gstin: '23AAICI1972L1ZC',
                contact: 'info@dictionarynetworks.in'
            },

            buyer: {
                name: 'GOIP GLOBAL SERVICES PRIVATE LIMITED',
                addressLine1:
                    '207/88, Second Floor, Skipper Towers, Nehru Place, New Delhi-110019',
                addressLine2:
                    'Corporate office at D-206, Sector-63, Noida-201301(UP), India',
                city: 'New Delhi',
                gstin: '09AABCS2463B1ZO'
            },

            invoiceNumber: 'DNI-IV-2026-101',
            invoiceDate: '30 May, 2026',

            refPo: '0195',
            refPi: 'DNI-PI-2026-001',

            placeOfSupply: 'Madhya Pradesh (23)',

            gstRate: 18,

            items: [
                {
                    description:
                        'Advance payment for firmware development based on the Realtek chipset',
                    quantity: 1,
                    unitPrice: 350000
                }
            ],

            paymentMethod: 'Bank Transfer',
            paymentDate: '30 May, 2026',

            timestamp: new Date().toLocaleString()
        };

        const html = await ejs.renderFile(
            path.join(
                __dirname,
                'templates',
                'pdf-template.ejs'
            ),
            {
                data: sampleData,
                logoImage,
                dirSignImage
            }
        );

        res.send(html);

    } catch (err) {
        console.error('Preview failed:', err);

        res.status(500).json({
            error: 'Preview failed'
        });
    }
});


// =====================================================
// NORMAL TAX INVOICE
// POST /genpdf
// =====================================================

app.post('/genpdf', async (req, res) => {

    console.log('Tax invoice generation started');

    try {
        // Auto-generate the next invoice number
        const invoiceNumber = await db.generateDocumentNumber('INVOICE');

        const data = {
            ...req.body,
            documentType: 'invoice',
            invoiceNumber,
            buyer: {
                name: req.body.buyer_name,
                gstin: req.body.buyer_gstin,
                address: req.body.buyer_address,
                city: req.body.buyer_city,
                state: req.body.buyer_state,
                pincode: req.body.buyer_pincode
            },
            seller: {
                name: req.body.seller_name,
                address: req.body.seller_address,
                city: req.body.seller_city,
                state: req.body.seller_state,
                pincode: req.body.seller_pincode,
                gstin: req.body.seller_gstin,
                contact: req.body.seller_contact
            }
        };

        const {
            logoImage,
            dirSignImage
        } = getImages();

        const html = await ejs.renderFile(
            path.join(
                __dirname,
                'templates',
                'pdf-template.ejs'
            ),
            {
                data,
                logoImage,
                dirSignImage
            }
        );

        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        await page.setContent(html, {
            waitUntil: 'networkidle0'
        });

        const filename =
            `${Date.now()}_invoice.pdf`;

        const pdfPath =
            path.join(pdfDir, filename);

        await page.pdf({
            path: pdfPath,
            format: 'A4',
            printBackground: true
        });

        await browser.close();

        const url =
            `/generatedPdf/${filename}`;

        // Calculate totals for database
        const items = data.items || [];
        const gstRate = Number(data.gstRate) || 18;
        const totals = calculateTotals(items, gstRate);

        // Save document to Supabase database
        await db.saveDocument({
            docType: 'INVOICE',
            docNumber: invoiceNumber,
            refPo: data.refPo,
            refPi: data.refPi,
            buyerName: data.buyer && data.buyer.name,
            buyerGstin: data.buyer && data.buyer.gstin,
            buyerAddress: formatAddress(data.buyer),
            invoiceDate: formatDateDDMMYY(data.invoice_date),
            placeOfSupply: data.place_of_supply,
            gstRate,
            items,
            subtotal: totals.subtotal,
            gstAmount: totals.gstAmount,
            grandTotal: totals.grandTotal,
            paymentMethod: data.payment_method,
            paymentDate: formatDateDDMMYY(data.payment_date),
            pdfUrl: url
        });

        // Update Ref PO counter in ref_counters table
        const nextRefPo = await db.issueNextRefValue('PO');
        console.log('Next Ref PO issued:', nextRefPo);

        console.log(
            'Tax invoice generated:',
            url,
            '| Number:',
            invoiceNumber
        );

        res.status(200).json({
            message:
                'Tax invoice generated successfully',
            type: 'invoice',
            invoiceNumber,
            url,
            refPo: nextRefPo,
            refPi: data.refPi
        });

    } catch (err) {

        console.error(
            'Tax invoice generation failed:',
            err
        );

        res.status(500).json({
            error:
                'Failed to generate tax invoice'
        });
    }
});


// =====================================================
// PROFORMA INVOICE
// POST /genproformapdf
// =====================================================

app.post('/genproformapdf', async (req, res) => {

    console.log(
        'Proforma invoice generation started'
    );

    try {
        // Auto-generate the next PI number
        const piNumber = await db.generateDocumentNumber('PI');

        const data = {
            ...req.body,
            documentType: 'proforma',
            invoiceNumber: piNumber,
            buyer: {
                name: req.body.buyer_name,
                gstin: req.body.buyer_gstin,
                address: req.body.buyer_address,
                city: req.body.buyer_city,
                state: req.body.buyer_state,
                pincode: req.body.buyer_pincode
            },
            seller: {
                name: req.body.seller_name,
                address: req.body.seller_address,
                city: req.body.seller_city,
                state: req.body.seller_state,
                pincode: req.body.seller_pincode,
                gstin: req.body.seller_gstin,
                contact: req.body.seller_contact
            }
        };

        const {
            logoImage,
            dirSignImage
        } = getImages();

        const html = await ejs.renderFile(
            path.join(
                __dirname,
                'templates',
                'pdf-template.ejs'
            ),
            {
                data,
                logoImage,
                dirSignImage
            }
        );

        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        await page.setContent(html, {
            waitUntil: 'networkidle0'
        });

        const filename =
            `${Date.now()}_proforma_invoice.pdf`;

        const pdfPath =
            path.join(pdfDir, filename);

        await page.pdf({
            path: pdfPath,
            format: 'A4',
            printBackground: true
        });

        await browser.close();

        const url =
            `/generatedPdf/${filename}`;

        // Calculate totals for database
        const items = data.items || [];
        const gstRate = Number(data.gstRate) || 18;
        const totals = calculateTotals(items, gstRate);

        // Save document to Supabase database
        await db.saveDocument({
            docType: 'PI',
            docNumber: piNumber,
            refPo: data.refPo,
            refPi: data.refPi,
            buyerName: data.buyer && data.buyer.name,
            buyerGstin: data.buyer && data.buyer.gstin,
            buyerAddress: [
                data.buyer && data.buyer.addressLine1,
                data.buyer && data.buyer.addressLine2,
                data.buyer && data.buyer.city
            ].filter(Boolean).join(', '),
            invoiceDate: data.invoiceDate,
            placeOfSupply: data.placeOfSupply,
            gstRate,
            items,
            subtotal: totals.subtotal,
            gstAmount: totals.gstAmount,
            grandTotal: totals.grandTotal,
            paymentMethod: data.paymentMethod,
            paymentDate: data.paymentDate,
            pdfUrl: url
        });

        // Update Ref PI counter in ref_counters table
        const nextRefPi = await db.issueNextRefValue('PI');
        console.log('Next Ref PI issued:', nextRefPi);

        console.log(
            'Proforma invoice generated:',
            url,
            '| Number:',
            piNumber
        );

        res.status(200).json({
            message:
                'Proforma invoice generated successfully',
            type: 'proforma',
            invoiceNumber: piNumber,
            url,
            refPi: nextRefPi
        });

    } catch (err) {

        console.error(
            'Proforma invoice generation failed:',
            err
        );

        res.status(500).json({
            error:
                'Failed to generate proforma invoice'
        });
    }
});


// =====================================================
// Start Server
// =====================================================

app.listen(port, () => {
    console.log(
        `App is running at http://localhost:${port}`
    );
});
