const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const ejs = require('ejs');
const path = require('path');

const app = express();
app.use(express.json());

const port = 4000;

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

        const data = {
            ...req.body,
            documentType: 'invoice'
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

        console.log(
            'Tax invoice generated:',
            url
        );

        res.status(200).json({
            message:
                'Tax invoice generated successfully',
            type: 'invoice',
            url
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

        const data = {
            ...req.body,

            // Important:
            // This tells the EJS template that
            // this is a proforma invoice.
            documentType: 'proforma'
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

        console.log(
            'Proforma invoice generated:',
            url
        );

        res.status(200).json({
            message:
                'Proforma invoice generated successfully',
            type: 'proforma',
            url
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

