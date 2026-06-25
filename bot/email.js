const nodemailer = require('nodemailer');
const { getBranding } = require('./branding');

function buildTransport(){
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

const PLACEHOLDER_PASS = 'your-16-char-app-password';

/**
 * True once real SMTP credentials are filled in (not the .env.example placeholder).
 * Mirrors drive.js's driveConfigured() — used to hide the "send to client" button
 * entirely rather than letting a send attempt fail at the worst possible moment.
 */
function emailConfigured(){
  return Boolean(process.env.SMTP_USER) &&
    Boolean(process.env.SMTP_PASS) &&
    process.env.SMTP_PASS !== PLACEHOLDER_PASS;
}

/**
 * Send the finished quote to a client by email, with the PDF attached.
 * @param {object} args
 * @param {string} args.to
 * @param {string} args.subject
 * @param {string} args.body - plain text
 * @param {Buffer} args.pdfBuffer
 * @param {string} args.filename
 */
async function sendQuoteEmail({ to, subject, body, pdfBuffer, filename }){
  const transport = buildTransport();
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
  await transport.sendMail({
    from: `"${getBranding().businessName}" <${from}>`,
    to,
    subject,
    text: body,
    attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }]
  });
}

module.exports = { sendQuoteEmail, emailConfigured };
