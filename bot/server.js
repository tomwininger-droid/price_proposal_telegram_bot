const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { getBranding } = require('./branding');
const { getSetupStatus } = require('./setup-status');
const { QUOTES_DIR } = require('./store');

const TOOL_DIR = path.join(__dirname, '..');
const INDEX_PATH = path.join(TOOL_DIR, 'index.html');

/**
 * The /setup-status page isn't meant to be public, but a non-technical deployer
 * shouldn't have to invent their own secret either — derive a stable, hard-to-guess
 * default from the Telegram token (already a secret only the deployer has) if
 * SETUP_STATUS_TOKEN isn't explicitly set.
 */
function getSetupStatusToken(){
  if (process.env.SETUP_STATUS_TOKEN) return process.env.SETUP_STATUS_TOKEN;
  return crypto.createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN || '').digest('hex').slice(0, 16);
}

function renderSetupStatusPage(results){
  const rows = results.map(r => {
    const icon = r.ok === true ? '✅' : r.ok === false ? '❌' : '⚪️';
    return `<tr><td>${icon}</td><td>${r.name}</td><td>${r.detail}</td></tr>`;
  }).join('');
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">
<title>בדיקת תקינות</title>
<style>
body{ font-family:-apple-system,'Segoe UI',Arial,sans-serif; padding:24px; background:#f4f3fa; }
table{ border-collapse:collapse; background:#fff; width:100%; max-width:640px; }
td{ padding:10px 14px; border-bottom:1px solid #ddd; text-align:right; }
h1{ font-size:18px; }
</style></head><body>
<h1>בדיקת תקינות החיבורים</h1>
<table>${rows}</table>
</body></html>`;
}

/**
 * Apply the configured business identity to the tool's index.html: 4 targeted
 * text replacements + one small <style> override for the 2 brand colors.
 * Intentionally not a templating engine — index.html ships with the original
 * Brands Or Not text/colors as literals, and this just swaps them in-memory.
 */
function brandIndexHtml(rawHtml){
  const { businessName, businessSlogan, primaryColor, bgColor } = getBranding();
  return rawHtml
    .replace('<title>הצעת מחיר — Brands Or Not</title>', `<title>הצעת מחיר — ${businessName}</title>`)
    .replace('<div class="brand-logo">BRANDS<br>OR<br>NOT</div>', `<div class="brand-logo">${businessName}</div>`)
    .replace('<div class="brand-name">Brands Or Not</div>', `<div class="brand-name">${businessName}</div>`)
    .replace('<div class="brand-slogan">עיצוב. חוויית משתמש. דיגיטל</div>', `<div class="brand-slogan">${businessSlogan}</div>`)
    .replace(
      'הצעה זו תקפה ל-14 יום ממועד הוצאתה · Brands Or Not',
      `הצעה זו תקפה ל-14 יום ממועד הוצאתה · ${businessName}`
    )
    .replace(
      '</head>',
      `<style>:root{ --indigo:${primaryColor}; --lavender:${bgColor}; }</style>\n</head>`
    );
}

/**
 * Serve the existing browser tool (index.html, app.js, styles.css, templates.js)
 * and the generated quote JSONs under /quote-tool/.
 * @param {number} port
 * @returns {Promise<void>}
 */
function startServer(port){
  const app = express();

  const brandedHtml = brandIndexHtml(fs.readFileSync(INDEX_PATH, 'utf8'));
  app.get(['/quote-tool/', '/quote-tool/index.html'], (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8').send(brandedHtml);
  });

  // Quotes may live outside TOOL_DIR (under DATA_DIR, e.g. a mounted Render disk),
  // so they're served from their real location explicitly, ahead of the general mount.
  app.use('/quote-tool/quotes', express.static(QUOTES_DIR));

  // Every other static asset (styles.css, app.js, templates.js) is served as-is;
  // index.html itself is excluded since the route above handles it.
  app.use('/quote-tool', express.static(TOOL_DIR, { extensions: ['html'], index: false }));

  app.get('/quote-tool/setup-status', async (req, res) => {
    if (req.query.token !== getSetupStatusToken()) {
      res.status(404).send('Not found');
      return;
    }
    const results = await getSetupStatus();
    res.set('Content-Type', 'text/html; charset=utf-8').send(renderSetupStatusPage(results));
  });

  app.get('/', (req, res) => res.redirect('/quote-tool/'));

  return new Promise(resolve => {
    app.listen(port, () => {
      console.log(`Static tool served on port ${port} at /quote-tool/`);
      resolve();
    });
  });
}

module.exports = { startServer };
