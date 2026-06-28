#!/usr/bin/env bash
# הקמת בוט-לקוח חדש על שרת ה-Hetzner (מסלול Done-for-you, שלב 0).
#
# כל לקוח מקבל:
#   - תיקייה משלו תחת /opt/tenants/<slug> (קוד מבודד, .env משלו, data משלו)
#   - פורט משלו, מיתוג משלו, מכסה חודשית משלו
#   - תהליך pm2 נפרד בשם <slug>
#   - node_modules ומפתחות ה-AI משותפים עם ההתקנה הראשית (תום מממן AI לכולם)
#
# שימוש (מנוי חודשי, ברירת מחדל):
#   ./new-tenant.sh <slug> <telegram_token> <port> <limit> <allowed_user_ids> "<business_name>" ["<slogan>"]
# דוגמה:
#   ./new-tenant.sh studio-danny 123:ABC 8091 50 374591848 "Danny Design" "עיצוב ומיתוג"
#
# לחבילת קרדיטים חד-פעמית במקום מנוי חודשי, הוסף "credits" כפרמטר 8 — <limit> אז
# הופך ל"כמה קרדיטים לתת בהקמה" (נטען לכל מזהה ב-<allowed_user_ids>):
#   ./new-tenant.sh studio-danny 123:ABC 8091 30 374591848 "Danny Design" "עיצוב" credits
#
# משתני סביבה אופציונליים:
#   SRC=/opt/bon-bot   קוד המקור הקנוני (ברירת מחדל)
#   START=0            לייצר את הקבצים בלי להפעיל pm2 (לבדיקה)
set -euo pipefail

if [ $# -lt 6 ]; then
  echo "שימוש: $0 <slug> <telegram_token> <port> <limit> <allowed_user_ids> \"<business_name>\" [\"<slogan>\"] [credits]"
  exit 1
fi

SLUG="$1"; TOKEN="$2"; PORT="$3"; LIMIT="$4"; ALLOWED="$5"; BUSINESS_NAME="$6"; SLOGAN="${7:-}"
BILLING_MODE="${8:-subscription}"
SRC="${SRC:-/opt/bon-bot}"
START="${START:-1}"
DEST="/opt/tenants/$SLUG"
MASTER_ENV="$SRC/bot/.env"

# ה-IP הציבורי לבניית הלינקים שהבוט שולח.
PUBLIC_IP="$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"

if [ -d "$DEST" ]; then
  echo "שגיאה: כבר קיים לקוח בשם '$SLUG' ($DEST). בחר שם אחר או מחק קודם." >&2
  exit 1
fi

# מפתחות ה-AI המשותפים נשלפים מההתקנה הראשית (תום מממן לכולם).
read_master(){ grep -E "^$1=" "$MASTER_ENV" | head -1 | cut -d= -f2-; }
OPENAI_KEY="$(read_master OPENAI_API_KEY)"
ANTHROPIC_KEY="$(read_master ANTHROPIC_API_KEY)"
if [ -z "$OPENAI_KEY" ] || [ -z "$ANTHROPIC_KEY" ]; then
  echo "שגיאה: לא נמצאו מפתחות OPENAI/ANTHROPIC ב-$MASTER_ENV." >&2
  exit 1
fi

echo "==> מעתיק קוד ל-$DEST"
mkdir -p /opt/tenants
rsync -a \
  --exclude 'bot/node_modules' \
  --exclude 'bot/.env' \
  --exclude 'bot/conversations.json' \
  --exclude 'bot/usage.json' \
  --exclude 'bot/drive-service-account.json' \
  --exclude 'quotes' \
  --exclude '.git' \
  --exclude '.claude' \
  "$SRC"/ "$DEST"/

# node_modules משותף (חוסך מקום וזמן; קוד זהה לכל הלקוחות).
ln -sfn "$SRC/bot/node_modules" "$DEST/bot/node_modules"

mkdir -p "$DEST/data"

echo "==> כותב .env ללקוח (מודל חיוב: $BILLING_MODE)"
MONTHLY_LIMIT_VALUE="$LIMIT"
if [ "$BILLING_MODE" = "credits" ]; then
  MONTHLY_LIMIT_VALUE=0
fi
cat > "$DEST/bot/.env" <<EOF
TELEGRAM_BOT_TOKEN=$TOKEN
OPENAI_API_KEY=$OPENAI_KEY
ANTHROPIC_API_KEY=$ANTHROPIC_KEY
ALLOWED_USER_IDS=$ALLOWED
PORT=$PORT
PUBLIC_BASE_URL=http://$PUBLIC_IP:$PORT
CLAUDE_MODEL=claude-sonnet-4-6
BILLING_MODE=$BILLING_MODE
MONTHLY_QUOTE_LIMIT=$MONTHLY_LIMIT_VALUE
CREDIT_LOW_BALANCE_WARNING=2
DATA_DIR=$DEST/data
BUSINESS_NAME=$BUSINESS_NAME
BUSINESS_SLOGAN=$SLOGAN
EOF
chmod 600 "$DEST/bot/.env"

if [ "$BILLING_MODE" = "credits" ]; then
  echo "==> טוען $LIMIT קרדיטים פתיחה לכל מזהה ב-ALLOWED_USER_IDS"
  IFS=',' read -ra IDS <<< "$ALLOWED"
  for id in "${IDS[@]}"; do
    id_trimmed="$(echo "$id" | xargs)"
    [ -n "$id_trimmed" ] && (cd "$DEST/bot" && node add-credits.js "$id_trimmed" "$LIMIT")
  done
fi

if [ "$START" = "1" ]; then
  echo "==> מפעיל את הבוט עם pm2 בשם '$SLUG'"
  pm2 start "$DEST/bot/index.js" --name "$SLUG" --cwd "$DEST/bot"
  pm2 save
  echo
  echo "✅ הלקוח '$SLUG' פעיל."
  echo "   כלי/בדיקה:  http://$PUBLIC_IP:$PORT/quote-tool/"
  echo "   זכור לפתוח את פורט $PORT בחומת האש של Hetzner."
else
  echo "✅ נוצרו קבצים בלבד (START=0). להפעלה: pm2 start $DEST/bot/index.js --name $SLUG --cwd $DEST/bot"
fi
