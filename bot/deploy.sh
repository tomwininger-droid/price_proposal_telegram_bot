#!/usr/bin/env bash
# פריסת הבוט לשרת Hetzner קיים.
# שימוש: ./deploy.sh <user>@<server-ip> [remote-path]
# לדוגמה: ./deploy.sh root@1.2.3.4 /opt/bon-bot
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "שימוש: ./deploy.sh <user>@<server-ip> [remote-path]"
  exit 1
fi

REMOTE="$1"
REMOTE_PATH="${2:-/opt/bon-bot}"
LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> מעלה קבצים ל-$REMOTE:$REMOTE_PATH"
ssh "$REMOTE" "mkdir -p '$REMOTE_PATH'"

# מעלים את כלי העריכה (index.html/app.js/וכו') ואת תיקיית bot, בלי node_modules ובלי .env מקומי.
rsync -avz --progress \
  --exclude 'bot/node_modules' \
  --exclude 'bot/.env' \
  --exclude 'bot/drive-service-account.json' \
  --exclude 'bot/conversations.json' \
  --exclude 'quotes' \
  --exclude '.git' \
  --exclude '.claude' \
  "$LOCAL_ROOT"/ "$REMOTE:$REMOTE_PATH"/

echo "==> מתקין תלויות בשרת"
ssh "$REMOTE" "cd '$REMOTE_PATH/bot' && npm install --omit=dev"

echo "==> הקבצים bot/.env ו-bot/drive-service-account.json לא הועלו (סודות). העלה בנפרד:"
echo "    scp '$LOCAL_ROOT/bot/.env' '$REMOTE:$REMOTE_PATH/bot/.env'"
echo "    scp '$LOCAL_ROOT/bot/drive-service-account.json' '$REMOTE:$REMOTE_PATH/bot/drive-service-account.json'"
echo
echo "==> סיום. כדי להפעיל עם pm2 בשרת:"
echo "    ssh $REMOTE"
echo "    cd $REMOTE_PATH/bot"
echo "    npm install -g pm2   # פעם אחת בלבד"
echo "    pm2 start index.js --name bon-bot"
echo "    pm2 save && pm2 startup"
