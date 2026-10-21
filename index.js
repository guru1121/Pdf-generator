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
// Helper: Format a party (buyer/seller) address
// Joins the available address parts into a single line
// =====================================================

function formatAddress(party) {
    if (!party) return '';

    return [
        party.addressLine1 || party.address,
        party.addressLine2,
        party.city,
        party.state,
        party.pincode
    ]
        .map(part => (part || '').toString().trim())
        .filter(Boolean)
        .join(', ');
}


// =====================================================
// Helper: Format a date to "DD Mon YYYY"
// Accepts DD/MM/YY, DD.MM.YY, DD-MM-YYYY and YYYY-MM-DD
// =====================================================

function formatDateDDMMYY(dateStr) {
    if (!dateStr) return '';

    const raw = String(dateStr).trim();

    let day;
    let month;
    let year;

    // YYYY-MM-DD
    let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

    if (match) {
        year = Number(match[1]);
        month = Number(match[2]);
        day = Number(match[3]);
    } else {

        // DD/MM/YY , DD.MM.YY , DD-MM-YYYY
        match = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);

        if (match) {
            day = Number(match[1]);
            month = Number(match[2]);

            const rawYear = Number(match[3]);

            year = rawYear < 100
                ? (rawYear >= 70 ? 1900 + rawYear : 2000 + rawYear)
                : rawYear;
        }
    }

    if (!day || !month || !year) return raw;

    const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    return `${String(day).padStart(2, '0')} ${months[month - 1]} ${year}`;
}

// =====================================================
// Helper: Map a raw payment method value to a readable label
// The dropdown submits values like "BankTransfer" / "UPI" / "Cash"
// =====================================================

function formatPaymentMethod(value) {
    if (!value) return '';

    const raw = String(value).trim();

    if (!raw) return '';

    const labels = {
        banktransfer: 'Bank Transfer',
        'bank transfer': 'Bank Transfer',
        bank: 'Bank Transfer',
        neft: 'NEFT',
        rtgs: 'RTGS',
        upi: 'UPI',
        cash: 'Cash',
        cheque: 'Cheque',
        check: 'Cheque',
        demanddraft: 'Demand Draft',
        'demand draft': 'Demand Draft',
        dd: 'Demand Draft',
        card: 'Card',
        creditcard: 'Credit Card',
        'credit card': 'Credit Card',
        debitcard: 'Debit Card',
        'debit card': 'Debit Card',
        netbanking: 'Net Banking',
        'net banking': 'Net Banking'
    };

    return labels[raw.toLowerCase().replace(/[\s_-]+/g, '')]
        || labels[raw.toLowerCase()]
        || raw;
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
                    '12/1, Nandbagh Sector D, Army Head Quarter',
                city: 'Indore',
                state: 'Madhya Pradesh',
                pincode: '452006',
                gstin: '23AAICI1972L1ZC',
                contact: 'info@dictionarynetworks.in, +91-96636 81258'
            },

            buyer: {
                name: 'GOIP GLOBAL SERVICES PRIVATE LIMITED',
                addressLine1:
                    '207/88, Second Floor, Skipper Towers, Nehru Place',
                city: 'New Delhi',
                state: 'Delhi',
                pincode: '110019',
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

        const body = req.body || {};

        // The form may submit either nested (buyer: {...}) or flat
        // (buyer_name, buyer_address, ...) fields - support both.
        const bodyBuyer = body.buyer || {};
        const bodySeller = body.seller || {};

        const pick = (...values) => {
            for (const value of values) {
                if (value !== undefined && value !== null && value !== '') {
                    return value;
                }
            }
            return undefined;
        };

        const data = {
            ...body,
            documentType: 'invoice',
            invoiceNumber,
            buyer: {
                name: pick(bodyBuyer.name, body.buyer_name),
                gstin: pick(bodyBuyer.gstin, body.buyer_gstin),
                addressLine1: pick(
                    bodyBuyer.addressLine1,
                    bodyBuyer.address,
                    body.buyer_address
                ),
                addressLine2: pick(bodyBuyer.addressLine2, body.buyer_address2),
                city: pick(bodyBuyer.city, body.buyer_city),
                state: pick(bodyBuyer.state, body.buyer_state),
                pincode: pick(bodyBuyer.pincode, body.buyer_pincode)
            },
            seller: {
                name: pick(bodySeller.name, body.seller_name),
                addressLine1: pick(
                    bodySeller.addressLine1,
                    bodySeller.address,
                    body.seller_address
                ),
                addressLine2: pick(bodySeller.addressLine2, body.seller_address2),
                city: pick(bodySeller.city, body.seller_city),
                state: pick(bodySeller.state, body.seller_state),
                pincode: pick(bodySeller.pincode, body.seller_pincode),
                gstin: pick(bodySeller.gstin, body.seller_gstin),
                contact: pick(bodySeller.contact, body.seller_contact)
            },
            invoiceDate: pick(body.invoiceDate, body.invoice_date),
            paymentDate: pick(body.paymentDate, body.payment_date),
            paymentMethod: formatPaymentMethod(
                pick(body.paymentMethod, body.payment_method)
            ),
            placeOfSupply: pick(body.placeOfSupply, body.place_of_supply),
            refPo: pick(body.refPo, body.ref_po),
            refPi: pick(body.refPi, body.ref_pi),
            gstRate: Number(pick(body.gstRate, body.gst_rate)) || 18,
            items: body.items || []
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
            invoiceDate: formatDateDDMMYY(data.invoiceDate),
            placeOfSupply: data.placeOfSupply,
            gstRate,
            items,
            subtotal: totals.subtotal,
            gstAmount: totals.gstAmount,
            grandTotal: totals.grandTotal,
            paymentMethod: data.paymentMethod,
            paymentDate: formatDateDDMMYY(data.paymentDate),
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

        const body = req.body || {};

        // The form may submit either nested (buyer: {...}) or flat
        // (buyer_name, buyer_address, ...) fields - support both.
        const bodyBuyer = body.buyer || {};
        const bodySeller = body.seller || {};

        const pick = (...values) => {
            for (const value of values) {
                if (value !== undefined && value !== null && value !== '') {
                    return value;
                }
            }
            return undefined;
        };

        const data = {
            ...body,
            documentType: 'proforma',
            invoiceNumber: piNumber,
            buyer: {
                name: pick(bodyBuyer.name, body.buyer_name),
                gstin: pick(bodyBuyer.gstin, body.buyer_gstin),
                addressLine1: pick(
                    bodyBuyer.addressLine1,
                    bodyBuyer.address,
                    body.buyer_address
                ),
                addressLine2: pick(bodyBuyer.addressLine2, body.buyer_address2),
                city: pick(bodyBuyer.city, body.buyer_city),
                state: pick(bodyBuyer.state, body.buyer_state),
                pincode: pick(bodyBuyer.pincode, body.buyer_pincode)
            },
            seller: {
                name: pick(bodySeller.name, body.seller_name),
                addressLine1: pick(
                    bodySeller.addressLine1,
                    bodySeller.address,
                    body.seller_address
                ),
                addressLine2: pick(bodySeller.addressLine2, body.seller_address2),
                city: pick(bodySeller.city, body.seller_city),
                state: pick(bodySeller.state, body.seller_state),
                pincode: pick(bodySeller.pincode, body.seller_pincode),
                gstin: pick(bodySeller.gstin, body.seller_gstin),
                contact: pick(bodySeller.contact, body.seller_contact)
            },
            invoiceDate: pick(body.invoiceDate, body.invoice_date),
            paymentDate: pick(body.paymentDate, body.payment_date),
            paymentMethod: formatPaymentMethod(
                pick(body.paymentMethod, body.payment_method)
            ),
            placeOfSupply: pick(body.placeOfSupply, body.place_of_supply),
            refPo: pick(body.refPo, body.ref_po),
            refPi: pick(body.refPi, body.ref_pi),
            gstRate: Number(pick(body.gstRate, body.gst_rate)) || 18,
            items: body.items || []
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
            buyerAddress: formatAddress(data.buyer),
            invoiceDate: formatDateDDMMYY(data.invoiceDate),
            placeOfSupply: data.placeOfSupply,
            gstRate,
            items,
            subtotal: totals.subtotal,
            gstAmount: totals.gstAmount,
            grandTotal: totals.grandTotal,
            paymentMethod: data.paymentMethod,
            paymentDate: formatDateDDMMYY(data.paymentDate),
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
