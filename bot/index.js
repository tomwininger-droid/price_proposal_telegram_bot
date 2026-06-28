require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');

const { transcribe } = require('./transcribe');
const { replyVoiceAndText } = require('./speak');
const { generateQuote, draftClientEmail } = require('./generate');
const { saveQuote, getConversation, setConversation, clearConversation, getUsage, incrementUsage } = require('./store');
const { startServer } = require('./server');
const { renderQuotePdf } = require('./pdf');
const { sendQuoteEmail, emailConfigured } = require('./email');
const { uploadQuotePdf, driveConfigured } = require('./drive');
const { getBranding } = require('./branding');

const {
  TELEGRAM_BOT_TOKEN,
  PORT = '8080',
  ALLOWED_USER_IDS = ''
} = process.env;

// Monthly quota of finished quotes per chat (tier enforcement + AI-cost protection,
// since Tom funds the AI). 0 or unset = unlimited (the original behavior).
const MONTHLY_QUOTE_LIMIT = Number(process.env.MONTHLY_QUOTE_LIMIT || 0);

// On Render, RENDER_EXTERNAL_URL is auto-injected with this service's own https
// URL — no need to know it before first deploy. Falls back to localhost for local dev.
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:8080';

if (!TELEGRAM_BOT_TOKEN) { console.error('Missing TELEGRAM_BOT_TOKEN'); process.exit(1); }

const allowed = ALLOWED_USER_IDS.split(',').map(s => s.trim()).filter(Boolean);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

/* ===== Authorization ===== */
bot.use(async (ctx, next) => {
  if (allowed.length && ctx.from && !allowed.includes(String(ctx.from.id))) {
    await ctx.reply('סליחה, אינך מורשה להשתמש בבוט הזה.');
    return;
  }
  return next();
});

/* ===== Commands ===== */
bot.start(ctx => ctx.reply(
  `שלום! אני יוצר הצעות מחיר ל-${getBranding().businessName}.\n` +
  'שלח/הקלט הודעה קולית או טקסט, למשל:\n' +
  '"תבנית בניית אתרים, לקוח רן לוי, 8,000 ש״ח, דגש על חנות אונליין".\n' +
  'אם יחסר לי מידע — אשאל. בסוף תקבל לינק להצעה, וכפתורים לתיקון או לשליחה ללקוח במייל.\n' +
  'פקודה /new מתחילה הצעה חדשה.'
));

bot.command('new', ctx => {
  clearConversation(ctx.chat.id);
  return ctx.reply('התחלנו מחדש. ספר לי על ההצעה החדשה 🎤');
});

/* ===== Helpers ===== */
async function downloadVoice(ctx){
  const fileId = ctx.message.voice.file_id;
  const link = await ctx.telegram.getFileLink(fileId);
  const res = await fetch(link.href);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = path.join(os.tmpdir(), `voice_${fileId}.ogg`);
  fs.writeFileSync(tmp, buf);
  return tmp;
}

function quoteReadyKeyboard(id){
  const row = [Markup.button.callback('✏️ תיקון', `fix:${id}`)];
  if (emailConfigured()) {
    row.push(Markup.button.callback('📧 שלח ללקוח במייל', `email:${id}`));
  }
  const rows = [row];
  if (driveConfigured()) {
    rows.push([Markup.button.callback('☁️ העלה לדרייב', `drive:${id}`)]);
  }
  return Markup.inlineKeyboard(rows);
}

/* ===== Core quote generation (text/voice → draft or finished quote) ===== */
async function handleUserText(ctx, transcript){
  if (!transcript) {
    await replyVoiceAndText(ctx, 'לא הצלחתי להבין את ההודעה. אפשר לנסות שוב?');
    return;
  }

  const convo = getConversation(ctx.chat.id);

  // Quota: block only when STARTING a brand-new quote (no active conversation).
  // In-progress collecting turns and refinements of an already-counted quote
  // keep working — you can finish/refine what you started, just not begin the
  // (N+1)th quote this month. MONTHLY_QUOTE_LIMIT=0 disables the cap entirely.
  if (MONTHLY_QUOTE_LIMIT > 0 && !convo && getUsage(ctx.chat.id) >= MONTHLY_QUOTE_LIMIT) {
    await replyVoiceAndText(
      ctx,
      `הגעת למכסת ההצעות החודשית (${MONTHLY_QUOTE_LIMIT}). המכסה מתאפסת בתחילת החודש הבא. ` +
      'לשדרוג חבילה — דבר עם מי שהקים לך את הבוט.'
    );
    return;
  }

  await ctx.sendChatAction('typing');
  const priorDraft = convo ? convo.draft : null;

  let result;
  try {
    result = await generateQuote({ transcript, priorDraft });
  } catch (err) {
    console.error('generateQuote failed:', err);
    await replyVoiceAndText(ctx, 'הייתה תקלה ביצירת ההצעה. אפשר לנסות שוב בעוד רגע.');
    return;
  }

  const { quote, missingFields, assistantMessage } = result;

  if (missingFields.length) {
    // Keep collecting — store the draft so the next message merges into it.
    setConversation(ctx.chat.id, { stage: 'collecting', draft: quote });
    const labels = missingFields.join(', ');
    await replyVoiceAndText(ctx, `${assistantMessage}\n(חסר לי: ${labels})`);
    return;
  }

  // Complete — persist, keep the draft around (so "תיקון" can keep refining it), send the link.
  const id = saveQuote(quote);
  // Count one quota unit per distinct quote, not per refinement: only the first
  // time this conversation reaches 'done'. The `counted` flag rides along so
  // later "תיקון" passes (which re-enter handleUserText) don't double-count.
  const alreadyCounted = convo && convo.counted;
  if (!alreadyCounted) incrementUsage(ctx.chat.id);
  setConversation(ctx.chat.id, { stage: 'done', draft: quote, id, counted: true });
  const url = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/quote-tool/?id=${id}`;
  await replyVoiceAndText(ctx, assistantMessage);
  await ctx.reply(
    `📄 ההצעה מוכנה:\n${url}\n\nפתח, ערוך אם צריך, ולחץ "הורד PDF".`,
    quoteReadyKeyboard(id)
  );
}

/* ===== Email collection + send flow ===== */
async function handleClientEmailInput(ctx, convo, text){
  const email = text.trim();
  if (!EMAIL_RE.test(email)) {
    await replyVoiceAndText(ctx, 'זה לא נראה כתובת מייל תקינה. אפשר לשלוח שוב?');
    return;
  }

  await ctx.sendChatAction('typing');
  const quote = { ...convo.draft, id: convo.id, clientEmail: email };
  saveQuote(quote);

  let emailDraft;
  try {
    emailDraft = await draftClientEmail({ quote });
  } catch (err) {
    console.error('draftClientEmail failed:', err);
    await replyVoiceAndText(ctx, 'הייתה תקלה בניסוח המייל. אפשר לנסות שוב?');
    return;
  }

  let pdfBuffer;
  try {
    pdfBuffer = await renderQuotePdf({ port: Number(PORT), id: convo.id });
  } catch (err) {
    console.error('renderQuotePdf failed:', err);
    await replyVoiceAndText(ctx, 'הייתה תקלה בהפקת ה-PDF. אפשר לנסות שוב?');
    return;
  }

  const pdfPath = path.join(os.tmpdir(), `quote_${convo.id}.pdf`);
  fs.writeFileSync(pdfPath, pdfBuffer);

  setConversation(ctx.chat.id, {
    stage: 'awaiting_email_confirm',
    draft: quote,
    id: convo.id,
    email,
    emailDraft,
    pdfPath
  });

  await ctx.reply(
    `📧 טיוטת מייל ל-${email}:\n\n*נושא:* ${emailDraft.subject}\n\n${emailDraft.body}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ שלח', `sendmail:${convo.id}`),
          Markup.button.callback('❌ בטל', `cancelmail:${convo.id}`)
        ]
      ])
    }
  );
}

/* ===== Message routing (free text/voice can mean different things depending on stage) ===== */
async function routeIncoming(ctx, text){
  const convo = getConversation(ctx.chat.id);
  if (convo && convo.stage === 'awaiting_email') {
    return handleClientEmailInput(ctx, convo, text);
  }
  return handleUserText(ctx, text);
}

/* ===== Message handlers ===== */
bot.on('voice', async ctx => {
  let tmp;
  try {
    tmp = await downloadVoice(ctx);
    const transcript = await transcribe(tmp);
    await routeIncoming(ctx, transcript);
  } catch (err) {
    console.error('voice handler failed:', err);
    await ctx.reply('הייתה תקלה בעיבוד ההודעה הקולית.');
  } finally {
    if (tmp) fs.unlink(tmp, () => {});
  }
});

bot.on('text', ctx => routeIncoming(ctx, ctx.message.text.trim()));

/* ===== Inline button actions ===== */
bot.action(/^fix:(.+)$/, async ctx => {
  await ctx.answerCbQuery();
  await replyVoiceAndText(ctx, 'מה תרצה לשנות בהצעה? אפשר להקליט או לכתוב.');
});

bot.action(/^drive:(.+)$/, async ctx => {
  const id = ctx.match[1];
  await ctx.answerCbQuery();
  if (!driveConfigured()) {
    await ctx.reply('העלאה לדרייב לא הוגדרה לבוט הזה.');
    return;
  }
  const convo = getConversation(ctx.chat.id);
  if (!convo || convo.id !== id) {
    await ctx.reply('לא מצאתי את ההצעה הזו. שלח /new כדי להתחיל הצעה חדשה.');
    return;
  }
  await ctx.sendChatAction('upload_document');
  try {
    const pdfBuffer = await renderQuotePdf({ port: Number(PORT), id });
    const quote = convo.draft;
    const filename = `הצעת מחיר - ${quote.clientName || 'לקוח'} - ${quote.date || ''}.pdf`;
    const file = await uploadQuotePdf({ pdfBuffer, filename });
    await ctx.reply(`☁️ ההצעה הועלתה לדרייב:\n${file.webViewLink}`);
  } catch (err) {
    console.error('Drive upload failed:', err);
    await ctx.reply('ההעלאה לדרייב נכשלה. בדוק את הגדרות ה-Service Account ונסה שוב.');
  }
});

bot.action(/^email:(.+)$/, async ctx => {
  const id = ctx.match[1];
  await ctx.answerCbQuery();
  if (!emailConfigured()) {
    await ctx.reply('שליחת מייל אוטומטית לא הוגדרה לבוט הזה.');
    return;
  }
  const convo = getConversation(ctx.chat.id);
  if (!convo || convo.id !== id) {
    await ctx.reply('לא מצאתי את ההצעה הזו. שלח /new כדי להתחיל הצעה חדשה.');
    return;
  }
  setConversation(ctx.chat.id, { ...convo, stage: 'awaiting_email' });
  await replyVoiceAndText(ctx, 'מה כתובת המייל של הלקוח?');
});

bot.action(/^sendmail:(.+)$/, async ctx => {
  const id = ctx.match[1];
  await ctx.answerCbQuery();
  const convo = getConversation(ctx.chat.id);
  if (!convo || convo.id !== id || convo.stage !== 'awaiting_email_confirm') {
    await ctx.reply('אין טיוטת מייל פעילה לשליחה.');
    return;
  }
  try {
    const pdfBuffer = fs.readFileSync(convo.pdfPath);
    await sendQuoteEmail({
      to: convo.email,
      subject: convo.emailDraft.subject,
      body: convo.emailDraft.body,
      pdfBuffer,
      filename: `הצעת-מחיר-${convo.draft.clientName || 'לקוח'}.pdf`
    });
    await replyVoiceAndText(ctx, `המייל נשלח בהצלחה ל-${convo.email}.`);
  } catch (err) {
    console.error('sendQuoteEmail failed:', err);
    await ctx.reply('שליחת המייל נכשלה. בדוק את הגדרות ה-SMTP ונסה שוב.');
    return;
  } finally {
    fs.unlink(convo.pdfPath, () => {});
  }
  setConversation(ctx.chat.id, { stage: 'done', draft: convo.draft, id: convo.id });
});

bot.action(/^cancelmail:(.+)$/, async ctx => {
  await ctx.answerCbQuery();
  const convo = getConversation(ctx.chat.id);
  if (convo) {
    if (convo.pdfPath) fs.unlink(convo.pdfPath, () => {});
    setConversation(ctx.chat.id, { stage: 'done', draft: convo.draft, id: convo.id });
  }
  await ctx.reply('בוטל. אפשר ללחוץ "שלח ללקוח במייל" שוב בכל עת.');
});

/* ===== Boot ===== */
(async () => {
  await startServer(Number(PORT));
  await bot.launch();
  console.log('Bot is running.');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
