// תבנית ברירת מחדל + מבנה הצעה ריקה

function makeId(){
  return 'q_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const DEFAULT_TEMPLATE = {
  title: 'הצעת מחיר',
  subtitle: 'תוכנית עבודה והצעת מחיר:',
  heading: 'אסטרטגיה, דיוק מסרים והקמת משפך שיווקי',
  intro: 'תרגום האסטרטגיה והמסרים המדויקים לדף נחיתה ממוקד באמצעות בניית משפך נכון שיוביל את המשתמשים להרשמה ישירה לשבוע ההתנסות באפליקציה.',
  clientName: '',
  quoteNumber: '',
  sections: [
    {
      heading: '1. מחקר, אסטרטגיה ומדידה',
      paragraphs: [
        { lead: 'ניתוח דאטה קיים ומחקר מקדים:', body: 'מעבר על הנתונים וההסטטיסטיקות מאחורי הקלעים כדי לאתר במדויק היכן מתרחשות הנטישות במסע הלקוחה הנוכחי, ראיונות משתמשים, נתונים מהאתר, לפצח את החסמים ולהבין את הפסיכולוגיה של תתי-הקהלים.' },
        { lead: 'דיוק מסרים שיווקיים:', body: 'גיבוש מסרים ממוקדים שפוגעים בכאבים האמיתיים שעלו מהשטח, אלו הם שיובילו את דף הנחיתה.' },
        { lead: 'הגדרת מדידה לפאנל:', body: 'קונפיגורציה והטמעת כלי מעקב, כדי לדעת בכל רגע נתון כמה מבקרות נכנסו לדף, כמה לחצו על ההנעה לפעולה, והיכן הן נוטשות.' }
      ]
    },
    {
      heading: '2. פיתוח דף הנחיתה (קוד מאפס ואחסון עצמאי)',
      paragraphs: [
        { lead: 'עיצוב ובניית דף נחיתה:', body: 'דף נחיתה מהיר, נקי וממוקד המפותח בקוד וייושב על שרת אחסון נפרד, לטובת הנעה לפעולה ממוקדת להרשמה לשבוע ניסיון באפליקציה.' }
      ]
    }
  ],
  lineItems: [
    { desc: 'מחקר ואסטרטגיית מסרים', qty: 1, price: 0 },
    { desc: 'עיצוב ופיתוח דף נחיתה', qty: 1, price: 0 },
    { desc: 'הקמת מדידה ואנליטיקס', qty: 1, price: 0 }
  ],
  vatRate: 18,
  footerNote: 'הצעה זו תקפה ל-14 יום ממועד הוצאתה.'
};

function buildBlankQuote(fromTemplate){
  const t = fromTemplate || DEFAULT_TEMPLATE;
  const today = new Date().toISOString().slice(0,10);
  return {
    id: makeId(),
    title: t.title,
    subtitle: t.subtitle,
    heading: t.heading,
    intro: t.intro,
    clientName: t.clientName || '',
    date: today,
    quoteNumber: t.quoteNumber || '',
    sections: JSON.parse(JSON.stringify(t.sections || [])),
    lineItems: JSON.parse(JSON.stringify(t.lineItems || [])),
    vatRate: t.vatRate != null ? t.vatRate : 18,
    footerNote: t.footerNote || '',
    savedAt: null
  };
}
