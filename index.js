const express = require('express');
const puppeteer = require ('puppeteer');
const fs = require('fs');
const ejs = require('ejs');
const path = require('path');

const app = express();
app.use(express.json());
const port = 4000;

app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'))

// Ensure generatedPdf directory exists
const pdfDir = path.join(__dirname, 'generatedPdf');
if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
}

// Serve a simple form at the root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Expose generated PDFs for download
app.use('/generatedPdf', express.static(path.join(__dirname, 'generatedPdf')));

// Preview route for inspecting invoice HTML
app.get('/preview', async (req, res) => {
    try {
        const logoPath = path.join(__dirname, 'public', 'images', 'Indo.png');
        const signPath = path.join(__dirname, 'public', 'images', 'dir_sign.png');
        
        const logoBuffer = fs.readFileSync(logoPath);
        const signBuffer = fs.readFileSync(signPath);
        
        const logoImage = 'data:image/png;base64,' + logoBuffer.toString('base64');
        const dirSignImage = 'data:image/png;base64,' + signBuffer.toString('base64');

        const sampleData = {
            data: {
                seller: {
                    name: 'INDO DICTIONARY NETWORKS PRIVATE LIMITED',
                    addressLine1: '12/1, Nandbagh Sector D, Army Head Quarter, Indore,',
                    addressLine2: 'Indore, Madhya Pradesh, India - 452006',
                    city: 'Indore',
                    gstin: '23AAICI1972L1ZC',
                    contact: 'info@dictionarynetworks.in'
                },
                buyer: {
                    name: 'GOIP GLOBAL SERVICES PRIVATE LIMITED',
                    addressLine1: '207/88,second Floor, Skipper Towers,Nehru Place, New Delhi-110019',
                    addressLine2: 'Corporate office at D-206, Sector-63, Noida-201301(UP),India',
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
                        description: 'Advance payment for firmware development based on the Realtek chipset',
                        quantity: 1,
                        unitPrice: 350000
                    }
                ],
                paymentMethod: 'Bank Transfer',
                paymentDate: '30 May, 2026',
                timestamp: new Date().toLocaleString()
            },
            logoImage: logoImage,
            dirSignImage: dirSignImage
        };

        const html = await ejs.renderFile(
            path.join(__dirname, 'templates', 'pdf-template.ejs'),
            sampleData
        );

        res.send(html);
    } catch (err) {
        console.error('Preview failed', err);
        res.status(500).json({ error: 'Preview failed' });
    }
});

app.post('/genpdf', async (req, res) => {
    console.log('genpdf route hit');
    const data = req.body;

    try {
        // Read images and convert to base64
        const logoPath = path.join(__dirname, 'public', 'images', 'Indo.png');
        const signPath = path.join(__dirname, 'public', 'images', 'dir_sign.png');
        
        const logoBuffer = fs.readFileSync(logoPath);
        const signBuffer = fs.readFileSync(signPath);
        
        const logoImage = 'data:image/png;base64,' + logoBuffer.toString('base64');
        const dirSignImage = 'data:image/png;base64,' + signBuffer.toString('base64');

        // Pass images to template
        const templateData = { data, logoImage, dirSignImage };

        const html = await ejs.renderFile(
            path.join(__dirname, 'templates', 'pdf-template.ejs'),
            templateData
        );

        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdfDir = path.join(__dirname, 'generatedPdf');
        if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir);

        const filename = `${Date.now()}_document.pdf`;
        const pdfPath = path.join(pdfDir, filename);

        await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });

        await browser.close();

        // Return a URL the client can use to download the file
        const url = `/generatedPdf/${filename}`;
        res.status(200).json({ message: 'PDF generated successfully', url });
    } catch (err) {
        console.error('PDF generation Failed', err);
        res.status(500).json({ error: 'Failed to generate' });
    }
});

app.listen(port, ()=>{
    console.log(`app is running at http://localhost:${port}`);
})