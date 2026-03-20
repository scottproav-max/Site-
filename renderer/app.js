/* ── State ──────────────────────────────────────────────────────────────── */
const state = {
  accounts: [],
  selectedAccountIndex: -1,
  folders: [],
  selectedFolder: 'INBOX',
  emails: [],
  filteredEmails: [],
  selectedEmail: null,
  settings: { fontSize: 14, fetchLimit: 50 },
  editingAccountIndex: -1,
};

const ACCOUNT_COLORS = ['#0a84ff','#30d158','#ff9f0a','#ff453a','#bf5af2','#64d2ff'];

/* ── DOM refs ────────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const accountList     = $('account-list');
const folderList      = $('folder-list');
const emailList       = $('email-list');
const emailView       = $('email-view');
const noSelection     = $('no-selection');
const loadingOverlay  = $('loading-overlay');
const loadingLabel    = $('loading-label');
const modalOverlay    = $('modal-overlay');
const modalAccount    = $('modal-account');
const modalSettings   = $('modal-settings');
const formAccount     = $('form-account');
const searchInput     = $('search-input');
const currentFolderLabel = $('current-folder-label');
const btnRefresh      = $('btn-refresh');
const toast           = $('toast');

/* ── Init ────────────────────────────────────────────────────────────────── */
async function init() {
  state.settings = await window.electronAPI.getSettings();
  applySettings();

  state.accounts = await window.electronAPI.getAccounts();
  renderAccountList();

  if (state.accounts.length > 0) {
    selectAccount(0);
  }

  // Menu / keyboard events from main process
  window.electronAPI.on('compose:new', () => openCompose());
  window.electronAPI.on('mail:refresh', () => refreshMail());
  window.electronAPI.on('nav:settings', () => openModal('modal-settings'));
  window.electronAPI.on('nav:addAccount', () => openAddAccount());
}

/* ── Settings ────────────────────────────────────────────────────────────── */
function applySettings() {
  document.documentElement.style.setProperty('--body-font-size', state.settings.fontSize + 'px');
  $('setting-font-size').value = state.settings.fontSize;
  $('font-size-val').textContent = state.settings.fontSize;
  $('setting-fetch-limit').value = state.settings.fetchLimit || 50;
}

$('setting-font-size').addEventListener('input', (e) => {
  $('font-size-val').textContent = e.target.value;
});

$('btn-save-settings').addEventListener('click', async () => {
  state.settings.fontSize = parseInt($('setting-font-size').value);
  state.settings.fetchLimit = parseInt($('setting-fetch-limit').value);
  await window.electronAPI.saveSettings(state.settings);
  applySettings();
  closeModal('modal-settings');
  showToast('Settings saved', 'success');
});

/* ── Account management ─────────────────────────────────────────────────── */
function renderAccountList() {
  accountList.innerHTML = '';
  state.accounts.forEach((acc, i) => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'account-dot';
    dot.style.background = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
    li.appendChild(dot);
    li.appendChild(document.createTextNode(acc.name || acc.email));
    li.title = acc.email;
    if (i === state.selectedAccountIndex) li.classList.add('active');
    li.addEventListener('click', () => selectAccount(i));

    // Right-click context to edit/delete
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (confirm(`Delete account "${acc.email}"?`)) {
        deleteAccount(i);
      }
    });

    accountList.appendChild(li);
  });
}

async function selectAccount(index) {
  state.selectedAccountIndex = index;
  state.selectedFolder = 'INBOX';
  currentFolderLabel.textContent = 'Inbox';
  renderAccountList();
  await loadFolders();
  await loadEmails();
}

async function deleteAccount(index) {
  await window.electronAPI.deleteAccount(index);
  state.accounts.splice(index, 1);
  if (state.selectedAccountIndex >= state.accounts.length) {
    state.selectedAccountIndex = state.accounts.length - 1;
  }
  renderAccountList();
  if (state.selectedAccountIndex >= 0) {
    await loadFolders();
    await loadEmails();
  } else {
    folderList.innerHTML = '';
    emailList.innerHTML = '<li class="empty-state">No accounts configured</li>';
    showNoSelection();
  }
}

/* ── Add / edit account ─────────────────────────────────────────────────── */
$('btn-add-account').addEventListener('click', openAddAccount);

function openAddAccount() {
  state.editingAccountIndex = -1;
  $('modal-account-title').textContent = 'Add Account';
  formAccount.reset();
  openModal('modal-account');
}

formAccount.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(formAccount);
  const account = {
    name:     fd.get('name'),
    email:    fd.get('email'),
    password: fd.get('password'),
    imapHost: fd.get('imapHost'),
    imapPort: parseInt(fd.get('imapPort')) || 993,
    imapTls:  fd.get('imapTls') === 'on',
    smtpHost: fd.get('smtpHost'),
    smtpPort: parseInt(fd.get('smtpPort')) || 587,
    smtpTls:  fd.get('smtpTls') === 'on',
  };

  if (state.editingAccountIndex >= 0) {
    state.accounts[state.editingAccountIndex] = account;
  } else {
    state.accounts.push(account);
  }

  await window.electronAPI.saveAccounts(state.accounts);
  renderAccountList();
  closeModal('modal-account');
  showToast('Account saved', 'success');

  if (state.accounts.length === 1 || state.editingAccountIndex < 0) {
    selectAccount(state.accounts.length - 1);
  }
});

/* ── Folder list ─────────────────────────────────────────────────────────── */
const FOLDER_ICONS = {
  INBOX:     `<svg class="folder-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="4" width="14" height="10" rx="2"/><path d="M1 8h4l1.5 2h3L11 8h4"/></svg>`,
  Sent:      `<svg class="folder-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2l12 6-12 6V9.5l8-1.5-8-1.5V2z"/></svg>`,
  Drafts:    `<svg class="folder-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12V5l5-3 5 3v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M6 8h4M6 10h2"/></svg>`,
  Trash:     `<svg class="folder-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h10M6 3h4M5 5l.5 9h5l.5-9"/></svg>`,
  Spam:      `<svg class="folder-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v4M8 11v.5"/></svg>`,
  Archive:   `<svg class="folder-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="3" width="14" height="4" rx="1"/><path d="M2 7v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7M6 10h4"/></svg>`,
};

function getFolderIcon(name) {
  for (const [key, icon] of Object.entries(FOLDER_ICONS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return `<svg class="folder-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4h5l1.5 2H14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/></svg>`;
}

async function loadFolders() {
  if (state.selectedAccountIndex < 0) return;
  const account = state.accounts[state.selectedAccountIndex];

  folderList.innerHTML = '<li class="empty-state">Loading…</li>';
  try {
    state.folders = await window.electronAPI.listFolders(account);
    renderFolderList();
  } catch (err) {
    folderList.innerHTML = '<li class="empty-state">Could not load folders</li>';
    showToast('IMAP connection failed: ' + err.message, 'error');
  }
}

function renderFolderList() {
  folderList.innerHTML = '';
  const priority = ['INBOX', 'Sent', 'Drafts', 'Spam', 'Trash'];
  const sorted = [...state.folders].sort((a, b) => {
    const ai = priority.findIndex(p => a.toUpperCase().includes(p.toUpperCase()));
    const bi = priority.findIndex(p => b.toUpperCase().includes(p.toUpperCase()));
    if (ai < 0 && bi < 0) return a.localeCompare(b);
    if (ai < 0) return 1;
    if (bi < 0) return -1;
    return ai - bi;
  });

  for (const folder of sorted) {
    const li = document.createElement('li');
    li.innerHTML = getFolderIcon(folder);
    li.appendChild(document.createTextNode(folder));
    if (folder === state.selectedFolder) li.classList.add('active');
    li.addEventListener('click', () => {
      state.selectedFolder = folder;
      currentFolderLabel.textContent = folder;
      renderFolderList();
      loadEmails();
    });
    folderList.appendChild(li);
  }
}

/* ── Email loading ───────────────────────────────────────────────────────── */
async function loadEmails(showLoader = true) {
  if (state.selectedAccountIndex < 0) return;
  const account = state.accounts[state.selectedAccountIndex];

  if (showLoader) showLoading('Fetching emails…');
  btnRefresh.classList.add('spinning');

  try {
    state.emails = await window.electronAPI.fetchMail({
      account,
      folder: state.selectedFolder,
      limit: state.settings.fetchLimit || 50,
    });
    state.filteredEmails = state.emails;
    renderEmailList();
    showNoSelection();
  } catch (err) {
    showToast('Error loading mail: ' + err.message, 'error');
    emailList.innerHTML = '<li class="empty-state">Failed to load emails</li>';
  } finally {
    hideLoading();
    btnRefresh.classList.remove('spinning');
  }
}

function renderEmailList(emails = state.filteredEmails) {
  emailList.innerHTML = '';
  if (emails.length === 0) {
    emailList.innerHTML = '<li class="empty-state">No messages</li>';
    return;
  }

  for (const email of emails) {
    const li = document.createElement('li');
    li.className = 'email-item';
    const isUnread = !email.flags.includes('\\Seen');
    if (isUnread) li.classList.add('unread');

    const from = parseFromName(email.from);
    const preview = (email.text || '').replace(/\s+/g, ' ').slice(0, 100);
    const dateStr = formatDate(email.date);

    li.innerHTML = `
      ${isUnread ? '<span class="unread-indicator"></span>' : ''}
      <div class="email-item-from">${escHtml(from)}</div>
      <div class="email-item-subject">${escHtml(email.subject)}</div>
      <div class="email-item-preview">${escHtml(preview)}</div>
      <div class="email-item-date">${dateStr}</div>
    `;

    li.addEventListener('click', () => openEmail(email, li));
    emailList.appendChild(li);
  }
}

/* ── Search ──────────────────────────────────────────────────────────────── */
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    state.filteredEmails = state.emails;
  } else {
    state.filteredEmails = state.emails.filter(e =>
      e.subject.toLowerCase().includes(q) ||
      e.from.toLowerCase().includes(q) ||
      (e.text || '').toLowerCase().includes(q)
    );
  }
  renderEmailList();
});

/* ── Open / display email ────────────────────────────────────────────────── */
async function openEmail(email, liEl) {
  state.selectedEmail = email;

  // Mark selected in list
  document.querySelectorAll('#email-list .email-item').forEach(el => el.classList.remove('selected'));
  if (liEl) liEl.classList.add('selected');

  // Populate headers
  $('email-subject').textContent = email.subject;
  $('email-from').textContent = email.from;
  $('email-to').textContent = email.to;
  $('email-cc').textContent = email.cc;
  $('email-date').textContent = formatDateFull(email.date);
  $('email-cc-row').classList.toggle('hidden', !email.cc);

  // Avatar initial
  const senderName = parseFromName(email.from);
  $('sender-avatar').textContent = senderName.charAt(0).toUpperCase();
  $('sender-avatar').style.background = stringToColor(senderName);

  // Body
  const webview = $('email-webview');
  const textBody = $('email-text-body');

  if (email.html) {
    const safeHtml = sanitizeHtml(email.html);
    webview.classList.remove('hidden');
    textBody.classList.add('hidden');
    webview.src = 'about:blank';
    setTimeout(() => {
      webview.executeJavaScript(`document.open();document.write(${JSON.stringify(safeHtml)});document.close();`);
    }, 100);
  } else {
    webview.classList.add('hidden');
    textBody.classList.remove('hidden');
    textBody.textContent = email.text || '(empty)';
  }

  noSelection.classList.add('hidden');
  emailView.classList.remove('hidden');

  // Mark as read
  if (!email.flags.includes('\\Seen') && state.selectedAccountIndex >= 0) {
    const account = state.accounts[state.selectedAccountIndex];
    try {
      await window.electronAPI.markRead({ account, folder: state.selectedFolder, uid: email.uid });
      email.flags.push('\\Seen');
      if (liEl) {
        liEl.classList.remove('unread');
        liEl.querySelector('.unread-indicator')?.remove();
      }
    } catch (_) { /* non-fatal */ }
  }
}

/* ── Toolbar actions ─────────────────────────────────────────────────────── */
$('btn-compose').addEventListener('click', () => openCompose());

$('btn-reply').addEventListener('click', () => {
  if (!state.selectedEmail) return;
  const e = state.selectedEmail;
  openCompose({
    to: extractEmail(e.from),
    subject: e.subject.startsWith('Re:') ? e.subject : `Re: ${e.subject}`,
    replyTo: e.from,
    inReplyTo: e.messageId,
    body: quoteBody(e),
  });
});

$('btn-reply-all').addEventListener('click', () => {
  if (!state.selectedEmail) return;
  const e = state.selectedEmail;
  const account = state.selectedAccountIndex >= 0 ? state.accounts[state.selectedAccountIndex] : null;
  const allTo = [extractEmail(e.from), e.to].filter(Boolean).filter(t => t !== account?.email).join(', ');
  openCompose({
    to: allTo,
    cc: e.cc,
    subject: e.subject.startsWith('Re:') ? e.subject : `Re: ${e.subject}`,
    inReplyTo: e.messageId,
    body: quoteBody(e),
  });
});

$('btn-forward').addEventListener('click', () => {
  if (!state.selectedEmail) return;
  const e = state.selectedEmail;
  openCompose({
    subject: e.subject.startsWith('Fwd:') ? e.subject : `Fwd: ${e.subject}`,
    body: `\n\n---------- Forwarded message ----------\nFrom: ${e.from}\nDate: ${formatDateFull(e.date)}\nSubject: ${e.subject}\nTo: ${e.to}\n\n${e.text || ''}`,
  });
});

$('btn-delete-email').addEventListener('click', async () => {
  if (!state.selectedEmail || state.selectedAccountIndex < 0) return;
  if (!confirm('Delete this message?')) return;

  const account = state.accounts[state.selectedAccountIndex];
  const email = state.selectedEmail;
  showLoading('Deleting…');
  try {
    await window.electronAPI.deleteMail({ account, folder: state.selectedFolder, uid: email.uid });
    state.emails = state.emails.filter(e => e.uid !== email.uid);
    state.filteredEmails = state.filteredEmails.filter(e => e.uid !== email.uid);
    renderEmailList();
    showNoSelection();
    showToast('Message deleted', 'success');
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
});

/* ── Refresh ─────────────────────────────────────────────────────────────── */
btnRefresh.addEventListener('click', refreshMail);
async function refreshMail() { await loadEmails(); }

/* ── Compose window ──────────────────────────────────────────────────────── */
function openCompose(data = {}) {
  window.electronAPI.openCompose(data);
}

/* ── Modal helpers ───────────────────────────────────────────────────────── */
$('btn-settings').addEventListener('click', () => openModal('modal-settings'));

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});

document.querySelectorAll('[data-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeAllModals();
});

function openModal(id) {
  modalOverlay.classList.remove('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  $(id).classList.remove('hidden');
}

function closeModal(id) {
  $(id).classList.add('hidden');
  modalOverlay.classList.add('hidden');
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  modalOverlay.classList.add('hidden');
}

/* ── Loading helpers ─────────────────────────────────────────────────────── */
function showLoading(msg = 'Loading…') {
  loadingLabel.textContent = msg;
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

/* ── Toast ───────────────────────────────────────────────────────────────── */
let toastTimer;
function showToast(msg, type = '') {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = type;
  toast.classList.remove('hidden');
  toastTimer = setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => {
      toast.classList.add('hidden');
      toast.classList.remove('fade-out');
    }, 300);
  }, 3000);
}

/* ── View helpers ────────────────────────────────────────────────────────── */
function showNoSelection() {
  emailView.classList.add('hidden');
  noSelection.classList.remove('hidden');
  state.selectedEmail = null;
}

/* ── Utility ─────────────────────────────────────────────────────────────── */
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sanitizeHtml(html) {
  // Wrap in a full document with dark background; strip scripts
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, 'about:')
    .replace(/on\w+\s*=/gi, 'data-removed=');
  return `<!DOCTYPE html><html><head><style>
    html,body{margin:0;padding:16px;background:#1c1c1e;color:#f5f5f7;
    font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif;
    font-size:14px;line-height:1.6;}
    a{color:#0a84ff;}img{max-width:100%;}
  </style></head><body>${clean}</body></html>`;
}

function parseFromName(from) {
  if (!from) return 'Unknown';
  const m = from.match(/^"?([^"<]+)"?\s*</);
  return m ? m[1].trim() : from.replace(/<[^>]+>/, '').trim() || from;
}

function extractEmail(from) {
  const m = from.match(/<([^>]+)>/);
  return m ? m[1] : from;
}

function formatDate(isoDate) {
  const d = new Date(isoDate);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const diff = now - d;
  if (diff < 7 * 86400000) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDateFull(isoDate) {
  return new Date(isoDate).toLocaleString([], {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function quoteBody(email) {
  const body = email.text || '';
  const date = formatDateFull(email.date);
  return `\n\n\nOn ${date}, ${email.from} wrote:\n\n${body.split('\n').map(l => '> ' + l).join('\n')}`;
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h},55%,40%)`;
}

/* ── Keyboard shortcuts ──────────────────────────────────────────────────── */
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); openCompose(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'r') { e.preventDefault(); refreshMail(); }
  if (e.key === 'Escape') closeAllModals();
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (state.selectedEmail && !modalOverlay.classList.contains('hidden') === false) {
      $('btn-delete-email').click();
    }
  }
});

/* ── Kick off ────────────────────────────────────────────────────────────── */
init();
