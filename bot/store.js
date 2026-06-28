const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// DATA_DIR defaults to the repo root (the original Hetzner layout: quotes/ sits
// next to index.html, conversations.json sits in bot/) — unset DATA_DIR changes
// nothing for the existing deploy. On a PaaS with a single mounted disk (Render),
// DATA_DIR points at that mount so both quotes/ and conversations.json survive
// restarts/redeploys together. server.js explicitly serves QUOTES_DIR at
// /quote-tool/quotes/ so the browser tool's ?id= fetch keeps working either way.
const TOOL_DIR = path.join(__dirname, '..');
// When DATA_DIR is unset, reproduce the exact original paths (quotes/ next to
// index.html, conversations.json inside bot/) so the existing Hetzner deploy
// is byte-for-byte unaffected. When set, both move under the one mounted disk.
const QUOTES_DIR = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'quotes') : path.join(TOOL_DIR, 'quotes');
const STATE_FILE = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'conversations.json') : path.join(__dirname, 'conversations.json');
const USAGE_FILE = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'usage.json') : path.join(__dirname, 'usage.json');
const CREDITS_FILE = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'credits.json') : path.join(__dirname, 'credits.json');

for (const dir of [QUOTES_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function makeId(){
  return 'q_' + crypto.randomBytes(6).toString('hex');
}

/**
 * Persist a finished quote as <id>.json and return its id.
 * @param {object} quote
 * @returns {string} id
 */
function saveQuote(quote){
  const id = quote.id || makeId();
  const today = new Date().toISOString().slice(0, 10);
  const record = {
    id,
    date: quote.date || today,
    savedAt: new Date().toISOString(),
    ...quote
  };
  record.id = id;
  fs.writeFileSync(path.join(QUOTES_DIR, id + '.json'), JSON.stringify(record, null, 2), 'utf8');
  return id;
}

/* ===== Per-chat conversation state (survives restarts) ===== */
function readState(){
  try{ return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch(e){ return {}; }
}
function writeState(all){
  fs.writeFileSync(STATE_FILE, JSON.stringify(all, null, 2), 'utf8');
}

function getConversation(chatId){
  return readState()[String(chatId)] || null;
}
function setConversation(chatId, convo){
  const all = readState();
  all[String(chatId)] = convo;
  writeState(all);
}
function clearConversation(chatId){
  const all = readState();
  delete all[String(chatId)];
  writeState(all);
}

/* ===== Monthly usage metering (per chat = per customer/bot) =====
   Since Tom funds the AI, every finished quote is counted against a monthly cap.
   Keyed by "YYYY-MM" so it resets automatically each month with no cron job.
   Stored separately from conversation state so it survives /new and restarts. */
function currentMonth(){
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}
function readUsage(){
  try{ return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); }
  catch(e){ return {}; }
}
function writeUsage(all){
  fs.writeFileSync(USAGE_FILE, JSON.stringify(all, null, 2), 'utf8');
}

/** How many finished quotes this chat produced in the current month. */
function getUsage(chatId){
  const all = readUsage();
  const month = currentMonth();
  return (all[month] && all[month][String(chatId)]) || 0;
}

/** Increment this chat's count for the current month; returns the new count. */
function incrementUsage(chatId){
  const all = readUsage();
  const month = currentMonth();
  if (!all[month]) all[month] = {};
  all[month][String(chatId)] = (all[month][String(chatId)] || 0) + 1;
  writeUsage(all);
  return all[month][String(chatId)];
}

/** Full current-month usage map { chatId: count } for the admin view. */
function getMonthlyUsage(){
  return readUsage()[currentMonth()] || {};
}

/* ===== Prepaid credits (per chat) =====
   Alternative billing model to the monthly quota above: a balance that only
   decreases (no automatic monthly reset) and is topped up manually by Tom via
   add-credits.js when a one-time payment comes in. Coexists with the monthly
   quota — a given tenant's .env picks ONE mode via BILLING_MODE, but both
   mechanisms live side by side in the same store so either can be used. */
function readCredits(){
  try{ return JSON.parse(fs.readFileSync(CREDITS_FILE, 'utf8')); }
  catch(e){ return {}; }
}
function writeCredits(all){
  fs.writeFileSync(CREDITS_FILE, JSON.stringify(all, null, 2), 'utf8');
}

/** { balance, warned } for this chat. balance=0/missing if never topped up. */
function getCredits(chatId){
  const all = readCredits();
  return all[String(chatId)] || { balance: 0, warned: false };
}

/** Add credits (e.g. after a payment). Resets the low-balance warning flag. */
function addCredits(chatId, amount){
  const all = readCredits();
  const key = String(chatId);
  const current = all[key] || { balance: 0, warned: false };
  all[key] = { balance: current.balance + amount, warned: false };
  writeCredits(all);
  return all[key].balance;
}

/** Spend one credit for a finished quote; returns the new balance. */
function decrementCredits(chatId){
  const all = readCredits();
  const key = String(chatId);
  const current = all[key] || { balance: 0, warned: false };
  all[key] = { ...current, balance: Math.max(0, current.balance - 1) };
  writeCredits(all);
  return all[key].balance;
}

/** Mark that the low-balance warning was already sent, so it fires once per dip. */
function markCreditsWarned(chatId){
  const all = readCredits();
  const key = String(chatId);
  const current = all[key] || { balance: 0, warned: false };
  all[key] = { ...current, warned: true };
  writeCredits(all);
}

/** Full credits map { chatId: {balance, warned} } for the admin view. */
function getAllCredits(){
  return readCredits();
}

module.exports = {
  makeId, saveQuote,
  getConversation, setConversation, clearConversation,
  getUsage, incrementUsage, getMonthlyUsage, currentMonth,
  getCredits, addCredits, decrementCredits, markCreditsWarned, getAllCredits,
  QUOTES_DIR
};
