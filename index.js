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

// Serve a simple form at the root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Expose generated PDFs for download
app.use('/generatedPdf', express.static(path.join(__dirname, 'generatedPdf')));

app.post('/genpdf', async (req, res) => {
    console.log('genpdf route hit');
    const data = req.body;

    try {
        const html = await ejs.renderFile(
            path.join(__dirname, 'templates', 'pdf-template.ejs'),
            { data }
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