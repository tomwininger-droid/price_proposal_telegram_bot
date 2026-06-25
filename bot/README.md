# בוט טלגרם — הצעות מחיר

בוט שמקבל הודעה קולית (או טקסט) בעברית, מתמלל, מייצר הצעת מחיר מלאה + תוכנית עבודה עם Claude,
שואל שאלות השלמה אם חסר מידע, ומשיב **בקול ובטקסט**. בסיום שולח לינק לכלי העריכה (שבתיקיית האב)
שבו פותחים, עורכים, ומורידים PDF.

> **זה הוא המסלול הטכני/עצמאי (VPS + SSH + pm2).** אם אתם מקימים עותק חדש בלי שרת משלכם,
> עם המיתוג שלכם, ובלי ידע טכני — עברו ל-[../SETUP_GUIDE.md](../SETUP_GUIDE.md) (דיפלוי
> ל-Render בכמה דקות). שאר הדף הזה רלוונטי רק אם אתם מתחזקים VPS בעצמכם.

## מה צריך
- שרת Linux (ה-Hetzner שלך) עם **Node.js 20+**.
- טוקן בוט מ-[@BotFather](https://t.me/BotFather).
- מפתח **OpenAI** (תמלול Whisper + הקראה TTS).
- מפתח **Anthropic** (יצירת ההצעה עם Claude).
- מזהה המשתמש שלך בטלגרם (שלח הודעה ל-[@userinfobot](https://t.me/userinfobot)).

## התקנה
```bash
cd bot
cp .env.example .env
# ערוך את .env ומלא: TELEGRAM_BOT_TOKEN, OPENAI_API_KEY, ANTHROPIC_API_KEY,
#                     PUBLIC_BASE_URL, PORT, ALLOWED_USER_IDS
npm install
npm start
```
`npm start` מפעיל גם את הבוט וגם שרת Express שמגיש את כלי העריכה ואת קבצי ההצעות.

## הגדרת PUBLIC_BASE_URL
הלינקים שהבוט שולח נבנים מ-`PUBLIC_BASE_URL`. צריך שזו תהיה כתובת **שנגישה מהדפדפן שלך**:
- התחלה מהירה: `http://<IP-של-השרת>:8080` (פתח את הפורט בחומת האש: `ufw allow 8080`).
- מומלץ לאורך זמן: דומיין + nginx + HTTPS (ראה למטה) → `https://quotes.yourdomain.com`.

## הרצה מתמשכת (pm2)
```bash
npm install -g pm2
pm2 start index.js --name bon-bot
pm2 save
pm2 startup        # הרץ את הפקודה שמודפסת כדי להפעיל אוטומטית באתחול
```
לוגים: `pm2 logs bon-bot` · ריסטארט: `pm2 restart bon-bot`.

## אופציונלי: דומיין + HTTPS (nginx + certbot)
כדי שהלינק יהיה נקי ומאובטח:
```nginx
server {
  server_name quotes.yourdomain.com;
  location / { proxy_pass http://localhost:8080; }
}
```
ואז `sudo certbot --nginx -d quotes.yourdomain.com`. עדכן `PUBLIC_BASE_URL=https://quotes.yourdomain.com`.

## שליחת מייל ללקוח (Gmail App Password) — אופציונלי
1. גלוש ל-[myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (דורש אימות דו-שלבי מופעל).
2. צור App Password (למשל בשם "quote-bot") וקבל קוד באורך 16 תווים.
3. ב-`.env`: `SMTP_USER=<המייל שלך>`, `SMTP_PASS=<16 התווים, בלי רווחים>`, `FROM_EMAIL=<המייל שלך>`.
4. אם שדות אלה ריקים — כפתור "שלח ללקוח במייל" פשוט לא מופיע, שאר הבוט עובד כרגיל.

## העלאה אוטומטית של כל ההצעות ל-Google Drive
הבוט מעלה PDF של כל הצעה שנוצרת לתיקיית Drive משותפת, באמצעות **Service Account** (לא Gmail רגיל —
בוט לא יכול "להתחבר" עם סיסמה לדרייב; Service Account הוא חשבון מכונה ייעודי שמקבל הרשאת גישה לתיקייה).

1. גלוש ל-[console.cloud.google.com](https://console.cloud.google.com), צור פרויקט (או בחר קיים).
2. **APIs & Services → Enable APIs and Services** → חפש "Google Drive API" → **Enable**.
3. **IAM & Admin → Service Accounts → Create Service Account**. שם לדוגמה: `bon-bot-drive`. אין צורך
   בתפקידי IAM נוספים (Drive access ניתן בשלב 5, לא כאן).
4. בתוך ה-Service Account שנוצר → **Keys → Add Key → Create new key → JSON**. קובץ JSON יורד למחשב.
5. פתח את הקובץ, מצא את השדה `"client_email"` (נראה כמו `bon-bot-drive@<project>.iam.gserviceaccount.com`).
6. בדרייב, פתח את התיקייה המשותפת → **Share** → הדבק את ה-`client_email` הזה עם הרשאת **Editor**.
7. שמור את קובץ ה-JSON בשם `bot/drive-service-account.json` (ליד `.env` — הקובץ ב-`.gitignore`, לא יעלה ל-git).
8. ב-`.env`: `DRIVE_FOLDER_ID=<מזהה התיקייה מתוך כתובת ה-URL שלה>` (כבר ממולא כברירת מחדל אם זו אותה תיקייה).

## שימוש
1. פתח שיחה עם הבוט בטלגרם, שלח `/start`.
2. הקלט הודעה קולית, למשל: *"תבנית בניית אתרים, לקוח רן לוי, 8,000 שקל, דגש על חנות אונליין."*
3. אם חסר מידע — הבוט ישאל (בטקסט ובקול). ענה (קול או טקסט).
4. בסיום תקבל לינק. פתח → ערוך אם צריך → "הורד PDF".
5. `/new` מתחיל הצעה חדשה.

## איך זה בנוי
| קובץ | תפקיד |
|------|-------|
| `index.js` | הבוט הראשי (telegraf) — מנהל את השיחה והמצב |
| `transcribe.js` | תמלול קול → טקסט (OpenAI Whisper) |
| `speak.js` | טקסט → קול (OpenAI TTS) + שליחת תשובה כקול+טקסט |
| `generate.js` | יצירת ההצעה המובנית עם Claude + זיהוי שדות חסרים + ניסוח מייל ללקוח |
| `store.js` | שמירת `<id>.json` + מצב שיחה ששורד ריסטארט |
| `server.js` | Express שמגיש את כלי העריכה ואת ההצעות |
| `pdf.js` | מפיק PDF מהכלי עצמו (Puppeteer) — תמיד תואם 1:1 לעיצוב |
| `email.js` | שליחת המייל ללקוח עם ה-PDF מצורף (SMTP) + `emailConfigured()` |
| `drive.js` | העלאת ה-PDF לתיקיית Drive המשותפת (Service Account) + `driveConfigured()` |
| `branding.js` | שם העסק/סלוגן/צבעים — env vars עם ברירת מחדל, מוזרק לכלי ולפרומפטים |
| `setup-status.js` | בדיקת תקינות לכל האינטגרציות, מוגש ב-`/quote-tool/setup-status?token=` |

ההצעות נשמרות ב-`../quotes/<id>.json` (בתיקיית האב, ליד `index.html`), והכלי טוען אותן דרך `?id=`.
