'use strict';

/* ================= 存储层 ================= */

const LS_KEY = 'jz.records.v1';
const CATS = ['餐饮', '交通', '购物', '娱乐', '日用', '其他'];

let records = loadRecords();

function loadRecords() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(r =>
      r && typeof r === 'object' &&
      Number.isFinite(r.cents) && r.cents > 0 &&
      Number.isFinite(r.ts)
    );
  } catch (e) {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(LS_KEY, JSON.stringify(records));
}

function genId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

/* ================= 金额工具 ================= */

// "12.5" -> 1250（分）。仅接受数字与一个小数点，超出两位小数截断。
function parseAmountToCents(str) {
  const clean = String(str).replace(/[^\d.]/g, '');
  if (!clean) return 0;
  const [i, d = ''] = clean.split('.');
  const int = parseInt(i || '0', 10) || 0;
  const dec = parseInt((d + '00').slice(0, 2), 10) || 0;
  return int * 100 + dec;
}

// 1250 -> "¥12.5"；整数金额不带小数
function fmtMoney(cents) {
  const int = Math.floor(cents / 100);
  const dec = cents % 100;
  let s = int.toLocaleString('zh-CN');
  if (dec !== 0) s += '.' + (dec % 10 === 0 ? String(dec / 10) : String(dec).padStart(2, '0'));
  return '¥' + s;
}

// 图表标签用：取整到元
function fmtYuan(cents) {
  return Math.round(cents / 100).toLocaleString('zh-CN');
}

/* ================= 日期工具 ================= */

const DAY_MS = 86400000;

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 周一为一周开始
function startOfWeek(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d.getTime();
}

function startOfMonth(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

// n 天前的 0 点
function daysAgoStart(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.getTime();
}

function sumRange(from, to) {
  let sum = 0, count = 0;
  for (const r of records) {
    if (r.ts >= from && r.ts < to) { sum += r.cents; count++; }
  }
  return { sum, count };
}

function dayLabel(dayStart) {
  const today = startOfDay(Date.now());
  if (dayStart === today) return '今天';
  if (dayStart === daysAgoStart(1)) return '昨天';
  const d = new Date(dayStart);
  const wd = '周' + '日一二三四五六'[d.getDay()];
  const md = (d.getMonth() + 1) + '月' + d.getDate() + '日';
  const y = d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '年' : '';
  return y + md + ' ' + wd;
}

function timeLabel(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* ================= DOM 工具 ================= */

const $ = s => document.querySelector(s);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

/* ================= 记账页 ================= */

let amountStr = '';

function displayAmount() {
  if (!amountStr) return '0';
  const [i, d] = amountStr.split('.');
  const grouped = (parseInt(i || '0', 10) || 0).toLocaleString('zh-CN');
  return d === undefined ? grouped : grouped + '.' + d;
}

function renderAmount() {
  const node = $('#amount-str');
  const s = displayAmount();
  node.textContent = s;
  node.classList.toggle('dim', !amountStr);
  node.classList.remove('mid', 'long');
  if (s.length > 11) node.classList.add('long');
  else if (s.length > 8) node.classList.add('mid');
}

function pressKey(k) {
  if (k === 'del') {
    amountStr = amountStr.slice(0, -1);
  } else if (k === '.') {
    if (!amountStr.includes('.')) amountStr = (amountStr || '0') + '.';
  } else {
    if (amountStr.includes('.')) {
      if (amountStr.split('.')[1].length >= 2) return; // 最多两位小数
      amountStr += k;
    } else {
      if (amountStr === '0') {
        if (k !== '0') amountStr = k;
      } else {
        if (amountStr.length >= 7) return; // 整数部分最多 7 位
        amountStr += k;
      }
    }
  }
  renderAmount();
}

function commitEntry() {
  const cents = parseAmountToCents(amountStr);
  if (cents <= 0) {
    const w = $('#amount-wrap');
    w.classList.remove('shake');
    void w.offsetWidth; // 重置动画
    w.classList.add('shake');
    return;
  }
  records.push({ id: genId(), cents, ts: Date.now(), note: '', cat: '' });
  saveRecords();
  amountStr = '';
  renderAmount();
  renderEntryHead(true);
  toast('已记一笔 ' + fmtMoney(cents));
}

function renderEntryHead(pop) {
  const now = Date.now();
  const day = sumRange(startOfDay(now), now + 1);
  const month = sumRange(startOfMonth(now), now + 1);
  $('#eh-day').textContent = fmtMoney(day.sum);
  $('#eh-month').textContent = fmtMoney(month.sum);
  if (pop) {
    const b = $('#eh-day');
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
    setTimeout(() => b.classList.remove('pop'), 200);
  }
}

/* ================= 统计页 ================= */

function renderStats() {
  const now = Date.now();
  const end = now + 1;
  const day = sumRange(startOfDay(now), end);
  const week = sumRange(startOfWeek(now), end);
  const month = sumRange(startOfMonth(now), end);

  $('#st-day').textContent = fmtMoney(day.sum);
  $('#st-day-n').textContent = day.count + ' 笔';
  $('#st-week').textContent = fmtMoney(week.sum);
  $('#st-week-n').textContent = week.count + ' 笔';
  $('#st-month').textContent = fmtMoney(month.sum);
  $('#st-month-n').textContent = month.count + ' 笔';

  let total = 0;
  for (const r of records) total += r.cents;
  $('#st-total').textContent = '累计 ' + fmtMoney(total) + ' · 共 ' + records.length + ' 笔';

  renderChart7();
  renderCats(month.sum);
  renderMonths();
}

function renderMonths() {
  const block = $('#months-block');
  const rows = $('#month-rows');
  rows.textContent = '';
  if (records.length === 0) {
    block.hidden = true;
    return;
  }
  const byMonth = new Map(); // key = 年*12+月，天然可按数字排序
  for (const r of records) {
    const d = new Date(r.ts);
    const key = d.getFullYear() * 12 + d.getMonth();
    const cur = byMonth.get(key) || { sum: 0, count: 0 };
    cur.sum += r.cents;
    cur.count++;
    byMonth.set(key, cur);
  }
  block.hidden = false;
  const now = new Date();
  const nowKey = now.getFullYear() * 12 + now.getMonth();
  for (const key of [...byMonth.keys()].sort((a, b) => b - a)) {
    const { sum, count } = byMonth.get(key);
    const row = el('div', 'month-row');
    const name = el('span', 'month-name', Math.floor(key / 12) + '年' + (key % 12 + 1) + '月');
    if (key === nowKey) name.appendChild(el('i', 'month-now', '本月'));
    row.appendChild(name);
    const amt = el('span', 'month-amt');
    amt.appendChild(el('b', null, fmtMoney(sum)));
    amt.appendChild(el('span', 'month-n', ' · ' + count + ' 笔'));
    row.appendChild(amt);
    rows.appendChild(row);
  }
}

function renderChart7() {
  const wrap = $('#chart7');
  wrap.textContent = '';
  const days = [];
  let max = 0;
  for (let i = 6; i >= 0; i--) {
    const from = daysAgoStart(i);
    const { sum } = sumRange(from, from + DAY_MS);
    max = Math.max(max, sum);
    days.push({ from, sum, isToday: i === 0 });
  }
  for (const d of days) {
    const col = el('div', 'bar-col' + (d.isToday ? ' today' : ''));
    col.appendChild(el('div', 'bar-val', d.sum > 0 ? fmtYuan(d.sum) : ''));
    const bar = el('div', 'bar' + (d.sum > 0 ? ' hot' : ''));
    bar.style.height = max > 0 ? Math.max(2, Math.round(d.sum / max * 100)) + '%' : '2%';
    col.appendChild(bar);
    col.appendChild(el('div', 'bar-lab', d.isToday ? '今' : '日一二三四五六'[new Date(d.from).getDay()]));
    wrap.appendChild(col);
  }
}

function renderCats(monthSum) {
  const block = $('#cat-block');
  const rows = $('#cat-rows');
  rows.textContent = '';
  const now = Date.now();
  const from = startOfMonth(now);
  const byCat = new Map();
  for (const r of records) {
    if (r.ts < from || r.ts > now) continue;
    const key = r.cat || '未分类';
    byCat.set(key, (byCat.get(key) || 0) + r.cents);
  }
  // 只有「未分类」一组时不展示该模块
  if (byCat.size === 0 || (byCat.size === 1 && byCat.has('未分类'))) {
    block.hidden = true;
    return;
  }
  block.hidden = false;
  $('#cat-title').textContent = (new Date(now).getMonth() + 1) + '月分类';
  const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  for (const [name, sum] of sorted) {
    const row = el('div', 'cat-row');
    row.appendChild(el('span', 'cat-name', name));
    const track = el('div', 'cat-track');
    const fill = el('div', 'cat-fill' + (name === '未分类' ? ' none' : ''));
    fill.style.width = monthSum > 0 ? Math.max(2, Math.round(sum / monthSum * 100)) + '%' : '2%';
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', 'cat-amt', fmtMoney(sum)));
    rows.appendChild(row);
  }
}

/* ================= 明细页 ================= */

let listLimit = 200;

function renderList() {
  const wrap = $('#rec-groups');
  wrap.textContent = '';
  const empty = $('#list-empty');
  const more = $('#btn-more');

  if (records.length === 0) {
    empty.hidden = false;
    more.hidden = true;
    return;
  }
  empty.hidden = true;

  const sorted = [...records].sort((a, b) => b.ts - a.ts);
  const shown = sorted.slice(0, listLimit);
  more.hidden = sorted.length <= listLimit;

  let curDay = -1;
  let group = null;
  let dayHead = null;

  for (const r of shown) {
    const d = startOfDay(r.ts);
    if (d !== curDay) {
      curDay = d;
      group = el('div', 'day-group');
      dayHead = el('div', 'day-head');
      dayHead.appendChild(el('span', null, dayLabel(d)));
      dayHead.appendChild(el('b', null, ''));
      group.appendChild(dayHead);
      wrap.appendChild(group);
      // 当天完整小计（不受分页截断影响）
      const full = sumRange(d, d + DAY_MS);
      dayHead.lastChild.textContent = fmtMoney(full.sum);
    }
    const row = el('div', 'rec');
    row.dataset.id = r.id;
    row.appendChild(el('span', 'rec-time', timeLabel(r.ts)));
    const mid = el('div', 'rec-mid');
    if (r.cat) mid.appendChild(el('span', 'rec-cat', r.cat));
    mid.appendChild(el('span', 'rec-note' + (r.note ? '' : ' none'), r.note || '未备注'));
    row.appendChild(mid);
    row.appendChild(el('span', 'rec-amt', fmtMoney(r.cents)));
    group.appendChild(row);
  }
}

/* ================= 编辑弹层 ================= */

let editingId = null;
let sheetCat = '';
let delTimer = null;

function openEdit(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  editingId = id;
  sheetCat = r.cat || '';
  $('#edit-amount').value = (r.cents / 100).toString();
  $('#edit-amount').classList.remove('bad');
  $('#edit-note').value = r.note || '';
  renderChips();
  $('#edit-meta').textContent = '记于 ' + dayLabel(startOfDay(r.ts)) + ' ' + timeLabel(r.ts);
  resetDelBtn();
  openMask('#edit-mask');
}

function renderChips() {
  const wrap = $('#edit-cats');
  wrap.textContent = '';
  for (const c of CATS) {
    const chip = el('button', 'chip' + (sheetCat === c ? ' on' : ''), c);
    chip.type = 'button';
    chip.addEventListener('click', () => {
      sheetCat = sheetCat === c ? '' : c; // 再点一次取消
      renderChips();
    });
    wrap.appendChild(chip);
  }
}

function saveEdit() {
  const r = records.find(x => x.id === editingId);
  if (!r) { closeMask('#edit-mask'); return; }
  const cents = parseAmountToCents($('#edit-amount').value.trim());
  if (cents <= 0) {
    $('#edit-amount').classList.add('bad');
    toast('金额无效');
    return;
  }
  r.cents = cents;
  r.note = $('#edit-note').value.trim().slice(0, 60);
  r.cat = sheetCat;
  saveRecords();
  closeMask('#edit-mask');
  renderAll();
  toast('已保存');
}

function resetDelBtn() {
  clearTimeout(delTimer);
  const btn = $('#btn-del');
  btn.textContent = '删除';
  btn.classList.remove('armed');
}

function deleteEdit() {
  const btn = $('#btn-del');
  if (!btn.classList.contains('armed')) {
    btn.textContent = '确认删除';
    btn.classList.add('armed');
    clearTimeout(delTimer);
    delTimer = setTimeout(resetDelBtn, 2500);
    return;
  }
  clearTimeout(delTimer);
  records = records.filter(x => x.id !== editingId);
  saveRecords();
  closeMask('#edit-mask');
  renderAll();
  toast('已删除');
}

/* ================= 弹层通用 ================= */

function openMask(sel) {
  const m = $(sel);
  clearTimeout(m._hideTimer);
  m.hidden = false;
  void m.offsetHeight; // 强制 reflow，让 display 先生效，过渡动画才能播放
  m.classList.add('open');
}

function closeMask(sel) {
  const m = $(sel);
  m.classList.remove('open');
  clearTimeout(m._hideTimer);
  m._hideTimer = setTimeout(() => { m.hidden = true; }, 240);
}

/* ================= 导出 / 导入 ================= */

function openExport() {
  $('#data-title').textContent = '导出数据';
  $('#data-hint').textContent = '复制下面的内容，粘贴到备忘录或发给自己即可备份。换手机时用「导入数据」粘回来。';
  const ta = $('#data-text');
  ta.value = JSON.stringify({ app: '手机记账', v: 1, exportedAt: new Date().toISOString(), records });
  ta.readOnly = true;
  $('#btn-copy').hidden = false;
  $('#btn-do-import').hidden = true;
  openMask('#data-mask');
}

function openImport() {
  $('#data-title').textContent = '导入数据';
  $('#data-hint').textContent = '把之前导出的内容粘贴到下面，按 id 合并去重，不会覆盖已有记录。';
  const ta = $('#data-text');
  ta.value = '';
  ta.readOnly = false;
  $('#btn-copy').hidden = true;
  $('#btn-do-import').hidden = false;
  openMask('#data-mask');
}

async function copyExport() {
  const text = $('#data-text').value;
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制，可粘贴到备忘录保存');
  } catch (e) {
    const ta = $('#data-text');
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      toast('已复制，可粘贴到备忘录保存');
    } catch (e2) {
      toast('复制失败，请长按文本框手动复制');
    }
  }
}

function doImport() {
  let data;
  try {
    data = JSON.parse($('#data-text').value);
  } catch (e) {
    toast('内容不是有效的 JSON');
    return;
  }
  const arr = Array.isArray(data) ? data : (Array.isArray(data.records) ? data.records : null);
  if (!arr) { toast('没有找到记录数据'); return; }
  const existing = new Set(records.map(r => r.id));
  let added = 0, skipped = 0, invalid = 0;
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') { invalid++; continue; }
    const cents = Math.round(Number(raw.cents));
    const ts = Number(raw.ts);
    if (!Number.isFinite(cents) || cents <= 0 || !Number.isFinite(ts)) { invalid++; continue; }
    const id = typeof raw.id === 'string' && raw.id ? raw.id : genId();
    if (existing.has(id)) { skipped++; continue; }
    existing.add(id);
    records.push({
      id,
      cents,
      ts,
      note: typeof raw.note === 'string' ? raw.note.slice(0, 60) : '',
      cat: typeof raw.cat === 'string' ? raw.cat.slice(0, 10) : ''
    });
    added++;
  }
  if (added > 0) saveRecords();
  closeMask('#data-mask');
  renderAll();
  let msg = '导入 ' + added + ' 笔';
  if (skipped) msg += '，跳过重复 ' + skipped + ' 笔';
  if (invalid) msg += '，无效 ' + invalid + ' 条';
  toast(msg);
}

/* ================= 标签页切换 ================= */

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'stats') renderStats();
  if (name === 'list') { listLimit = 200; renderList(); }
}

function renderAll() {
  renderEntryHead(false);
  if ($('#view-stats').classList.contains('active')) renderStats();
  if ($('#view-list').classList.contains('active')) renderList();
}

/* ================= 事件绑定 ================= */

// 键盘：点击委托
$('#keypad').addEventListener('click', e => {
  const btn = e.target.closest('button[data-k]');
  if (!btn) return;
  if (btn.id === 'key-del' && suppressDelClick) { suppressDelClick = false; return; }
  pressKey(btn.dataset.k);
});
$('#btn-commit').addEventListener('click', commitEntry);

// 退格长按清空
let delHoldTimer = null;
let suppressDelClick = false;
$('#key-del').addEventListener('pointerdown', () => {
  suppressDelClick = false;
  delHoldTimer = setTimeout(() => {
    if (amountStr) {
      amountStr = '';
      renderAmount();
    }
    suppressDelClick = true;
  }, 500);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  $('#key-del').addEventListener(ev, () => clearTimeout(delHoldTimer));
}

// 标签栏
$('#tabbar').addEventListener('click', e => {
  const btn = e.target.closest('button[data-view]');
  if (btn) switchView(btn.dataset.view);
});

// 明细点击 → 编辑
$('#rec-groups').addEventListener('click', e => {
  const row = e.target.closest('.rec');
  if (row) openEdit(row.dataset.id);
});
$('#btn-more').addEventListener('click', () => {
  listLimit += 300;
  renderList();
});

// 编辑弹层
$('#btn-edit-close').addEventListener('click', () => closeMask('#edit-mask'));
$('#edit-mask').addEventListener('click', e => { if (e.target.id === 'edit-mask') closeMask('#edit-mask'); });
$('#btn-save').addEventListener('click', saveEdit);
$('#btn-del').addEventListener('click', deleteEdit);
$('#edit-amount').addEventListener('input', e => e.target.classList.remove('bad'));

// 导出/导入
$('#btn-export').addEventListener('click', openExport);
$('#btn-import').addEventListener('click', openImport);
$('#btn-data-close').addEventListener('click', () => closeMask('#data-mask'));
$('#data-mask').addEventListener('click', e => { if (e.target.id === 'data-mask') closeMask('#data-mask'); });
$('#btn-copy').addEventListener('click', copyExport);
$('#btn-do-import').addEventListener('click', doImport);

// 从后台回来 / 跨天后刷新数字
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderAll();
});

/* ================= 启动 ================= */

renderAmount();
renderAll();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
