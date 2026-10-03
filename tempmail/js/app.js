import { API_BASE, POLL_MS, USE_PROXY } from './config.js';
import { createClient, MailTmError } from './mailtm.js';
import { buildSrcdoc, escapeHtml, formatSize, formatWhen, hasRemoteImages, senderLabel } from './render.js';

const STORE_KEY = 'tempmail.session.v1';
const BASE_TITLE = document.title;
const $ = (id) => document.getElementById(id);

const el = {
  status: $('status'), address: $('address'), copy: $('copy'), refresh: $('refresh'),
  newBtn: $('new'), customToggle: $('custom-toggle'), custom: $('custom'),
  customName: $('custom-name'), customDomain: $('custom-domain'), error: $('error'),
  list: $('list'), empty: $('empty'), updated: $('updated'), mail: document.querySelector('.mail'),
  placeholder: $('placeholder'), reader: $('reader'), back: $('back'), showImages: $('show-images'),
  deleteMsg: $('delete-msg'), rSubject: $('r-subject'), rFrom: $('r-from'), rTime: $('r-time'),
  rNote: $('r-images-note'), rAttachments: $('r-attachments'), rBody: $('r-body'),
};

// localStorage có thể ném lỗi (chế độ riêng tư, bị chặn) — trang vẫn chạy, chỉ không nhớ hộp thư.
function loadSession() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
}
function saveSession(s) {
  try { s ? localStorage.setItem(STORE_KEY, JSON.stringify(s)) : localStorage.removeItem(STORE_KEY); } catch { /* bỏ qua */ }
}

const client = createClient({ base: API_BASE, proxy: USE_PROXY, session: loadSession(), onSession: saveSession });

let messages = [];
let openMessage = null;
let pollTimer = null;
let busy = false;

function setStatus(kind, text) {
  el.status.className = `status ${kind}`;
  el.status.textContent = text;
}

function showError(err) {
  if (!err) { el.error.hidden = true; el.error.textContent = ''; return; }
  console.error(err);
  el.error.textContent = err instanceof MailTmError || err instanceof Error ? err.message : String(err);
  el.error.hidden = false;
}

function setAddress(address) {
  el.address.textContent = address || '—';
  el.copy.disabled = !address;
  el.refresh.disabled = !address;
}

function renderList() {
  el.list.replaceChildren(...messages.map((m) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `item${m.seen ? '' : ' unread'}${openMessage?.id === m.id ? ' active' : ''}`;
    btn.innerHTML = `
      <div class="item-top"><span class="item-from">${escapeHtml(senderLabel(m.from))}</span>
      <span class="muted">${escapeHtml(formatWhen(m.createdAt))}</span></div>
      <div class="item-subject">${escapeHtml(m.subject || '(không tiêu đề)')}</div>
      <div class="item-intro">${escapeHtml(m.intro || '')}</div>`;
    btn.addEventListener('click', () => openById(m.id));
    li.append(btn);
    return li;
  }));
  el.empty.hidden = messages.length > 0;
  const unread = messages.filter((m) => !m.seen).length;
  document.title = unread ? `(${unread}) ${BASE_TITLE}` : BASE_TITLE;
}

async function refresh() {
  if (!client.session || busy) return;
  busy = true;
  try {
    messages = await client.listMessages();
    renderList();
    const t = new Date();
    el.updated.textContent = `Cập nhật ${t.toLocaleTimeString('vi-VN')}`;
    setStatus('live', 'Đang theo dõi');
    showError(null);
  } catch (err) {
    setStatus('down', 'Mất kết nối');
    showError(err);
  } finally {
    busy = false;
  }
}

// Chỉ kiểm tra thư khi tab đang hiện; tab ẩn thì ngủ, mở lại thì kiểm tra ngay.
function schedule() {
  clearTimeout(pollTimer);
  if (document.hidden) { setStatus('paused', 'Tạm dừng (tab ẩn)'); return; }
  pollTimer = setTimeout(async () => { await refresh(); schedule(); }, POLL_MS);
}
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden) await refresh();
  schedule();
});

function closeReader() {
  openMessage = null;
  el.reader.hidden = true;
  el.placeholder.hidden = false;
  el.mail.classList.remove('reading');
  el.rBody.srcdoc = '';
  renderList();
}

function paintBody(allowRemote) {
  el.rBody.srcdoc = buildSrcdoc(openMessage, { allowRemote });
  const remote = hasRemoteImages(openMessage);
  el.showImages.hidden = !remote || allowRemote;
  el.rNote.hidden = !remote || allowRemote;
}

async function openById(id) {
  try {
    const m = await client.getMessage(id);
    openMessage = m;
    el.rSubject.textContent = m.subject || '(không tiêu đề)';
    el.rFrom.textContent = m.from ? `${senderLabel(m.from)} <${m.from.address}>` : '(không rõ người gửi)';
    el.rTime.textContent = Number.isNaN(new Date(m.createdAt).getTime()) ? '—' : new Date(m.createdAt).toLocaleString('vi-VN');
    el.rTime.dateTime = m.createdAt || '';
    renderAttachments(m.attachments || []);
    paintBody(false);
    el.reader.hidden = false;
    el.placeholder.hidden = true;
    el.mail.classList.add('reading');

    if (!m.seen) {
      const local = messages.find((x) => x.id === id);
      if (local) local.seen = true;
      client.markSeen(id).catch((err) => console.warn('Không đánh dấu đã đọc được', err));
    }
    renderList();
  } catch (err) {
    showError(err);
  }
}

function renderAttachments(list) {
  el.rAttachments.replaceChildren(...list.map((a) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = `📎 ${a.filename || 'tệp'} (${formatSize(a.size)})`;
    btn.addEventListener('click', async () => {
      try {
        const blob = await client.downloadAttachment(a.downloadUrl);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = a.filename || 'attachment';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      } catch (err) {
        showError(err);
      }
    });
    li.append(btn);
    return li;
  }));
}

async function newAddress(opts) {
  el.newBtn.disabled = true;
  setStatus('', 'Đang tạo địa chỉ…');
  try {
    // Hộp thư cũ bị xoá hẳn ở mail.tm: không giữ tài khoản mồ côi mà không ai còn mật khẩu.
    if (client.session) {
      await client.deleteAccount().catch((err) => console.warn('Không xoá được hộp thư cũ', err));
    }
    saveSession(null);
    const s = await client.createAccount(opts);
    messages = [];
    closeReader();
    setAddress(s.address);
    showError(null);
    await refresh();
    schedule();
    return true;
  } catch (err) {
    setStatus('down', 'Lỗi');
    showError(err);
    setAddress(client.session?.address);
    return false;
  } finally {
    el.newBtn.disabled = false;
  }
}

el.copy.addEventListener('click', async () => {
  const text = client.session?.address;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard API bị chặn (http, quyền) → chọn chữ để người dùng tự Ctrl+C
    const range = document.createRange();
    range.selectNodeContents(el.address);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    return;
  }
  el.copy.textContent = 'Đã chép ✓';
  setTimeout(() => { el.copy.textContent = 'Sao chép'; }, 1500);
});

el.refresh.addEventListener('click', async () => { await refresh(); schedule(); });

el.newBtn.addEventListener('click', () => {
  if (messages.length && !confirm('Địa chỉ hiện tại và toàn bộ thư sẽ bị xoá. Tạo địa chỉ mới?')) return;
  newAddress();
});

el.customToggle.addEventListener('click', async () => {
  const open = el.custom.hidden;
  el.custom.hidden = !open;
  el.customToggle.setAttribute('aria-expanded', String(open));
  if (open && !el.customDomain.options.length) {
    try {
      const domains = await client.getDomains();
      el.customDomain.replaceChildren(...domains.map((d) => new Option(d, d)));
    } catch (err) {
      showError(err);
    }
  }
  if (open) el.customName.focus();
});

el.custom.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (messages.length && !confirm('Địa chỉ hiện tại và toàn bộ thư sẽ bị xoá. Tiếp tục?')) return;
  const ok = await newAddress({ localPart: el.customName.value.trim(), domain: el.customDomain.value });
  if (ok) { el.custom.hidden = true; el.customToggle.setAttribute('aria-expanded', 'false'); el.customName.value = ''; }
});

el.back.addEventListener('click', closeReader);
el.showImages.addEventListener('click', () => paintBody(true));

el.deleteMsg.addEventListener('click', async () => {
  if (!openMessage) return;
  const id = openMessage.id;
  try {
    await client.deleteMessage(id);
    messages = messages.filter((m) => m.id !== id);
    closeReader();
  } catch (err) {
    showError(err);
  }
});

async function start() {
  const s = client.session;
  if (s) {
    setAddress(s.address);
    await refresh();
    // Hộp thư đã bị mail.tm xoá (đăng nhập lại cũng 401) → tạo cái mới
    if (el.status.classList.contains('down') && /HTTP 401/.test(el.error.textContent)) {
      await newAddress();
      return;
    }
    schedule();
  } else {
    await newAddress();
  }
}

start();
