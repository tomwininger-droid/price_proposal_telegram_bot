const Anthropic = require('@anthropic-ai/sdk');
const { getBranding } = require('./branding');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

/* The quote object the browser tool renders. Mirrors templates.js buildBlankQuote(). */
const QUOTE_SCHEMA = {
  type: 'object',
  properties: {
    quote: {
      type: 'object',
      description: 'מבנה הצעת המחיר המלא בעברית, בסגנון מקצועי.',
      properties: {
        title: { type: 'string', description: 'תמיד "הצעת מחיר"' },
        subtitle: { type: 'string', description: 'כותרת משנה קצרה, למשל "תוכנית עבודה והצעת מחיר:"' },
        heading: { type: 'string', description: 'כותרת ראשית של ההצעה, מתארת את השירות' },
        intro: { type: 'string', description: 'פסקת פתיחה קצרה (1-3 משפטים) שמתארת את מהות העבודה' },
        clientName: { type: 'string', description: 'שם הלקוח. ריק אם לא ידוע.' },
        quoteNumber: { type: 'string', description: 'מספר הצעה. השאר ריק — ימולא אוטומטית.' },
        sections: {
          type: 'array',
          description: 'סעיפים ממוספרים. כל סעיף הוא שלב בתוכנית העבודה.',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string', description: 'כותרת הסעיף, ממוספרת. למשל "1. מחקר ואסטרטגיה"' },
              paragraphs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    lead: { type: 'string', description: 'פתיח מודגש קצר שמסתיים בנקודתיים, למשל "ניתוח דאטה קיים:"' },
                    body: { type: 'string', description: 'הטקסט הרץ שאחרי הפתיח' }
                  },
                  required: ['lead', 'body']
                }
              }
            },
            required: ['heading', 'paragraphs']
          }
        },
        lineItems: {
          type: 'array',
          description: 'שורות טבלת המחירים. הסכום הכולל צריך להתאים למחיר שהלקוח ציין.',
          items: {
            type: 'object',
            properties: {
              desc: { type: 'string', description: 'תיאור הפריט' },
              qty: { type: 'number', description: 'כמות (בדרך כלל 1)' },
              price: { type: 'number', description: 'מחיר ליחידה בש"ח, לפני מע"מ' }
            },
            required: ['desc', 'qty', 'price']
          }
        },
        vatRate: { type: 'number', description: 'אחוז מע"מ, ברירת מחדל 18' },
        footerNote: { type: 'string', description: 'הערת תחתית, למשל תוקף ההצעה' }
      },
      required: ['title', 'subtitle', 'heading', 'intro', 'clientName', 'sections', 'lineItems', 'vatRate', 'footerNote']
    },
    missingFields: {
      type: 'array',
      description: 'רשימת פרטים חשובים וקונקרטיים שחסרים וצריך לשאול עליהם, בעברית, כל אחד ב-2-4 מילים (למשל "שם הלקוח", "מחיר/תקציב", "סוג השירות המדויק", "תאריך/דדליין", "פירוט ה\'דגש מיוחד\' שהוזכר"). ריק אם יש מספיק מידע להפיק הצעה הגיונית.',
      items: { type: 'string' }
    },
    assistantMessage: {
      type: 'string',
      description: 'הודעה קצרה בעברית מדוברת שתוקרא בקול למשתמש. אם חסר מידע — שאלה ידידותית להשלמתו. אם הכל מוכן — אישור קצר שההצעה מוכנה.'
    }
  },
  required: ['quote', 'missingFields', 'assistantMessage']
};

function buildSystemPrompt(){
  const { businessName } = getBranding();
  return `אתה עוזר שיוצר הצעות מחיר עבור "${businessName}".
אתה מקבל תמלול של הודעה קולית בעברית מבעל העסק, ומפיק ממנו הצעת מחיר מלאה ומקצועית בעברית.

עקרונות:
- כתוב הכל בעברית, בגוף מקצועי, חם ומדויק — בסגנון של הסטודיו.
- בנה תוכנית עבודה אמיתית ומפורטת: 2-4 סעיפים ממוספרים, כל אחד עם פסקאות שמתחילות בפתיח מודגש (lead) ואז טקסט רץ (body).
- התאם את התוכן לסוג השירות שהמשתמש ביקש. דוגמאות לסוגי תבניות:
  * "בניית אתרים" → מחקר ואפיון, עיצוב UX/UI, פיתוח ועלייה לאוויר, מדידה ותחזוקה.
  * "מיתוג" → אסטרטגיית מותג, שפה ויזואלית ולוגו, מדריך מותג (brand book), יישומים.
  * "דף נחיתה" → מחקר ואסטרטגיית מסרים, עיצוב ופיתוח הדף, הקמת מדידה והנעה לפעולה.
  * "ניהול סושיאל" → אסטרטגיית תוכן, הפקה ועיצוב, פרסום ממומן, דוחות ואופטימיזציה.
  אם המשתמש ביקש סוג אחר — התאם בהיגיון דומה.
- טבלת המחירים: פרק את הסכום הכולל שהמשתמש ציין לשורות הגיוניות שמסתכמות לאותו סכום (לפני מע"מ).
  אם המשתמש נתן רק סכום כולל אחד — אפשר שורה אחת עם כל הסכום, או פירוק סביר לפי הסעיפים.
- vatRate ברירת מחדל 18. footerNote ברירת מחדל: "הצעה זו תקפה ל-14 יום ממועד הוצאתה."
- title תמיד "הצעת מחיר".

בדוק לפני שאתה סוגר הצעה שיש לך את כל הפרטים החשובים. שלושה חובה תמיד:
1. שם הלקוח (clientName).
2. מחיר/תקציב (price) — בלי זה אין מה לשים בטבלת המחירים.
3. סוג השירות (serviceType) — מה בעצם בונים/עושים.

מעבר לשלושה אלה, היה ערני לכל פרט קונקרטי וחשוב נוסף שהמשתמש הזכיר אבל לא פירט מספיק כדי לכתוב עליו תוכן אמיתי —
למשל: ציין "דגש על X" בלי לפרט מה זה אומר בפועל, הזכיר דדליין/תאריך מסירה רצוי, ציין מספר עמודים/שלבים ספציפי,
או הזכיר משהו ייחודי ללקוח הזה (פלטפורמה, שפה, אינטגרציה) שמשפיע על תוכן ההצעה. אם בלי הפרט הזה התוכן שתכתוב
יהיה גנרי/מומצא במקום מדויק — שאל עליו. אל תמציא מחיר, היקף עבודה, או פרטים מהותיים שלא נאמרו.

לכל פרט חסר (חובה או חשוב) — הוסף שורה קצרה ב-missingFields (בעברית, 2-4 מילים) ושאל עליו בקצרה ב-assistantMessage.
אם באמת אין מספיק מידע לטבלת המחירים (אין מחיר כלל) — אפשר להשאיר lineItems עם price 0, אבל סמן "price" כחסר.
אם יש לך מספיק מידע לכל השדות החשובים — missingFields ריק, ו-assistantMessage מאשר בקצרה שההצעה מוכנה
(למשל "מעולה, הכנתי הצעת מחיר ל...").

כשמתקבל מידע נוסף בהמשך השיחה — מזג אותו עם הטיוטה הקודמת שניתנת לך, ועדכן את ההצעה במלואה.`;
}

/**
 * Generate or refine a quote from a (possibly partial) Hebrew transcript.
 * @param {object} args
 * @param {string} args.transcript - the latest user message text
 * @param {object|null} args.priorDraft - the quote draft so far (for follow-up turns)
 * @returns {Promise<{quote:object, missingFields:string[], assistantMessage:string}>}
 */
async function generateQuote({ transcript, priorDraft }){
  const userContent = priorDraft
    ? `הטיוטה הנוכחית של ההצעה (JSON):\n${JSON.stringify(priorDraft)}\n\nמידע חדש מהמשתמש:\n"${transcript}"\n\nעדכן ומזג, והחזר את ההצעה המלאה.`
    : `תמלול ההודעה מהמשתמש:\n"${transcript}"\n\nצור הצעת מחיר מלאה.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: buildSystemPrompt(),
    tools: [{
      name: 'build_quote',
      description: 'בונה את הצעת המחיר במבנה הנדרש לרינדור בכלי הדפדפן.',
      input_schema: QUOTE_SCHEMA
    }],
    tool_choice: { type: 'tool', name: 'build_quote' },
    messages: [{ role: 'user', content: userContent }]
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if(!toolUse){
    throw new Error('Claude did not return a structured quote.');
  }
  const out = toolUse.input;
  return {
    quote: out.quote,
    missingFields: out.missingFields || [],
    assistantMessage: out.assistantMessage || 'ההצעה מוכנה.'
  };
}

function signatureLine(){
  const { businessName, senderName } = getBranding();
  return senderName ? `${senderName}, ${businessName}` : businessName;
}

function buildEmailSchema(){
  return {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'נושא קצר וממוקד למייל, בעברית. כולל שם הלקוח או סוג השירות.' },
      body: {
        type: 'string',
        description: 'גוף המייל בעברית, טקסט רגיל (לא HTML), 4-6 שורות: פתיחה אישית לפי שם הלקוח, ' +
          'משפט שמציג את ההצעה המצורפת (תוכנית עבודה ומחיר), קריאה לפעולה (לתאם שיחה/לאשר ולהתחיל), ' +
          `וסיום עם חתימה בשם "${signatureLine()}".`
      }
    },
    required: ['subject', 'body']
  };
}

function buildEmailSystemPrompt(){
  const { businessName } = getBranding();
  return `אתה כותב מייל מקצועי בעברית בשם "${businessName}", ששולח ללקוח הצעת מחיר
מצורפת כקובץ PDF. הטון חם, ענייני ומקצועי — לא רשמי-קר ולא קזואלי מדי. אל תמציא פרטים שלא מופיעים בהצעה.`;
}

/**
 * Draft a Hebrew subject + plain-text body for emailing a finished quote to the client.
 * @param {object} args
 * @param {object} args.quote
 * @returns {Promise<{subject:string, body:string}>}
 */
async function draftClientEmail({ quote }){
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildEmailSystemPrompt(),
    tools: [{
      name: 'draft_email',
      description: 'מנסח נושא וגוף למייל ללקוח עם ההצעה המצורפת.',
      input_schema: buildEmailSchema()
    }],
    tool_choice: { type: 'tool', name: 'draft_email' },
    messages: [{
      role: 'user',
      content: `פרטי ההצעה (JSON):\n${JSON.stringify(quote)}\n\nכתוב נושא וגוף מייל בעברית ללקוח "${quote.clientName}".`
    }]
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if(!toolUse){
    throw new Error('Claude did not return an email draft.');
  }
  return { subject: toolUse.input.subject, body: toolUse.input.body };
}

module.exports = { generateQuote, draftClientEmail };
