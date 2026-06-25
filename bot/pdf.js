const puppeteer = require('puppeteer');

/**
 * Render the existing browser tool's print view (?id=<id>) to a PDF buffer
 * via headless Chromium. Reuses the tool's own print CSS, so the PDF is
 * pixel-for-pixel the same as a manual "Save as PDF" from the browser.
 * @param {object} args
 * @param {number} args.port - the local Express port serving /quote-tool/
 * @param {string} args.id - the quote id (quotes/<id>.json)
 * @returns {Promise<Buffer>}
 */
async function renderQuotePdf({ port, id }){
  const browser = await puppeteer.launch({
    headless: 'new',
    // In Docker (Render etc.) the Dockerfile installs system Chromium and points
    // this at it instead of Puppeteer's bundled download — smaller image, avoids
    // the "Chromium not found" failure mode some containers hit. Outside Docker
    // (local dev, the Hetzner deploy) this stays unset and Puppeteer uses its own.
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try{
    const page = await browser.newPage();
    const url = `http://127.0.0.1:${port}/quote-tool/?id=${encodeURIComponent(id)}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
    await page.waitForFunction('window.__quoteReady === true', { timeout: 15000 });
    await page.emulateMediaType('print');
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '0mm', right: '0mm' }
    });
  } finally {
    await browser.close();
  }
}

module.exports = { renderQuotePdf };
