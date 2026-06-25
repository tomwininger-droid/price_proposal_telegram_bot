const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { google } = require('googleapis');

const KEY_PATH = path.join(__dirname, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || 'drive-service-account.json');
const FOLDER_ID = process.env.DRIVE_FOLDER_ID;

/**
 * On PaaS deploys (Render, etc.) a multi-line JSON key file is awkward to paste
 * into a single env-var form field, so GOOGLE_SERVICE_ACCOUNT_KEY_B64 (the same
 * JSON, base64-encoded) is supported as an alternative to GOOGLE_SERVICE_ACCOUNT_KEY_PATH.
 * Decodes it to KEY_PATH once at boot; the existing file-path mode (used by the
 * Hetzner deploy) keeps working unchanged if the B64 var isn't set.
 */
function materializeServiceAccountKey(){
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;
  if (!b64) return;
  try {
    fs.writeFileSync(KEY_PATH, Buffer.from(b64, 'base64'));
  } catch (err) {
    console.error('Failed to write Drive service account key from GOOGLE_SERVICE_ACCOUNT_KEY_B64:', err.message);
  }
}

materializeServiceAccountKey();

function driveConfigured(){
  return Boolean(FOLDER_ID) && fs.existsSync(KEY_PATH);
}

function getDriveClient(){
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/drive.file']
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Upload a quote PDF into the shared "all quotes" Drive folder.
 * @param {object} args
 * @param {Buffer} args.pdfBuffer
 * @param {string} args.filename
 * @returns {Promise<{id:string, webViewLink:string}>}
 */
async function uploadQuotePdf({ pdfBuffer, filename }){
  if (!driveConfigured()) {
    throw new Error('Drive is not configured (missing DRIVE_FOLDER_ID or service account key file).');
  }
  const drive = getDriveClient();
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [FOLDER_ID] },
    media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
    fields: 'id, webViewLink'
  });
  return res.data;
}

module.exports = { uploadQuotePdf, driveConfigured };
