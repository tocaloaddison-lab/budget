'use strict';
/* =====================================================================
   Family Budget v2 — one person logs, family money tracked.
   Data stays on this phone (localStorage) and syncs to Google Sheets.
   ===================================================================== */
const CONFIG = {
  members: ['Me'],
  categories: [['Food & Groceries', 0], ['Fare & Transport', 0], ['Load & Internet', 0], ['School', 0],
    ['Bills & Utilities', 0], ['Health', 0], ['Household', 0], ['Others', 0]],
  paymentMethods: ['Cash', 'GCash', 'Maya', 'Bank / Card', ['Credit Card', true]],   // [name, true] = outside budget
  incomeSources: ['Salary', 'Business', 'Remittance', 'Other'],
  savingsAccounts: ['Cash'],
  bills: [],
  savingsGoal: 0
};
const KEY = 'familyBudget.v1';
const SMALL_LIMIT = 15000;          // ₱150 in centavos (small-leak rule)
const VERSION = '2.0';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const dim = (y, m) => new Date(y, m + 1, 0).getDate();
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monthRange = (y, m) => [ymd(new Date(y, m, 1)), ymd(new Date(y, m + 1, 0))];
const sum = list => list.reduce((a, e) => a + e.amount, 0);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const monthLabel = key => { const [y, m] = key.split('-').map(Number); return MONTHS[m - 1] + ' ' + y; };
const dateLabel = s => { const d = parseYmd(s); return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate(); };
const shortDate = s => { const d = parseYmd(s); return MONTHS[d.getMonth()] + ' ' + d.getDate(); };
function fmt(c) { const n = c / 100; return (n < 0 ? '-₱' : '₱') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmt0(c) { const n = Math.round(c / 100); return (n < 0 ? '-₱' : '₱') + Math.abs(n).toLocaleString('en-US'); }
function fmtC(c) {          // compact, for small tiles
  const n = Math.round(c / 100), a = Math.abs(n), s = n < 0 ? '-₱' : '₱';
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1e5) return s + Math.round(a / 1e3) + 'k';
  return s + a.toLocaleString('en-US');
}
const moneyField = c => (c ? String(c / 100) : '0');
const byId = (arr, id) => arr.find(x => x.id === id);
const nameOf = (arr, id, fb = '—') => (byId(arr, id) || {}).name || fb;
const active = arr => arr.filter(x => !x.archived);
const isActive = (arr, id) => !!arr.find(x => x.id === id && !x.archived);
const plural = (n, w) => n + ' ' + (n === 1 ? w : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's');
const clone = o => JSON.parse(JSON.stringify(o));
const cssv = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const PAL = i => cssv('--c' + ((i % 8 + 8) % 8 + 1)) || '#888';
const solo = () => active(S.settings.members).length <= 1;
function ensureMember(st) { if (!active(st.members).length) st.members.push({ id: uid(), name: 'Me' }); }

function parseAmount(raw, allowZero = false) {
  const s = String(raw ?? '').replace(/[,\s₱]/g, '');
  if (!s) return { err: allowZero ? 'Enter a number (0 is OK).' : 'Type an amount first.' };
  if (s.startsWith('-')) return { err: "Amount can't be negative." };
  if (!/^\d*(\.\d{0,2})?$/.test(s) || s === '.') return { err: 'Numbers only, like 150 or 150.50.' };
  const v = parseFloat(s);
  if (!isFinite(v)) return { err: 'Numbers only, like 150 or 150.50.' };
  if (!allowZero && v <= 0) return { err: 'Amount must be more than ₱0.' };
  if (v >= 10000000) return { err: 'That amount looks too big. Please check it.' };
  return { c: Math.round(v * 100) };
}

/* ---------- icons ---------- */
const svg = (d, cls = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${d}</svg>`;
const IC = {
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  right: svg('<path d="M9 18l6-6-6-6"/>'),
  chev: svg('<path d="M6 9l6 6 6-6"/>', 'chev'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>'),
  cloud: svg('<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>'),
  close: svg('<path d="M18 6L6 18M6 6l12 12"/>')
};
const ICON_WORDS = {
  cat: [[/food|grocer|rice|meal|ulam|palengke/i, '🍚'], [/fare|transpo|jeep|tricycle|gas|fuel|commute/i, '🛺'], [/load|internet|wifi|data/i, '📶'],
    [/school|tuition|educ|baon/i, '🎒'], [/bill|util|electric|water|power/i, '💡'], [/health|medic|doctor|pharma/i, '💊'], [/rent/i, '🏘️'],
    [/house|home/i, '🏠'], [/baby|kid|child/i, '🍼'], [/cloth|apparel/i, '👕'], [/church|zakat|donat|charity|sadaqah|tithe/i, '🤲'],
    [/gift|party|celebr/i, '🎁'], [/pet/i, '🐾'], [/eat out|restaurant|snack|coffee/i, '🍔'], [/other|misc/i, '📦']],
  inc: [[/salary|sweldo|wage/i, '💼'], [/business|negosyo|store|sales/i, '🏪'], [/remit|padala/i, '🌏'], [/allowance/i, '👛'], [/interest|dividend/i, '📈']],
  fund: [[/travel|trip|vacation|bakasyon/i, '✈️'], [/emergenc/i, '🛟'], [/tuition|school|educ|college/i, '🎓'], [/house|home|build|renov/i, '🏠'],
    [/car|vehicle|motor/i, '🚗'], [/alkansya|piggy|coin/i, '🐷'], [/business|capital|puhunan/i, '💼'], [/hajj|umrah/i, '🕋'], [/wedding/i, '💍'],
    [/health|hospital|medical/i, '🏥'], [/gadget|phone|laptop/i, '📱'], [/gift|christmas|eid|birthday/i, '🎁']],
  acct: [[/gcash|maya|gsave|wallet|e-?wallet/i, '📱'], [/cash|home|alkansya/i, '💵'], [/card|credit/i, '💳']],
  method: [[/gcash|maya|wallet/i, '📱'], [/cash/i, '💵'], [/credit|card/i, '💳'], [/bank|online/i, '🏦']]
};
const ICON_DEFAULT = { cat: '🏷️', inc: '💰', fund: '💰', acct: '🏦', method: '💳' };
function iconFor(kind, it) {
  if (!it) return ICON_DEFAULT[kind];
  if (it.icon) return it.icon;
  for (const [re, e] of ICON_WORDS[kind]) if (re.test(it.name || '')) return e;
  return ICON_DEFAULT[kind];
}
const EMOJI = '🍚 🛒 🍔 ☕ 🛺 🚌 ⛽ 📶 📱 💻 🎒 🎓 💡 💧 💊 🏥 🏠 🏘️ 🧹 🧴 👕 🍼 🐾 🤲 🎁 🎉 📦 🏷️ 🔧 🚗 🏍️ ✈️ 🛟 🐷 💼 🏪 🌏 🕋 💍 💰 💵 🏦 💳 📈 ⭐ ❤️ 🎯 🏁'.split(' ');

/* ---------- colours (follow the item, never its rank) ---------- */
function catColor(c) {
  if (!c) return cssv('--muted');
  if (c.color) return c.color;
  const L = (DRAFT && DRAFT.categories.includes(c)) ? DRAFT.categories : S.settings.categories;
  return PAL(Math.max(0, L.indexOf(c)));
}
const catColorId = id => catColor(byId(S.settings.categories, id));
const fundColor = f => (f && f.color) || PAL(Math.max(0, S.savings.funds.indexOf(f)));
const acctColor = k => { const i = S.settings.savingsAccounts.findIndex(a => a.id === k); return i < 0 ? cssv('--muted') : PAL(i + 4); };

/* =====================================================================
   STORAGE
   ===================================================================== */
let S, DRAFT = null, dirty = false;
const notices = [];
function blankState() {
  return { v: 1, setupDone: false,
    settings: { members: [], categories: [], methods: [], incomeSources: [], bills: [], savingsAccounts: [], savingsGoal: 0, theme: 'auto', carryOver: true, openingBalance: 0 },
    entries: [], savings: { funds: [], tx: [] }, prefs: { lastMember: null, lastByMember: {}, lastAcct: {}, lastFund: null } };
}
function fresh() {
  const s = blankState(), st = s.settings, c = v => Math.round(Number(v || 0) * 100);
  st.members = CONFIG.members.map(n => ({ id: uid(), name: n }));
  st.categories = CONFIG.categories.map(([n, b]) => ({ id: uid(), name: n, budget: c(b) }));
  st.methods = CONFIG.paymentMethods.map(n => Array.isArray(n) ? { id: uid(), name: n[0], offBudget: !!n[1] } : { id: uid(), name: n });
  st.incomeSources = CONFIG.incomeSources.map(n => ({ id: uid(), name: n }));
  st.bills = CONFIG.bills.map(([n, a, d, cat]) => ({ id: uid(), name: n, amount: c(a), day: Math.min(31, Math.max(1, d | 0)),
    categoryId: (st.categories.find(x => x.name === cat) || st.categories[0] || {}).id || null }));
  st.savingsAccounts = CONFIG.savingsAccounts.map(n => ({ id: uid(), name: n }));
  st.savingsGoal = c(CONFIG.savingsGoal);
  return s;
}
function valid(s) {
  return s && typeof s === 'object' && s.v === 1 && Array.isArray(s.entries) && s.settings &&
    ['members', 'categories', 'methods', 'incomeSources', 'bills'].every(k => Array.isArray(s.settings[k] || []));
}
function normalize(s) {
  const b = blankState();
  s.settings = Object.assign(b.settings, s.settings || {});
  for (const k of ['members', 'categories', 'methods', 'incomeSources', 'bills', 'savingsAccounts']) s.settings[k] = (s.settings[k] || []).filter(x => x && x.id);
  s.prefs = Object.assign(b.prefs, s.prefs || {});
  s.prefs.lastByMember = s.prefs.lastByMember || {};
  s.prefs.lastAcct = s.prefs.lastAcct || {};
  s.entries = s.entries.filter(e => e && e.id && Number.isInteger(e.amount) && e.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && (e.type === 'expense' || e.type === 'income'));
  s.settings.savingsGoal = Number.isInteger(s.settings.savingsGoal) ? s.settings.savingsGoal : 0;
  if (typeof s.settings.carryOver !== 'boolean') s.settings.carryOver = true;
  if (!Number.isInteger(s.settings.openingBalance)) s.settings.openingBalance = 0;
  const sv = s.savings && typeof s.savings === 'object' ? s.savings : {};
  s.savings = { funds: (Array.isArray(sv.funds) ? sv.funds : []).filter(f => f && f.id),
    tx: (Array.isArray(sv.tx) ? sv.tx : []).filter(t => t && t.id && Number.isInteger(t.amount) && t.amount > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(t.date) && ['in', 'out', 'move'].includes(t.type)) };
  /* v2: each savings record has its own account. Older records take their fund's account. */
  for (const t of s.savings.tx) {
    if (!('account' in t)) { const f = s.savings.funds.find(x => x.id === t.fund); t.account = (f && f.accountId) || null; }
    if (t.type === 'move') { if (!('toAccount' in t)) { const f = s.savings.funds.find(x => x.id === t.toFund); t.toAccount = (f && f.accountId) || null; } }
    else t.toAccount = null;
  }
  return s;
}
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); }
  catch (e) { notices.push('This browser is blocking storage, so nothing will be kept. Open the app in a normal (not private) window.'); return fresh(); }
  if (raw === null) return fresh();
  try {
    const s = JSON.parse(raw);
    if (!valid(s)) throw new Error('bad shape');
    return normalize(s);
  } catch (e) {
    try { localStorage.setItem(KEY + '.unreadable.' + Date.now(), raw); } catch (_) {}
    notices.push('Saved data could not be read, so the app started fresh. Restore a backup in Settings → Backup.');
    return fresh();
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); if (typeof SY !== 'undefined' && SY) markChanged(); return true; }
  catch (e) { toast('Could not save — phone storage may be full. Export a backup now.', true); return false; }
}

/* ---------- feedback ---------- */
let toastTimer;
function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = '', bad ? 4500 : 2400);
}
function ask(text, yes = 'Yes', danger = false, infoOnly = false, noLabel = 'Cancel') {
  return new Promise(res => {
    const m = $('#modal'), y = $('#m-yes'), n = $('#m-no');
    $('#m-text').textContent = text; y.textContent = yes; y.className = 'btn ' + (danger ? 'dangerfill' : 'pri');
    n.textContent = noLabel; n.classList.toggle('hidden', infoOnly); $('.mbtns').style.gridTemplateColumns = infoOnly ? '1fr' : '';
    m.classList.remove('hidden');
    const done = v => { m.classList.add('hidden'); n.classList.remove('hidden'); y.onclick = n.onclick = null; res(v); };
    y.onclick = () => done(true); n.onclick = () => done(false); n.focus();
  });
}
function renderNotices() {
  $('#notices').innerHTML = notices.map((n, i) => `<div class="notice" role="alert"><span>${esc(n)}</span><button type="button" class="btn sm" data-a="dismiss" data-i="${i}">OK</button></div>`).join('');
}

/* =====================================================================
   NAVIGATION
   ===================================================================== */
let screen = 'add', prevScreen = 'add';
const SUB = { budget: 'overview', savings: 'overview' };
const FOLD = {};
let MC = (() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; })();
const isCurMonth = () => { const t = new Date(); return MC.y === t.getFullYear() && MC.m === t.getMonth(); };
const mcRange = () => monthRange(MC.y, MC.m);
function firstMonth() {
  const t = new Date(), cur = { y: t.getFullYear(), m: t.getMonth() };
  if (!S.entries.length) return cur;
  const f = parseYmd(S.entries.reduce((a, e) => e.date < a ? e.date : a, '9999-12-31'));
  return (f.getFullYear() * 12 + f.getMonth()) < (cur.y * 12 + cur.m) ? { y: f.getFullYear(), m: f.getMonth() } : cur;
}
function syncDot() {
  if (!SY || !SY.url) return '';
  const cls = syncing ? 'pend' : (SY.pending && !navigator.onLine) ? 'off' : (SY.pending && SY.error) ? 'err' : SY.pending ? 'pend' : 'ok';
  return `<button type="button" class="icbtn" data-a="go" data-to="settings" data-open="set-sync" aria-label="${esc(syncStatusText())}">${IC.cloud}<i class="dot ${cls}"></i></button>`;
}
function renderHeader() {
  if (!S) return;
  const titles = { add: F.editing ? 'Edit' : 'Add', budget: 'Budget', savings: 'Savings', settings: 'Settings', setup: 'Welcome' };
  const back = screen === 'settings';
  let mid = '';
  if (screen === 'budget') {
    const fm = firstMonth(), canPrev = MC.y * 12 + MC.m > fm.y * 12 + fm.m;
    mid = `<div class="mnav"><button type="button" class="icbtn sm" data-a="mon" data-d="-1" aria-label="Previous month"${canPrev ? '' : ' disabled'}>${IC.back}</button><span>${MONTHS[MC.m]} ${MC.y}</span><button type="button" class="icbtn sm" data-a="mon" data-d="1" aria-label="Next month"${isCurMonth() ? ' disabled' : ''}>${IC.right}</button></div>`;
  }
  let right = '';
  if (screen === 'add' && F.editing) right = `<button type="button" class="tbtn" data-a="cancelEdit">Cancel</button>`;
  else if (screen !== 'settings' && screen !== 'setup') right = `${syncDot()}<button type="button" class="icbtn" data-a="go" data-to="settings" aria-label="Settings">${IC.gear}</button>`;
  const tabs = (screen === 'budget' || screen === 'savings')
    ? `<div class="tabs" role="tablist">${[['overview', 'Overview'], ['history', 'History']].map(([k, l]) => `<button type="button" role="tab" data-a="sub" data-k="${k}" aria-selected="${SUB[screen] === k}">${l}</button>`).join('')}</div>` : '';
  $('#top').innerHTML = `<div class="top-row${back ? ' hasback' : ''}">${back ? `<button type="button" class="icbtn" data-a="back" aria-label="Back">${IC.back}</button>` : ''}<h1 class="ttl">${titles[screen]}</h1>${mid}<div class="top-r">${right}</div></div>${tabs}`;
}
function render() {
  renderHeader();
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + screen));
  $$('#nav [data-to]').forEach(b => b.setAttribute('aria-current', b.dataset.to === screen ? 'page' : 'false'));
  const noNav = screen === 'settings' || screen === 'setup';
  $('#nav').classList.toggle('hidden', noNav);
  document.body.classList.toggle('nonav', noNav);
  destroyCharts();
  if (screen === 'add') renderAdd();
  else if (screen === 'budget') SUB.budget === 'history' ? renderBudgetHistory() : renderBudgetOverview();
  else if (screen === 'savings') SUB.savings === 'history' ? renderSavingsHistory() : renderSavingsOverview();
  else if (screen === 'settings') renderSettings();
  else if (screen === 'setup') renderSetup();
  renderSetBar();
}
async function go(name) {
  if (screen === 'settings' && name !== 'settings' && dirty) {
    const yes = await ask('You have unsaved changes in Settings.\n\nSave them?', 'Save', false, false, "Don't save");
    if (yes) commitSettings(true); else { dirty = false; applyTheme(S.settings.theme); }
  }
  if (name === 'settings' && screen !== 'settings') {
    prevScreen = screen;
    try { history.pushState({ fb: 'settings' }, ''); } catch (_) {}
  }
  if (name !== 'settings' && name !== 'setup') { DRAFT = null; dirty = false; }
  if (name === 'settings' && !DRAFT) DRAFT = clone(S.settings);
  screen = name;
  render();
  window.scrollTo(0, 0);
}
function leaveSettings() { go(prevScreen && prevScreen !== 'settings' && prevScreen !== 'setup' ? prevScreen : 'add'); }

/* ---------- sheets (bottom panels) ---------- */
let sheetOpen = false, sheetKind = null, ignorePop = false;
function openSheet(html, kind) {
  $('#sheet-body').innerHTML = html;
  if (!sheetOpen) {
    $('#sheet').classList.remove('hidden'); sheetOpen = true;
    try { history.pushState({ fb: 'sheet' }, ''); } catch (_) {}
  }
  sheetKind = kind;
}
function closeSheet(fromPop) {
  if (!sheetOpen) return;
  sheetOpen = false; sheetKind = null;
  $('#sheet').classList.add('hidden'); $('#sheet-body').innerHTML = '';
  if (!fromPop) { try { if (history.state && history.state.fb === 'sheet') { ignorePop = true; history.back(); } } catch (_) {} }
}
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop = false; return; }
  if (sheetOpen) { closeSheet(true); return; }
  if (screen === 'settings') leaveSettings();
});

/* =====================================================================
   BILLS
   ===================================================================== */
function billDue(b, y, m) { return ymd(new Date(y, m, Math.min(b.day, dim(y, m)))); }
function isPaid(b, key) { return S.entries.some(e => e.billId === b.id && (e.billFor || e.date.slice(0, 7)) === key); }
function billStatus() {        // due in the next 7 days, plus unpaid overdue bills from this month
  const t = new Date(), ts = ymd(t), end = ymd(addDays(t, 7)), out = [];
  for (const b of active(S.settings.bills)) {
    for (const off of [0, 1]) {
      const d = new Date(t.getFullYear(), t.getMonth() + off, 1), due = billDue(b, d.getFullYear(), d.getMonth()), key = due.slice(0, 7), paid = isPaid(b, key);
      if (due >= ts && due <= end) out.push({ b, due, key, paid, overdue: false });
      else if (off === 0 && due < ts && !paid) out.push({ b, due, key, paid, overdue: true });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/* =====================================================================
   SAVINGS MATH (balances per fund AND per account)
   ===================================================================== */
const SRC = {
  budget: { i: '🏠', l: 'Family budget', h: 'Counts toward the monthly goal · lowers this month’s money left' },
  outside: { i: '🎁', l: 'Outside money', h: 'Gift, bonus, separate money · budget not affected' },
  interest: { i: '📈', l: 'Interest', h: 'Bank interest or earnings · budget not affected' },
  opening: { i: '🏁', l: 'Starting balance', h: 'Money already saved before using the app' }
};
const DEST = {
  budget: { i: '🏠', l: 'Back to budget', h: 'Added back to this month’s money left' },
  direct: { i: '🧾', l: 'Paid directly', h: 'Paid straight from savings · write what for' }
};
const akey = a => a || '';
const activeAccts = () => active(S.settings.savingsAccounts);
const acctName = k => k ? nameOf(S.settings.savingsAccounts, k, 'Account') : 'Not set';
const acctIcon = k => k ? iconFor('acct', byId(S.settings.savingsAccounts, k)) : '❔';
const fundName = id => nameOf(S.savings.funds, id, 'Fund');
function balOf(list, id) {
  let b = 0;
  for (const t of list) {
    if (t.type === 'in' && t.fund === id) b += t.amount;
    else if (t.type === 'out' && t.fund === id) b -= t.amount;
    else if (t.type === 'move') { if (t.fund === id) b -= t.amount; if (t.toFund === id) b += t.amount; }
  }
  return b;
}
function pairBal(list, fid, acct) {
  const k = akey(acct); let b = 0;
  for (const t of list) {
    if (t.fund === fid && akey(t.account) === k) b += t.type === 'in' ? t.amount : -t.amount;
    if (t.type === 'move' && t.toFund === fid && akey(t.toAccount) === k) b += t.amount;
  }
  return b;
}
function fundAccts(fid, list = S.savings.tx) {
  const m = new Map(), add = (k, v) => m.set(k, (m.get(k) || 0) + v);
  for (const t of list) {
    if (t.fund === fid) add(akey(t.account), t.type === 'in' ? t.amount : -t.amount);
    if (t.type === 'move' && t.toFund === fid) add(akey(t.toAccount), t.amount);
  }
  return [...m.entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
}
function acctTotals() {
  const m = new Map();
  for (const f of S.savings.funds) for (const [k, v] of fundAccts(f.id)) {
    const r = m.get(k) || { bal: 0, funds: [] }; r.bal += v; r.funds.push([f, v]); m.set(k, r);
  }
  return [...m.entries()].filter(([, r]) => r.bal !== 0).sort((a, b) => b[1].bal - a[1].bal);
}
const fundBal = (id, skip) => balOf(skip ? S.savings.tx.filter(t => t.id !== skip) : S.savings.tx, id);
const savTotal = () => S.savings.funds.reduce((a, f) => a + fundBal(f.id), 0);
function savingsFlow(from, to) {          // money moved between the family budget and savings
  let toS = 0, fromS = 0;
  for (const t of S.savings.tx) {
    if (t.date < from || t.date > to) continue;
    if (t.type === 'in' && t.src === 'budget') toS += t.amount;
    if (t.type === 'out' && t.dest === 'budget') fromS += t.amount;
  }
  return { toS, fromS };
}
/* Money carried into a month = starting money + everything left over (or overspent) in all earlier months. */
function carryInto(monthStart) {
  const st = S.settings;
  if (st.carryOver === false) return 0;
  let c = st.openingBalance || 0;
  for (const e of S.entries) { if (e.offBudget || e.date >= monthStart) continue; c += e.type === 'income' ? e.amount : -e.amount; }
  const fl = savingsFlow('0000-01-01', ymd(addDays(parseYmd(monthStart), -1)));
  return c - fl.toS + fl.fromS;
}
function prevMonthName(monthStart) { const d = parseYmd(monthStart); return MONTHS[new Date(d.getFullYear(), d.getMonth() - 1, 1).getMonth()]; }
function fundNet(fid, a, b) {
  let n = 0;
  for (const x of S.savings.tx) {
    if (x.date < a || x.date > b || x.src === 'opening') continue;
    if ((x.type === 'in' && x.fund === fid) || (x.type === 'move' && x.toFund === fid && x.fund !== fid)) n += x.amount;
    if ((x.type === 'out' && x.fund === fid) || (x.type === 'move' && x.fund === fid && x.toFund !== fid)) n -= x.amount;
  }
  return n;
}
function defaultMember() {
  const lm = S.prefs.lastMember;
  return lm && isActive(S.settings.members, lm) ? lm : (active(S.settings.members)[0] || {}).id || null;
}
function entryName(e) {
  return e.type === 'expense' ? nameOf(S.settings.categories, e.categoryId, 'Expense') : nameOf(S.settings.incomeSources, e.source, 'Income');
}

/* =====================================================================
   ADD / EDIT — expense, income and savings in one place
   ===================================================================== */
let F = newForm();
function newForm(type = 'expense') {
  return { type, member: null, cat: null, source: null, method: null, date: today(), dateTouched: false, note: '', amount: '',
    billId: null, billFor: null, editing: null, offBudget: false, offTouched: false, returnTo: null,
    sv: { mode: 'in', fund: null, account: null, toFund: null, toAccount: null, src: 'budget', dest: 'budget' } };
}
function applyMemberDefaults() {
  const st = S.settings, p = S.prefs.lastByMember[F.member] || {};
  if (F.type === 'expense') { if (p.cat && isActive(st.categories, p.cat)) F.cat = p.cat; }
  else if (F.type === 'income') { if (p.source && isActive(st.incomeSources, p.source)) F.source = p.source; }
  const m = F.type === 'expense' ? p.method : (p.methodIn || p.method);
  if (m && isActive(st.methods, m)) F.method = m;
  if (!F.method || !isActive(st.methods, F.method)) F.method = (active(st.methods)[0] || {}).id || null;
}
function lastAmount() {
  const p = S.prefs.lastByMember[F.member]; if (!p || !p.amt) return null;
  const k = F.type === 'expense' ? F.cat : F.source; return k ? p.amt[k] || null : null;
}
function defaultOff() {
  const st = S.settings, m = byId(st.methods, F.method), s = byId(st.incomeSources, F.source);
  return !!((m && m.offBudget) || (F.type === 'income' && s && s.offBudget));
}
function defaultAcct(fid, mode) {
  const accts = activeAccts();
  if (!fid) return accts[0] ? accts[0].id : null;
  if (mode === 'in') { const la = S.prefs.lastAcct[fid]; if (la && isActive(S.settings.savingsAccounts, la)) return la; }
  const fa = fundAccts(fid, S.savings.tx.filter(t => t.id !== F.editing)).filter(([, b]) => b > 0);
  if (fa.length) return fa[0][0];
  return accts[0] ? accts[0].id : null;
}
function svDefaults() {
  const v = F.sv, funds = active(S.savings.funds);
  if (!v.fund || !byId(S.savings.funds, v.fund)) v.fund = (S.prefs.lastFund && isActive(S.savings.funds, S.prefs.lastFund)) ? S.prefs.lastFund : (funds[0] || {}).id || null;
  if (v.fund && v.account === null) v.account = defaultAcct(v.fund, v.mode);
  if (v.mode === 'move') {
    if (!v.toFund || !byId(S.savings.funds, v.toFund)) v.toFund = (funds.find(f => f.id !== v.fund) || funds[0] || {}).id || null;
    if (v.toAccount === null && v.toFund) {
      v.toAccount = defaultAcct(v.toFund, 'in');
      if (v.toFund === v.fund && akey(v.toAccount) === akey(v.account)) { const o = activeAccts().find(a => a.id !== v.account); if (o) v.toAccount = o.id; }
    }
  }
}
function renderAdd() {
  const st = S.settings, isSv = F.type === 'savings';
  if (!F.editing && !F.dateTouched) F.date = today();
  if (!F.member || !(F.editing ? byId(st.members, F.member) : isActive(st.members, F.member))) {
    F.member = defaultMember(); if (!F.editing && !isSv) applyMemberDefaults();
  }
  if (!F.editing && !isSv) {
    if (F.cat && !isActive(st.categories, F.cat)) F.cat = null;
    if (F.source && !isActive(st.incomeSources, F.source)) F.source = null;
    if (F.method && !isActive(st.methods, F.method)) F.method = null;
    if (!F.method) applyMemberDefaults();
  }
  if (isSv) svDefaults();
  const types = [['expense', '💸', 'Expense'], ['income', '💰', 'Income'], ['savings', '🐷', 'Savings']];
  let h = `<div class="seg typeseg" role="group" aria-label="Type">${types.map(([k, i, l]) => {
    const dis = F.editing && ((k === 'savings') !== isSv);
    return `<button type="button" data-a="ftype" data-k="${k}" aria-pressed="${F.type === k}"${dis ? ' disabled' : ''}>${i} ${l}</button>`;
  }).join('')}</div>`;
  h += isSv ? svFields() : entryFields();
  const canSave = !isSv || active(S.savings.funds).length || F.editing;
  if (canSave) h += `<div class="err" id="ferr" role="alert"></div><div class="savebar">${F.editing ? `<button type="button" class="btn danger icon" data-a="fdel" aria-label="Delete">${IC.trash}</button>` : ''}<button type="button" class="btn pri big" data-a="fsave">${F.editing ? 'Save changes' : 'Save'}</button></div>`;
  $('#screen-add').innerHTML = h;
}
function amountBox(extra) {
  return `<div class="lbl"><span>Amount</span>${extra || ''}</div><div class="amtbox"><span>₱</span><input id="f-amount" data-i="amount" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="0" value="${esc(F.amount)}" aria-label="Amount"></div>`;
}
function memberChips(sel, act) {
  return `<div class="hscroll">${S.settings.members.filter(m => !m.archived || m.id === sel).map(m =>
    `<button type="button" class="chip" data-a="${act}" data-id="${m.id}" aria-pressed="${m.id === sel}">${esc(m.name)}</button>`).join('')}</div>`;
}
function dateNote(ph, label = 'Note') {
  return `<div class="row2"><label class="fld"><span>Date</span><input type="date" data-c="fdate" value="${F.date}"></label><label class="fld"><span>${label}</span><input data-i="note" maxlength="80" autocomplete="off" placeholder="${esc(ph)}" value="${esc(F.note)}"></label></div>${F.date > today() ? '<div class="warn">📅 Future date — it will be marked FUTURE</div>' : ''}`;
}
function entryFields() {
  const st = S.settings, isExp = F.type === 'expense'; let h = '';
  if (isExp) {
    if (F.billId) { const b = byId(st.bills, F.billId); h += `<div class="billpill">🧾 <span class="grow">Paying <b>${esc(b ? b.name : 'bill')}</b>${F.billFor ? ' · ' + monthLabel(F.billFor) : ''}</span><button type="button" class="icbtn sm" data-a="billclear" aria-label="Not a bill payment">${IC.close}</button></div>`; }
    else if (!F.editing) {
      const due = billStatus().filter(x => !x.paid);
      if (due.length) h += `<div class="hscroll quickrow">${due.map(x => `<button type="button" class="chip sm quick" data-a="bill" data-id="${x.b.id}" data-for="${x.key}">🧾 ${esc(x.b.name)} ${fmt0(x.b.amount)} <small class="${x.overdue ? 'neg' : ''}">${x.overdue ? 'overdue' : shortDate(x.due)}</small></button>`).join('')}</div>`;
    }
  }
  const la = !F.editing && !F.amount ? lastAmount() : null;
  h += amountBox(la ? `<button type="button" class="chip xs" data-a="lastamt">↺ Same as last · ${fmt0(la)}</button>` : '');
  const list = isExp ? st.categories : st.incomeSources, sel = isExp ? F.cat : F.source;
  h += `<div class="lbl">${isExp ? 'Category' : 'From'}</div><div class="cgrid4">${list.filter(c => !c.archived || c.id === sel).map(c =>
    `<button type="button" class="ctile" data-a="fcat" data-id="${c.id}" aria-pressed="${c.id === sel}" style="--cc:${isExp ? catColor(c) : cssv('--green')}"><span class="e">${iconFor(isExp ? 'cat' : 'inc', c)}</span><span class="n">${esc(c.name)}</span></button>`).join('') || '<p class="muted">Add some in Settings.</p>'}</div>`;
  if (!solo()) h += `<div class="lbl">${isExp ? 'Who spent it' : 'Who received it'}</div>${memberChips(F.member, 'fmem')}`;
  h += `<div class="lbl">${isExp ? 'Paid with' : 'Received in'}</div><div class="hscroll">${st.methods.filter(x => !x.archived || x.id === F.method).map(x =>
    `<button type="button" class="chip" data-a="fmeth" data-id="${x.id}" aria-pressed="${x.id === F.method}">${iconFor('method', x)} ${esc(x.name)}</button>`).join('')}</div>`;
  if (!F.offTouched) F.offBudget = defaultOff();
  h += dateNote(isExp ? 'e.g. rice 5kg' : 'e.g. November salary');
  h += `<button type="button" class="switchrow" data-a="foff" aria-pressed="${F.offBudget}"><span class="sw"></span><span class="grow"><b>Outside budget</b><small>Credit card or separate money · not counted in totals</small></span></button>`;
  return h;
}
function fundTiles(sel, act, withNew) {
  const v = F.sv, funds = S.savings.funds.filter(f => !f.archived || f.id === v.fund || f.id === v.toFund);
  return `<div class="hscroll">${funds.map(f => `<button type="button" class="ftile" data-a="${act}" data-id="${f.id}" aria-pressed="${f.id === sel}" style="--cc:${fundColor(f)}"><span class="e">${iconFor('fund', f)}</span><span class="n">${esc(f.name)}</span><span class="b">${fmtC(fundBal(f.id, F.editing))}</span></button>`).join('')}${withNew ? `<button type="button" class="ftile add" data-a="fundNew"><span class="e">＋</span><span class="n">New fund</span></button>` : ''}</div>`;
}
function acctChips(fid, sel, act, showBal) {
  const list = S.savings.tx.filter(t => t.id !== F.editing);
  const items = S.settings.savingsAccounts.filter(a => !a.archived || a.id === sel).map(a => ({ k: a.id, n: a.name, i: iconFor('acct', a) }));
  if ((fid && pairBal(list, fid, null) > 0) || sel === '') items.push({ k: '', n: 'Not set', i: '❔' });
  return `<div class="hscroll">${items.map(x => {
    const b = fid ? pairBal(list, fid, x.k || null) : 0, show = b !== 0 || showBal;
    return `<button type="button" class="chip" data-a="${act}" data-id="${x.k}" aria-pressed="${sel !== null && sel === x.k}">${x.i} ${esc(x.n)}${show ? ` <small>${fmtC(b)}</small>` : ''}</button>`;
  }).join('')}<button type="button" class="chip quick" data-a="acctNew" data-for="${act}">＋ New</button></div>`;
}
function svFields() {
  const v = F.sv, funds = S.savings.funds.filter(f => !f.archived || f.id === v.fund || f.id === v.toFund);
  if (!funds.length) return `<div class="card empty" style="margin-top:10px"><div class="e">🐷</div><b>No savings funds yet</b><p>Make one for each goal — Travel, Emergency, Tuition…</p><button type="button" class="btn pri" data-a="fundNew">＋ Create a fund</button></div>`;
  const canMove = funds.length > 1 || activeAccts().length > 1;
  let h = `<div class="seg mini" role="group" aria-label="Action" style="margin-top:10px">${[['in', '＋ Add'], ['out', '− Take out'], ['move', '⇄ Move']].map(([k, l]) =>
    `<button type="button" data-a="svmode" data-k="${k}" aria-pressed="${v.mode === k}"${k === 'move' && !canMove ? ' disabled' : ''}>${l}</button>`).join('')}</div>`;
  if (v.mode === 'in' && !F.editing) {
    const t = new Date(), [ms, me] = monthRange(t.getFullYear(), t.getMonth());
    const g = active(S.savings.funds).filter(f => f.monthlyGoal > 0).map(f => [f, f.monthlyGoal - fundNet(f.id, ms, me)]).filter(([, r]) => r > 0);
    if (g.length) h += `<div class="hscroll quickrow">${g.map(([f, r]) => `<button type="button" class="chip sm quick" data-a="goalfill" data-id="${f.id}" data-amt="${r}">🎯 ${iconFor('fund', f)} ${esc(f.name)} <small>${fmt0(r)} to go</small></button>`).join('')}</div>`;
  }
  h += `<div class="lbl">${v.mode === 'move' ? 'From fund' : 'Fund'}</div>${fundTiles(v.fund, 'svfund', true)}`;
  h += `<div class="lbl">${v.mode === 'in' ? 'Kept in' : v.mode === 'out' ? 'Taken from' : 'From account'}</div>${acctChips(v.fund, v.account, 'svacct', v.mode !== 'in')}`;
  if (v.mode === 'move') h += `<div class="lbl">To fund</div>${fundTiles(v.toFund, 'svtofund', false)}<div class="lbl">To account</div>${acctChips(v.toFund, v.toAccount, 'svtoacct', false)}`;
  let maxChip = '';
  if (v.mode !== 'in' && v.fund && v.account !== null) {
    const b = pairBal(S.savings.tx.filter(t => t.id !== F.editing), v.fund, v.account || null);
    if (b > 0) maxChip = `<button type="button" class="chip xs" data-a="maxamt" data-amt="${b}">All · ${fmt0(b)}</button>`;
  }
  h += amountBox(maxChip);
  if (v.mode === 'in') {
    const keys = ['budget', 'outside', 'interest'].concat(v.src === 'opening' ? ['opening'] : []);
    h += `<div class="lbl">Came from</div><div class="hscroll">${keys.map(k => `<button type="button" class="chip" data-a="svsrc" data-k="${k}" aria-pressed="${v.src === k}">${SRC[k].i} ${SRC[k].l}</button>`).join('')}</div><p class="hint">${SRC[v.src].h}</p>`;
  }
  if (v.mode === 'out') h += `<div class="lbl">Goes to</div><div class="hscroll">${['budget', 'direct'].map(k => `<button type="button" class="chip" data-a="svdest" data-k="${k}" aria-pressed="${v.dest === k}">${DEST[k].i} ${DEST[k].l}</button>`).join('')}</div><p class="hint">${DEST[v.dest].h}</p>`;
  if (!solo()) h += `<div class="lbl">Who</div>${memberChips(F.member, 'fmem')}`;
  h += v.mode === 'out' && v.dest === 'direct' ? dateNote('e.g. tuition, hospital', 'What for?') : dateNote(v.mode === 'move' ? 'optional' : 'e.g. leftover from October');
  return h;
}
function ferr(m) { const e = $('#ferr'); if (e) e.textContent = m; return false; }
function finishForm(wasEditing) {
  if (wasEditing) { const back = F.returnTo || 'budget'; F = newForm(F.type === 'savings' ? 'savings' : 'expense'); go(back); return; }
  F.amount = ''; F.note = ''; F.billId = null; F.billFor = null; F.dateTouched = false; F.offTouched = false;
  renderAdd();
}
function saveEntry() {
  const st = S.settings, isExp = F.type === 'expense', r = parseAmount(F.amount);
  if (r.err) return ferr(r.err);
  if (!F.member) { if (solo()) { ensureMember(st); F.member = active(st.members)[0].id; } else return ferr(isExp ? 'Tap who spent it.' : 'Tap who received it.'); }
  const catId = isExp ? F.cat : F.source;
  if (!catId) return ferr(isExp ? 'Tap a category.' : 'Tap where the money came from.');
  if (!F.method && active(st.methods).length) return ferr('Tap how it was paid.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(F.date)) return ferr('Pick a valid date.');
  const data = { type: F.type, amount: r.c, date: F.date, member: F.member, categoryId: isExp ? catId : null, source: isExp ? null : catId,
    method: F.method || null, note: F.note.trim(), billId: isExp ? F.billId : null, billFor: isExp ? F.billFor : null, offBudget: !!F.offBudget };
  const wasEditing = F.editing;
  if (wasEditing) { const e = S.entries.find(x => x.id === wasEditing); if (e) Object.assign(e, data, { updated: Date.now() }); }
  else S.entries.push(Object.assign({ id: uid(), created: Date.now() }, data));
  const p = S.prefs.lastByMember[F.member] = S.prefs.lastByMember[F.member] || { amt: {} };
  p.amt = p.amt || {};
  if (isExp) { p.cat = catId; p.method = F.method; } else { p.source = catId; p.methodIn = F.method; }
  p.amt[catId] = r.c; S.prefs.lastMember = F.member;
  save();
  const nm = isExp ? nameOf(st.categories, catId) : nameOf(st.incomeSources, catId);
  toast(`✓ ${fmt(r.c)} · ${nm}${F.date > today() ? ' · future' : ''}${F.offBudget ? ' · outside budget' : ''}`);
  finishForm(wasEditing);
}
function saveSavings() {
  const v = F.sv, r = parseAmount(F.amount);
  if (r.err) return ferr(r.err);
  if (!v.fund) return ferr('Pick a fund.');
  if (v.account === null) return ferr(activeAccts().length ? 'Tap where the money is kept.' : 'Add an account first — tap ＋ New.');
  if (v.mode === 'move') {
    if (!v.toFund) return ferr('Pick the fund to move to.');
    if (v.toAccount === null) return ferr('Tap the account to move to.');
    if (v.toFund === v.fund && akey(v.toAccount) === akey(v.account)) return ferr('Pick a different fund or account.');
  }
  if (!F.member) F.member = defaultMember();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(F.date)) return ferr('Pick a valid date.');
  if (v.mode === 'out' && v.dest === 'direct' && !F.note.trim()) return ferr('Write what the money was used for.');
  const tx = { type: v.mode, fund: v.fund, account: v.account || null, toFund: v.mode === 'move' ? v.toFund : null, toAccount: v.mode === 'move' ? (v.toAccount || null) : null,
    amount: r.c, date: F.date, src: v.mode === 'in' ? v.src : null, dest: v.mode === 'out' ? v.dest : null, member: F.member, note: F.note.trim() };
  const old = F.editing ? S.savings.tx.find(t => t.id === F.editing) : null;
  const others = S.savings.tx.filter(t => t.id !== F.editing), after = others.concat([tx]);
  const pairs = [[tx.fund, tx.account]];
  if (tx.type === 'move') pairs.push([tx.toFund, tx.toAccount]);
  if (old) { pairs.push([old.fund, old.account]); if (old.type === 'move') pairs.push([old.toFund, old.toAccount]); }
  for (const [f, a] of pairs) if (pairBal(after, f, a) < 0) return ferr(`Not enough in ${fundName(f)} · ${acctName(a)} — it has ${fmt(Math.max(0, pairBal(others, f, a)))}.`);
  if (old) Object.assign(old, tx, { updated: Date.now() }); else S.savings.tx.push(Object.assign({ id: uid(), created: Date.now() }, tx));
  S.prefs.lastFund = tx.fund; S.prefs.lastAcct[tx.fund] = tx.account; if (F.member) S.prefs.lastMember = F.member;
  save();
  const L = txLabel(tx);
  toast(`✓ ${L.sign}${fmt(r.c)} · ${L.title}`);
  const wasEditing = F.editing;
  if (!wasEditing) { F.sv.account = null; F.sv.toAccount = null; }
  finishForm(wasEditing);
}
function txLabel(t) {
  const f = byId(S.savings.funds, t.fund);
  if (t.type === 'in') return { title: fundName(t.fund), sub: `${(SRC[t.src] || SRC.budget).i} ${(SRC[t.src] || SRC.budget).l} → ${acctName(t.account)}`, sign: '+', cls: 'pos', f };
  if (t.type === 'out') return { title: fundName(t.fund), sub: `${(DEST[t.dest] || DEST.budget).i} ${(DEST[t.dest] || DEST.budget).l} ← ${acctName(t.account)}`, sign: '−', cls: 'neg', f };
  const title = t.fund === t.toFund ? fundName(t.fund) : `${fundName(t.fund)} → ${fundName(t.toFund)}`;
  return { title, sub: `⇄ ${acctName(t.account)} → ${acctName(t.toAccount)}`, sign: '', cls: '', f };
}
async function deleteEntry(id) {
  const i = S.entries.findIndex(x => x.id === id); if (i < 0) return;
  const e = S.entries[i];
  if (!(await ask(`Delete this entry?\n\n${fmt(e.amount)} · ${entryName(e)} · ${dateLabel(e.date)}\n\nThis cannot be undone.`, 'Delete', true))) return;
  S.entries.splice(i, 1); save(); toast('Entry deleted');
  if (F.editing === id) { const back = F.returnTo || 'budget'; F = newForm(); go(back); } else render();
}
async function deleteTx(id) {
  const t = S.savings.tx.find(x => x.id === id); if (!t) return;
  const rest = S.savings.tx.filter(x => x !== t), L = txLabel(t);
  const pairs = [[t.fund, t.account]]; if (t.type === 'move') pairs.push([t.toFund, t.toAccount]);
  for (const [f, a] of pairs) {
    const after = pairBal(rest, f, a);
    if (after < 0) {
      const later = rest.filter(x => x.date >= t.date && x.fund === f && akey(x.account) === akey(a) && x.type !== 'in').sort((p, q) => p.date.localeCompare(q.date)).slice(0, 3)
        .map(x => { const l = txLabel(x); return `• ${l.title} ${l.sign}${fmt(x.amount)} · ${shortDate(x.date)}`; }).join('\n');
      await ask(`Can't delete this yet.\n\nWithout it, ${fundName(f)} · ${acctName(a)} would go to ${fmt(after)}, because money was taken out later:\n${later}\n\nDelete or lower that later record first.`, 'OK', false, true);
      return;
    }
  }
  if (!(await ask(`Delete this savings record?\n\n${L.title} · ${L.sign}${fmt(t.amount)} · ${dateLabel(t.date)}${t.note ? '\n' + t.note : ''}\n\nThis cannot be undone.`, 'Delete', true))) return;
  S.savings.tx = rest; save(); toast('Savings record deleted');
  if (F.editing === id) { const back = F.returnTo || 'savings'; F = newForm('savings'); go(back); return; }
  if (sheetKind === 'fund' && sheetFund) openFundSheet(sheetFund); else render();
}

/* =====================================================================
   TIPS — deterministic rules, offline, same input → same output
   ===================================================================== */
function suggestions() {
  const t = new Date(), ts = ymd(t);
  const past = S.entries.filter(e => e.date <= ts);
  if (!past.length) return { notEnough: true, span: 0 };
  const first = past.reduce((a, e) => e.date < a ? e.date : a, ts);
  const span = Math.round((parseYmd(ts) - parseYmd(first)) / 864e5) + 1;
  if (span < 7) return { notEnough: true, span };
  const y = t.getFullYear(), m = t.getMonth(), D = dim(y, m), el = t.getDate(), left = D - el;
  const [ms] = monthRange(y, m);
  const mPast = past.filter(e => e.date >= ms);
  const mExp = mPast.filter(e => e.type === 'expense' && !e.offBudget);
  const mInc = sum(mPast.filter(e => e.type === 'income' && !e.offBudget));
  const mSpent = sum(mExp), out = [];
  const leftTxt = left === 0 ? 'today is the last day' : `${plural(left, 'day')} left`;
  const prevMonths = [];
  for (let k = 1; k <= 3; k++) { const d = new Date(y, m - k, 1), [a, b] = monthRange(d.getFullYear(), d.getMonth()); if (a >= first) prevMonths.push([a, b]); }
  for (const c of S.settings.categories) {
    const list = mExp.filter(e => e.categoryId === c.id), spent = sum(list);
    if (c.budget > 0 && spent > 0) {                                   // 1. pace
      const proj = Math.round(spent / el * D);
      if (proj > c.budget) {
        let txt;
        if (spent >= c.budget) txt = `${c.name} is at ${fmt0(spent)} — over its ${fmt0(c.budget)} budget by ${fmt0(spent - c.budget)}, ${leftTxt}. Hold off on ${c.name} spending that can wait.`;
        else { txt = `${c.name} is at ${fmt0(spent)} of ${fmt0(c.budget)}, ${leftTxt} — on pace for ${fmt0(proj)}.`; if (left > 0) txt += ` Keep it to ${fmt0(Math.floor((c.budget - spent) / left))}/day.`; }
        out.push({ kind: 'warn', impact: proj - c.budget, text: txt });
      }
    }
    if (prevMonths.length && spent > 0) {                              // 2. spike
      const tot = prevMonths.reduce((a, [s, e]) => a + sum(S.entries.filter(x => x.type === 'expense' && !x.offBudget && x.categoryId === c.id && x.date >= s && x.date <= e)), 0);
      const avg = Math.round(tot / prevMonths.length);
      if (avg > 0 && spent > 1.5 * avg) out.push({ kind: 'warn', impact: spent - avg, text: `${c.name} is ${fmt0(spent)} this month — ${(spent / avg).toFixed(1)}× the usual ${fmt0(avg)}/month (last ${plural(prevMonths.length, 'month')} average).` });
    }
    const small = list.filter(e => e.amount < SMALL_LIMIT);              // 3. small leaks
    if (small.length >= 8) { const sm = sum(small); out.push({ kind: 'warn', impact: sm, text: `${small.length} small ${c.name} buys under ₱150 add up to ${fmt0(sm)}${c.budget > 0 ? ` — ${Math.round(sm / c.budget * 100)}% of its budget` : ''}. Buying in bulk could cut these.` }); }
    if (c.budget > 0 && left < D / 3 && spent < 0.6 * c.budget)         // 6. good news
      out.push({ kind: 'good', impact: c.budget - spent, text: `${c.name} is only at ${fmt0(spent)} of ${fmt0(c.budget)} (${Math.round(spent / c.budget * 100)}%), ${leftTxt}. Nice!` });
  }
  const unpaid = active(S.settings.bills).filter(b => !isPaid(b, ms.slice(0, 7)));   // 4. bill squeeze
  const sf = savingsFlow(ms, ts), savedSoFar = sf.toS - sf.fromS, carry = carryInto(ms);
  const U = unpaid.reduce((a, b) => a + b.amount, 0), remaining = carry + mInc - mSpent - savedSoFar;
  const carryTxt = carry ? ` (incl. ${carry > 0 ? fmt0(carry) + ' carried over' : fmt0(-carry) + ' overspent'} from ${prevMonthName(ms)})` : '';
  if (U > 0 && U > remaining) out.push({ kind: 'warn', impact: U - remaining, text: `Unpaid bills total ${fmt0(U)} (${unpaid.map(b => b.name + ' ' + fmt0(b.amount)).join(', ')}) but only ${fmt0(remaining)} is left${carryTxt}. Short by ${fmt0(U - remaining)}.` });
  const goal = S.settings.savingsGoal;                                 // 5. savings check
  if (goal > 0) {
    const projSpend = Math.round(mSpent / el * D), projSave = carry + mInc - projSpend;
    if (savedSoFar >= goal) out.push({ kind: 'good', impact: savedSoFar - goal + 1, text: `Savings goal reached: ${fmt0(savedSoFar)} moved to savings (goal ${fmt0(goal)}).` });
    else if (projSave < goal) { const gap = goal - projSave; out.push({ kind: 'warn', impact: gap, text: `At this pace you'll spend about ${fmt0(projSpend)}, leaving ${fmt0(projSave)} to save${carryTxt} — ${fmt0(gap)} short of the ${fmt0(goal)} goal${left > 0 ? `. Spend ${fmt0(Math.ceil(gap / left))}/day less to close it` : ''}.` }); }
    else out.push({ kind: 'good', impact: projSave - goal, text: `On track: about ${fmt0(projSave)} will be left. Move ${fmt0(goal - savedSoFar)} more to savings to hit the ${fmt0(goal)} goal.` });
  }
  out.sort((a, b) => (a.kind === b.kind ? b.impact - a.impact : a.kind === 'warn' ? -1 : 1));
  return { list: out.slice(0, 3), span };
}

/* ---------- shared bits ---------- */
function groupSum(list, keyFn) {
  const m = new Map();
  for (const e of list) { const k = keyFn(e) || ''; m.set(k, (m.get(k) || 0) + e.amount); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function sbar(segs, cls = '') {
  const s = segs.filter(x => x[0] > 0);
  return `<div class="sbar ${cls}" role="img" aria-label="${esc(s.map(x => x[2] + ' ' + fmt0(x[0])).join(', '))}">${s.map(([v, c]) => `<i style="flex:${v};background:${c}"></i>`).join('')}</div>`;
}
function splitBlock(title, pairs, nameFn, colorFn) {
  const tot = pairs.reduce((a, p) => a + p[1], 0); if (!tot) return '';
  const col = (k, i) => colorFn ? colorFn(k, i) : PAL(i);
  return `<div class="split"><div class="split-h"><span>${title}</span><b>${fmt0(tot)}</b></div>${sbar(pairs.map(([k, v], i) => [v, col(k, i), nameFn(k)]))}<div class="legend">${pairs.map(([k, v], i) =>
    `<span><i style="background:${col(k, i)}"></i>${esc(nameFn(k))} <b>${fmtC(v)}</b>${pairs.length > 1 ? ' ' + Math.round(v / tot * 100) + '%' : ''}</span>`).join('')}</div></div>`;
}
const tile = (label, v, o = {}) => `<div class="tile"><div class="tk">${o.dot ? `<i style="background:${o.dot}"></i>` : ''}${label}</div><b class="${o.cls || ''}">${o.raw !== undefined ? o.raw : (o.sign && v > 0 ? '+' : '') + fmtC(v)}</b></div>`;
function foldHtml(key, icon, title, meta, body, defOpen, badge, warn) {
  const open = key in FOLD ? FOLD[key] : !!defOpen;
  return `<details class="fold" data-fold="${key}"${open ? ' open' : ''}><summary><span class="fi">${icon}</span><span class="grow"><b>${title}</b>${meta ? `<small>${meta}</small>` : ''}</span>${badge ? `<span class="badge${warn ? ' warn' : ''}">${badge}</span>` : ''}${IC.chev}</summary><div class="fold-b">${body}</div></details>`;
}
const tipList = items => items.map(x => `<div class="tip"><span class="ti">${x.icon}</span><p>${esc(x.text)}</p></div>`).join('');

/* =====================================================================
   BUDGET — overview
   ===================================================================== */
let CH = 'daily';
const charts = {};
function destroyCharts() { for (const k in charts) { try { charts[k].destroy(); } catch (_) {} delete charts[k]; } }
function renderBudgetOverview() {
  const box = $('#screen-budget'), st = S.settings, [ms, me] = mcRange(), cur = isCurMonth(), t = new Date();
  if (!S.entries.length && !S.savings.tx.length) {
    box.innerHTML = `<div class="card empty"><div class="e">🧾</div><b>Nothing logged yet</b><p>Your month at a glance shows up here.</p><button type="button" class="btn pri" data-a="go" data-to="add">＋ Log first expense</button></div>`; return;
  }
  const es = S.entries.filter(e => e.date >= ms && e.date <= me), inB = es.filter(e => !e.offBudget);
  const exp = inB.filter(e => e.type === 'expense'), incs = inB.filter(e => e.type === 'income'), inc = sum(incs), spent = sum(exp);
  const fl = savingsFlow(ms, me), net = fl.toS - fl.fromS, carryOn = st.carryOver !== false, carry = carryInto(ms), rem = carry + inc - spent - net;
  const D = dim(MC.y, MC.m), dLeft = cur ? D - t.getDate() : 0;
  const offExp = es.filter(e => e.offBudget && e.type === 'expense'), offSpent = sum(offExp);
  let h = '';
  /* hero */
  const todayS = cur ? sum(exp.filter(e => e.date === today())) : 0;
  const wk = ymd(addDays(t, -((t.getDay() + 6) % 7))), weekS = cur ? sum(exp.filter(e => e.date >= wk && e.date <= today())) : 0;
  const perDay = cur && rem > 0 ? Math.floor(rem / (dLeft + 1)) : 0;
  h += `<section class="card hero">
    <div class="hero-top"><div class="grow"><div class="k">${rem < 0 ? 'Over by' : cur ? 'Money left' : 'Left at month end'}</div><div class="big ${rem < 0 ? 'neg' : ''}">${fmt(Math.abs(rem))}</div></div>
    ${cur ? `<div class="bnum"><b>${dLeft}</b><span>${dLeft === 1 ? 'day' : 'days'} left</span></div>` : ''}</div>
    ${sbar([[spent, cssv('--spent'), 'Spent'], [Math.max(0, net), cssv('--saved'), 'Saved'], [Math.max(0, rem), cssv('--green'), 'Left']])}
    <div class="mini4${carryOn ? '' : ' c3'}">${carryOn ? tile('↪ ' + prevMonthName(ms), carry, { cls: carry < 0 ? 'neg' : '', sign: true }) : ''}${tile('Income', inc, { cls: 'pos', dot: cssv('--green') })}${tile('Spent', spent, { dot: cssv('--spent') })}${tile('Saved', net, { dot: cssv('--saved') })}</div>
    ${cur ? `<div class="pills"><span class="pill">Today <b>${fmt0(todayS)}</b></span><span class="pill">This week <b>${fmt0(weekS)}</b></span>${perDay ? `<span class="pill ok">≈ <b>${fmt0(perDay)}</b>/day</span>` : ''}</div>` : ''}
    ${offSpent ? `<div class="note-line">💳 Outside budget <b>${fmt0(offSpent)}</b> · ${esc(groupSum(offExp, e => e.method).map(([k, v]) => nameOf(st.methods, k, '?') + ' ' + fmt0(v)).join(' · '))}</div>` : ''}
    ${cur && rem > 0 && active(S.savings.funds).length ? `<button type="button" class="btn ghost sm full" data-a="saveLeft" data-amt="${rem}">🐷 Move leftover to savings</button>` : ''}
  </section>`;
  /* bills */
  if (cur) {
    const bs = billStatus();
    if (bs.length) h += `<section class="card"><div class="card-h"><h2>Bills due</h2><small>next 7 days</small></div>${bs.map(x => {
      const days = Math.round((parseYmd(x.due) - parseYmd(today())) / 864e5);
      const when = x.overdue ? `<span class="neg">Overdue · ${shortDate(x.due)}</span>` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due ${shortDate(x.due)} · ${days} days`;
      return `<div class="rowi"><span class="ico" style="--ic:${catColorId(x.b.categoryId)}">${iconFor('cat', byId(st.categories, x.b.categoryId))}</span><span class="grow"><b>${esc(x.b.name)}</b><small>${when}</small></span><b class="amt">${fmt0(x.b.amount)}</b>${x.paid ? '<span class="pos" style="font-weight:800">✓</span>' : `<button type="button" class="btn sm pri" data-a="paybill" data-id="${x.b.id}" data-for="${x.key}">Pay</button>`}</div>`;
    }).join('')}</section>`;
  }
  /* categories */
  const spentBy = {}; for (const e of exp) spentBy[e.categoryId] = (spentBy[e.categoryId] || 0) + e.amount;
  const cats = st.categories.filter(c => !c.archived || spentBy[c.id]);
  const bTot = cats.reduce((a, c) => a + (c.budget || 0), 0), bSpent = cats.reduce((a, c) => a + (c.budget ? (spentBy[c.id] || 0) : 0), 0);
  h += `<section class="card"><div class="card-h"><h2>Categories</h2>${bTot ? `<small>${fmt0(bSpent)} of ${fmt0(bTot)} budget</small>` : '<small>tap to see entries</small>'}</div><div class="cgrid3">${cats.map(c => {
    const s = spentBy[c.id] || 0, b = c.budget || 0, p = b ? s / b : (spent ? s / spent : 0);
    const col = b ? (p > 1 ? cssv('--red') : p >= 0.8 ? cssv('--amber') : cssv('--green')) : catColor(c);
    const sub = b ? (s > b ? `<small class="neg">over ${fmtC(s - b)}</small>` : `<small>${fmtC(b - s)} left</small>`) : `<small>${s ? Math.round(p * 100) + '% of spent' : 'no budget'}</small>`;
    return `<button type="button" class="ctile3${s ? '' : ' dim'}" data-a="catHist" data-id="${c.id}"><span class="ring" style="--p:${Math.min(100, Math.round(p * 100))};--c:${col}"><span>${iconFor('cat', c)}</span></span><span class="n">${esc(c.name)}</span><b>${fmtC(s)}</b>${sub}</button>`;
  }).join('')}</div></section>`;
  /* trend */
  h += `<section class="card"><div class="card-h"><h2>Spending by day</h2><div class="seg mini" role="group" aria-label="Chart">${[['daily', 'Daily'], ['cum', 'Running']].map(([k, l]) => `<button type="button" data-a="chMode" data-k="${k}" aria-pressed="${CH === k}">${l}</button>`).join('')}</div></div><div class="chartbox"><canvas id="trend" aria-label="Spending by day, this month and last month"></canvas></div><small id="trend-msg"></small></section>`;
  /* where it went */
  const parts = [!solo() ? splitBlock('👥 Who spent', groupSum(exp, e => e.member), k => nameOf(st.members, k, '?')) : '',
    splitBlock('💳 Paid with', groupSum(exp, e => e.method), k => nameOf(st.methods, k, 'Not set')),
    splitBlock('⬇ Income from', groupSum(incs, e => e.source), k => nameOf(st.incomeSources, k, '?'), (k, i) => PAL(i + 2))].filter(Boolean);
  if (parts.length) h += `<section class="card">${parts.join('')}</section>`;
  /* tips (folded, at the bottom) */
  if (cur) {
    const sg = suggestions(), items = sg.notEnough ? [] : sg.list, warnN = items.filter(x => x.kind === 'warn').length;
    const body = sg.notEnough ? tipList([{ icon: '⏳', text: `Tips start after a week of logging${sg.span ? ` — ${sg.span} of 7 days so far` : ''}.` }])
      : items.length ? tipList(items.map(x => ({ icon: x.kind === 'good' ? '👍' : '⚠️', text: x.text }))) : tipList([{ icon: '✅', text: 'All within budget. Keep logging!' }]);
    h += foldHtml('tips', '💡', 'Tips', sg.notEnough ? 'after 7 days of logging' : warnN ? `${plural(warnN, 'thing')} to watch` : 'all good', body, false, sg.notEnough ? '' : String(items.length || '✓'), warnN > 0);
  }
  box.innerHTML = h;
  renderTrend();
}
function dailyArr(y, m, upto) {
  const a = new Array(upto).fill(0), [s, e] = monthRange(y, m);
  for (const x of S.entries) if (x.type === 'expense' && !x.offBudget && x.date >= s && x.date <= e) { const d = +x.date.slice(8); if (d <= upto) a[d - 1] += x.amount; }
  return a;
}
function chartBase(money = true) {
  const muted = cssv('--muted'), line = cssv('--line'), text = cssv('--text');
  return {
    responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom', labels: { color: text, boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
      tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + fmt(Math.round(c.parsed.y * 100)) } } },
    scales: { x: { ticks: { color: muted, maxTicksLimit: 8, maxRotation: 0, font: { size: 10 } }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: muted, maxTicksLimit: 5, font: { size: 10 }, callback: v => money ? '₱' + (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('en-US') + 'k' : v) : v }, grid: { color: line }, border: { display: false } } }
  };
}
function chartMsg(id) {
  const m = $('#' + id); if (!m) return false;
  if (!window.Chart) { m.textContent = window.chartFailed ? 'Chart could not load. Open the app once with internet.' : 'Loading chart…'; return false; }
  m.textContent = ''; return true;
}
function renderTrend() {
  if (!$('#trend') || !chartMsg('trend-msg')) return;
  const y = MC.y, m = MC.m, upto = isCurMonth() ? new Date().getDate() : dim(y, m), pd = new Date(y, m - 1, 1);
  let a = dailyArr(y, m, upto), b = dailyArr(pd.getFullYear(), pd.getMonth(), dim(pd.getFullYear(), pd.getMonth()));
  const ds = [];
  if (CH === 'cum') { const acc = x => { let s = 0; return x.map(v => s += v); }; a = acc(a); b = acc(b); }
  ds.push({ label: MONTHS[m], data: a.map(v => v / 100), borderColor: cssv('--brand'), backgroundColor: cssv('--brand'), borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, tension: .3 });
  ds.push({ label: MONTHS[pd.getMonth()], data: b.map(v => v / 100), borderColor: cssv('--muted'), backgroundColor: cssv('--muted'), borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, tension: .3 });
  const bud = S.settings.categories.reduce((s, c) => s + (c.archived ? 0 : c.budget || 0), 0);
  const n = Math.max(dim(y, m), b.length);
  if (CH === 'cum' && bud) ds.push({ label: 'Budget', data: new Array(n).fill(bud / 100), borderColor: cssv('--red'), borderWidth: 1.5, borderDash: [2, 3], pointRadius: 0 });
  const o = chartBase(); o.plugins.tooltip.callbacks.title = i => MONTHS[m] + ' ' + i[0].label;
  charts.trend = new Chart($('#trend'), { type: 'line', data: { labels: Array.from({ length: n }, (_, i) => String(i + 1)), datasets: ds }, options: o });
}

/* =====================================================================
   BUDGET — history
   ===================================================================== */
const H = { type: '', cat: '', member: '', limit: 100 };
function entryRow(e) {
  const st = S.settings, isInc = e.type === 'income', c = isInc ? byId(st.incomeSources, e.source) : byId(st.categories, e.categoryId);
  const tags = (e.billId ? '<span class="tag">BILL</span>' : '') + (e.offBudget ? '<span class="tag warn">OUTSIDE</span>' : '') + (e.date > today() ? '<span class="tag warn">FUTURE</span>' : '');
  const meta = [e.note, solo() ? '' : nameOf(st.members, e.member, ''), nameOf(st.methods, e.method, '')].filter(Boolean).map(esc).join(' · ');
  return `<button type="button" class="rowi" data-a="editEntry" data-id="${e.id}"><span class="ico" style="--ic:${isInc ? cssv('--green') : catColor(c)}">${iconFor(isInc ? 'inc' : 'cat', c)}</span><span class="grow"><b>${esc(entryName(e))}${tags}</b><small>${meta || '&nbsp;'}</small></span><b class="amt ${isInc ? 'pos' : ''}">${isInc ? '+' : '−'}${fmt(e.amount)}</b></button>`;
}
function renderBudgetHistory() {
  const st = S.settings, [ms, me] = mcRange(), opt = (v, l, sel) => `<option value="${v}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`;
  if (solo()) H.member = '';
  let list = S.entries.filter(e => e.date >= ms && e.date <= me && (!H.type || e.type === H.type) && (!H.member || e.member === H.member) &&
    (!H.cat || (H.cat[0] === 'c' ? e.categoryId === H.cat.slice(2) : e.source === H.cat.slice(2))));
  list.sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
  const outT = sum(list.filter(e => e.type === 'expense' && !e.offBudget)), inT = sum(list.filter(e => e.type === 'income' && !e.offBudget));
  let h = `<div class="filters"><div class="seg mini" role="group" aria-label="Type">${[['', 'All'], ['expense', 'Spent'], ['income', 'Income']].map(([k, l]) => `<button type="button" data-a="hType" data-k="${k}" aria-pressed="${H.type === k}">${l}</button>`).join('')}</div>
    <select data-c="hcat" aria-label="Category">${opt('', 'All categories', H.cat)}${st.categories.map(c => opt('c:' + c.id, iconFor('cat', c) + ' ' + c.name, H.cat)).join('')}${st.incomeSources.map(c => opt('s:' + c.id, iconFor('inc', c) + ' ' + c.name, H.cat)).join('')}</select>
    ${solo() ? '' : `<select class="wide" data-c="hmem" aria-label="Person">${opt('', 'Everyone', H.member)}${st.members.map(m => opt(m.id, m.name, H.member)).join('')}</select>`}</div>
    <div class="sumline"><span>${plural(list.length, 'entry')} · ${MONTHS[MC.m]}</span><span><b class="neg">−${fmt0(outT)}</b> · <b class="pos">+${fmt0(inT)}</b></span></div>`;
  if (!list.length) h += `<div class="card empty" style="margin-top:8px"><div class="e">🗒️</div><p>Nothing here for ${MONTHS[MC.m]} ${MC.y}.</p></div>`;
  const shown = list.slice(0, H.limit), groups = [];
  for (const e of shown) { const g = groups[groups.length - 1]; if (g && g.date === e.date) g.items.push(e); else groups.push({ date: e.date, items: [e] }); }
  h += groups.map(g => { const o = sum(g.items.filter(e => e.type === 'expense' && !e.offBudget)); return `<div class="day-h"><span>${dateLabel(g.date)}</span><span>${o ? '−' + fmt0(o) : ''}</span></div><div class="list">${g.items.map(entryRow).join('')}</div>`; }).join('');
  if (list.length > H.limit) h += `<button type="button" class="btn full" data-a="hMore">Show more (${list.length - H.limit})</button>`;
  $('#screen-budget').innerHTML = h;
}

/* =====================================================================
   SAVINGS — overview
   ===================================================================== */
const SD = { period: '6m', mode: 'bal' };
const mlabel = d => MONTHS[d.getMonth()];
function lastMonths(n) { const t = new Date(), out = []; for (let k = n - 1; k >= 0; k--) out.push(new Date(t.getFullYear(), t.getMonth() - k, 1)); return out; }
function sdMonths() {
  const t = new Date();
  if (SD.period === '12m') return lastMonths(12);
  if (SD.period === 'all') {
    const f = parseYmd(S.savings.tx.reduce((a, x) => x.date < a ? x.date : a, ymd(t))), out = [];
    for (let d = new Date(f.getFullYear(), f.getMonth(), 1); d <= t; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push(d);
    return out.length ? out : lastMonths(1);
  }
  return lastMonths(6);
}
function monthStats(d) {
  const [a, b] = monthRange(d.getFullYear(), d.getMonth());
  let added = 0, out = 0, fromBudget = 0, toBudget = 0;
  for (const x of S.savings.tx) {
    if (x.date < a || x.date > b) continue;
    if (x.type === 'in' && x.src !== 'opening') { added += x.amount; if (x.src === 'budget') fromBudget += x.amount; }
    if (x.type === 'out') { out += x.amount; if (x.dest === 'budget') toBudget += x.amount; }
  }
  const upto = S.savings.tx.filter(x => x.date <= b), fundEnd = {};
  let end = 0;
  for (const f of S.savings.funds) { fundEnd[f.id] = balOf(upto, f.id); end += fundEnd[f.id]; }
  return { d, a, b, key: a.slice(0, 7), label: mlabel(d), added, out, net: added - out, budgetNet: fromBudget - toBudget, end, fundEnd };
}
function avgMonthlySpend() {
  const t = new Date(), firstEntry = S.entries.reduce((a, e) => e.date < a ? e.date : a, today()), vals = [];
  for (let k = 1; k <= 3; k++) {
    const d = new Date(t.getFullYear(), t.getMonth() - k, 1), [a, b] = monthRange(d.getFullYear(), d.getMonth());
    if (a < firstEntry) continue;
    vals.push(sum(S.entries.filter(e => e.type === 'expense' && !e.offBudget && e.date >= a && e.date <= b)));
  }
  if (vals.length) return { avg: Math.round(vals.reduce((x, y) => x + y, 0) / vals.length), basis: plural(vals.length, 'month') };
  const [ms] = monthRange(t.getFullYear(), t.getMonth());
  const spent = sum(S.entries.filter(e => e.type === 'expense' && !e.offBudget && e.date >= ms && e.date <= today()));
  return spent ? { avg: Math.round(spent / t.getDate() * dim(t.getFullYear(), t.getMonth())), basis: "this month's pace" } : null;
}
function fundTile(f, ms, me) {
  const b = fundBal(f.id), got = fundNet(f.id, ms, me);
  let p = 0, sub = '';
  if (f.monthlyGoal > 0) { p = got / f.monthlyGoal; sub = got >= f.monthlyGoal ? '✓ goal met' : `🎯 ${fmtC(f.monthlyGoal - got)} to go`; }
  else if (f.target > 0) { p = b / f.target; sub = `${Math.min(100, Math.round(p * 100))}% of ${fmtC(f.target)}`; }
  else if (got) sub = `${got > 0 ? '+' : ''}${fmtC(got)} this month`;
  const accts = fundAccts(f.id).filter(([, v]) => v > 0);
  return `<button type="button" class="ftile2" data-a="fundOpen" data-id="${f.id}"><span class="ring sm" style="--p:${Math.max(0, Math.min(100, Math.round(p * 100)))};--c:${fundColor(f)}"><span>${iconFor('fund', f)}</span></span><span class="txt"><span class="n">${esc(f.name)}</span><b>${fmt0(b)}</b><small>${sub || '&nbsp;'}</small></span>${accts.length ? sbar(accts.map(([k, v]) => [v, acctColor(k), acctName(k)]), 'thin') : ''}</button>`;
}
function renderSavingsOverview() {
  const box = $('#screen-savings'), funds = active(S.savings.funds);
  if (!S.savings.funds.length) {
    box.innerHTML = `<div class="card empty"><div class="e">🐷</div><b>Start your first savings fund</b><p>One for each goal: Travel, Emergency, Tuition…</p><button type="button" class="btn pri" data-a="fundNew">＋ Create a fund</button></div>`; return;
  }
  const t = new Date(), [ms, me] = monthRange(t.getFullYear(), t.getMonth()), total = savTotal(), goal = S.settings.savingsGoal;
  const six = lastMonths(6).map(monthStats), cur = six[six.length - 1];
  const avgNet = Math.round(six.reduce((a, m) => a + m.net, 0) / six.length);
  const spend = avgMonthlySpend(), cover = spend && spend.avg ? total / spend.avg : null;
  const fl = savingsFlow(ms, me), gnet = fl.toS - fl.fromS, gp = goal > 0 ? Math.max(0, Math.min(100, Math.round(gnet / goal * 100))) : 0;
  let h = `<section class="card hero"><div class="hero-top"><div class="grow"><div class="k">Total savings</div><div class="big">${fmt(total)}</div></div>${cover !== null ? `<div class="bnum"><b>${cover >= 10 ? Math.round(cover) : cover.toFixed(1)}</b><span>months covered</span></div>` : ''}</div>
    ${sbar(funds.map(f => [fundBal(f.id), fundColor(f), f.name]))}
    <div class="mini4 c3">${tile('This month', cur.net, { sign: true, cls: cur.net < 0 ? 'neg' : 'pos' })}${tile('Avg / month', avgNet, { cls: avgNet < 0 ? 'neg' : '' })}${tile('Funds', 0, { raw: funds.length })}</div>
    ${goal > 0 ? `<div class="split" style="margin-top:10px"><div class="split-h"><span>🎯 From budget this month</span><b>${fmt0(gnet)} / ${fmt0(goal)}</b></div><div class="bar"><i style="width:${gp}%"></i></div></div>` : ''}</section>`;
  h += `<section class="card"><div class="card-h"><h2>Funds</h2><button type="button" class="tbtn" data-a="fundNew">＋ New</button></div><div class="fgrid">${funds.map(f => fundTile(f, ms, me)).join('')}</div></section>`;
  const at = acctTotals();
  if (at.length) h += `<section class="card"><div class="card-h"><h2>Where it’s kept</h2><small>check vs. bank / GCash</small></div>${at.map(([k, r]) =>
    `<div class="rowi"><span class="ico" style="--ic:${acctColor(k)}">${acctIcon(k)}</span><span class="grow"><b>${esc(acctName(k))}</b><small>${r.funds.filter(([, v]) => v).map(([f, v]) => iconFor('fund', f) + ' ' + fmtC(v)).join('  ·  ')}</small></span><b class="amt">${fmt0(r.bal)}</b></div>`).join('')}</section>`;
  const stats = sdMonths().map(monthStats), pName = { '6m': 'last 6 months', '12m': 'last 12 months', all: 'all time' }[SD.period];
  h += `<section class="card"><div class="card-h"><h2>Over time</h2><div class="seg mini" role="group" aria-label="Chart">${[['bal', 'Balance'], ['flow', 'In & out']].map(([k, l]) => `<button type="button" data-a="svCh" data-k="${k}" aria-pressed="${SD.mode === k}">${l}</button>`).join('')}</div></div>
    <div class="chartbox"><canvas id="svchart" aria-label="Savings over time"></canvas></div><small id="sv-msg"></small>
    <div class="rowsplit"><div class="hscroll">${[['6m', '6 months'], ['12m', '12 months'], ['all', 'All']].map(([k, l]) => `<button type="button" class="chip xs" data-a="svPer" data-k="${k}" aria-pressed="${SD.period === k}">${l}</button>`).join('')}</div></div>
    <details class="tblfold" data-fold="svtbl"${FOLD.svtbl ? ' open' : ''}><summary>Show as table</summary><table class="tbl"><thead><tr><th>Month</th><th>In</th><th>Out</th><th>Balance</th></tr></thead><tbody>${stats.slice().reverse().map(m => `<tr><td>${m.label} ${String(m.d.getFullYear()).slice(2)}</td><td class="pos">${fmt0(m.added)}</td><td class="${m.out ? 'neg' : ''}">${fmt0(m.out)}</td><td><b>${fmt0(m.end)}</b></td></tr>`).join('')}</tbody></table></details></section>`;
  const pStart = stats[0].a, inP = S.savings.tx.filter(x => x.date >= pStart && x.date <= me);
  const srcCol = { budget: cssv('--brand'), outside: cssv('--c2'), interest: cssv('--c6'), opening: cssv('--muted') };
  const srcP = ['budget', 'outside', 'interest'].map(k => [k, sum(inP.filter(x => x.type === 'in' && x.src === k))]).filter(p => p[1] > 0);
  const dstP = ['budget', 'direct'].map(k => [k, sum(inP.filter(x => x.type === 'out' && x.dest === k))]).filter(p => p[1] > 0);
  const uses = groupSum(inP.filter(x => x.type === 'out' && x.dest === 'direct'), x => (x.note || 'No note').trim().toLowerCase()).slice(0, 5);
  const blocks = [splitBlock('⬇ Came from', srcP, k => SRC[k].l, k => srcCol[k]),
    splitBlock('⬆ Went to', dstP, k => DEST[k].l, k => k === 'budget' ? cssv('--brand') : cssv('--spent')),
    uses.length ? splitBlock('🧾 Paid for', uses, k => k.charAt(0).toUpperCase() + k.slice(1), (k, i) => PAL(i + 1)) : '',
    !solo() ? splitBlock('👥 Added by', groupSum(inP.filter(x => x.type === 'in' && x.src !== 'opening'), x => x.member), k => nameOf(S.settings.members, k, '?')) : ''].filter(Boolean);
  if (blocks.length) h += `<section class="card"><div class="card-h"><h2>In & out</h2><small>${pName}</small></div>${blocks.join('')}</section>`;
  const gFunds = funds.filter(f => f.monthlyGoal > 0);
  if (goal > 0 || gFunds.length) {
    const firstTx = S.savings.tx.reduce((a, x) => x.date < a ? x.date : a, '9999');
    const fStart = fid => S.savings.tx.filter(x => x.fund === fid || x.toFund === fid).reduce((a, x) => x.date < a ? x.date : a, '9999');
    const cell = (m, val, g, start) => m.b < start ? '<span class="gc">–</span>' : val >= g ? '<span class="gc ok">✓</span>' : m.key === cur.key ? '<span class="gc now">◔</span>' : '<span class="gc miss">✗</span>';
    let rows = '';
    if (goal > 0) rows += `<span class="gname">🏠 From budget</span>${six.map(m => cell(m, m.budgetNet, goal, firstTx)).join('')}`;
    for (const f of gFunds) { const st0 = fStart(f.id); rows += `<span class="gname">${iconFor('fund', f)} ${esc(f.name)}</span>${six.map(m => cell(m, fundNet(f.id, m.a, m.b), f.monthlyGoal, st0)).join('')}`; }
    h += `<section class="card"><div class="card-h"><h2>Monthly goals</h2><small>✓ met · ✗ missed · ◔ now</small></div><div class="ggrid"><span></span>${six.map(m => `<span class="gm">${m.label}</span>`).join('')}${rows}</div></section>`;
  }
  const ins = svInsights(six, cur, total, cover, spend);
  const warnN = ins.filter(i => i.k === 'warn').length;
  h += foldHtml('svins', '💡', 'Insights', warnN ? `${plural(warnN, 'thing')} to watch` : 'how your savings are doing',
    tipList(ins.map(i => ({ icon: i.k === 'good' ? '👍' : i.k === 'warn' ? '⚠️' : 'ℹ️', text: i.t }))), false, String(ins.length), warnN > 0);
  box.innerHTML = h;
  renderSvChart(stats);
}
function svInsights(six, cur, total, cover, spend) {
  const ins = [], goal = S.settings.savingsGoal, t = new Date(), last = six[six.length - 2];
  if (cur.added || cur.out) ins.push({ k: cur.net >= 0 ? 'good' : 'warn', t: `This month savings ${cur.net >= 0 ? 'grew' : 'went down'} by ${fmt0(Math.abs(cur.net))} (${fmt0(cur.added)} in, ${fmt0(cur.out)} out). Last month: ${last.net >= 0 ? '+' : '−'}${fmt0(Math.abs(last.net))}.` });
  else ins.push({ k: 'info', t: `Nothing added yet this month. Last month: ${last.net >= 0 ? '+' : '−'}${fmt0(Math.abs(last.net))}.` });
  if (cur.out > 0 && cur.added > 0 && cur.out >= cur.added * 0.5) ins.push({ k: 'warn', t: `${fmt0(cur.out)} was taken out this month — ${Math.round(cur.out / cur.added * 100)}% of the ${fmt0(cur.added)} added.` });
  if (goal > 0) {
    let streak = 0;
    for (let k = six.length - 2; k >= 0; k--) { if (six[k].budgetNet >= goal) streak++; else break; }
    const left = goal - cur.budgetNet;
    ins.push({ k: left <= 0 ? 'good' : 'info', t: left <= 0 ? `Monthly goal of ${fmt0(goal)} reached${streak ? ` — ${plural(streak + 1, 'month')} in a row` : ''}.` : `${fmt0(cur.budgetNet)} of the ${fmt0(goal)} monthly goal moved from the budget — ${fmt0(left)} to go.` });
  }
  const a3 = ymd(new Date(t.getFullYear(), t.getMonth() - 2, 1)), dl = dim(t.getFullYear(), t.getMonth()) - t.getDate(), [cms, cme] = monthRange(t.getFullYear(), t.getMonth());
  for (const f of active(S.savings.funds)) {
    const b = fundBal(f.id);
    if (f.target > 0) {
      if (b >= f.target) ins.push({ k: 'good', t: `${f.name} reached its ${fmt0(f.target)} target 🎉` });
      else {
        const pace = Math.round(fundNet(f.id, a3, today()) / 3);
        if (pace > 0) {
          const n = Math.ceil((f.target - b) / pace), eta = new Date(t.getFullYear(), t.getMonth() + n, 1);
          let txt = `${f.name}: at ${fmt0(pace)}/month it reaches ${fmt0(f.target)} around ${MONTHS[eta.getMonth()]} ${eta.getFullYear()}.`, k = 'info';
          if (f.targetDate && ymd(eta) > f.targetDate) { const td = parseYmd(f.targetDate), mL = Math.max(1, (td.getFullYear() - t.getFullYear()) * 12 + td.getMonth() - t.getMonth()); txt += ` Too late for ${shortDate(f.targetDate)}, ${f.targetDate.slice(0, 4)} — needs ${fmt0(Math.ceil((f.target - b) / mL))}/month.`; k = 'warn'; }
          ins.push({ k, t: txt });
        } else ins.push({ k: 'warn', t: `${f.name} (${fmt0(b)} of ${fmt0(f.target)}) hasn't grown in 3 months.` });
      }
    }
    if (f.monthlyGoal > 0 && dl <= 10) { const got = fundNet(f.id, cms, cme), rest = f.monthlyGoal - got; if (rest > 0) ins.push({ k: 'warn', t: `${f.name}: ${fmt0(rest)} still to go for this month's goal, ${dl === 0 ? 'last day' : plural(dl, 'day') + ' left'}.` }); }
  }
  if (cover !== null) ins.push({ k: cover >= 3 ? 'good' : 'info', t: `Savings would cover ${cover.toFixed(1)} months of spending (${fmt0(spend.avg)}/month).${cover < 3 ? ` 3 months = ${fmt0(spend.avg * 3)}.` : ''}` });
  const unset = acctTotals().find(([k]) => k === '');
  if (unset) ins.push({ k: 'info', t: `${fmt0(unset[1].bal)} has no account set. Edit or move those records to say where it's kept.` });
  return ins;
}
function renderSvChart(stats) {
  if (!$('#svchart') || !chartMsg('sv-msg')) return;
  const labels = stats.map(m => m.label + (stats.length > 12 ? " '" + String(m.d.getFullYear()).slice(2) : ''));
  const o = chartBase();
  let data;
  if (SD.mode === 'bal') {
    const fs = S.savings.funds.filter(f => stats.some(m => m.fundEnd[f.id]));
    data = { labels, datasets: fs.map(f => ({ label: f.name, data: stats.map(m => m.fundEnd[f.id] / 100), backgroundColor: fundColor(f), borderRadius: 3, borderSkipped: false, maxBarThickness: 26 })) };
    o.scales.x.stacked = true; o.scales.y.stacked = true;
    o.plugins.tooltip.callbacks.footer = items => 'Total: ' + fmt(Math.round(items.reduce((s, i) => s + i.parsed.y, 0) * 100));
    o.plugins.legend.display = fs.length > 1;
  } else {
    data = { labels, datasets: [{ label: 'In', data: stats.map(m => m.added / 100), backgroundColor: cssv('--saved'), borderRadius: 4, maxBarThickness: 16 },
      { label: 'Out', data: stats.map(m => m.out / 100), backgroundColor: cssv('--spent'), borderRadius: 4, maxBarThickness: 16 }] };
    o.plugins.tooltip.callbacks.footer = items => { const m = stats[items[0].dataIndex]; return 'Net: ' + (m.net >= 0 ? '+' : '−') + fmt(Math.abs(m.net)); };
  }
  charts.sv = new Chart($('#svchart'), { type: 'bar', data, options: o });
}
window.chartReady = () => {
  if (screen === 'budget' && SUB.budget === 'overview') { destroyCharts(); renderTrend(); }
  else if (screen === 'savings' && SUB.savings === 'overview') { destroyCharts(); renderSvChart(sdMonths().map(monthStats)); }
};

/* =====================================================================
   SAVINGS — history
   ===================================================================== */
const SH = { fund: '', acct: '', limit: 100 };
function svRow(t, del = true) {
  const L = txLabel(t), meta = [L.sub, shortDate(t.date), t.note, solo() ? '' : nameOf(S.settings.members, t.member, '')].filter(Boolean).map(esc).join(' · ');
  return `<div class="svrow"><button type="button" class="rowi" data-a="editTx" data-id="${t.id}"><span class="ico" style="--ic:${fundColor(L.f)}">${iconFor('fund', L.f)}</span><span class="grow"><b>${esc(L.title)}${t.date > today() ? '<span class="tag warn">FUTURE</span>' : ''}</b><small>${meta}</small></span><b class="amt ${L.cls}">${L.sign}${fmt(t.amount)}</b></button>${del ? `<button type="button" class="icbtn del" data-a="delTx" data-id="${t.id}" aria-label="Delete">${IC.trash}</button>` : ''}</div>`;
}
function renderSavingsHistory() {
  const opt = (v, l, sel) => `<option value="${v}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`;
  const hasNull = S.savings.tx.some(t => !t.account || (t.type === 'move' && !t.toAccount));
  let list = S.savings.tx.filter(t => (!SH.fund || t.fund === SH.fund || t.toFund === SH.fund) &&
    (!SH.acct || (SH.acct === '-' ? (!t.account || (t.type === 'move' && !t.toAccount)) : (t.account === SH.acct || t.toAccount === SH.acct))));
  list.sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
  const inT = sum(list.filter(t => t.type === 'in')), outT = sum(list.filter(t => t.type === 'out'));
  let h = `<div class="filters" style="grid-template-columns:1fr 1fr"><select data-c="shfund" aria-label="Fund">${opt('', 'All funds', SH.fund)}${S.savings.funds.map(f => opt(f.id, iconFor('fund', f) + ' ' + f.name, SH.fund)).join('')}</select>
    <select data-c="shacct" aria-label="Account">${opt('', 'All accounts', SH.acct)}${S.settings.savingsAccounts.map(a => opt(a.id, iconFor('acct', a) + ' ' + a.name, SH.acct)).join('')}${hasNull ? opt('-', '❔ Not set', SH.acct) : ''}</select></div>
    <div class="sumline"><span>${plural(list.length, 'record')}</span><span><b class="pos">+${fmt0(inT)}</b> · <b class="neg">−${fmt0(outT)}</b></span></div>`;
  if (!list.length) h += `<div class="card empty" style="margin-top:8px"><div class="e">🐷</div><p>No savings records yet.</p><button type="button" class="btn pri" data-a="newSv">＋ Add savings</button></div>`;
  const groups = [];
  for (const t of list.slice(0, SH.limit)) { const k = t.date.slice(0, 7), g = groups[groups.length - 1]; if (g && g.k === k) g.items.push(t); else groups.push({ k, items: [t] }); }
  h += groups.map(g => { const n = g.items.reduce((s, t) => s + (t.type === 'in' ? t.amount : t.type === 'out' ? -t.amount : 0), 0); return `<div class="day-h"><span>${monthLabel(g.k)}</span><span>${n >= 0 ? '+' : '−'}${fmt0(Math.abs(n))}</span></div><div class="list">${g.items.map(t => svRow(t)).join('')}</div>`; }).join('');
  if (list.length > SH.limit) h += `<button type="button" class="btn full" data-a="shMore">Show more (${list.length - SH.limit})</button>`;
  $('#screen-savings').innerHTML = h;
}

/* =====================================================================
   SHEETS — fund details, fund editor, icon picker, new account
   ===================================================================== */
let sheetFund = null, FF = null, EMO_T = null, ACCT_FOR = null;
function openFundSheet(fid) {
  const f = byId(S.savings.funds, fid); if (!f) return;
  sheetFund = fid;
  const b = fundBal(fid), t = new Date(), [ms, me] = monthRange(t.getFullYear(), t.getMonth()), got = fundNet(fid, ms, me), accts = fundAccts(fid);
  let h = `<div class="sh-h"><span class="ico lg" style="--ic:${fundColor(f)}">${iconFor('fund', f)}</span><div class="grow"><h2>${esc(f.name)}</h2>${f.note ? `<small>${esc(f.note)}</small>` : ''}</div><button type="button" class="tbtn" data-a="fundEdit" data-id="${fid}">Edit</button><button type="button" class="icbtn" data-a="sheetClose" aria-label="Close">${IC.close}</button></div>`;
  h += `<div class="card"><div class="k">Balance</div><div class="big">${fmt(b)}</div>${accts.some(a => a[1] > 0) ? sbar(accts.filter(a => a[1] > 0).map(([k, v]) => [v, acctColor(k), acctName(k)])) : ''}${accts.map(([k, v]) => `<div class="arow"><span><i style="background:${acctColor(k)}"></i>${acctIcon(k)} ${esc(acctName(k))}</span><b>${fmt0(v)}</b></div>`).join('')}</div>`;
  if (f.monthlyGoal > 0) {
    const rest = f.monthlyGoal - got, p = Math.max(0, Math.min(100, Math.round(got / f.monthlyGoal * 100)));
    h += `<div class="card"><div class="split-h"><span>🎯 This month</span><b>${fmt0(Math.max(0, got))} / ${fmt0(f.monthlyGoal)}</b></div><div class="bar"><i style="width:${p}%;background:${fundColor(f)}"></i></div>${rest > 0 ? `<button type="button" class="btn ghost sm full" data-a="fundAct" data-k="in" data-id="${fid}" data-amt="${rest}">＋ Add the remaining ${fmt0(rest)}</button>` : '<small class="pos">✓ Goal met this month</small>'}</div>`;
  }
  if (f.target > 0) {
    const p = Math.max(0, Math.min(100, Math.round(b / f.target * 100)));
    let need = '';
    if (f.targetDate && b < f.target) {
      const td = parseYmd(f.targetDate), months = (td.getFullYear() - t.getFullYear()) * 12 + td.getMonth() - t.getMonth();
      need = f.targetDate < today() ? ' · date passed' : months > 0 ? ` · ${fmt0(Math.ceil((f.target - b) / months))}/month to make it` : '';
    }
    h += `<div class="card"><div class="split-h"><span>🏁 Target ${fmt0(f.target)}${f.targetDate ? ' · ' + MONTHS[parseYmd(f.targetDate).getMonth()] + ' ' + f.targetDate.slice(0, 4) : ''}</span><b>${p}%</b></div><div class="bar"><i style="width:${p}%;background:${fundColor(f)}"></i></div><small>${b >= f.target ? '🎉 Reached!' : fmt0(f.target - b) + ' to go' + need}</small></div>`;
  }
  const canMove = active(S.savings.funds).length > 1 || activeAccts().length > 1;
  h += `<div class="btn3"><button type="button" class="btn pri" data-a="fundAct" data-k="in" data-id="${fid}">＋ Add</button><button type="button" class="btn" data-a="fundAct" data-k="out" data-id="${fid}"${b > 0 ? '' : ' disabled'}>− Take out</button><button type="button" class="btn" data-a="fundAct" data-k="move" data-id="${fid}"${b > 0 && canMove ? '' : ' disabled'}>⇄ Move</button></div>`;
  const recent = S.savings.tx.filter(x => x.fund === fid || x.toFund === fid).sort((a, c) => c.date.localeCompare(a.date) || (c.created || 0) - (a.created || 0));
  if (recent.length) h += `<div class="lbl"><span>Recent</span>${recent.length > 5 ? `<button type="button" class="tbtn" data-a="fundHist" data-id="${fid}">See all ${recent.length}</button>` : ''}</div><div class="list">${recent.slice(0, 5).map(x => svRow(x)).join('')}</div>`;
  openSheet(h, 'fund');
}
function openFundEdit(fid) {
  const f = fid ? byId(S.savings.funds, fid) : null;
  FF = { id: fid || null, name: f ? f.name : '', note: f && f.note || '', icon: f && f.icon || '', color: f ? fundColor(f) : PAL(S.savings.funds.length),
    target: f && f.target ? String(f.target / 100) : '', date: f && f.targetDate || '', monthly: f && f.monthlyGoal ? String(f.monthlyGoal / 100) : '',
    open: '', openAcct: (activeAccts()[0] || {}).id || null };
  renderFundEdit();
}
function renderFundEdit() {
  const f = FF.id ? byId(S.savings.funds, FF.id) : null, ic = FF.icon || iconFor('fund', { name: FF.name });
  let h = `<div class="sh-h"><span class="ico lg" style="--ic:${FF.color}">${ic}</span><h2 class="grow">${f ? 'Edit fund' : 'New fund'}</h2><button type="button" class="icbtn" data-a="sheetClose" aria-label="Close">${IC.close}</button></div>
    <label class="fld"><span>Name</span><input data-i="ff" data-k="name" maxlength="40" autocomplete="off" value="${esc(FF.name)}" placeholder="e.g. Travel fund"></label>
    <div class="lbl">Icon</div><div class="hscroll">${EMOJI.map(e => `<button type="button" class="chip emo" data-a="ffIcon" data-e="${e}" aria-pressed="${e === ic}">${e}</button>`).join('')}</div>
    <label class="fld" style="margin-top:10px"><span>Description</span><textarea data-i="ff" data-k="note" rows="2" maxlength="300" placeholder="e.g. Bohol trip, Dec 2027 — airfare + hotel for 5">${esc(FF.note)}</textarea></label>
    <div class="row2e"><label class="fld"><span>🏁 Target ₱</span><input data-i="ff" data-k="target" inputmode="decimal" autocomplete="off" value="${esc(FF.target)}" placeholder="optional"></label><label class="fld"><span>By date</span><input type="date" data-i="ff" data-k="date" value="${esc(FF.date)}"></label></div>
    <div class="row2e"><label class="fld"><span>🎯 Monthly goal ₱</span><input id="ff-monthly" data-i="ff" data-k="monthly" inputmode="decimal" autocomplete="off" value="${esc(FF.monthly)}" placeholder="optional"></label><div class="fld"><span>&nbsp;</span><button type="button" class="btn ghost" data-a="ffCalc">From target</button></div></div>`;
  if (!f) h += `<div class="lbl">Already saved (optional)</div><div class="amtbox"><span>₱</span><input data-i="ff" data-k="open" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(FF.open)}" aria-label="Starting balance"></div>
    <div class="lbl">Kept in</div><div class="hscroll">${activeAccts().map(a => `<button type="button" class="chip" data-a="ffAcct" data-id="${a.id}" aria-pressed="${a.id === FF.openAcct}">${iconFor('acct', a)} ${esc(a.name)}</button>`).join('')}<button type="button" class="chip quick" data-a="acctNew" data-for="ffAcct">＋ New</button></div>`;
  h += `<div class="row2e"><label class="fld"><span>Color</span><input type="color" data-i="ff" data-k="color" value="${esc(FF.color)}"></label></div>
    <div class="err" id="fferr" role="alert"></div>
    <div class="savebar">${f ? `<button type="button" class="btn danger icon" data-a="ffDel" aria-label="Remove fund">${IC.trash}</button>` : ''}<button type="button" class="btn pri big" data-a="ffSave">${f ? 'Save changes' : 'Create fund'}</button></div>`;
  openSheet(h, 'fundEdit');
}
function fferr(m) { const e = $('#fferr'); if (e) e.textContent = m; }
function saveFund() {
  const name = FF.name.trim();
  if (!name) return fferr('Give the fund a name.');
  const tr = String(FF.target).trim() ? parseAmount(FF.target, true) : { c: 0 }; if (tr.err) return fferr('Target: ' + tr.err);
  const mr = String(FF.monthly).trim() ? parseAmount(FF.monthly, true) : { c: 0 }; if (mr.err) return fferr('Monthly goal: ' + mr.err);
  const data = { name, note: FF.note.trim(), icon: FF.icon || null, color: FF.color || null, target: tr.c, targetDate: FF.date || null, monthlyGoal: mr.c };
  let fid = FF.id;
  if (fid) { Object.assign(byId(S.savings.funds, fid), data); toast('Fund updated'); }
  else {
    const or = String(FF.open).trim() ? parseAmount(FF.open, true) : { c: 0 }; if (or.err) return fferr('Already saved: ' + or.err);
    if (or.c > 0 && !FF.openAcct) return fferr('Tap where that money is kept.');
    const f = Object.assign({ id: uid() }, data); fid = f.id;
    S.savings.funds.push(f);
    if (or.c > 0) S.savings.tx.push({ id: uid(), created: Date.now(), type: 'in', fund: f.id, account: FF.openAcct, toFund: null, toAccount: null, amount: or.c, date: today(), src: 'opening', dest: null, member: defaultMember(), note: 'Starting balance' });
    toast(`“${name}” created`);
  }
  save();
  const wasNew = !FF.id; FF = null;
  if (screen === 'add') { closeSheet(); if (wasNew) { F.sv.fund = fid; F.sv.account = null; } render(); }
  else { render(); openFundSheet(fid); }
}
async function removeFund() {
  const f = byId(S.savings.funds, FF.id); if (!f) return;
  const b = fundBal(f.id);
  if (b !== 0) return fferr(`It still has ${fmt(b)}. Move or take it out first.`);
  if (!(await ask(`Remove the fund “${f.name}”?`, 'Remove', true))) return;
  if (S.savings.tx.some(t => t.fund === f.id || t.toFund === f.id)) f.archived = true; else S.savings.funds.splice(S.savings.funds.indexOf(f), 1);
  save(); toast(`“${f.name}” removed`); FF = null; closeSheet(); render();
}
function openEmojiSheet(target, current) {
  EMO_T = target;
  openSheet(`<div class="sh-h"><h2 class="grow">Pick an icon</h2><button type="button" class="icbtn" data-a="sheetClose" aria-label="Close">${IC.close}</button></div><div class="emojis">${EMOJI.map(e => `<button type="button" data-a="pickEmoji" data-e="${e}" aria-pressed="${e === current}">${e}</button>`).join('')}</div><button type="button" class="btn full" data-a="pickEmoji" data-e="">Use automatic icon</button>`, 'emoji');
}
function openAcctSheet(forAct) {
  ACCT_FOR = forAct;
  openSheet(`<div class="sh-h"><span class="ico lg">🏦</span><h2 class="grow">New account</h2><button type="button" class="icbtn" data-a="sheetClose" aria-label="Close">${IC.close}</button></div>
    <label class="fld"><span>Where is the money kept?</span><input id="acct-name" maxlength="40" autocomplete="off" placeholder="e.g. Unionbank, GCash GSave, Cash at home"></label>
    <div class="hscroll" style="margin-top:8px">${['Unionbank', 'BDO', 'BPI', 'Landbank', 'GCash GSave', 'Maya Savings', 'Cash at home'].map(n => `<button type="button" class="chip sm" data-a="acctPreset" data-n="${n}">${n}</button>`).join('')}</div>
    <div class="err" id="acerr" role="alert"></div><div class="savebar"><button type="button" class="btn pri big" data-a="acctSave">Add account</button></div>`, 'acct');
  setTimeout(() => { const i = $('#acct-name'); if (i) i.focus(); }, 50);
}

/* =====================================================================
   SETTINGS & SETUP (edit a draft; nothing is kept until Save)
   ===================================================================== */
const ED = () => DRAFT || S.settings;
const SECTIONS = {
  members: ['👥', 'Who spends the money', 'Me, Husband, the kids… With 2+ names the Add screen asks “Who spent it”.', 'New person'],
  categories: ['🏷️', 'Categories & budgets', 'Monthly budget in ₱ · 0 = no budget · tap the icon to change it', 'New category'],
  methods: ['💳', 'Payment methods', 'Tick “Outside” for credit card or separate money', 'New method'],
  incomeSources: ['💼', 'Income sources', 'Tick “Outside” for money that isn’t family income', 'New source'],
  bills: ['🧾', 'Monthly bills', 'Shows as unpaid each month until you log it', 'New bill'],
  savingsAccounts: ['🏦', 'Savings accounts', 'Banks, e-wallets, cash — where savings are kept', 'New account']
};
const KIND = { categories: 'cat', incomeSources: 'inc', methods: 'method', savingsAccounts: 'acct' };
function edRow(key, it) {
  const st = ED(), nm = esc(it.name);
  const name = `<input class="f-name" data-c="ed" data-f="name" value="${nm}" maxlength="40" autocomplete="off" aria-label="Name">`;
  const icon = KIND[key] ? `<button type="button" class="ebtn" data-a="pickIcon" data-key="${key}" data-id="${it.id}" aria-label="Icon for ${nm}">${iconFor(KIND[key], it)}</button>` : '';
  const x = `<button type="button" class="x" data-a="edDel" data-key="${key}" data-id="${it.id}" aria-label="Remove ${nm}">✕</button>`;
  let mid = '', wrap = '';
  if (key === 'categories') mid = `<input class="f-money" data-c="ed" data-f="budget" inputmode="decimal" value="${moneyField(it.budget)}" aria-label="Monthly budget for ${nm}"><input class="f-color" type="color" data-c="ed" data-f="color" value="${catColor(it)}" aria-label="Color for ${nm}">`;
  if (key === 'bills') {
    mid = `<input class="f-money" data-c="ed" data-f="amount" inputmode="decimal" value="${moneyField(it.amount)}" aria-label="Amount"><input class="f-day" data-c="ed" data-f="day" inputmode="numeric" value="${it.day}" aria-label="Due day">`;
    wrap = `<select class="f-cat" data-c="ed" data-f="categoryId" aria-label="Category">${active(st.categories).map(c => `<option value="${c.id}"${c.id === it.categoryId ? ' selected' : ''}>${iconFor('cat', c)} ${esc(c.name)}</option>`).join('')}</select>`;
  }
  if (key === 'methods' || key === 'incomeSources') mid = `<label class="togg"><input type="checkbox" data-c="ed" data-f="offBudget"${it.offBudget ? ' checked' : ''}>Outside</label>`;
  return `<div class="ed${wrap ? ' wrap' : ''}" data-key="${key}" data-id="${it.id}">${icon}${name}${mid}${x}${wrap}</div>`;
}
const ED_HEAD = {
  categories: '<div class="edh"><span class="h-ic"></span><span class="f-name">Name</span><span class="f-money">Budget ₱</span><span class="f-color">Color</span><span class="h-x"></span></div>',
  bills: '<div class="edh"><span class="f-name">Name</span><span class="f-money">₱ / month</span><span class="f-day">Day</span><span class="h-x"></span></div>'
};
function sectionFold(key, defOpen) {
  const st = ED(), [icon, title, help, nw] = SECTIONS[key], items = active(st[key]), hidden = st[key].filter(x => x.archived);
  const meta = key === 'categories' ? `${items.length} · ${fmt0(items.reduce((a, c) => a + (c.budget || 0), 0))} budget` : key === 'bills' ? `${items.length} · ${fmt0(items.reduce((a, b) => a + (b.amount || 0), 0))}/month` : items.map(x => x.name).slice(0, 4).join(', ') + (items.length > 4 ? '…' : '') || 'none yet';
  const body = `<p class="hint" style="margin:0 0 4px">${help}</p>${items.length && ED_HEAD[key] ? ED_HEAD[key] : ''}${items.map(it => edRow(key, it)).join('')}
    ${hidden.length ? `<div class="restore">Hidden: ${hidden.map(x => `<button type="button" data-a="edRestore" data-key="${key}" data-id="${x.id}">${esc(x.name)} ↺</button>`).join('')}</div>` : ''}
    <button type="button" class="btn sm ghost addrow" data-a="edAdd" data-key="${key}" data-new="${nw}">＋ ${nw}</button>`;
  return foldHtml('set-' + key, icon, title, meta, body, defOpen);
}
function renderSettings() {
  const st = ED(), th = st.theme || 'auto';
  let h = foldHtml('set-look', '🎨', 'Appearance', { auto: 'Auto (follows phone)', light: 'Light', dark: 'Dark' }[th],
    `<div class="seg" role="group" aria-label="Theme">${[['auto', '📱 Auto'], ['light', '☀️ Light'], ['dark', '🌙 Dark']].map(([v, l]) => `<button type="button" data-a="theme" data-k="${v}" aria-pressed="${th === v}">${l}</button>`).join('')}</div>`);
  h += Object.keys(SECTIONS).map(k => sectionFold(k, false)).join('');
  const fg = S.savings.funds.filter(f => !f.archived).reduce((a, f) => a + (f.monthlyGoal || 0), 0);
  h += foldHtml('set-money', '⚖️', 'Money rules', `${st.carryOver !== false ? 'Carry over on' : 'Each month starts at ₱0'} · goal ${fmt0(st.savingsGoal)}`,
    `<div class="lbl" style="margin-top:0">Money left at month end</div><div class="seg" role="group">${[['on', '↪ Carry to next month'], ['off', '0️⃣ Start at ₱0']].map(([k, l]) => `<button type="button" data-a="carry" data-k="${k}" aria-pressed="${(st.carryOver !== false) === (k === 'on')}">${l}</button>`).join('')}</div>
    <p class="hint">Overspending carries too — next month starts short.</p>
    <div class="row2e">${st.carryOver !== false ? `<label class="fld"><span>Cash on hand at start ₱</span><input data-c="opening" inputmode="decimal" value="${moneyField(st.openingBalance || 0)}"></label>` : ''}<label class="fld"><span>🎯 Monthly savings goal ₱</span><input data-c="goal" inputmode="decimal" value="${moneyField(st.savingsGoal)}"></label></div>
    ${fg ? `<p class="hint">Fund goals add up to ${fmt0(fg)}.</p>` : ''}`);
  h += foldHtml('set-sync', '☁️', 'Google Sheets sync', SY.url ? syncStatusText() : 'Not connected', `<div id="sync-body">${syncBody()}</div>`);
  h += foldHtml('set-install', '📲', 'Install as app', isStandalone() ? '✅ Installed' : 'Home-screen icon · works offline', `<div id="install-body">${installBody()}</div>`);
  const n = S.entries.length;
  h += foldHtml('set-data', '💾', 'Backup & data', `${plural(n, 'entry')} · ${plural(S.savings.tx.length, 'savings record')}`,
    `<p class="hint" style="margin:0 0 8px">⚠️ Data lives on this phone. Clearing browser data erases it — keep sync on or export backups.</p>
    <div class="datatools"><button type="button" class="btn pri" data-a="expJson">⬇ Export backup (JSON)</button><button type="button" class="btn" data-a="impReplace">⬆ Restore backup (replaces)</button><button type="button" class="btn" data-a="impMerge">➕ Add entries from another phone</button>
    <div class="row2e" style="margin:0"><button type="button" class="btn sm" data-a="expCsv">📄 Entries CSV</button><button type="button" class="btn sm" data-a="expSvCsv">📄 Savings CSV</button></div>
    <button type="button" class="btn danger" data-a="wipe">Erase everything on this phone</button></div>`);
  h += `<p class="ver">Family Budget v${VERSION}</p>`;
  $('#screen-settings').innerHTML = h;
}
function renderSetup() {
  $('#screen-setup').innerHTML = `<div class="card intro"><span class="e">👋</span><div><b>Let’s set up your budget</b><p class="hint" style="margin:2px 0 0">Check these lists. You can change them anytime in Settings.</p></div></div>
    ${['members', 'categories', 'methods', 'bills', 'savingsAccounts'].map(k => sectionFold(k, k === 'members' || k === 'categories')).join('')}
    <div class="err" id="setup-err" role="alert"></div>
    <div class="savebar"><button type="button" class="btn pri big" data-a="setupDone">Start using the app</button></div>
    <p class="hint" style="text-align:center">Already used on another phone? Start, then Settings → Google Sheets sync.</p>`;
}
function rerenderEditors() { if (screen === 'setup') renderSetup(); else renderSettings(); }
function markDirty() { if (screen === 'settings') { dirty = true; renderSetBar(); } }
function renderSetBar() { $('#setbar').classList.toggle('hidden', !(screen === 'settings' && dirty)); }
function commitSettings(quiet) {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (!DRAFT) return;
  ensureMember(DRAFT);
  S.settings = DRAFT; DRAFT = clone(S.settings); dirty = false;
  save(); applyTheme(S.settings.theme); renderSetBar();
  if (!quiet) { toast('Settings saved ✓'); if (screen === 'settings') renderSettings(); }
}
function used(id) {
  return S.savings.tx.some(t => t.account === id || t.toAccount === id) || S.entries.some(e => e.member === id || e.categoryId === id || e.source === id || e.method === id || e.billId === id) ||
    ED().bills.some(b => !b.archived && b.categoryId === id);
}
function applyTheme(t) {
  const r = document.documentElement;
  if (t === 'light' || t === 'dark') r.dataset.theme = t; else delete r.dataset.theme;
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', cssv('--top') || '#0f766e');
}
function editorChange(inp) {
  const row = inp.closest('[data-id]'); if (!row) return;
  const key = row.dataset.key, it = byId(ED()[key], row.dataset.id), f = inp.dataset.f; if (!it || !f) return;
  if (f === 'name') {
    const v = inp.value.trim();
    if (!v) { toast('Name cannot be empty.', true); inp.value = it.name; return; }
    it.name = v; markDirty(); rerenderEditors(); return;
  }
  if (f === 'budget' || f === 'amount') {
    const r = parseAmount(inp.value, f === 'budget');
    if (r.err) { toast(r.err, true); inp.value = moneyField(it[f]); return; }
    it[f] = r.c; inp.value = moneyField(r.c);
  } else if (f === 'day') {
    const d = parseInt(inp.value, 10);
    if (!(d >= 1 && d <= 31)) { toast('Due day must be 1 to 31.', true); inp.value = it.day; return; }
    it.day = d;
  } else if (f === 'color') it.color = inp.value;
  else if (f === 'offBudget') it.offBudget = inp.checked;
  else if (f === 'categoryId') it.categoryId = inp.value;
  markDirty();
}

/* =====================================================================
   GOOGLE SHEETS SYNC — offline first
   ===================================================================== */
var SY = loadSync(), syncTimer = null, syncing = false;
function loadSync() {
  const d = { url: '', key: '', pending: false, changedAt: 0, last: null, error: '', sheet: '' };
  try { return Object.assign(d, JSON.parse(localStorage.getItem(KEY + '.sync') || '{}')); } catch (e) { return d; }
}
function saveSync() { try { localStorage.setItem(KEY + '.sync', JSON.stringify(SY)); } catch (e) {} renderSyncStatus(); }
function markChanged() { if (!SY.url) return; SY.pending = true; SY.changedAt = Date.now(); saveSync(); scheduleSync(); }
function scheduleSync(delay = 4000) {
  clearTimeout(syncTimer);
  if (!SY.url || !SY.pending) return;
  if (!navigator.onLine) { renderSyncStatus(); return; }
  syncTimer = setTimeout(() => doSync(false), delay);
}
async function callSheet(url, key, payload) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ key }, payload)) });
  let j;
  try { j = await res.json(); } catch (e) { throw new Error("The link didn't answer like the budget script. Check it ends in /exec and access is “Anyone”."); }
  if (!j.ok) throw new Error(j.error || 'The Google Sheet refused the request.');
  return j;
}
function syncErrorText(e) {
  return /Failed to fetch|NetworkError|Load failed|network/i.test(e.message) ? "Couldn't reach Google. Check the internet, and that the script access is “Anyone”." : e.message;
}
async function doSync(manual) {
  if (!SY.url || syncing) return;
  if (!navigator.onLine) { if (manual) toast("You're offline. Saved on this phone — it syncs when you're back online.", true); renderSyncStatus(); return; }
  syncing = true; renderSyncStatus();
  const sentAt = Date.now();
  try {
    await callSheet(SY.url, SY.key, { action: 'push', state: S, tables: sheetTables() });
    if (SY.changedAt <= sentAt) SY.pending = false;
    SY.last = Date.now(); SY.error = '';
    if (manual) toast('Synced to Google Sheets ✓');
  } catch (e) { SY.error = syncErrorText(e); if (manual) toast(SY.error, true); }
  finally { syncing = false; saveSync(); if (SY.pending) scheduleSync(SY.error ? 60000 : 3000); }
}
function sheetTables() {
  const st = S.settings, n = c => Math.round(c) / 100, people = !solo();
  const byNew = (a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0);
  const ent = [['Date', 'Type', 'Amount', 'Category / Source', 'Payment method', 'Note', 'Bill', 'Outside budget'].concat(people ? ['Person'] : [])];
  for (const e of [...S.entries].sort(byNew)) ent.push([e.date, e.type === 'expense' ? 'Expense' : 'Income', n(e.amount), entryName(e), nameOf(st.methods, e.method, ''), e.note || '', e.billId ? nameOf(st.bills, e.billId, '') : '', e.offBudget ? 'Yes' : ''].concat(people ? [nameOf(st.members, e.member, '')] : []));
  const fn = id => id ? fundName(id) : '';
  const sav = [['Date', 'Kind', 'Fund', 'To fund', 'Amount', 'Came from / Went to', 'Account', 'To account', 'Note'].concat(people ? ['Person'] : [])];
  for (const t of [...S.savings.tx].sort(byNew)) sav.push([t.date, { in: 'Added', out: 'Taken out', move: 'Moved' }[t.type], fn(t.fund), fn(t.toFund), n(t.amount),
    t.type === 'in' ? (SRC[t.src] || {}).l || '' : t.type === 'out' ? (DEST[t.dest] || {}).l || '' : '', acctName(t.account), t.type === 'move' ? acctName(t.toAccount) : '', t.note || ''].concat(people ? [nameOf(st.members, t.member, '')] : []));
  const funds = [['Fund', 'Balance', 'Where it is kept', 'Monthly goal', 'Target', 'Target date', 'Description']];
  for (const f of S.savings.funds.filter(f => !f.archived || fundBal(f.id))) funds.push([f.name, n(fundBal(f.id)), fundAccts(f.id).map(([k, v]) => acctName(k) + ' ' + fmt0(v)).join('; '), f.monthlyGoal ? n(f.monthlyGoal) : '', f.target ? n(f.target) : '', f.targetDate || '', f.note || '']);
  const accts = [['Account', 'Fund', 'Balance']];
  for (const [k, r] of acctTotals()) { for (const [f, v] of r.funds) if (v) accts.push([acctName(k), f.name, n(v)]); accts.push([acctName(k), 'TOTAL', n(r.bal)]); }
  const all = S.entries.map(e => e.date).concat(S.savings.tx.map(t => t.date));
  const months = [['Month', 'Carried in', 'Income', 'Spent', 'Moved to savings (net)', 'Left at month end', 'Spent outside budget', 'Total savings at month end']];
  if (all.length) {
    const first = parseYmd(all.reduce((a, d) => d < a ? d : a)), t = new Date();
    for (let d = new Date(t.getFullYear(), t.getMonth(), 1); d >= new Date(first.getFullYear(), first.getMonth(), 1); d = new Date(d.getFullYear(), d.getMonth() - 1, 1)) {
      const [a, b] = monthRange(d.getFullYear(), d.getMonth()), es = S.entries.filter(e => e.date >= a && e.date <= b);
      const inc = sum(es.filter(e => e.type === 'income' && !e.offBudget)), sp = sum(es.filter(e => e.type === 'expense' && !e.offBudget));
      const off = sum(es.filter(e => e.type === 'expense' && e.offBudget)), fl = savingsFlow(a, b), net = fl.toS - fl.fromS;
      const upto = S.savings.tx.filter(x => x.date <= b), tot = S.savings.funds.reduce((s, f) => s + balOf(upto, f.id), 0), cin = carryInto(a);
      months.push([MONTHS[d.getMonth()] + ' ' + d.getFullYear(), n(cin), n(inc), n(sp), n(net), n(cin + inc - sp - net), n(off), n(tot)]);
    }
  }
  return [{ name: 'Monthly summary', rows: months, money: [2, 3, 4, 5, 6, 7, 8] }, { name: 'Expenses & income', rows: ent, money: [3], dates: [1] },
    { name: 'Savings funds', rows: funds, money: [2, 4, 5], dates: [6] }, { name: 'Savings by account', rows: accts, money: [3] },
    { name: 'Savings records', rows: sav, money: [5], dates: [1] }];
}
function syncStatusText() {
  if (!SY.url) return '';
  if (syncing) return '☁️ Syncing…';
  const when = SY.last ? new Date(SY.last).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  if (SY.pending && !navigator.onLine) return '📴 Offline — saved on phone, syncs when online';
  if (SY.pending && SY.error) return '⚠️ Not synced — ' + SY.error;
  if (SY.pending) return '☁️ Waiting to sync…';
  return '✅ Synced' + (when ? ' · ' + when : '');
}
function renderSyncStatus() {
  if (!S) return;
  renderHeader();
  if (screen === 'settings' && SY.url) { const b = $('#sync-body'); if (b) b.innerHTML = syncBody(); }
}
function syncBody() {
  if (!SY.url) return `<p class="hint" style="margin:0 0 6px">Copies everything to your own Google Sheet whenever you're online. Setup steps are in the guide.</p>
    <label class="fld"><span>Web app link</span><input id="sy-url" autocomplete="off" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec"></label>
    <label class="fld" style="margin-top:8px"><span>Secret word</span><input id="sy-key" autocomplete="off" type="password"></label>
    <button type="button" class="btn pri full" data-a="syConnect">Connect</button>`;
  return `<p><b>${esc(syncStatusText())}</b></p><small>Connected${SY.sheet ? ' to “' + esc(SY.sheet) + '”' : ''} · syncs a few seconds after each save</small>
    <div class="row2e"><button type="button" class="btn pri" data-a="syNow">Sync now</button><button type="button" class="btn" data-a="syPull">Restore from sheet</button></div>
    <button type="button" class="tbtn" data-a="syOff" style="margin-top:6px;padding-left:0">Disconnect</button>`;
}
window.addEventListener('online', () => { renderSyncStatus(); scheduleSync(1500); });
window.addEventListener('offline', renderSyncStatus);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  scheduleSync(1500);
  if (screen === 'add' && !F.editing && !F.dateTouched && F.date !== today()) renderAdd();
});

/* =====================================================================
   INSTALL AS AN APP
   ===================================================================== */
let installPrompt = null;
const isStandalone = () => !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; const b = $('#install-body'); if (b) b.innerHTML = installBody(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('Installed ✓ — open it from your home screen'); });
function installBody() {
  if (isStandalone()) return '<p>✅ Installed. Opens from the home screen and works without internet.</p>';
  if (location.protocol === 'file:') return '<p class="hint">Opened as a file. Put the app online first (see the guide), then open that link on the phone.</p>';
  if (installPrompt) return '<button type="button" class="btn pri full" data-a="doInstall" style="margin-top:0">📲 Install app</button>';
  return isIOS() ? '<p class="hint" style="margin:0">In <b>Safari</b>: tap <b>Share ⬆︎</b> → <b>Add to Home Screen</b> → <b>Add</b>. Install it this way so iPhone keeps the data.</p>'
    : '<p class="hint" style="margin:0">In Chrome: menu <b>⋮</b> → <b>Install app</b> (or <b>Add to Home screen</b>).</p>';
}
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* =====================================================================
   BACKUP / RESTORE / CSV
   ===================================================================== */
function download(name, text, mime) {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast('Saved file: ' + name);
  } catch (e) { toast('This browser could not create the file.', true); }
}
const csvQ = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCsv = rows => '﻿' + rows.map(r => r.map(csvQ).join(',')).join('\r\n');
let importMode = 'replace';
$('#imp-file').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const rd = new FileReader();
  rd.onerror = () => toast('Could not read that file.', true);
  rd.onload = async () => {
    let obj;
    try { obj = JSON.parse(rd.result); if (!valid(obj)) throw 0; obj = normalize(obj); }
    catch (_) { toast('That file is not a Family Budget backup.', true); return; }
    if (importMode === 'replace') {
      if (!(await ask(`Replace ALL data on this phone with this backup?\n\nBackup: ${plural(obj.entries.length, 'entry')}, ${plural(obj.savings.tx.length, 'savings record')}.\nThis phone: ${plural(S.entries.length, 'entry')} — will be lost.`, 'Replace', true))) return;
      S = obj; S.setupDone = true; save(); DRAFT = clone(S.settings); dirty = false; applyTheme(S.settings.theme); F = newForm(); toast('Backup restored'); render();
    } else {
      const added = await mergeIn(obj);
      if (added === null) return;
      DRAFT = clone(S.settings); dirty = false; toast(`Added ${plural(added.e, 'entry')} and ${plural(added.s, 'savings record')}`); render();
    }
  };
  rd.readAsText(file);
});
async function mergeIn(obj) {
  const st = S.settings, have = new Set(S.entries.map(e => e.id)), newE = obj.entries.filter(e => !have.has(e.id));
  if (!(await ask(`Add ${plural(newE.length, 'new entry')} from this backup?\n(${obj.entries.length - newE.length} already here will be skipped.)`))) return null;
  const mapList = key => {
    const map = {};
    for (const it of obj.settings[key] || []) {
      const nm = String(it.name || '').trim().toLowerCase();
      let ex = st[key].find(x => x.id === it.id) || st[key].find(x => x.name.trim().toLowerCase() === nm);
      if (!ex) { ex = Object.assign({}, it); st[key].push(ex); }
      map[it.id] = ex.id;
    }
    return map;
  };
  const mm = mapList('members'), mc = mapList('categories'), mt = mapList('methods'), msrc = mapList('incomeSources'), mb = mapList('bills'), ma = mapList('savingsAccounts');
  for (const b of st.bills) if (mc[b.categoryId]) b.categoryId = mc[b.categoryId];
  for (const e of newE) S.entries.push(Object.assign({}, e, { member: mm[e.member] || e.member, categoryId: e.categoryId ? (mc[e.categoryId] || e.categoryId) : null,
    source: e.source ? (msrc[e.source] || e.source) : null, method: e.method ? (mt[e.method] || e.method) : null, billId: e.billId ? (mb[e.billId] || e.billId) : null }));
  const mf = {}, sv = S.savings;
  for (const f of obj.savings.funds) {
    const nm = String(f.name || '').trim().toLowerCase();
    let ex = sv.funds.find(x => x.id === f.id) || sv.funds.find(x => x.name.trim().toLowerCase() === nm);
    if (!ex) { ex = Object.assign({}, f); sv.funds.push(ex); }
    mf[f.id] = ex.id;
  }
  const haveT = new Set(sv.tx.map(t => t.id)); let nt = 0;
  for (const t of obj.savings.tx) if (!haveT.has(t.id)) {
    sv.tx.push(Object.assign({}, t, { fund: mf[t.fund] || t.fund, toFund: t.toFund ? (mf[t.toFund] || t.toFund) : null, member: mm[t.member] || t.member,
      account: t.account ? (ma[t.account] || t.account) : null, toAccount: t.toAccount ? (ma[t.toAccount] || t.toAccount) : null }));
    nt++;
  }
  save();
  return { e: newE.length, s: nt };
}

/* =====================================================================
   TAP HANDLERS
   ===================================================================== */
const A = {
  dismiss: el => { notices.splice(+el.dataset.i, 1); renderNotices(); },
  go: el => { if (el.dataset.open) FOLD[el.dataset.open] = true; if (sheetOpen) closeSheet(); go(el.dataset.to); },
  back: () => { try { if (history.state && history.state.fb === 'settings') { history.back(); return; } } catch (_) {} leaveSettings(); },
  sub: el => { SUB[screen] = el.dataset.k; render(); window.scrollTo(0, 0); },
  mon: el => { const d = new Date(MC.y, MC.m + Number(el.dataset.d), 1); MC = { y: d.getFullYear(), m: d.getMonth() }; H.limit = 100; render(); },
  /* add form */
  ftype: el => {
    const k = el.dataset.k; if (F.type === k) return;
    F.type = k; F.billId = null; F.billFor = null;
    if (k !== 'savings' && !F.editing) { F.offTouched = false; applyMemberDefaults(); }
    renderHeader(); renderAdd();
  },
  fcat: el => { if (F.type === 'expense') F.cat = el.dataset.id; else F.source = el.dataset.id; F.offTouched = F.offTouched && F.editing; renderAdd(); },
  fmem: el => { F.member = el.dataset.id; if (!F.editing && F.type !== 'savings') applyMemberDefaults(); renderAdd(); },
  fmeth: el => { F.method = el.dataset.id; if (!F.editing) F.offTouched = false; renderAdd(); },
  foff: () => { F.offBudget = !F.offBudget; F.offTouched = true; renderAdd(); },
  bill: el => fillBill(el.dataset.id, el.dataset.for),
  billclear: () => { F.billId = null; F.billFor = null; renderAdd(); },
  lastamt: () => { F.amount = String(lastAmount() / 100); renderAdd(); },
  maxamt: el => { F.amount = String(Number(el.dataset.amt) / 100); renderAdd(); },
  fsave: () => F.type === 'savings' ? saveSavings() : saveEntry(),
  fdel: () => F.type === 'savings' ? deleteTx(F.editing) : deleteEntry(F.editing),
  cancelEdit: () => { const back = F.returnTo || 'budget'; F = newForm(F.type === 'savings' ? 'savings' : 'expense'); go(back); },
  svmode: el => {
    const v = F.sv; v.mode = el.dataset.k;
    if (v.mode !== 'in' && v.fund && (v.account === null || pairBal(S.savings.tx.filter(t => t.id !== F.editing), v.fund, v.account || null) <= 0)) v.account = defaultAcct(v.fund, 'out');
    if (v.mode === 'move') { v.toFund = v.toFund || null; v.toAccount = null; }
    renderAdd();
  },
  svfund: el => { F.sv.fund = el.dataset.id; F.sv.account = defaultAcct(el.dataset.id, F.sv.mode); if (F.sv.mode === 'move') F.sv.toAccount = null; renderAdd(); },
  svacct: el => { F.sv.account = el.dataset.id; if (F.sv.mode === 'move' && F.sv.toFund === F.sv.fund && akey(F.sv.toAccount) === akey(F.sv.account)) F.sv.toAccount = null; renderAdd(); },
  svtofund: el => { F.sv.toFund = el.dataset.id; F.sv.toAccount = null; renderAdd(); },
  svtoacct: el => { F.sv.toAccount = el.dataset.id; renderAdd(); },
  svsrc: el => { F.sv.src = el.dataset.k; renderAdd(); },
  svdest: el => { F.sv.dest = el.dataset.k; renderAdd(); },
  goalfill: el => { const v = F.sv; v.mode = 'in'; v.fund = el.dataset.id; v.account = defaultAcct(v.fund, 'in'); F.amount = String(Number(el.dataset.amt) / 100); renderAdd(); },
  newSv: () => { F = newForm('savings'); go('add'); },
  /* budget */
  paybill: el => { F = newForm('expense'); go('add').then(() => fillBill(el.dataset.id, el.dataset.for)); },
  saveLeft: el => { F = newForm('savings'); F.sv.src = 'budget'; F.amount = String(Number(el.dataset.amt) / 100); go('add'); },
  catHist: el => { H.cat = 'c:' + el.dataset.id; H.type = ''; SUB.budget = 'history'; render(); window.scrollTo(0, 0); },
  chMode: el => { CH = el.dataset.k; render(); },
  hType: el => { H.type = el.dataset.k; renderBudgetHistory(); },
  hMore: () => { H.limit += 100; renderBudgetHistory(); },
  editEntry: el => {
    const x = S.entries.find(z => z.id === el.dataset.id); if (!x) return;
    F = Object.assign(newForm(x.type), { member: x.member, cat: x.categoryId, source: x.source, method: x.method, date: x.date, dateTouched: true, note: x.note || '',
      amount: (x.amount / 100).toFixed(2), billId: x.billId || null, billFor: x.billFor || null, editing: x.id, offBudget: !!x.offBudget, offTouched: true, returnTo: screen });
    go('add');
  },
  /* savings */
  svCh: el => { SD.mode = el.dataset.k; render(); },
  svPer: el => { SD.period = el.dataset.k; render(); },
  shMore: () => { SH.limit += 100; renderSavingsHistory(); },
  editTx: el => {
    const t = S.savings.tx.find(z => z.id === el.dataset.id); if (!t) return;
    const ret = sheetOpen ? 'savings' : screen;
    if (sheetOpen) closeSheet();
    F = Object.assign(newForm('savings'), { member: t.member, date: t.date, dateTouched: true, note: t.note || '', amount: (t.amount / 100).toFixed(2), editing: t.id, returnTo: ret,
      sv: { mode: t.type, fund: t.fund, account: akey(t.account), toFund: t.toFund, toAccount: t.type === 'move' ? akey(t.toAccount) : null, src: t.src || 'budget', dest: t.dest || 'budget' } });
    go('add');
  },
  delTx: el => deleteTx(el.dataset.id),
  fundOpen: el => openFundSheet(el.dataset.id),
  fundNew: () => openFundEdit(null),
  fundEdit: el => openFundEdit(el.dataset.id),
  fundHist: el => { closeSheet(); SH.fund = el.dataset.id; SH.acct = ''; SUB.savings = 'history'; go('savings'); },
  fundAct: el => {
    const fid = el.dataset.id, k = el.dataset.k; closeSheet();
    F = newForm('savings'); F.sv.mode = k; F.sv.fund = fid; F.sv.account = defaultAcct(fid, k);
    if (el.dataset.amt) F.amount = String(Number(el.dataset.amt) / 100);
    go('add');
  },
  /* sheets */
  sheetClose: () => { FF = null; closeSheet(); },
  ffIcon: el => { FF.icon = el.dataset.e; renderFundEdit(); },
  ffAcct: el => { FF.openAcct = el.dataset.id; renderFundEdit(); },
  ffCalc: () => {
    const tg = parseAmount(FF.target, true);
    if (tg.err || !tg.c || !FF.date) return fferr('Enter a target and a date first.');
    const f = FF.id ? byId(S.savings.funds, FF.id) : null, bal = f ? fundBal(f.id) : (parseAmount(FF.open, true).c || 0);
    const td = parseYmd(FF.date), now = new Date(), months = Math.max(1, (td.getFullYear() - now.getFullYear()) * 12 + td.getMonth() - now.getMonth());
    const need = Math.max(0, Math.ceil((tg.c - bal) / months / 100) * 100);
    FF.monthly = String(need / 100); renderFundEdit(); toast(`${fmt0(need)}/month × ${months} = ${fmt0(tg.c)}`);
  },
  ffSave: () => saveFund(),
  ffDel: () => removeFund(),
  pickEmoji: el => {
    const e = el.dataset.e, t = EMO_T; closeSheet();
    if (!t) return;
    const it = byId(ED()[t.key], t.id); if (it) { it.icon = e || null; markDirty(); rerenderEditors(); }
  },
  acctNew: el => openAcctSheet(el.dataset.for),
  acctPreset: el => { const i = $('#acct-name'); if (i) i.value = el.dataset.n; },
  acctSave: () => {
    const name = ($('#acct-name').value || '').trim(), errEl = $('#acerr');
    if (!name) { errEl.textContent = 'Type a name.'; return; }
    let a = S.settings.savingsAccounts.find(x => x.name.trim().toLowerCase() === name.toLowerCase());
    if (!a) { a = { id: uid(), name }; S.settings.savingsAccounts.push(a); } else a.archived = false;
    save(); toast(`🏦 ${name} added`);
    if (ACCT_FOR === 'ffAcct' && FF) { FF.openAcct = a.id; renderFundEdit(); return; }
    if (ACCT_FOR === 'svtoacct') F.sv.toAccount = a.id; else F.sv.account = a.id;
    closeSheet(); renderAdd();
  },
  /* settings */
  theme: el => { ED().theme = el.dataset.k; applyTheme(el.dataset.k); markDirty(); renderSettings(); },
  carry: el => { ED().carryOver = el.dataset.k === 'on'; markDirty(); renderSettings(); },
  edAdd: el => {
    const st = ED(), k = el.dataset.key, it = { id: uid(), name: el.dataset.new };
    if (k === 'categories') it.budget = 0;
    if (k === 'bills') { it.amount = 0; it.day = 1; it.categoryId = (active(st.categories)[0] || {}).id || null; }
    st[k].push(it); FOLD['set-' + k] = true; markDirty(); rerenderEditors();
    const inp = $(`.ed[data-id="${it.id}"] [data-f="name"]`); if (inp) { inp.focus(); inp.select(); }
  },
  edDel: async el => {
    const st = ED(), k = el.dataset.key, it = byId(st[k], el.dataset.id); if (!it) return;
    if (!(await ask(`Remove “${it.name}”?`, 'Remove', true))) return;
    if (used(it.id)) { it.archived = true; toast(`“${it.name}” hidden — past records keep it.`); } else st[k].splice(st[k].indexOf(it), 1);
    markDirty(); rerenderEditors();
  },
  edRestore: el => { const it = byId(ED()[el.dataset.key], el.dataset.id); if (it) { it.archived = false; markDirty(); rerenderEditors(); } },
  pickIcon: el => { const it = byId(ED()[el.dataset.key], el.dataset.id); openEmojiSheet({ key: el.dataset.key, id: el.dataset.id }, it ? iconFor(KIND[el.dataset.key], it) : ''); },
  setSave: () => commitSettings(),
  setDiscard: async () => { if (!(await ask('Discard all unsaved changes?', 'Discard', true))) return; DRAFT = clone(S.settings); dirty = false; applyTheme(S.settings.theme); renderSettings(); renderSetBar(); toast('Changes discarded'); },
  setupDone: () => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const st = ED(), err = $('#setup-err');
    ensureMember(st);
    if (!active(st.categories).length) { err.textContent = 'Add at least one category.'; return; }
    if (!active(st.methods).length) { err.textContent = 'Add at least one payment method (e.g. Cash).'; return; }
    S.settings = st; DRAFT = null; dirty = false; S.setupDone = true; save(); applyTheme(S.settings.theme);
    F = newForm(); screen = 'add'; render(); toast('All set! Log your first expense.');
  },
  syConnect: async el => {
    const url = $('#sy-url').value.trim(), key = $('#sy-key').value.trim();
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) return toast('Paste the Web app link — starts with https://script.google.com/ and ends with /exec.', true);
    if (!key) return toast('Type the secret word (SYNC_KEY in the script).', true);
    if (!navigator.onLine) return toast('Connect to the internet first.', true);
    el.disabled = true; el.textContent = 'Connecting…';
    try {
      const j = await callSheet(url, key, { action: 'ping' }), p = await callSheet(url, key, { action: 'pull' });
      Object.assign(SY, { url, key, sheet: j.sheet || '', error: '' });
      if (p.state && valid(p.state) && (p.state.entries.length || (p.state.savings && p.state.savings.tx && p.state.savings.tx.length))) {
        const obj = normalize(p.state);
        const useSheet = await ask(`This Google Sheet already has data${p.at ? ' (' + p.at + ')' : ''}:\n${plural(obj.entries.length, 'entry')}, ${plural(obj.savings.tx.length, 'savings record')}.\n\nThis phone: ${plural(S.entries.length, 'entry')}, ${plural(S.savings.tx.length, 'savings record')}.\n\nWhich copy should be kept?`, 'Use the sheet’s data', false, false, 'Keep this phone’s');
        if (useSheet) { S = obj; S.setupDone = true; applyTheme(S.settings.theme); F = newForm(); }
      }
      DRAFT = clone(S.settings); dirty = false;
      SY.pending = true; SY.changedAt = Date.now();
      save(); saveSync(); toast('Connected to Google Sheets ✓'); render(); doSync(false);
    } catch (err) { toast(syncErrorText(err), true); el.disabled = false; el.textContent = 'Connect'; }
  },
  syNow: () => { SY.pending = true; SY.changedAt = Date.now(); doSync(true); },
  syOff: async () => {
    if (!(await ask('Disconnect from Google Sheets?\n\nData stays on this phone and in the sheet.', 'Disconnect', true))) return;
    SY = { url: '', key: '', pending: false, changedAt: 0, last: null, error: '', sheet: '' }; saveSync(); renderSettings();
  },
  syPull: async () => {
    if (dirty) return toast('Save or discard your Settings changes first.', true);
    if (!navigator.onLine) return toast('Connect to the internet first.', true);
    try {
      const j = await callSheet(SY.url, SY.key, { action: 'pull' });
      if (!j.state || !valid(j.state)) return toast('No backup in the sheet yet.', true);
      const obj = normalize(j.state);
      if (!(await ask(`Replace this phone's data with the copy in Google Sheets?\n\n${j.at || ''}\nSheet: ${plural(obj.entries.length, 'entry')}, ${plural(obj.savings.tx.length, 'savings record')}.\nPhone: ${plural(S.entries.length, 'entry')}, ${plural(S.savings.tx.length, 'savings record')}.`, 'Replace', true))) return;
      S = obj; S.setupDone = true; save(); DRAFT = clone(S.settings); dirty = false; applyTheme(S.settings.theme); F = newForm();
      toast('Restored from Google Sheets ✓'); render();
    } catch (err) { toast(syncErrorText(err), true); }
  },
  doInstall: async () => { if (!installPrompt) return; installPrompt.prompt(); try { await installPrompt.userChoice; } catch (_) {} installPrompt = null; const b = $('#install-body'); if (b) b.innerHTML = installBody(); },
  expJson: () => { if (dirty) return toast('Save or discard your Settings changes first.', true); download(`family-budget-backup-${today()}.json`, JSON.stringify(S, null, 1), 'application/json'); },
  expCsv: () => {
    const st = S.settings, rows = [['Date', 'Type', 'Amount (PHP)', 'Category / Source', 'Person', 'Payment method', 'Note', 'Bill', 'Future', 'Outside budget']];
    for (const e of [...S.entries].sort((a, b) => a.date.localeCompare(b.date))) rows.push([e.date, e.type, (e.amount / 100).toFixed(2), entryName(e), nameOf(st.members, e.member, ''), nameOf(st.methods, e.method, ''), e.note || '', e.billId ? nameOf(st.bills, e.billId, '') : '', e.date > today() ? 'yes' : '', e.offBudget ? 'yes' : '']);
    download(`family-budget-${today()}.csv`, toCsv(rows), 'text/csv');
  },
  expSvCsv: () => {
    const rows = [['Date', 'Kind', 'Fund', 'To fund', 'Amount (PHP)', 'Came from / Went to', 'Account', 'To account', 'Person', 'Note']];
    for (const t of [...S.savings.tx].sort((a, b) => a.date.localeCompare(b.date))) rows.push([t.date, { in: 'Added', out: 'Taken out', move: 'Moved' }[t.type], fundName(t.fund), t.toFund ? fundName(t.toFund) : '', (t.amount / 100).toFixed(2),
      t.type === 'in' ? (SRC[t.src] || {}).l || '' : t.type === 'out' ? (DEST[t.dest] || {}).l || '' : '', acctName(t.account), t.type === 'move' ? acctName(t.toAccount) : '', nameOf(S.settings.members, t.member, ''), t.note || '']);
    rows.push([]); rows.push(['Balances as of ' + today()]);
    for (const f of S.savings.funds) for (const [k, v] of fundAccts(f.id)) rows.push(['', '', f.name, '', (v / 100).toFixed(2), '', acctName(k)]);
    download(`family-savings-${today()}.csv`, toCsv(rows), 'text/csv');
  },
  impReplace: () => { if (dirty) return toast('Save or discard your Settings changes first.', true); importMode = 'replace'; $('#imp-file').value = ''; $('#imp-file').click(); },
  impMerge: () => { if (dirty) return toast('Save or discard your Settings changes first.', true); importMode = 'merge'; $('#imp-file').value = ''; $('#imp-file').click(); },
  wipe: async () => {
    if (dirty) return toast('Save or discard your Settings changes first.', true);
    if (!(await ask('Erase ALL entries and settings on this phone?\n\nExport a backup first if you might need it.' + (SY.url ? '\n\nSync is disconnected first, so your Google Sheet keeps its copy.' : ''), 'Erase', true))) return;
    if (!(await ask('Are you sure? Everything on this phone will be deleted.', 'Erase everything', true))) return;
    SY = { url: '', key: '', pending: false, changedAt: 0, last: null, error: '', sheet: '' }; saveSync();
    S = fresh(); save(); DRAFT = clone(S.settings); dirty = false; applyTheme('auto'); F = newForm(); screen = 'setup'; render(); toast('Everything erased');
  }
};
function fillBill(id, forKey) {
  const b = byId(S.settings.bills, id); if (!b) return;
  F.type = 'expense'; F.billId = id; F.billFor = forKey;
  if (b.categoryId && byId(S.settings.categories, b.categoryId)) F.cat = b.categoryId;
  F.note = b.name; F.amount = String(b.amount / 100);
  renderAdd();
}
const INPUT = {
  amount: el => { F.amount = el.value; ferr(''); },
  note: el => { F.note = el.value; },
  ff: el => { if (FF) FF[el.dataset.k] = el.value; if (el.dataset.k !== 'color') fferr(''); }
};
const CHANGE = {
  fdate: el => { F.date = el.value || today(); F.dateTouched = true; renderAdd(); },
  hcat: el => { H.cat = el.value; renderBudgetHistory(); },
  hmem: el => { H.member = el.value; renderBudgetHistory(); },
  shfund: el => { SH.fund = el.value; renderSavingsHistory(); },
  shacct: el => { SH.acct = el.value; renderSavingsHistory(); },
  ed: el => editorChange(el),
  opening: el => { const r = parseAmount(el.value, true); if (r.err) { toast(r.err, true); el.value = moneyField(ED().openingBalance || 0); return; } ED().openingBalance = r.c; markDirty(); },
  goal: el => { const r = parseAmount(el.value, true); if (r.err) { toast(r.err, true); el.value = moneyField(ED().savingsGoal); return; } ED().savingsGoal = r.c; markDirty(); }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.a];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('input', e => { const el = e.target, k = el.dataset && el.dataset.i; if (k && INPUT[k]) INPUT[k](el); });
document.addEventListener('change', e => { const el = e.target, k = el.dataset && el.dataset.c; if (k && CHANGE[k]) CHANGE[k](el); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'f-amount') { e.preventDefault(); e.target.blur(); } });
document.addEventListener('toggle', e => { const d = e.target; if (d && d.dataset && d.dataset.fold) FOLD[d.dataset.fold] = d.open; }, true);
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

/* =====================================================================
   START
   ===================================================================== */
S = load();
applyTheme(S.settings.theme);
renderNotices();
if (!S.setupDone) { DRAFT = clone(S.settings); screen = 'setup'; }
render();
if (SY.pending) scheduleSync(2000);
