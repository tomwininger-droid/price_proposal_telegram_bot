// הוספת קרדיטים ללקוח אחרי תשלום חד-פעמי (מודל BILLING_MODE=credits).
// הרץ מתוך תיקיית bot/ של הלקוח הספציפי (כדי שהקרדיטים יישמרו ב-DATA_DIR שלו):
//   node add-credits.js <chat_id> <amount>
// דוגמה: node add-credits.js 374591848 30
require('dotenv').config();
const { addCredits, getCredits } = require('./store');

const [, , chatId, amountStr] = process.argv;
const amount = Number(amountStr);

if (!chatId || !Number.isFinite(amount) || amount <= 0) {
  console.error('שימוש: node add-credits.js <chat_id> <amount>');
  process.exit(1);
}

const before = getCredits(chatId).balance;
const after = addCredits(chatId, amount);
console.log(`לקוח ${chatId}: ${before} → ${after} קרדיטים (+${amount}).`);
