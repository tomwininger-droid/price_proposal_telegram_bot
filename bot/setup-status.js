const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

const { emailConfigured } = require('./email');
const { driveConfigured } = require('./drive');

async function checkTelegram(){
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { name: 'Telegram', ok: false, detail: 'TELEGRAM_BOT_TOKEN חסר.' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (data.ok) return { name: 'Telegram', ok: true, detail: `מחובר לבוט @${data.result.username}.` };
    return { name: 'Telegram', ok: false, detail: 'הטוקן שגוי או בוטל — בדוק מול @BotFather.' };
  } catch (err) {
    return { name: 'Telegram', ok: false, detail: `שגיאת רשת: ${err.message}` };
  }
}

async function checkOpenAI(){
  if (!process.env.OPENAI_API_KEY) return { name: 'OpenAI', ok: false, detail: 'OPENAI_API_KEY חסר.' };
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    await client.models.list();
    return { name: 'OpenAI', ok: true, detail: 'המפתח תקין.' };
  } catch (err) {
    return { name: 'OpenAI', ok: false, detail: 'המפתח שגוי או אין חיוב פעיל בחשבון.' };
  }
}

async function checkAnthropic(){
  if (!process.env.ANTHROPIC_API_KEY) return { name: 'Anthropic (Claude)', ok: false, detail: 'ANTHROPIC_API_KEY חסר.' };
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }]
    });
    return { name: 'Anthropic (Claude)', ok: true, detail: 'המפתח תקין.' };
  } catch (err) {
    return { name: 'Anthropic (Claude)', ok: false, detail: 'המפתח שגוי או אין חיוב פעיל בחשבון.' };
  }
}

async function checkEmail(){
  if (!emailConfigured()) return { name: 'שליחת מייל (SMTP)', ok: null, detail: 'לא הוגדר — תכונה אופציונלית.' };
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await transport.verify();
    return { name: 'שליחת מייל (SMTP)', ok: true, detail: 'החיבור תקין.' };
  } catch (err) {
    return { name: 'שליחת מייל (SMTP)', ok: false, detail: 'בדוק את SMTP_USER/SMTP_PASS — ייתכן שה-App Password שגוי.' };
  }
}

async function checkDrive(){
  if (!driveConfigured()) return { name: 'Google Drive', ok: null, detail: 'לא הוגדר — תכונה אופציונלית.' };
  try {
    const path = require('path');
    const KEY_PATH = path.join(__dirname, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || 'drive-service-account.json');
    const auth = new google.auth.GoogleAuth({ keyFile: KEY_PATH, scopes: ['https://www.googleapis.com/auth/drive.file'] });
    const drive = google.drive({ version: 'v3', auth });
    await drive.files.list({ pageSize: 1, fields: 'files(id)' });
    return { name: 'Google Drive', ok: true, detail: 'החיבור תקין.' };
  } catch (err) {
    return { name: 'Google Drive', ok: false, detail: 'בדוק שהתיקייה שותפה עם ה-client_email של ה-Service Account.' };
  }
}

/**
 * Run all integration checks concurrently. Each is isolated (Promise.allSettled-style)
 * so one dead integration never blanks the whole status page.
 * @returns {Promise<Array<{name:string, ok:boolean|null, detail:string}>>} ok=null means "optional, not configured"
 */
async function getSetupStatus(){
  const checks = [checkTelegram(), checkOpenAI(), checkAnthropic(), checkEmail(), checkDrive()];
  const results = await Promise.allSettled(checks);
  return results.map((r, i) => r.status === 'fulfilled'
    ? r.value
    : { name: ['Telegram', 'OpenAI', 'Anthropic (Claude)', 'שליחת מייל (SMTP)', 'Google Drive'][i], ok: false, detail: r.reason?.message || 'שגיאה לא ידועה.' });
}

module.exports = { getSetupStatus };
