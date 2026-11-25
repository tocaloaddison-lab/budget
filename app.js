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
const VERSION = '4.0';

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
/* ---------- flat line icons (one style, colour from the item) ---------- */
const ICONS = {
  over: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>',
  minus: '<path d="M5 12h14"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  chevd: '<path d="M6 9l6 6 6-6"/>',
  bowl: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7.5c1.2-1.6 2.8-1.6 4 0s2.8 1.6 4 0"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 11.3a2 2 0 0 0 2 1.7h7.7a2 2 0 0 0 1.9-1.5L21 7H6.2"/>',
  burger: '<path d="M4 11a8 6 0 0 1 16 0z"/><path d="M3 14.5h18"/><path d="M4 17.5h16l-.8 1.6a2 2 0 0 1-1.8 1.1H6.6a2 2 0 0 1-1.8-1.1z"/>',
  coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3v3M12 3v3"/>',
  moto: '<circle cx="5.5" cy="17" r="3"/><circle cx="18.5" cy="17" r="3"/><path d="M8.5 17h6l2.5-7h-3"/><path d="M5.5 17l3-6h5"/><path d="M14 6h3l1.5 4"/>',
  bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 18v3M16 18v3"/><path d="M7.5 14.5h1M15.5 14.5h1"/>',
  car: '<path d="M3 16v-3l2.2-5.5A2 2 0 0 1 7.1 6h9.8a2 2 0 0 1 1.9 1.5L21 13v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h18"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12M4 10h10"/><path d="M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  wifi: '<path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5 12a10 10 0 0 1 14 0"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><path d="M12 19h.01"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  laptop: '<rect x="4" y="4" width="16" height="11" rx="2"/><path d="M2 19h20"/>',
  bag: '<path d="M6 9a6 6 0 0 1 12 0v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M9.5 4.5V3h5v1.5"/><path d="M9 14h6v4H9z"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/><path d="M22 9v6"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v14H6a2 2 0 0 0-2 2.5z"/><path d="M4 19.5A2 2 0 0 0 6 21h13v-4"/><path d="M9 7h6"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  pill: '<path d="M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>',
  medical: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10.5 21v-3h3v3"/>',
  sparkles: '<path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
  shirt: '<path d="M8 3L3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/>',
  baby: '<path d="M10 3h4v3h-4z"/><path d="M8.5 9a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v10a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2z"/><path d="M8.5 13h3M8.5 16.5h3"/>',
  paw: '<circle cx="5.5" cy="10.5" r="2"/><circle cx="9.5" cy="5.5" r="2"/><circle cx="14.5" cy="5.5" r="2"/><circle cx="18.5" cy="10.5" r="2"/><path d="M8 17.5c0-3 2-5.5 4-5.5s4 2.5 4 5.5a2.8 2.8 0 0 1-4 2.4 2.8 2.8 0 0 1-4-2.4z"/>',
  hands: '<path d="M12 10s-3.2-1.9-3.2-4.2A1.9 1.9 0 0 1 12 4.6a1.9 1.9 0 0 1 3.2 1.2C15.2 8.1 12 10 12 10z"/><path d="M2 14h3.5l3 1.2H12a1.6 1.6 0 0 1 0 3.2H9"/><path d="M5.5 20.5l7 .5 8.3-4.9a1.7 1.7 0 0 0-1.9-2.8L14.5 16"/>',
  heart: '<path d="M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 6.6a4.5 4.5 0 0 1 8 2.9C20 15.4 12 20 12 20z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8S10.5 3.5 8 4.2 7.8 8 12 8zM12 8s1.5-4.5 4-3.8S16.2 8 12 8z"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  box: '<path d="M3 7.5l9-4.5 9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  tools: '<path d="M14.5 6.5a4 4 0 0 1 5.2-3.8L17 5.4l.6 2 2 .6 2.7-2.7a4 4 0 0 1-5.4 4.9L8.5 18.6a2 2 0 0 1-2.9-2.9l8.4-8.4a4 4 0 0 1 .5-.8z"/>',
  plane: '<path d="M2.5 12.5L21 4l-6.5 17-3.2-6.3z"/><path d="M11.3 14.7L21 4"/>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6.5a2 2 0 0 1-4 0"/>',
  lifebuoy: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>',
  coins: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M21 9h-5a3 3 0 0 0 0 6h5z"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
  bank: '<path d="M3 9l9-6 9 6"/><path d="M4 9h16M6 9v8M10 9v8M14 9v8M18 9v8M3 20h18M4 17h16"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  store: '<path d="M4 10v10h16V10"/><path d="M3 4h18l-1 5a3 3 0 0 1-5.3 1 3 3 0 0 1-5.4 0A3 3 0 0 1 4 9z"/><path d="M10 20v-5h4v5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  mosque: '<path d="M5 21v-7h14v7"/><path d="M5 14a7 7 0 0 1 14 0"/><path d="M12 7V3.5"/><path d="M10 21v-3a2 2 0 0 1 4 0v3M3 21h18"/>',
  ring: '<circle cx="12" cy="14.5" r="6"/><path d="M9.5 4h5l-1.5 4h-2z"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-7 8-7 0 4-3 7-8 7z"/><path d="M12 14.5c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  lend: '<circle cx="15.5" cy="6.5" r="3"/><path d="M2 14h3.5l3 1.2H12a1.6 1.6 0 0 1 0 3.2H9"/><path d="M5.5 20.5l7 .5 8.3-4.9a1.7 1.7 0 0 0-1.9-2.8L14.5 16"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  receipt: '<path d="M5 3h14v18l-2.3-1.5L14.3 21 12 19.5 9.7 21l-2.4-1.5L5 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  /* interface */
  out: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  in: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  carry: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.6 1.7-1.6H16a5 5 0 0 0 5-5c0-4-4-7.3-9-7.3z"/><path d="M7.5 11h.01M10 7h.01M14.5 7h.01"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h14"/><path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  install: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M12 7v7M9 11l3 3 3-3"/>',
  save: '<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  file: '<path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v5h5M8 13h8M8 17h6"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'
};
/* what the icon picker offers, in order */
const PICK = ['bowl', 'cart', 'burger', 'coffee', 'moto', 'bus', 'car', 'fuel', 'wifi', 'phone', 'laptop', 'bag', 'cap', 'book', 'bulb', 'bolt',
  'drop', 'pill', 'medical', 'home', 'building', 'sparkles', 'shirt', 'baby', 'paw', 'hands', 'heart', 'gift', 'star', 'box', 'tag', 'tools',
  'plane', 'umbrella', 'lifebuoy', 'coins', 'wallet', 'cash', 'bank', 'card', 'briefcase', 'store', 'globe', 'mosque', 'ring', 'sprout',
  'trend', 'lend', 'target', 'flag', 'receipt', 'users'];
function I(name, cls = '') {
  return `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.tag}</svg>`;
}
const ICON_WORDS = {
  cat: [[/food|grocer|rice|meal|ulam|palengke/i, 'bowl'], [/fare|transpo|jeep|tricycle|commute/i, 'moto'], [/gas|fuel/i, 'fuel'], [/load|internet|wifi|data/i, 'wifi'],
    [/school|tuition|educ|baon/i, 'bag'], [/electric|power|meralco/i, 'bolt'], [/water/i, 'drop'], [/bill|util/i, 'receipt'], [/health|medic|doctor|pharma/i, 'pill'],
    [/rent/i, 'building'], [/house|home/i, 'home'], [/baby|kid|child/i, 'baby'], [/cloth|apparel/i, 'shirt'], [/zakat|donat|charity|sadaqah|church|tithe/i, 'hands'],
    [/gift|party|celebr/i, 'gift'], [/pet/i, 'paw'], [/eat out|restaurant|snack|coffee/i, 'coffee'], [/market|shop/i, 'cart'], [/other|misc/i, 'box']],
  inc: [[/salary|sweldo|wage/i, 'briefcase'], [/business|negosyo|store|sales/i, 'store'], [/remit|padala/i, 'globe'], [/allowance/i, 'wallet'], [/profit|dividend/i, 'sprout']],
  fund: [[/travel|trip|vacation|bakasyon/i, 'plane'], [/emergenc/i, 'umbrella'], [/tuition|school|educ|college/i, 'cap'], [/house|home|build|renov/i, 'home'],
    [/car|vehicle|motor/i, 'car'], [/alkansya|coin/i, 'coins'], [/business|capital|puhunan/i, 'briefcase'], [/hajj|umrah/i, 'mosque'], [/wedding/i, 'ring'],
    [/health|hospital|medical/i, 'medical'], [/gadget|phone|laptop/i, 'phone'], [/gift|christmas|eid|birthday/i, 'gift']],
  acct: [[/gcash|maya|gsave|wallet/i, 'phone'], [/cash|home|alkansya/i, 'cash'], [/card|credit/i, 'card']],
  method: [[/gcash|maya|wallet/i, 'phone'], [/cash/i, 'cash'], [/credit|card/i, 'card'], [/bank|online/i, 'bank']],
  src: [[/budget/i, 'home'], [/outside|separate/i, 'wallet'], [/profit|dividend|interest/i, 'sprout'], [/gift|family|parent/i, 'gift'], [/sold|sale/i, 'tag'],
    [/bonus|13th/i, 'star'], [/business|negosyo/i, 'store'], [/salary/i, 'briefcase'], [/remit|padala/i, 'globe'], [/starting/i, 'flag']],
  use: [[/budget/i, 'home'], [/sadaqah|charity|zakat|donat/i, 'hands'], [/lent|loan|utang|lend/i, 'lend'], [/gift|family/i, 'gift'], [/hajj|umrah/i, 'mosque'],
    [/school|tuition/i, 'cap'], [/hospital|medical|health/i, 'medical'], [/direct|paid/i, 'receipt']]
};
const ICON_DEFAULT = { cat: 'tag', inc: 'coins', fund: 'coins', acct: 'bank', method: 'card', src: 'coins', use: 'out' };
/* icons picked in v2 were emoji: map them to the flat set */
const EMOJI_MAP = { '🍚': 'bowl', '🛒': 'cart', '🍔': 'burger', '☕': 'coffee', '🛺': 'moto', '🚌': 'bus', '⛽': 'fuel', '📶': 'wifi', '📱': 'phone', '💻': 'laptop',
  '🎒': 'bag', '🎓': 'cap', '💡': 'bulb', '💧': 'drop', '💊': 'pill', '🏥': 'medical', '🏠': 'home', '🏘️': 'building', '🧹': 'sparkles', '🧴': 'drop', '👕': 'shirt',
  '🍼': 'baby', '🐾': 'paw', '🤲': 'hands', '🎁': 'gift', '🎉': 'star', '📦': 'box', '🏷️': 'tag', '🔧': 'tools', '🚗': 'car', '🏍️': 'moto', '✈️': 'plane',
  '🛟': 'lifebuoy', '🐷': 'coins', '💼': 'briefcase', '🏪': 'store', '🌏': 'globe', '🕋': 'mosque', '💍': 'ring', '💰': 'coins', '💵': 'cash', '🏦': 'bank',
  '💳': 'card', '📈': 'trend', '⭐': 'star', '❤️': 'heart', '🎯': 'target', '🏁': 'flag' };
function iconKey(kind, it) {
  if (!it) return ICON_DEFAULT[kind];
  if (it.icon) { if (ICONS[it.icon]) return it.icon; if (EMOJI_MAP[it.icon]) return EMOJI_MAP[it.icon]; }
  for (const [re, k] of ICON_WORDS[kind] || []) if (re.test(it.name || '')) return k;
  return ICON_DEFAULT[kind];
}
const iconFor = (kind, it) => I(iconKey(kind, it));

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
    settings: { members: [], categories: [], methods: [], incomeSources: [], bills: [], savingsAccounts: [], savingsSources: [], savingsUses: [], savingsGoal: 0, theme: 'auto', carryOver: true, openingBalance: 0 },
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
  st.savingsSources = defaultSources(); st.savingsUses = defaultUses();
  st.savingsGoal = c(CONFIG.savingsGoal);
  return s;
}
function defaultSources() { return [{ id: 'budget', name: 'Family budget', budget: true, locked: true }, { id: 'outside', name: 'Outside money', budget: false }, { id: 'profit', name: 'Profit', budget: false }]; }
function defaultUses() { return [{ id: 'budget', name: 'Back to budget', budget: true, locked: true }, { id: 'direct', name: 'Paid directly', budget: false }]; }
function valid(s) {
  return s && typeof s === 'object' && s.v === 1 && Array.isArray(s.entries) && s.settings &&
    ['members', 'categories', 'methods', 'incomeSources', 'bills'].every(k => Array.isArray(s.settings[k] || []));
}
function normalize(s) {
  const b = blankState();
  s.settings = Object.assign(b.settings, s.settings || {});
  for (const k of ['members', 'categories', 'methods', 'incomeSources', 'bills', 'savingsAccounts', 'savingsSources', 'savingsUses']) s.settings[k] = (s.settings[k] || []).filter(x => x && x.id);
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
  /* v3: savings sources and uses are editable lists; "Interest" is no longer offered */
  const st = s.settings;
  if (!st.savingsSources.length) st.savingsSources = defaultSources();
  if (!st.savingsUses.length) st.savingsUses = defaultUses();
  for (const [list, d] of [[st.savingsSources, defaultSources()[0]], [st.savingsUses, defaultUses()[0]]]) {
    let b0 = list.find(x => x.id === 'budget'); if (!b0) { b0 = Object.assign({}, d); list.unshift(b0); }
    b0.budget = true; b0.locked = true; b0.archived = false;
  }
  if (s.savings.tx.some(t => t.src === 'interest') && !st.savingsSources.find(x => x.id === 'interest')) st.savingsSources.push({ id: 'interest', name: 'Interest', budget: false, archived: true });
  if (s.savings.tx.some(t => t.dest === 'direct') && !st.savingsUses.find(x => x.id === 'direct')) st.savingsUses.push({ id: 'direct', name: 'Paid directly', budget: false });
  /* v3: icons are flat line icons; convert v2 emoji choices */
  for (const it of [].concat(st.categories, st.incomeSources, st.methods, st.savingsAccounts, s.savings.funds))
    if (it.icon && !ICONS[it.icon]) it.icon = EMOJI_MAP[it.icon] || null;
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
let UNDO = null;
function toast(msg, bad = false, undo = null) {
  const t = $('#toast'); UNDO = undo;
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" data-a="undo">Undo</button>' : ''}`;
  t.className = 'show' + (bad ? ' bad' : '') + (undo ? ' act' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; UNDO = null; }, undo ? 6000 : bad ? 4500 : 2400);
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
const SRC_OPENING = { id: 'opening', name: 'Starting balance', budget: false, icon: 'flag' };
function srcOf(id) { if (id === 'opening') return SRC_OPENING; return byId(S.settings.savingsSources, id) || { id, name: id === 'budget' ? 'Family budget' : id === 'interest' ? 'Interest' : 'Other', budget: id === 'budget' }; }
function useOf(id) { return byId(S.settings.savingsUses, id) || { id, name: id === 'budget' ? 'Back to budget' : 'Paid directly', budget: id === 'budget' }; }
const srcIsBudget = id => !!srcOf(id).budget;
const useIsBudget = id => !!useOf(id).budget;
const srcHint = x => x.id === 'opening' ? 'Money already saved before using the app' : x.budget ? 'From this month’s money · counts toward the goal' : 'Budget not affected';
const useHint = x => x.budget ? 'Added back to this month’s money left' : x.id === 'direct' ? 'Paid straight from savings · write what for' : 'Paid from savings · budget not affected';
const akey = a => a || '';
const activeAccts = () => active(S.settings.savingsAccounts);
const acctName = k => k ? nameOf(S.settings.savingsAccounts, k, 'Account') : 'Not set';
const acctIcon = k => k ? iconFor('acct', byId(S.settings.savingsAccounts, k)) : I('question');
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
    if (t.type === 'in' && srcIsBudget(t.src)) toS += t.amount;
    if (t.type === 'out' && useIsBudget(t.dest)) fromS += t.amount;
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
  const types = [['expense', 'out', 'Expense'], ['income', 'in', 'Income'], ['savings', 'coins', 'Savings']];
  let h = `<div class="seg typeseg" role="group" aria-label="Type">${types.map(([k, i, l]) => {
    const dis = F.editing && ((k === 'savings') !== isSv);
    return `<button type="button" data-a="ftype" data-k="${k}" aria-pressed="${F.type === k}"${dis ? ' disabled' : ''}>${I(i)} ${l}</button>`;
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
  return `<div class="row2"><label class="fld"><span>Date</span><input type="date" data-c="fdate" value="${F.date}"></label><label class="fld"><span>${label}</span><input data-i="note" maxlength="80" autocomplete="off" placeholder="${esc(ph)}" value="${esc(F.note)}"></label></div>${F.date > today() ? '<div class="warn">' + I('calendar') + ' Future date — it will be marked FUTURE</div>' : ''}`;
}
let USUALS = [];
function usuals() {        /* repeats from the last 90 days: same category, amount, method, person and note, 3+ times */
  const since = ymd(addDays(new Date(), -90)), m = new Map();
  for (const e of S.entries) {
    if (e.type !== 'expense' || e.offBudget || e.billId || e.date < since || !isActive(S.settings.categories, e.categoryId)) continue;
    const note = (e.note || '').trim(), k = [e.categoryId, e.amount, e.method, e.member, note.toLowerCase()].join('|');
    const r = m.get(k) || { cat: e.categoryId, amount: e.amount, method: e.method, member: e.member, note, n: 0, last: '' };
    r.n++; if (e.date > r.last) r.last = e.date; m.set(k, r);
  }
  return [...m.values()].filter(r => r.n >= 3).sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).slice(0, 6);
}
function entryFields() {
  const st = S.settings, isExp = F.type === 'expense'; let h = '';
  if (isExp) {
    if (F.billId) { const b = byId(st.bills, F.billId); h += `<div class="billpill">${I('receipt')} <span class="grow">Paying <b>${esc(b ? b.name : 'bill')}</b>${F.billFor ? ' · ' + monthLabel(F.billFor) : ''}</span><button type="button" class="icbtn sm" data-a="billclear" aria-label="Not a bill payment">${IC.close}</button></div>`; }
    else if (!F.editing) {
      const due = billStatus().filter(x => !x.paid);
      if (due.length) h += `<div class="hscroll quickrow">${due.map(x => `<button type="button" class="chip sm quick" data-a="bill" data-id="${x.b.id}" data-for="${x.key}">${I('receipt')} ${esc(x.b.name)} ${fmt0(x.b.amount)} <small class="${x.overdue ? 'neg' : ''}">${x.overdue ? 'overdue' : shortDate(x.due)}</small></button>`).join('')}</div>`;
    }
  }
  if (isExp && !F.editing && !F.billId) {
    USUALS = usuals();
    if (USUALS.length) h += `<div class="lbl">Usual · tap to log</div><div class="hscroll usual">${USUALS.map((u, i) => { const c = byId(st.categories, u.cat);
      return `<button type="button" class="chip" data-a="usual" data-i="${i}"><span style="color:${catColor(c)}">${iconFor('cat', c)}</span> ${esc(u.note || (c ? c.name : ''))} <b>${fmt0(u.amount)}</b></button>`; }).join('')}</div>`;
  }
  const la = !F.editing && !F.amount ? lastAmount() : null;
  h += amountBox(la ? `<button type="button" class="chip xs" data-a="lastamt">↺ ${fmt0(la)}</button>` : '');
  const list = isExp ? st.categories : st.incomeSources, sel = isExp ? F.cat : F.source;
  h += `<div class="lbl">${isExp ? 'Category' : 'From'}</div><div class="cgrid4">${list.filter(c => !c.archived || c.id === sel).map(c =>
    `<button type="button" class="ctile" data-a="fcat" data-id="${c.id}" aria-pressed="${c.id === sel}" style="--cc:${isExp ? catColor(c) : cssv('--green')}"><span class="e">${iconFor(isExp ? 'cat' : 'inc', c)}</span><span class="n">${esc(c.name)}</span></button>`).join('') || '<p class="muted">Add some in Settings.</p>'}</div>`;
  if (!solo()) h += `<div class="lbl">Who</div>${memberChips(F.member, 'fmem')}`;
  h += `<div class="lbl">${isExp ? 'Paid with' : 'Into'}</div><div class="hscroll">${st.methods.filter(x => !x.archived || x.id === F.method).map(x =>
    `<button type="button" class="chip" data-a="fmeth" data-id="${x.id}" aria-pressed="${x.id === F.method}">${iconFor('method', x)} ${esc(x.name)}</button>`).join('')}</div>`;
  if (!F.offTouched) F.offBudget = defaultOff();
  h += dateNote(isExp ? 'e.g. rice 5kg' : 'e.g. November salary');
  h += `<button type="button" class="switchrow" data-a="foff" aria-pressed="${F.offBudget}"><span class="sw"></span><span class="grow"><b>Outside budget</b><small>Not counted in totals</small></span></button>`;
  return h;
}
function token(k, icon, name, extra, color, need) {
  return `<button type="button" class="tok${need ? ' need' : ''}" data-a="pick" data-k="${k}" style="--tc:${color}"><span class="ti">${icon}</span><span class="tn">${esc(name)}</span>${extra || ''}${I('chevd')}</button>`;
}
function svList() { return S.savings.tx.filter(t => t.id !== F.editing); }
function tokFund(k, fid) { const f = byId(S.savings.funds, fid); return f ? token(k, iconFor('fund', f), f.name, `<small>${fmtC(fundBal(f.id, F.editing))}</small>`, fundColor(f)) : token(k, I('question'), 'Choose', '', cssv('--red'), true); }
function tokAcct(k, fid, acct) {
  if (acct === null) return token(k, I('question'), 'Choose', '', cssv('--red'), true);
  const b = fid ? pairBal(svList(), fid, acct || null) : 0;
  return token(k, acctIcon(acct || null), acctName(acct || null), b ? `<small>${fmtC(b)}</small>` : '', acct ? acctColor(acct) : cssv('--muted'));
}
const budTag = x => x.budget ? '<span class="badge bud">Budget</span>' : '';
function svFields() {
  const v = F.sv, funds = S.savings.funds.filter(f => !f.archived || f.id === v.fund || f.id === v.toFund);
  if (!funds.length) return `<div class="card empty" style="margin-top:10px"><div class="e">${I('coins')}</div><b>No savings funds yet</b><p>One per goal: Travel, Emergency…</p><button type="button" class="btn pri" data-a="fundNew">＋ Create a fund</button></div>`;
  const canMove = funds.length > 1 || activeAccts().length > 1;
  let h = `<div class="svmodes"><div class="seg mini" role="group" aria-label="Action">${[['in', 'plus', 'Add'], ['out', 'minus', 'Take out']].map(([k, ic, l]) =>
    `<button type="button" data-a="svmode" data-k="${k}" aria-pressed="${v.mode === k}">${I(ic)} ${l}</button>`).join('')}</div>${canMove ? `<button type="button" class="tbtn mv${v.mode === 'move' ? ' on' : ''}" data-a="svmode" data-k="${v.mode === 'move' ? 'in' : 'move'}" aria-pressed="${v.mode === 'move'}">${I('swap')} Move</button>` : ''}</div>`;
  if (v.mode === 'in' && !F.editing) {
    const t = new Date(), [ms, me] = monthRange(t.getFullYear(), t.getMonth());
    const g = active(S.savings.funds).filter(f => f.monthlyGoal > 0).map(f => [f, f.monthlyGoal - fundNet(f.id, ms, me)]).filter(([, r]) => r > 0);
    if (g.length) h += `<div class="lbl">Goals left · tap to fill</div><div class="hscroll">${g.map(([f, r]) => `<button type="button" class="chip sm quick" data-a="goalfill" data-id="${f.id}" data-amt="${r}"><span style="color:${fundColor(f)}">${iconFor('fund', f)}</span> ${esc(f.name)} <b>${fmt0(r)}</b></button>`).join('')}</div>`;
  }
  let maxChip = '';
  if (v.mode !== 'in' && v.fund && v.account !== null) {
    const b = pairBal(svList(), v.fund, v.account || null);
    if (b > 0) maxChip = `<button type="button" class="chip xs" data-a="maxamt" data-amt="${b}">All ${fmt0(b)}</button>`;
  }
  h += amountBox(maxChip);
  const rows = [];
  if (v.mode === 'in') {
    const s = srcOf(v.src);
    rows.push(['Into', tokFund('fund', v.fund)], ['Kept in', tokAcct('acct', v.fund, v.account)], ['From', token('src', iconFor('src', s), s.name, budTag(s), s.budget ? cssv('--brand') : cssv('--c2'))]);
  } else if (v.mode === 'out') {
    const u = useOf(v.dest);
    rows.push(['From', tokFund('fund', v.fund)], ['Taken from', tokAcct('acct', v.fund, v.account)], ['For', token('use', iconFor('use', u), u.name, budTag(u), u.budget ? cssv('--brand') : cssv('--spent'))]);
  } else {
    rows.push(['From', tokFund('fund', v.fund)], ['', tokAcct('acct', v.fund, v.account)], ['To', tokFund('tofund', v.toFund)], ['', tokAcct('toacct', v.toFund, v.toAccount)]);
  }
  h += `<div class="card sent">${rows.map(([l, t]) => `<div class="srow"><span class="sl">${l}</span>${t}</div>`).join('')}</div>`;
  if (!solo()) h += `<div class="lbl">Who</div>${memberChips(F.member, 'fmem')}`;
  h += v.mode === 'out' && v.dest === 'direct' ? dateNote('e.g. tuition', 'What for?') : dateNote('optional');
  return h;
}
/* picker sheet for the sentence tokens */
function openPick(k) {
  const v = F.sv, list = svList();
  let body = '', title = '';
  if (k === 'fund' || k === 'tofund') {
    title = k === 'fund' ? (v.mode === 'in' ? 'Into which fund?' : 'From which fund?') : 'To which fund?';
    const sel = k === 'fund' ? v.fund : v.toFund;
    body = `<div class="ptiles">${active(S.savings.funds).map(f => `<button type="button" class="ptile" data-a="picked" data-k="${k}" data-v="${f.id}" aria-pressed="${f.id === sel}" style="--cc:${fundColor(f)}"><span class="e">${iconFor('fund', f)}</span><span class="n">${esc(f.name)}</span><small>${fmt0(fundBal(f.id, F.editing))}</small></button>`).join('')}
      <button type="button" class="ptile add" data-a="fundNew"><span class="e">${I('plus')}</span><span class="n">New fund</span></button></div>`;
  } else if (k === 'acct' || k === 'toacct') {
    const fid = k === 'acct' ? v.fund : v.toFund, sel = k === 'acct' ? v.account : v.toAccount;
    title = k === 'acct' ? (v.mode === 'in' ? 'Kept where?' : 'Taken from where?') : 'Moved to where?';
    const items = activeAccts().map(a => a.id);
    if (fid && pairBal(list, fid, null) > 0) items.push('');
    body = `<div class="list">${items.map(id => { const b = fid ? pairBal(list, fid, id || null) : 0;
      return `<button type="button" class="rowi" data-a="picked" data-k="${k}" data-v="${id}" aria-pressed="${sel === id}"><span class="ico" style="--ic:${id ? acctColor(id) : cssv('--muted')}">${acctIcon(id || null)}</span><span class="grow"><b>${esc(acctName(id || null))}</b></span>${b ? `<b class="amt">${fmt0(b)}</b>` : ''}${sel === id ? `<span class="pos">${I('check')}</span>` : ''}</button>`; }).join('')}</div>
      <button type="button" class="btn ghost full" data-a="acctNew" data-for="${k === 'acct' ? 'svacct' : 'svtoacct'}">${I('plus')} New account</button>`;
  } else {
    const isSrc = k === 'src', items = isSrc ? S.settings.savingsSources.filter(x => !x.archived || x.id === v.src) : S.settings.savingsUses.filter(x => !x.archived || x.id === v.dest);
    const sel = isSrc ? v.src : v.dest;
    title = isSrc ? 'Where did it come from?' : 'What is it for?';
    body = `<div class="list">${items.map(x => `<button type="button" class="rowi" data-a="picked" data-k="${k}" data-v="${x.id}"><span class="ico" style="--ic:${x.budget ? cssv('--brand') : cssv(isSrc ? '--c2' : '--spent')}">${iconFor(isSrc ? 'src' : 'use', x)}</span><span class="grow"><b>${esc(x.name)}</b><small>${isSrc ? srcHint(x) : useHint(x)}</small></span>${sel === x.id ? `<span class="pos">${I('check')}</span>` : ''}</button>`).join('')}</div>
      <button type="button" class="btn ghost full" data-a="srcNew" data-k="${isSrc ? 'src' : 'use'}">${I('plus')} New</button>`;
  }
  openSheet(`<div class="sh-h"><h2 class="grow">${title}</h2><button type="button" class="icbtn" data-a="sheetClose" aria-label="Close">${IC.close}</button></div>${body}`, 'pick');
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
  let undo;
  if (wasEditing) { const e = S.entries.find(x => x.id === wasEditing); if (e) { const prev = clone(e); Object.assign(e, data, { updated: Date.now() }); undo = () => { const x = S.entries.find(z => z.id === prev.id); if (x) Object.assign(x, prev); }; } }
  else { const ne = Object.assign({ id: uid(), created: Date.now() }, data); S.entries.push(ne); undo = () => { S.entries = S.entries.filter(z => z.id !== ne.id); }; }
  const p = S.prefs.lastByMember[F.member] = S.prefs.lastByMember[F.member] || { amt: {} };
  p.amt = p.amt || {};
  if (isExp) { p.cat = catId; p.method = F.method; } else { p.source = catId; p.methodIn = F.method; }
  p.amt[catId] = r.c; S.prefs.lastMember = F.member;
  save();
  const nm = isExp ? nameOf(st.categories, catId) : nameOf(st.incomeSources, catId);
  toast(`✓ ${fmt0(r.c)} · ${nm}${F.date > today() ? ' · future' : ''}`, false, undo);
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
  let undo;
  if (old) { const prev = clone(old); Object.assign(old, tx, { updated: Date.now() }); undo = () => { const x = S.savings.tx.find(z => z.id === prev.id); if (x) Object.assign(x, prev); }; }
  else { const nt = Object.assign({ id: uid(), created: Date.now() }, tx); S.savings.tx.push(nt); undo = () => { S.savings.tx = S.savings.tx.filter(z => z.id !== nt.id); }; }
  S.prefs.lastFund = tx.fund; S.prefs.lastAcct[tx.fund] = tx.account; if (F.member) S.prefs.lastMember = F.member;
  save();
  const L = txLabel(tx);
  toast(`✓ ${L.sign}${fmt0(r.c)} · ${L.title}`, false, undo);
  const wasEditing = F.editing;
  if (!wasEditing) { F.sv.account = null; F.sv.toAccount = null; }
  finishForm(wasEditing);
}
function txLabel(t) {
  const f = byId(S.savings.funds, t.fund);
  if (t.type === 'in') return { title: fundName(t.fund), sub: `${srcOf(t.src).name} → ${acctName(t.account)}`, sign: '+', cls: 'pos', f };
  if (t.type === 'out') return { title: fundName(t.fund), sub: `${useOf(t.dest).name} ← ${acctName(t.account)}`, sign: '−', cls: 'neg', f };
  const title = t.fund === t.toFund ? fundName(t.fund) : `${fundName(t.fund)} → ${fundName(t.toFund)}`;
  return { title, sub: `⇄ ${acctName(t.account)} → ${acctName(t.toAccount)}`, sign: '', cls: '', f };
}
async function deleteEntry(id) {
  const i = S.entries.findIndex(x => x.id === id); if (i < 0) return;
  const e = S.entries[i];
  S.entries.splice(i, 1); save(); toast(`Deleted ${entryName(e)} ${fmt0(e.amount)}`, false, () => { S.entries.splice(i, 0, e); });
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
  S.savings.tx = rest; save(); toast(`Deleted ${L.title} ${L.sign}${fmt0(t.amount)}`, false, () => { S.savings.tx.push(t); });
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
  return `<details class="fold" data-fold="${key}"${open ? ' open' : ''}><summary><span class="fi">${I(icon)}</span><span class="grow"><b>${title}</b>${meta ? `<small>${meta}</small>` : ''}</span>${badge ? `<span class="badge${warn ? ' warn' : ''}">${badge}</span>` : ''}${IC.chev}</summary><div class="fold-b">${body}</div></details>`;
}
const TIP_I = { good: 'check', warn: 'warn', info: 'info', wait: 'clock' };
const tipList = items => items.map(x => `<div class="tip"><span class="ti ${x.icon}">${I(TIP_I[x.icon] || 'info')}</span><p>${esc(x.text)}</p></div>`).join('');

/* =====================================================================
   BUDGET — overview
   ===================================================================== */
let CH = 'daily';
const charts = {};
function destroyCharts() { for (const k in charts) { try { charts[k].destroy(); } catch (_) {} delete charts[k]; } }
function monthMoney() {
  const st = S.settings, [ms, me] = mcRange(), cur = isCurMonth(), t = new Date();
  const es = S.entries.filter(e => e.date >= ms && e.date <= me), inB = es.filter(e => !e.offBudget);
  const exp = inB.filter(e => e.type === 'expense'), incs = inB.filter(e => e.type === 'income'), inc = sum(incs), spent = sum(exp);
  const fl = savingsFlow(ms, me), net = fl.toS - fl.fromS, carryOn = st.carryOver !== false, carry = carryInto(ms), rem = carry + inc - spent - net;
  const D = dim(MC.y, MC.m), el = cur ? t.getDate() : D, dLeft = cur ? D - t.getDate() : 0;
  const perDay = cur && rem > 0 ? Math.floor(rem / (dLeft + 1)) : 0;
  const avgDay = el ? spent / el : 0;
  const offExp = es.filter(e => e.offBudget && e.type === 'expense');
  const wk = ymd(addDays(t, -((t.getDay() + 6) % 7)));
  let status = 'ok';
  if (rem < 0) status = 'over'; else if (cur && el >= 3 && perDay < avgDay * 0.9) status = 'careful';
  return { ms, me, cur, es, exp, incs, inc, spent, net, carryOn, carry, rem, D, dLeft, perDay, avgDay, offExp, offSpent: sum(offExp),
    todayS: cur ? sum(exp.filter(e => e.date === today())) : 0, weekS: cur ? sum(exp.filter(e => e.date >= wk && e.date <= today())) : 0, status };
}
const STATUS = { ok: ['check', 'On track'], careful: ['warn', 'Careful'], over: ['over', 'Over budget'] };
function renderBudgetOverview() {
  const box = $('#screen-budget'), st = S.settings;
  if (!S.entries.length && !S.savings.tx.length) {
    box.innerHTML = `<div class="card empty"><div class="e">${I('receipt')}</div><b>Nothing logged yet</b><p>Your month shows up here.</p><button type="button" class="btn pri" data-a="go" data-to="add">＋ Log first expense</button></div>`; return;
  }
  const M = monthMoney(), [sIc, sWord] = STATUS[M.status];
  let h = '';
  /* hero: one answer, tap for how it's made */
  const bigLabel = M.rem < 0 ? 'Over by' : M.cur ? 'Safe to spend today' : 'Left at month end';
  const bigVal = M.rem < 0 ? -M.rem : M.cur ? M.perDay : M.rem;
  h += `<button type="button" class="card hero2 s-${M.status}" data-a="explain" aria-label="${sWord}. ${bigLabel} ${fmt0(bigVal)}. Tap for details.">
    <span class="status">${I(sIc)} ${M.cur ? sWord : M.rem < 0 ? 'Over budget' : 'Stayed within'}</span><span class="more">${I('info')}</span>
    <span class="k">${bigLabel}</span><span class="big">${fmt0(bigVal)}</span>
    ${M.cur && M.rem >= 0 ? `<span class="sub">${fmt0(M.rem)} left · ${plural(M.dLeft + 1, 'day')}</span>` : ''}
    ${sbar([[M.spent, cssv('--spent'), 'Spent'], [Math.max(0, M.net), cssv('--saved'), 'Saved'], [Math.max(0, M.rem), cssv('--green'), 'Left']])}
    <span class="keys"><span><i style="background:var(--spent)"></i>Spent</span><span><i style="background:var(--saved)"></i>Saved</span><span><i style="background:var(--green)"></i>Left</span></span>
  </button>`;
  /* month-end moment */
  const t = new Date();
  if (M.cur && t.getDate() <= 7 && M.carryOn && M.carry > 0 && S.prefs.meDone !== M.ms && active(S.savings.funds).length) {
    h += `<section class="card me"><div class="me-h">${I('calendar')} <span class="grow"><b>${prevMonthName(M.ms)} left ${fmt0(M.carry)}</b></span></div>
      <div class="row2e" style="margin:0"><button type="button" class="btn" data-a="meKeep">${I('carry')} Keep</button><button type="button" class="btn pri" data-a="meSave" data-amt="${M.carry}">${I('coins')} Save it</button></div></section>`;
  }
  /* bills */
  if (M.cur) {
    const bs = billStatus();
    if (bs.length) h += `<section class="card"><div class="card-h"><h2>Bills</h2></div>${bs.map(x => {
      const days = Math.round((parseYmd(x.due) - parseYmd(today())) / 864e5);
      const when = x.paid ? 'Paid' : x.overdue ? '<span class="neg">Overdue</span>' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
      return `<div class="rowi"><span class="ico" style="--ic:${catColorId(x.b.categoryId)}">${iconFor('cat', byId(st.categories, x.b.categoryId))}</span><span class="grow"><b>${esc(x.b.name)}</b><small>${when}</small></span><b class="amt">${fmt0(x.b.amount)}</b>${x.paid ? `<span class="pos">${I('check')}</span>` : `<button type="button" class="btn sm pri" data-a="paybill" data-id="${x.b.id}" data-for="${x.key}">Pay</button>`}</div>`;
    }).join('')}</section>`;
  }
  /* categories: ring = share of budget; text only when it matters */
  const spentBy = {}; for (const e of M.exp) spentBy[e.categoryId] = (spentBy[e.categoryId] || 0) + e.amount;
  const cats = st.categories.filter(c => !c.archived || spentBy[c.id]);
  const bTot = cats.reduce((a, c) => a + (c.budget || 0), 0), bSpent = cats.reduce((a, c) => a + (c.budget ? (spentBy[c.id] || 0) : 0), 0);
  h += `<section class="card"><div class="card-h"><h2>Categories</h2>${bTot ? `<small>${fmt0(bSpent)} / ${fmt0(bTot)}</small>` : ''}</div><div class="cgrid3">${cats.map(c => {
    const s = spentBy[c.id] || 0, b = c.budget || 0, p = b ? s / b : (M.spent ? s / M.spent : 0);
    const col = b ? (p > 1 ? cssv('--red') : p >= 0.8 ? cssv('--amber') : cssv('--green')) : catColor(c);
    const sub = b && s > b ? `<small class="neg">+${fmtC(s - b)}</small>` : b && p >= 0.8 ? `<small class="warnc">${fmtC(b - s)} left</small>` : '<small>&nbsp;</small>';
    return `<button type="button" class="ctile3${s ? '' : ' dim'}" data-a="catHist" data-id="${c.id}" aria-label="${esc(c.name)} ${fmt0(s)}${b ? ' of ' + fmt0(b) : ''}"><span class="ring" style="--p:${Math.min(100, Math.round(p * 100))};--c:${col}">${b && s > b ? '<i class="bang">!</i>' : ''}<span style="color:${catColor(c)}">${iconFor('cat', c)}</span></span><span class="n">${esc(c.name)}</span><b>${fmtC(s)}</b>${sub}</button>`;
  }).join('')}</div></section>`;
  /* trends & breakdown: folded */
  const parts = [!solo() ? splitBlock(I('users') + ' Who spent', groupSum(M.exp, e => e.member), k => nameOf(st.members, k, '?')) : '',
    splitBlock(I('card') + ' Paid with', groupSum(M.exp, e => e.method), k => nameOf(st.methods, k, 'Not set')),
    splitBlock(I('in') + ' Income from', groupSum(M.incs, e => e.source), k => nameOf(st.incomeSources, k, '?'), (k, i) => PAL(i + 2))].filter(Boolean);
  h += foldHtml('trends', 'trend', 'Trends', 'by day · who · paid with',
    `<div class="card-h" style="margin-top:2px"><span></span><div class="seg mini" role="group" aria-label="Chart">${[['daily', 'Daily'], ['cum', 'Running']].map(([k, l]) => `<button type="button" data-a="chMode" data-k="${k}" aria-pressed="${CH === k}">${l}</button>`).join('')}</div></div><div class="chartbox"><canvas id="trend" aria-label="Spending by day, this month and last month"></canvas></div><small id="trend-msg"></small>${parts.length ? '<div style="margin-top:14px">' + parts.join('') + '</div>' : ''}`);
  /* tips */
  if (M.cur) {
    const sg = suggestions(), items = sg.notEnough ? [] : sg.list, warnN = items.filter(x => x.kind === 'warn').length;
    const body = sg.notEnough ? tipList([{ icon: 'wait', text: `Tips start after 7 days of logging${sg.span ? ` (${sg.span} so far)` : ''}.` }])
      : items.length ? tipList(items.map(x => ({ icon: x.kind === 'good' ? 'good' : 'warn', text: x.text }))) : tipList([{ icon: 'good', text: 'All within budget.' }]);
    h += foldHtml('tips', 'bulb', 'Tips', '', body, false, sg.notEnough ? '' : String(items.length || '✓'), warnN > 0);
  }
  box.innerHTML = h;
  if (FOLD.trends) renderTrend();
}
function openExplain() {
  const M = monthMoney(), st = S.settings, rows = [];
  if (M.carryOn) rows.push([I('carry'), 'From ' + prevMonthName(M.ms), M.carry, M.carry < 0 ? cssv('--red') : cssv('--muted')]);
  rows.push([I('in'), 'Income', M.inc, cssv('--green')], [I('out'), 'Spent', -M.spent, cssv('--spent')], [I('coins'), 'Saved', -M.net, cssv('--saved')]);
  const max = Math.max(1, ...rows.map(r => Math.abs(r[2])), Math.abs(M.rem));
  const row = (ic, l, v, c, strong) => `<span class="wl">${ic} ${l}</span><span class="wb"><i style="width:${Math.round(Math.abs(v) / max * 100)}%;background:${c}"></i></span><span class="wv${strong ? ' big2' : ''}">${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt0(Math.abs(v))}</span>`;
  let h = `<div class="sh-h"><h2 class="grow">${MONTHS[MC.m]} ${MC.y}</h2><button type="button" class="icbtn" data-a="sheetClose" aria-label="Close">${IC.close}</button></div>
    <div class="card"><div class="wf">${rows.map(r => row(...r)).join('')}<hr>${row(I(M.rem < 0 ? 'over' : 'check'), M.rem < 0 ? 'Over' : 'Left', M.rem, M.rem < 0 ? cssv('--red') : cssv('--green'), true)}</div></div>`;
  if (M.cur) h += `<div class="pills" style="margin:0 0 10px"><span class="pill">Today <b>${fmt0(M.todayS)}</b></span><span class="pill">This week <b>${fmt0(M.weekS)}</b></span>${M.perDay ? `<span class="pill ok">Safe <b>${fmt0(M.perDay)}</b>/day</span>` : ''}</div>`;
  if (M.offSpent) h += `<div class="card"><div class="split-h"><span>${I('card')} Outside budget</span><b>${fmt0(M.offSpent)}</b></div><small>Not counted above · ${esc(groupSum(M.offExp, e => e.method).map(([k, v]) => nameOf(st.methods, k, '?') + ' ' + fmt0(v)).join(' · '))}</small></div>`;
  if (M.cur && M.rem > 0 && active(S.savings.funds).length) h += `<button type="button" class="btn ghost full" data-a="saveLeft" data-amt="${M.rem}">${I('coins')} Move leftover to savings</button>`;
  openSheet(h, 'explain');
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
    <select data-c="hcat" aria-label="Category">${opt('', 'All categories', H.cat)}${st.categories.map(c => opt('c:' + c.id, c.name, H.cat)).join('')}${st.incomeSources.map(c => opt('s:' + c.id, 'Income: ' + c.name, H.cat)).join('')}</select>
    ${solo() ? '' : `<select class="wide" data-c="hmem" aria-label="Person">${opt('', 'Everyone', H.member)}${st.members.map(m => opt(m.id, m.name, H.member)).join('')}</select>`}</div>
    <div class="sumline"><span>${plural(list.length, 'entry')} · ${MONTHS[MC.m]}</span><span><b class="neg">−${fmt0(outT)}</b> · <b class="pos">+${fmt0(inT)}</b></span></div>`;
  if (!list.length) h += `<div class="card empty" style="margin-top:8px"><div class="e">${I('list')}</div><p>Nothing here for ${MONTHS[MC.m]} ${MC.y}.</p></div>`;
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
    if (x.type === 'in' && x.src !== 'opening') { added += x.amount; if (srcIsBudget(x.src)) fromBudget += x.amount; }
    if (x.type === 'out') { out += x.amount; if (useIsBudget(x.dest)) toBudget += x.amount; }
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
  if (f.monthlyGoal > 0) { p = got / f.monthlyGoal; sub = got >= f.monthlyGoal ? '✓ goal met' : `${fmtC(f.monthlyGoal - got)} to go`; }
  else if (f.target > 0) { p = b / f.target; sub = `${Math.min(100, Math.round(p * 100))}% of ${fmtC(f.target)}`; }
  else if (got) sub = `${got > 0 ? '+' : ''}${fmtC(got)} this month`;
  const accts = fundAccts(f.id).filter(([, v]) => v > 0);
  return `<button type="button" class="ftile2" data-a="fundOpen" data-id="${f.id}"><span class="ring sm" style="--p:${Math.max(0, Math.min(100, Math.round(p * 100)))};--c:${fundColor(f)}"><span style="color:${fundColor(f)}">${iconFor('fund', f)}</span></span><span class="txt"><span class="n">${esc(f.name)}</span><b>${fmt0(b)}</b><small>${sub || '&nbsp;'}</small></span>${accts.length ? sbar(accts.map(([k, v]) => [v, acctColor(k), acctName(k)]), 'thin') : ''}</button>`;
}
function renderSavingsOverview() {
  const box = $('#screen-savings'), funds = active(S.savings.funds);
  if (!S.savings.funds.length) {
    box.innerHTML = `<div class="card empty"><div class="e">${I('coins')}</div><b>Start your first savings fund</b><p>One for each goal: Travel, Emergency, Tuition…</p><button type="button" class="btn pri" data-a="fundNew">＋ Create a fund</button></div>`; return;
  }
  const t = new Date(), [ms, me] = monthRange(t.getFullYear(), t.getMonth()), total = savTotal(), goal = S.settings.savingsGoal;
  const six = lastMonths(6).map(monthStats), cur = six[six.length - 1];
  const avgNet = Math.round(six.reduce((a, m) => a + m.net, 0) / six.length);
  const spend = avgMonthlySpend(), cover = spend && spend.avg ? total / spend.avg : null;
  const fl = savingsFlow(ms, me), gnet = fl.toS - fl.fromS, gp = goal > 0 ? Math.max(0, Math.min(100, Math.round(gnet / goal * 100))) : 0;
  let h = `<section class="card hero"><div class="hero-top"><div class="grow"><div class="k">Total savings</div><div class="big">${fmt0(total)}</div><span class="sub ${cur.net < 0 ? 'neg' : 'pos'}">${cur.net >= 0 ? '▲' : '▼'} ${fmt0(Math.abs(cur.net))} this month</span></div>${cover !== null ? `<div class="bnum"><b>${cover >= 10 ? Math.round(cover) : cover.toFixed(1)}</b><span>months covered</span></div>` : ''}</div>
    ${sbar(funds.map(f => [fundBal(f.id), fundColor(f), f.name]))}
    ${goal > 0 ? `<div class="split" style="margin-top:10px"><div class="split-h"><span>${I('target')} From budget this month</span><b>${fmt0(gnet)} / ${fmt0(goal)}</b></div><div class="bar"><i style="width:${gp}%"></i></div></div>` : ''}</section>`;
  h += `<section class="card"><div class="card-h"><h2>Funds</h2><button type="button" class="tbtn" data-a="fundNew">＋ New</button></div><div class="fgrid">${funds.map(f => fundTile(f, ms, me)).join('')}</div></section>`;
  const at = acctTotals();
  if (at.length) h += `<section class="card"><div class="card-h"><h2>Where it’s kept</h2><small>match your bank app</small></div>${at.map(([k, r]) =>
    `<div class="rowi"><span class="ico" style="--ic:${acctColor(k)}">${acctIcon(k)}</span><span class="grow"><b>${esc(acctName(k))}</b><small>${r.funds.filter(([, v]) => v).map(([f, v]) => iconFor('fund', f) + ' ' + fmtC(v)).join('  ·  ')}</small></span><b class="amt">${fmt0(r.bal)}</b></div>`).join('')}</section>`;
  const stats = sdMonths().map(monthStats), pName = { '6m': 'last 6 months', '12m': 'last 12 months', all: 'all time' }[SD.period];
  let tr = `<div class="mini4 c3" style="margin-bottom:12px">${tile('This month', cur.net, { sign: true, cls: cur.net < 0 ? 'neg' : 'pos' })}${tile('Avg / month', avgNet, { cls: avgNet < 0 ? 'neg' : '' })}${tile('Funds', 0, { raw: funds.length })}</div><div class="card-h"><h2>Over time</h2><div class="seg mini" role="group" aria-label="Chart">${[['bal', 'Balance'], ['flow', 'In & out']].map(([k, l]) => `<button type="button" data-a="svCh" data-k="${k}" aria-pressed="${SD.mode === k}">${l}</button>`).join('')}</div></div>
    <div class="chartbox"><canvas id="svchart" aria-label="Savings over time"></canvas></div><small id="sv-msg"></small>
    <div class="rowsplit"><div class="hscroll">${[['6m', '6 months'], ['12m', '12 months'], ['all', 'All']].map(([k, l]) => `<button type="button" class="chip xs" data-a="svPer" data-k="${k}" aria-pressed="${SD.period === k}">${l}</button>`).join('')}</div></div>
    <details class="tblfold" data-fold="svtbl"${FOLD.svtbl ? ' open' : ''}><summary>Show as table</summary><table class="tbl"><thead><tr><th>Month</th><th>In</th><th>Out</th><th>Balance</th></tr></thead><tbody>${stats.slice().reverse().map(m => `<tr><td>${m.label} ${String(m.d.getFullYear()).slice(2)}</td><td class="pos">${fmt0(m.added)}</td><td class="${m.out ? 'neg' : ''}">${fmt0(m.out)}</td><td><b>${fmt0(m.end)}</b></td></tr>`).join('')}</tbody></table></details>`;
  const pStart = stats[0].a, inP = S.savings.tx.filter(x => x.date >= pStart && x.date <= me);
  const srcP = groupSum(inP.filter(x => x.type === 'in' && x.src !== 'opening'), x => x.src);
  const dstP = groupSum(inP.filter(x => x.type === 'out'), x => x.dest);
  const uses = groupSum(inP.filter(x => x.type === 'out' && x.dest === 'direct'), x => (x.note || 'No note').trim().toLowerCase()).slice(0, 5);
  const blocks = [splitBlock(I('in') + ' Came from', srcP, k => srcOf(k).name, (k, i) => k === 'budget' ? cssv('--brand') : PAL(i + 1)),
    splitBlock(I('out') + ' Went to', dstP, k => useOf(k).name, (k, i) => k === 'budget' ? cssv('--brand') : k === 'direct' ? cssv('--spent') : PAL(i + 4)),
    uses.length ? splitBlock(I('receipt') + ' Paid directly for', uses, k => k.charAt(0).toUpperCase() + k.slice(1), (k, i) => PAL(i + 1)) : '',
    !solo() ? splitBlock(I('users') + ' Added by', groupSum(inP.filter(x => x.type === 'in' && x.src !== 'opening'), x => x.member), k => nameOf(S.settings.members, k, '?')) : ''].filter(Boolean);
  if (blocks.length) tr += `<div class="card-h" style="margin-top:16px"><h2>In & out</h2><small>${pName}</small></div>${blocks.join('')}`;
  const gFunds = funds.filter(f => f.monthlyGoal > 0);
  if (goal > 0 || gFunds.length) {
    const firstTx = S.savings.tx.reduce((a, x) => x.date < a ? x.date : a, '9999');
    const fStart = fid => S.savings.tx.filter(x => x.fund === fid || x.toFund === fid).reduce((a, x) => x.date < a ? x.date : a, '9999');
    const cell = (m, val, g, start) => m.b < start ? '<span class="gc">–</span>' : val >= g ? '<span class="gc ok">✓</span>' : m.key === cur.key ? '<span class="gc now">◔</span>' : '<span class="gc miss">✗</span>';
    let rows = '';
    if (goal > 0) rows += `<span class="gname">${I('home')} From budget</span>${six.map(m => cell(m, m.budgetNet, goal, firstTx)).join('')}`;
    for (const f of gFunds) { const st0 = fStart(f.id); rows += `<span class="gname">${iconFor('fund', f)} ${esc(f.name)}</span>${six.map(m => cell(m, fundNet(f.id, m.a, m.b), f.monthlyGoal, st0)).join('')}`; }
    tr += `<div class="card-h" style="margin-top:16px"><h2>Monthly goals</h2><small>✓ met · ✗ missed · ◔ now</small></div><div class="ggrid"><span></span>${six.map(m => `<span class="gm">${m.label}</span>`).join('')}${rows}</div>`;
  }
  h += foldHtml('svtrend', 'trend', 'Trends', 'over time · in & out · goals', tr);
  const ins = svInsights(six, cur, total, cover, spend);
  const warnN = ins.filter(i => i.k === 'warn').length;
  h += foldHtml('svins', 'bulb', 'Insights', warnN ? `${plural(warnN, 'thing')} to watch` : 'how your savings are doing',
    tipList(ins.map(i => ({ icon: i.k === 'good' ? 'good' : i.k === 'warn' ? 'warn' : 'info', text: i.t }))), false, String(ins.length), warnN > 0);
  box.innerHTML = h;
  if (FOLD.svtrend) renderSvChart(stats);
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
      if (b >= f.target) ins.push({ k: 'good', t: `${f.name} reached its ${fmt0(f.target)} target.` });
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
  if (screen === 'budget' && SUB.budget === 'overview' && FOLD.trends) { destroyCharts(); renderTrend(); }
  else if (screen === 'savings' && SUB.savings === 'overview' && FOLD.svtrend) { destroyCharts(); renderSvChart(sdMonths().map(monthStats)); }
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
  let h = `<div class="filters" style="grid-template-columns:1fr 1fr"><select data-c="shfund" aria-label="Fund">${opt('', 'All funds', SH.fund)}${S.savings.funds.map(f => opt(f.id, f.name, SH.fund)).join('')}</select>
    <select data-c="shacct" aria-label="Account">${opt('', 'All accounts', SH.acct)}${S.settings.savingsAccounts.map(a => opt(a.id, a.name, SH.acct)).join('')}${hasNull ? opt('-', 'Not set', SH.acct) : ''}</select></div>
    <div class="sumline"><span>${plural(list.length, 'record')}</span><span><b class="pos">+${fmt0(inT)}</b> · <b class="neg">−${fmt0(outT)}</b></span></div>`;
  if (!list.length) h += `<div class="card empty" style="margin-top:8px"><div class="e">${I('coins')}</div><p>No savings records yet.</p><button type="button" class="btn pri" data-a="newSv">＋ Add savings</button></div>`;
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
  h += `<div class="card"><div class="k">Balance</div><div class="big">${fmt0(b)}</div>${accts.some(a => a[1] > 0) ? sbar(accts.filter(a => a[1] > 0).map(([k, v]) => [v, acctColor(k), acctName(k)])) : ''}${accts.map(([k, v]) => `<div class="arow"><span><i style="background:${acctColor(k)}"></i>${acctIcon(k)} ${esc(acctName(k))}</span><b>${fmt0(v)}</b></div>`).join('')}</div>`;
  if (f.monthlyGoal > 0) {
    const rest = f.monthlyGoal - got, p = Math.max(0, Math.min(100, Math.round(got / f.monthlyGoal * 100)));
    h += `<div class="card"><div class="split-h"><span>${I('target')} This month</span><b>${fmt0(Math.max(0, got))} / ${fmt0(f.monthlyGoal)}</b></div><div class="bar"><i style="width:${p}%;background:${fundColor(f)}"></i></div>${rest > 0 ? `<button type="button" class="btn ghost sm full" data-a="fundAct" data-k="in" data-id="${fid}" data-amt="${rest}">＋ Add the remaining ${fmt0(rest)}</button>` : '<small class="pos">✓ Goal met this month</small>'}</div>`;
  }
  if (f.target > 0) {
    const p = Math.max(0, Math.min(100, Math.round(b / f.target * 100)));
    let need = '';
    if (f.targetDate && b < f.target) {
      const td = parseYmd(f.targetDate), months = (td.getFullYear() - t.getFullYear()) * 12 + td.getMonth() - t.getMonth();
      need = f.targetDate < today() ? ' · date passed' : months > 0 ? ` · ${fmt0(Math.ceil((f.target - b) / months))}/month to make it` : '';
    }
    h += `<div class="card"><div class="split-h"><span>${I('flag')} Target ${fmt0(f.target)}${f.targetDate ? ' · ' + MONTHS[parseYmd(f.targetDate).getMonth()] + ' ' + f.targetDate.slice(0, 4) : ''}</span><b>${p}%</b></div><div class="bar"><i style="width:${p}%;background:${fundColor(f)}"></i></div><small>${b >= f.target ? 'Reached!' : fmt0(f.target - b) + ' to go' + need}</small></div>`;
  }
  const canMove = active(S.savings.funds).length > 1 || activeAccts().length > 1;
  h += `<div class="btn3"><button type="button" class="btn pri" data-a="fundAct" data-k="in" data-id="${fid}">＋ Add</button><button type="button" class="btn" data-a="fundAct" data-k="out" data-id="${fid}"${b > 0 ? '' : ' disabled'}>− Take out</button><button type="button" class="btn" data-a="fundAct" data-k="move" data-id="${fid}"${b > 0 && canMove ? '' : ' disabled'}>⇄ Move</button></div>`;
  const recent = S.savings.tx.filter(x => x.fund === fid || x.toFund === fid).sort((a, c) => c.date.localeCompare(a.date) || (c.created || 0) - (a.created || 0));
  if (recent.length) h += `<div class="lbl"><span>Recent</span>${recent.length > 5 ? `<button type="button" class="tbtn" data-a="fundHist" data-id="${fid}">See all ${recent.length}</button>` : ''}</div><div class="list">${recent.slice(0, 5).map(x => svRow(x)).join('')}</div>`;
  openSheet(h, 'fund');
}
function openFundEdit(fid) {
  const f = fid ? byId(S.savings.funds, fid) : null;
  FF = { id: fid || null, name: f ? f.name : '', note: f && f.note || '', icon: f ? (f.icon ? iconKey('fund', f) : '') : '', color: f ? fundColor(f) : PAL(S.savings.funds.length),
    target: f && f.target ? String(f.target / 100) : '', date: f && f.targetDate || '', monthly: f && f.monthlyGoal ? String(f.monthlyGoal / 100) : '',
    open: '', openAcct: (activeAccts()[0] || {}).id || null };
  renderFundEdit();
}
function renderFundEdit() {
  const f = FF.id ? byId(S.savings.funds, FF.id) : null, ic = FF.icon || iconKey('fund', { name: FF.name });
  let h = `<div class="sh-h"><span class="ico lg" style="--ic:${FF.color}">${I(ic)}</span><h2 class="grow">${f ? 'Edit fund' : 'New fund'}</h2><button type="button" class="icbtn" data-a="sheetClose" aria-label="Close">${IC.close}</button></div>
    <label class="fld"><span>Name</span><input data-i="ff" data-k="name" maxlength="40" autocomplete="off" value="${esc(FF.name)}" placeholder="e.g. Travel fund"></label>
    <div class="lbl">Icon</div><div class="hscroll">${[ic].concat(PICK.filter(k => k !== ic)).map(e => `<button type="button" class="chip emo" data-a="ffIcon" data-e="${e}" aria-pressed="${e === ic}" aria-label="${e}" style="color:${FF.color}">${I(e)}</button>`).join('')}</div>
    <label class="fld" style="margin-top:10px"><span>Description</span><textarea data-i="ff" data-k="note" rows="2" maxlength="300" placeholder="e.g. Bohol trip, Dec 2027 — airfare + hotel for 5">${esc(FF.note)}</textarea></label>
    <div class="row2e"><label class="fld"><span>Target ₱</span><input data-i="ff" data-k="target" inputmode="decimal" autocomplete="off" value="${esc(FF.target)}" placeholder="optional"></label><label class="fld"><span>By date</span><input type="date" data-i="ff" data-k="date" value="${esc(FF.date)}"></label></div>
    <div class="row2e"><label class="fld"><span>Monthly goal ₱</span><input id="ff-monthly" data-i="ff" data-k="monthly" inputmode="decimal" autocomplete="off" value="${esc(FF.monthly)}" placeholder="optional"></label><div class="fld"><span>&nbsp;</span><button type="button" class="btn ghost" data-a="ffCalc">From target</button></div></div>`;
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
  openSheet(`<div class="sh-h"><h2 class="grow">Pick an icon</h2><button type="button" class="icbtn" data-a="sheetClose" aria-label="Close">${IC.close}</button></div><div class="emojis">${PICK.map(e => `<button type="button" data-a="pickEmoji" data-e="${e}" aria-pressed="${e === current}" aria-label="${e}">${I(e)}</button>`).join('')}</div><button type="button" class="btn full" data-a="pickEmoji" data-e="">Use automatic icon</button>`, 'emoji');
}
let SRCK = null;
function openSrcSheet(kind) {
  SRCK = kind;
  const isSrc = kind === 'src';
  const presets = isSrc ? ['Business profit', 'Gift from family', 'Sold an item', '13th month pay', 'Bonus'] : ['Sadaqah / charity', 'Gift to family', 'Lent to someone', 'Hajj / Umrah'];
  openSheet(`<div class="sh-h"><span class="ico lg">${I(isSrc ? 'in' : 'out')}</span><h2 class="grow">${isSrc ? 'New “came from”' : 'New “goes to”'}</h2><button type="button" class="icbtn" data-a="sheetClose" aria-label="Close">${IC.close}</button></div>
    <label class="fld"><span>Name</span><input id="src-name" maxlength="40" autocomplete="off" placeholder="${isSrc ? 'e.g. Business profit' : 'e.g. Sadaqah / charity'}"></label>
    <div class="hscroll" style="margin-top:8px">${presets.map(n => `<button type="button" class="chip sm" data-a="srcPreset" data-n="${n}">${n}</button>`).join('')}</div>
    <button type="button" class="switchrow" id="src-bud" data-a="srcBud" aria-pressed="false"><span class="sw"></span><span class="grow"><b>${isSrc ? 'Taken from family budget' : 'Goes back to family budget'}</b><small>${isSrc ? 'On: lowers this month’s money left and counts toward the goal' : 'On: adds back to this month’s money left'}</small></span></button>
    <div class="err" id="srcerr" role="alert"></div><div class="savebar"><button type="button" class="btn pri big" data-a="srcSave">Add</button></div>`, 'src');
  setTimeout(() => { const i = $('#src-name'); if (i) i.focus(); }, 50);
}
function openAcctSheet(forAct) {
  ACCT_FOR = forAct;
  openSheet(`<div class="sh-h"><span class="ico lg">${I('bank')}</span><h2 class="grow">New account</h2><button type="button" class="icbtn" data-a="sheetClose" aria-label="Close">${IC.close}</button></div>
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
  members: ['users', 'Who spends the money', 'Me, Husband, the kids… With 2+ names the Add screen asks “Who spent it”.', 'New person'],
  categories: ['tag', 'Categories & budgets', 'Monthly budget in ₱ · 0 = no budget · tap the icon to change it', 'New category'],
  methods: ['card', 'Payment methods', 'Tick “Outside” for credit card or separate money', 'New method'],
  incomeSources: ['briefcase', 'Income sources', 'Tick “Outside” for money that isn’t family income', 'New source'],
  bills: ['receipt', 'Monthly bills', 'Shows as unpaid each month until you log it', 'New bill'],
  savingsAccounts: ['bank', 'Savings accounts', 'Banks, e-wallets, cash — where savings are kept', 'New account'],
  savingsSources: ['in', 'Savings: came from', 'Tick “Budget” if it comes out of this month’s family money', 'New source'],
  savingsUses: ['out', 'Savings: goes to', 'Tick “Budget” if it goes back into this month’s family money', 'New use']
};
const KIND = { categories: 'cat', incomeSources: 'inc', methods: 'method', savingsAccounts: 'acct', savingsSources: 'src', savingsUses: 'use' };
function edRow(key, it) {
  const st = ED(), nm = esc(it.name);
  const name = `<input class="f-name" data-c="ed" data-f="name" value="${nm}" maxlength="40" autocomplete="off" aria-label="Name">`;
  const icon = KIND[key] ? `<button type="button" class="ebtn" data-a="pickIcon" data-key="${key}" data-id="${it.id}" aria-label="Icon for ${nm}">${iconFor(KIND[key], it)}</button>` : '';
  const x = it.locked ? '<span class="h-x"></span>' : `<button type="button" class="x" data-a="edDel" data-key="${key}" data-id="${it.id}" aria-label="Remove ${nm}">✕</button>`;
  let mid = '', wrap = '';
  if (key === 'categories') mid = `<input class="f-money" data-c="ed" data-f="budget" inputmode="decimal" value="${moneyField(it.budget)}" aria-label="Monthly budget for ${nm}"><input class="f-color" type="color" data-c="ed" data-f="color" value="${catColor(it)}" aria-label="Color for ${nm}">`;
  if (key === 'bills') {
    mid = `<input class="f-money" data-c="ed" data-f="amount" inputmode="decimal" value="${moneyField(it.amount)}" aria-label="Amount"><input class="f-day" data-c="ed" data-f="day" inputmode="numeric" value="${it.day}" aria-label="Due day">`;
    wrap = `<select class="f-cat" data-c="ed" data-f="categoryId" aria-label="Category">${active(st.categories).map(c => `<option value="${c.id}"${c.id === it.categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
  }
  if (key === 'savingsSources' || key === 'savingsUses') mid = it.locked ? '<span class="togg">Budget ✓</span>' : `<label class="togg"><input type="checkbox" data-c="ed" data-f="fromBudget"${it.budget ? ' checked' : ''}>Budget</label>`;
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
  let h = ['categories', 'members', 'methods', 'bills'].map(k => sectionFold(k, false)).join('');
  let m = foldHtml('set-look', 'palette', 'Appearance', { auto: 'Auto (follows phone)', light: 'Light', dark: 'Dark' }[th],
    `<div class="seg" role="group" aria-label="Theme">${[['auto', I('phone') + ' Auto'], ['light', I('sun') + ' Light'], ['dark', I('moon') + ' Dark']].map(([v, l]) => `<button type="button" data-a="theme" data-k="${v}" aria-pressed="${th === v}">${l}</button>`).join('')}</div>`);
  m += ['incomeSources', 'savingsAccounts', 'savingsSources', 'savingsUses'].map(k => sectionFold(k, false)).join('');
  const fg = S.savings.funds.filter(f => !f.archived).reduce((a, f) => a + (f.monthlyGoal || 0), 0);
  m += foldHtml('set-money', 'scale', 'Money rules', `${st.carryOver !== false ? 'Carry over on' : 'Each month starts at ₱0'} · goal ${fmt0(st.savingsGoal)}`,
    `<div class="lbl" style="margin-top:0">Money left at month end</div><div class="seg" role="group">${[['on', I('carry') + ' Carry to next month'], ['off', 'Start at ₱0']].map(([k, l]) => `<button type="button" data-a="carry" data-k="${k}" aria-pressed="${(st.carryOver !== false) === (k === 'on')}">${l}</button>`).join('')}</div>
    <p class="hint">Overspending carries too — next month starts short.</p>
    <div class="row2e">${st.carryOver !== false ? `<label class="fld"><span>Cash on hand at start ₱</span><input data-c="opening" inputmode="decimal" value="${moneyField(st.openingBalance || 0)}"></label>` : ''}<label class="fld"><span>Monthly savings goal ₱</span><input data-c="goal" inputmode="decimal" value="${moneyField(st.savingsGoal)}"></label></div>
    ${fg ? `<p class="hint">Fund goals add up to ${fmt0(fg)}.</p>` : ''}`);
  m += foldHtml('set-sync', 'cloud', 'Google Sheets sync', SY.url ? syncStatusText() : 'Not connected', `<div id="sync-body">${syncBody()}</div>`);
  m += foldHtml('set-install', 'install', 'Install as app', isStandalone() ? 'Installed' : 'Home-screen icon · works offline', `<div id="install-body">${installBody()}</div>`);
  const n = S.entries.length;
  m += foldHtml('set-data', 'save', 'Backup & data', `${plural(n, 'entry')} · ${plural(S.savings.tx.length, 'savings record')}`,
    `<p class="hint" style="margin:0 0 8px">${I('warn')} Data lives on this phone. Clearing browser data erases it — keep sync on or export backups.</p>
    <div class="datatools"><button type="button" class="btn pri" data-a="expJson">${I('download')} Export backup (JSON)</button><button type="button" class="btn" data-a="impReplace">${I('upload')} Restore backup (replaces)</button><button type="button" class="btn" data-a="impMerge">${I('plus')} Add entries from another phone</button>
    <div class="row2e" style="margin:0"><button type="button" class="btn sm" data-a="expCsv">${I('file')} Entries CSV</button><button type="button" class="btn sm" data-a="expSvCsv">${I('file')} Savings CSV</button></div>
    <button type="button" class="btn danger" data-a="wipe">Erase everything on this phone</button></div>`);
  h += foldHtml('set-more', 'list', 'More settings', 'look · savings lists · sync · backup', m);
  h += `<p class="ver">Family Budget v${VERSION}</p>`;
  $('#screen-settings').innerHTML = h;
}
function renderSetup() {
  $('#screen-setup').innerHTML = `<div class="card intro"><span class="e">${I('home')}</span><div><b>Let’s set up your budget</b><p class="hint" style="margin:2px 0 0">Check these lists. You can change them anytime in Settings.</p></div></div>
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
  return S.savings.tx.some(t => t.account === id || t.toAccount === id || t.src === id || t.dest === id) || S.entries.some(e => e.member === id || e.categoryId === id || e.source === id || e.method === id || e.billId === id) ||
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
  else if (f === 'fromBudget') it.budget = inp.checked;
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
    t.type === 'in' ? srcOf(t.src).name : t.type === 'out' ? useOf(t.dest).name : '', acctName(t.account), t.type === 'move' ? acctName(t.toAccount) : '', t.note || ''].concat(people ? [nameOf(st.members, t.member, '')] : []));
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
  if (syncing) return 'Syncing…';
  const when = SY.last ? new Date(SY.last).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  if (SY.pending && !navigator.onLine) return 'Offline — saved on phone, syncs when online';
  if (SY.pending && SY.error) return 'Not synced — ' + SY.error;
  if (SY.pending) return 'Waiting to sync…';
  return 'Synced' + (when ? ' · ' + when : '');
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
  if (isStandalone()) return '<p>Installed. Opens from the home screen and works without internet.</p>';
  if (location.protocol === 'file:') return '<p class="hint">Opened as a file. Put the app online first (see the guide), then open that link on the phone.</p>';
  if (installPrompt) return '<button type="button" class="btn pri full" data-a="doInstall" style="margin-top:0">' + I('install') + ' Install app</button>';
  return isIOS() ? '<p class="hint" style="margin:0">In <b>Safari</b>: tap <b>Share</b> (square with arrow) → <b>Add to Home Screen</b> → <b>Add</b>. Install it this way so iPhone keeps the data.</p>'
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
  const mm = mapList('members'), mc = mapList('categories'), mt = mapList('methods'), msrc = mapList('incomeSources'), mb = mapList('bills'), ma = mapList('savingsAccounts'), mss = mapList('savingsSources'), msu = mapList('savingsUses');
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
      account: t.account ? (ma[t.account] || t.account) : null, toAccount: t.toAccount ? (ma[t.toAccount] || t.toAccount) : null,
      src: t.src ? (mss[t.src] || t.src) : null, dest: t.dest ? (msu[t.dest] || t.dest) : null }));
    nt++;
  }
  save();
  return { e: newE.length, s: nt };
}

/* =====================================================================
   TAP HANDLERS
   ===================================================================== */
const A = {
  undo: () => { if (!UNDO) return; const f = UNDO; UNDO = null; f(); save(); toast('Undone'); render(); if (sheetKind === 'fund' && sheetFund) openFundSheet(sheetFund); },
  explain: () => openExplain(),
  meKeep: () => { S.prefs.meDone = monthMoney().ms; save(); render(); },
  meSave: el => { S.prefs.meDone = monthMoney().ms; save(); F = newForm('savings'); F.sv.src = 'budget'; F.amount = String(Number(el.dataset.amt) / 100); go('add'); },
  usual: el => {
    const u = USUALS[+el.dataset.i]; if (!u) return;
    const ne = { id: uid(), created: Date.now(), type: 'expense', amount: u.amount, date: today(), member: isActive(S.settings.members, u.member) ? u.member : defaultMember(), categoryId: u.cat, source: null,
      method: isActive(S.settings.methods, u.method) ? u.method : (active(S.settings.methods)[0] || {}).id || null, note: u.note, billId: null, billFor: null, offBudget: false };
    S.entries.push(ne); save(); renderAdd();
    toast(`✓ ${fmt0(u.amount)} · ${u.note || nameOf(S.settings.categories, u.cat)}`, false, () => { S.entries = S.entries.filter(z => z.id !== ne.id); });
  },
  pick: el => openPick(el.dataset.k),
  picked: el => {
    const v = F.sv, k = el.dataset.k, val = el.dataset.v;
    if (k === 'fund') { v.fund = val; v.account = defaultAcct(val, v.mode); if (v.mode === 'move') v.toAccount = null; }
    else if (k === 'tofund') { v.toFund = val; v.toAccount = null; }
    else if (k === 'acct') { v.account = val; if (v.mode === 'move' && v.toFund === v.fund && akey(v.toAccount) === akey(v.account)) v.toAccount = null; }
    else if (k === 'toacct') v.toAccount = val;
    else if (k === 'src') v.src = val;
    else if (k === 'use') v.dest = val;
    closeSheet(); renderAdd();
  },
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
  saveLeft: el => { if (sheetOpen) closeSheet(); F = newForm('savings'); F.sv.src = 'budget'; F.amount = String(Number(el.dataset.amt) / 100); go('add'); },
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
  srcNew: el => openSrcSheet(el.dataset.k),
  srcPreset: el => { const i = $('#src-name'); if (i) i.value = el.dataset.n; const b = $('#src-bud'); if (b && SRCK === 'src') b.setAttribute('aria-pressed', 'false'); },
  srcBud: el => el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'),
  srcSave: () => {
    const name = ($('#src-name').value || '').trim(), isSrc = SRCK === 'src', list = isSrc ? S.settings.savingsSources : S.settings.savingsUses;
    if (!name) { $('#srcerr').textContent = 'Type a name.'; return; }
    let it = list.find(x => x.name.trim().toLowerCase() === name.toLowerCase());
    if (!it) { it = { id: uid(), name, budget: $('#src-bud').getAttribute('aria-pressed') === 'true' }; list.push(it); } else it.archived = false;
    save(); toast(`${name} added`);
    if (isSrc) F.sv.src = it.id; else F.sv.dest = it.id;
    closeSheet(); renderAdd();
  },
  acctPreset: el => { const i = $('#acct-name'); if (i) i.value = el.dataset.n; },
  acctSave: () => {
    const name = ($('#acct-name').value || '').trim(), errEl = $('#acerr');
    if (!name) { errEl.textContent = 'Type a name.'; return; }
    let a = S.settings.savingsAccounts.find(x => x.name.trim().toLowerCase() === name.toLowerCase());
    if (!a) { a = { id: uid(), name }; S.settings.savingsAccounts.push(a); } else a.archived = false;
    save(); toast(`${name} added`);
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
  pickIcon: el => { const it = byId(ED()[el.dataset.key], el.dataset.id); openEmojiSheet({ key: el.dataset.key, id: el.dataset.id }, it ? iconKey(KIND[el.dataset.key], it) : ''); },
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
      t.type === 'in' ? srcOf(t.src).name : t.type === 'out' ? useOf(t.dest).name : '', acctName(t.account), t.type === 'move' ? acctName(t.toAccount) : '', nameOf(S.settings.members, t.member, ''), t.note || '']);
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
document.addEventListener('toggle', e => {
  const d = e.target; if (!d || !d.dataset || !d.dataset.fold) return;
  FOLD[d.dataset.fold] = d.open;
  if (d.open && d.dataset.fold === 'trends') { destroyCharts(); renderTrend(); }
  if (d.open && d.dataset.fold === 'svtrend') { destroyCharts(); renderSvChart(sdMonths().map(monthStats)); }
}, true);
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
