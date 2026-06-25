const STORAGE_KEY_QUOTES = 'bon_quotes';
const STORAGE_KEY_TEMPLATES = 'bon_templates';

let state = null;

/* ===== Persistence helpers ===== */
function loadQuotes(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY_QUOTES)) || []; }
  catch(e){ return []; }
}
function saveQuotes(list){
  localStorage.setItem(STORAGE_KEY_QUOTES, JSON.stringify(list));
}
function loadTemplates(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY_TEMPLATES)) || []; }
  catch(e){ return []; }
}
function saveTemplates(list){
  localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(list));
}
function loadCurrent(){
  try{
    const raw = localStorage.getItem('bon_current');
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function persistCurrent(){
  localStorage.setItem('bon_current', JSON.stringify(state));
}

/* ===== Init ===== */
function init(){
  // When the Telegram bot sends a link like ?id=q_abc, load that quote from the
  // server. Only works when served over HTTP (the bot's Express); a local
  // double-click (file://) just falls through to the normal behavior below.
  const id = new URLSearchParams(location.search).get('id');
  if(id){
    state = buildBlankQuote(DEFAULT_TEMPLATE);
    render();
    fetch('quotes/' + encodeURIComponent(id) + '.json')
      .then(r => { if(!r.ok) throw new Error('not found'); return r.json(); })
      .then(data => {
        state = normalizeQuote(data);
        persistCurrent();
        render();
      })
      .catch(() => {
        alert('לא נמצאה הצעה עם המזהה הזה. נטענת הצעה ריקה.');
      })
      .finally(() => { window.__quoteReady = true; });
    return;
  }
  state = loadCurrent() || buildBlankQuote(DEFAULT_TEMPLATE);
  render();
  // Signals to a headless renderer (the bot's PDF generator) that content is in place.
  window.__quoteReady = true;
}

// Ensure a quote loaded from the bot has every field the renderer expects.
function normalizeQuote(data){
  const base = buildBlankQuote(DEFAULT_TEMPLATE);
  const merged = Object.assign(base, data);
  merged.sections = Array.isArray(data.sections) ? data.sections : base.sections;
  merged.lineItems = Array.isArray(data.lineItems) ? data.lineItems : base.lineItems;
  if(merged.vatRate == null) merged.vatRate = 18;
  return merged;
}

/* ===== Rendering ===== */
function render(){
  document.getElementById('field-title').textContent = state.title;
  document.getElementById('field-subtitle').textContent = state.subtitle;
  document.getElementById('field-heading').textContent = state.heading;
  document.getElementById('field-intro').textContent = state.intro;
  document.getElementById('field-client').textContent = state.clientName || '';
  document.getElementById('field-date').textContent = state.date || '';
  document.getElementById('field-quotenum').textContent = state.quoteNumber || '';

  renderSections();
  renderTable();
}

function renderSections(){
  const container = document.getElementById('sections-container');
  container.innerHTML = '';
  state.sections.forEach((sec, sIdx) => {
    const secEl = document.createElement('div');
    secEl.className = 'section';
    secEl.dataset.sIdx = sIdx;

    const h = document.createElement('div');
    h.className = 'section-heading';
    h.contentEditable = 'true';
    h.textContent = sec.heading;
    h.addEventListener('blur', () => {
      state.sections[sIdx].heading = h.textContent;
      persistCurrent();
    });
    secEl.appendChild(h);

    sec.paragraphs.forEach((p, pIdx) => {
      // Older saved quotes may still store paragraphs as plain strings.
      const para = (typeof p === 'string') ? { lead: '', body: p } : p;
      state.sections[sIdx].paragraphs[pIdx] = para;

      const pEl = document.createElement('p');
      pEl.className = 'section-paragraph';

      const leadEl = document.createElement('strong');
      leadEl.className = 'paragraph-lead';
      leadEl.contentEditable = 'true';
      leadEl.textContent = para.lead;
      leadEl.addEventListener('blur', () => {
        state.sections[sIdx].paragraphs[pIdx].lead = leadEl.textContent;
        persistCurrent();
      });

      const bodyEl = document.createElement('span');
      bodyEl.className = 'paragraph-body';
      bodyEl.contentEditable = 'true';
      bodyEl.textContent = (para.lead ? ' ' : '') + para.body;
      bodyEl.addEventListener('blur', () => {
        state.sections[sIdx].paragraphs[pIdx].body = bodyEl.textContent.replace(/^\s+/, '');
        persistCurrent();
      });

      pEl.appendChild(leadEl);
      pEl.appendChild(bodyEl);
      secEl.appendChild(pEl);
    });

    const controls = document.createElement('div');
    controls.className = 'section-controls';

    const addParaBtn = document.createElement('button');
    addParaBtn.className = 'mini-btn';
    addParaBtn.textContent = '➕ הוסף פסקה';
    addParaBtn.addEventListener('click', () => {
      state.sections[sIdx].paragraphs.push({ lead: 'כותרת משנה:', body: 'טקסט רץ...' });
      persistCurrent();
      renderSections();
    });
    controls.appendChild(addParaBtn);

    const delSecBtn = document.createElement('button');
    delSecBtn.className = 'mini-btn danger';
    delSecBtn.textContent = '🗑 מחק סעיף';
    delSecBtn.addEventListener('click', () => {
      if(!confirm('למחוק את הסעיף?')) return;
      state.sections.splice(sIdx, 1);
      persistCurrent();
      renderSections();
    });
    controls.appendChild(delSecBtn);

    secEl.appendChild(controls);
    container.appendChild(secEl);
  });

  const addSecBtn = document.createElement('button');
  addSecBtn.className = 'mini-btn no-print';
  addSecBtn.style.marginTop = '10px';
  addSecBtn.textContent = '➕ הוסף סעיף חדש';
  addSecBtn.addEventListener('click', () => {
    const num = state.sections.length + 1;
    state.sections.push({ heading: num + '. סעיף חדש', paragraphs: [{ lead: 'כותרת משנה:', body: 'טקסט רץ...' }] });
    persistCurrent();
    renderSections();
  });
  container.appendChild(addSecBtn);
}

function renderTable(){
  const tbody = document.getElementById('price-table-body');
  tbody.innerHTML = '';
  state.lineItems.forEach((item, idx) => {
    const tr = document.createElement('tr');

    tr.appendChild(makeCell(item.desc, 'text', v => { state.lineItems[idx].desc = v; persistCurrent(); }));
    tr.appendChild(makeCell(item.qty, 'number', v => { state.lineItems[idx].qty = parseFloat(v)||0; persistCurrent(); updateRowTotal(idx); }, 'qty-col'));
    tr.appendChild(makeCell(item.price, 'number', v => { state.lineItems[idx].price = parseFloat(v)||0; persistCurrent(); updateRowTotal(idx); }, 'price-col'));

    const totalTd = document.createElement('td');
    totalTd.className = 'total-col';
    totalTd.id = 'row-total-' + idx;
    totalTd.textContent = formatMoney((item.qty||0) * (item.price||0));
    tr.appendChild(totalTd);

    const delTd = document.createElement('td');
    delTd.className = 'row-del';
    const delBtn = document.createElement('button');
    delBtn.className = 'mini-btn danger';
    delBtn.textContent = '✕';
    delBtn.title = 'מחק שורה';
    delBtn.addEventListener('click', () => {
      state.lineItems.splice(idx, 1);
      afterTableChange();
    });
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);

    tbody.appendChild(tr);
  });

  document.getElementById('vat-rate-input').value = state.vatRate;
  renderTotals();
}

function makeCell(value, type, onChange, extraClass){
  const td = document.createElement('td');
  if(extraClass) td.className = extraClass;
  const input = document.createElement('input');
  input.className = 'cell-input';
  input.type = type;
  input.value = value;
  if(type === 'number'){ input.min = '0'; input.step = '0.01'; }
  input.addEventListener('input', () => onChange(input.value));
  td.appendChild(input);
  return td;
}

/* Updates a single row's total + the grand totals, without rebuilding
   the table (rebuilding would destroy the focused input mid-keystroke). */
function updateRowTotal(idx){
  const item = state.lineItems[idx];
  const cell = document.getElementById('row-total-' + idx);
  if(cell) cell.textContent = formatMoney((item.qty||0) * (item.price||0));
  renderTotals();
}

function afterTableChange(){
  persistCurrent();
  renderTable();
}

function renderTotals(){
  const subtotal = state.lineItems.reduce((sum, i) => sum + (i.qty||0) * (i.price||0), 0);
  const vat = subtotal * (state.vatRate/100);
  const grand = subtotal + vat;
  document.getElementById('subtotal-val').textContent = formatMoney(subtotal);
  document.getElementById('vat-val').textContent = formatMoney(vat);
  document.getElementById('grand-val').textContent = formatMoney(grand);
}

function formatMoney(n){
  return '₪' + n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function addRow(){
  state.lineItems.push({ desc: 'פריט חדש', qty: 1, price: 0 });
  afterTableChange();
}

/* ===== Top-level field bindings ===== */
function bindField(id, key){
  const el = document.getElementById(id);
  el.addEventListener('blur', () => {
    state[key] = el.textContent;
    persistCurrent();
  });
}

function bindVatInput(){
  const el = document.getElementById('vat-rate-input');
  el.addEventListener('input', () => {
    state.vatRate = parseFloat(el.value) || 0;
    persistCurrent();
    renderTotals();
  });
}

/* ===== Document actions ===== */
function newQuote(){
  if(!confirm('ליצור הצעה חדשה? שינויים שלא נשמרו יאבדו.')) return;
  const templates = loadTemplates();
  state = buildBlankQuote(templates.length ? templates[0] : DEFAULT_TEMPLATE);
  persistCurrent();
  render();
}

function saveQuote(){
  const list = loadQuotes();
  state.savedAt = new Date().toISOString();
  if(!state.quoteNumber){
    state.quoteNumber = 'Q-' + (list.length + 1).toString().padStart(3,'0');
  }
  const idx = list.findIndex(q => q.id === state.id);
  if(idx >= 0) list[idx] = state; else list.push(state);
  saveQuotes(list);
  persistCurrent();
  render();
  alert('ההצעה נשמרה בהצלחה.');
}

function openLoadPanel(){
  const list = loadQuotes();
  const panel = document.getElementById('load-panel-body');
  panel.innerHTML = '';
  if(!list.length){
    panel.innerHTML = '<div class="panel-empty">אין הצעות שמורות עדיין.</div>';
  }
  list.slice().reverse().forEach(q => {
    const item = document.createElement('div');
    item.className = 'panel-item';
    const info = document.createElement('div');
    info.className = 'panel-item-info';
    info.innerHTML = '<div class="panel-item-title">' + escapeHtml(q.title || 'ללא כותרת') +
      (q.clientName ? ' — ' + escapeHtml(q.clientName) : '') + '</div>' +
      '<div class="panel-item-date">' + (q.quoteNumber || '') + ' · ' + (q.date || '') + '</div>';
    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'panel-item-actions';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'mini-btn';
    loadBtn.textContent = 'טען';
    loadBtn.addEventListener('click', () => {
      state = JSON.parse(JSON.stringify(q));
      persistCurrent();
      render();
      closePanel('load-panel');
    });
    actions.appendChild(loadBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'mini-btn danger';
    delBtn.textContent = 'מחק';
    delBtn.addEventListener('click', () => {
      if(!confirm('למחוק את ההצעה השמורה?')) return;
      const all = loadQuotes().filter(x => x.id !== q.id);
      saveQuotes(all);
      openLoadPanel();
    });
    actions.appendChild(delBtn);

    item.appendChild(actions);
    panel.appendChild(item);
  });
  document.getElementById('load-panel').classList.remove('hidden');
}

function saveAsTemplate(){
  const templates = loadTemplates();
  const tpl = {
    title: state.title, subtitle: state.subtitle, heading: state.heading, intro: state.intro,
    clientName: '', quoteNumber: '', sections: state.sections, lineItems: state.lineItems,
    vatRate: state.vatRate, footerNote: state.footerNote, name: state.title + ' (תבנית)',
    savedAt: new Date().toISOString()
  };
  templates.unshift(tpl);
  saveTemplates(templates);
  alert('ההצעה הנוכחית נשמרה כתבנית.');
}

function closePanel(id){
  document.getElementById(id).classList.add('hidden');
}

function exportBackup(){
  const data = {
    quotes: loadQuotes(),
    templates: loadTemplates(),
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'brands-or-not-quotes-backup.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importBackup(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(Array.isArray(data.quotes)) saveQuotes(data.quotes);
      if(Array.isArray(data.templates)) saveTemplates(data.templates);
      alert('הייבוא הושלם בהצלחה.');
    }catch(e){
      alert('שגיאה בקריאת הקובץ. ודא שזהו קובץ גיבוי תקין.');
    }
  };
  reader.readAsText(file);
}

function downloadPdf(){
  window.print();
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/* ===== Wire up ===== */
document.addEventListener('DOMContentLoaded', () => {
  init();

  bindField('field-title', 'title');
  bindField('field-subtitle', 'subtitle');
  bindField('field-heading', 'heading');
  bindField('field-intro', 'intro');
  bindField('field-client', 'clientName');
  bindField('field-date', 'date');
  bindField('field-quotenum', 'quoteNumber');
  bindVatInput();

  document.getElementById('btn-new').addEventListener('click', newQuote);
  document.getElementById('btn-save').addEventListener('click', saveQuote);
  document.getElementById('btn-load').addEventListener('click', openLoadPanel);
  document.getElementById('btn-save-template').addEventListener('click', saveAsTemplate);
  document.getElementById('btn-export').addEventListener('click', exportBackup);
  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file-input').click());
  document.getElementById('import-file-input').addEventListener('change', (e) => {
    if(e.target.files && e.target.files[0]) importBackup(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('btn-pdf').addEventListener('click', downloadPdf);
  document.getElementById('btn-add-row').addEventListener('click', addRow);
  document.getElementById('load-panel-close').addEventListener('click', () => closePanel('load-panel'));
  document.getElementById('load-panel').addEventListener('click', (e) => {
    if(e.target.id === 'load-panel') closePanel('load-panel');
  });
});
