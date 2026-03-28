/* ── State ──────────────────────────────────────────────────────────────── */
let accounts = [];
let composeData = {};
let sending = false;

/* ── DOM refs ────────────────────────────────────────────────────────────── */
const fromSelect = document.getElementById('from-account');
const toInput    = document.getElementById('to');
const ccInput    = document.getElementById('cc');
const bccInput   = document.getElementById('bcc');
const subjectIn  = document.getElementById('subject');
const editor     = document.getElementById('editor');
const statusMsg  = document.getElementById('status-msg');
const charCount  = document.getElementById('char-count');
const btnSend    = document.getElementById('btn-send');

/* ── Init ────────────────────────────────────────────────────────────────── */
async function init() {
  accounts = await window.electronAPI.getAccounts();
  renderAccountSelector();
  editor.dataset.placeholder = 'Write your message here…';

  window.electronAPI.on('compose:init', (data) => {
    composeData = data || {};
    prefill();
  });
}

function renderAccountSelector() {
  fromSelect.innerHTML = '';
  if (accounts.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'No accounts configured';
    opt.disabled = true;
    fromSelect.appendChild(opt);
    return;
  }
  accounts.forEach((acc, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${acc.name || acc.email} <${acc.email}>`;
    fromSelect.appendChild(opt);
  });
}

function prefill() {
  if (composeData.to)      toInput.value      = composeData.to;
  if (composeData.cc)      ccInput.value      = composeData.cc;
  if (composeData.subject) subjectIn.value    = composeData.subject;
  if (composeData.body) {
    editor.textContent = composeData.body;
    // Move cursor to top
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(editor, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  if (composeData.accountIndex !== undefined) {
    fromSelect.value = composeData.accountIndex;
  }

  // Focus
  if (!composeData.to) toInput.focus();
  else if (!composeData.subject) subjectIn.focus();
  else editor.focus();
}

/* ── Bcc toggle ──────────────────────────────────────────────────────────── */
document.getElementById('btn-toggle-bcc').addEventListener('click', () => {
  const row = document.getElementById('bcc-row');
  row.style.display = row.style.display === 'none' ? 'flex' : 'none';
});

/* ── Formatting toolbar ──────────────────────────────────────────────────── */
document.getElementById('toolbar').addEventListener('mousedown', (e) => {
  const btn = e.target.closest('[data-cmd]');
  if (!btn) return;
  e.preventDefault();
  const cmd = btn.dataset.cmd;
  document.execCommand(cmd, false, null);
  editor.focus();
  updateToolbarState();
});

document.getElementById('btn-clear-format').addEventListener('mousedown', (e) => {
  e.preventDefault();
  document.execCommand('removeFormat', false, null);
  editor.focus();
});

editor.addEventListener('keyup', updateToolbarState);
editor.addEventListener('mouseup', updateToolbarState);

function updateToolbarState() {
  document.querySelectorAll('#toolbar [data-cmd]').forEach(btn => {
    try {
      btn.classList.toggle('active', document.queryCommandState(btn.dataset.cmd));
    } catch (_) {}
  });
  charCount.textContent = (editor.textContent || '').length + ' chars';
}

/* ── Send ────────────────────────────────────────────────────────────────── */
btnSend.addEventListener('click', sendEmail);

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendEmail();
  if (e.key === 'Escape') {
    if (confirm('Discard this message?')) window.electronAPI.closeCompose();
  }
});

async function sendEmail() {
  if (sending) return;

  const to = toInput.value.trim();
  if (!to) { setStatus('Recipient is required', 'error'); toInput.focus(); return; }

  const accountIndex = parseInt(fromSelect.value);
  if (isNaN(accountIndex) || !accounts[accountIndex]) {
    setStatus('Select a valid account', 'error');
    return;
  }

  const account = accounts[accountIndex];
  const html = editor.innerHTML;
  const text = editor.innerText;

  sending = true;
  btnSend.disabled = true;
  setStatus('Sending…');

  try {
    await window.electronAPI.sendMail({
      account,
      message: {
        to,
        cc: ccInput.value.trim() || undefined,
        bcc: bccInput.value.trim() || undefined,
        subject: subjectIn.value.trim() || '(no subject)',
        text,
        html: `<html><body>${html}</body></html>`,
        replyTo:    composeData.replyTo,
        inReplyTo:  composeData.inReplyTo,
        references: composeData.inReplyTo,
      },
    });

    setStatus('Message sent!', 'success');
    setTimeout(() => window.electronAPI.closeCompose(), 1200);
  } catch (err) {
    setStatus('Failed: ' + err.message, 'error');
    sending = false;
    btnSend.disabled = false;
  }
}

/* ── Discard ─────────────────────────────────────────────────────────────── */
document.getElementById('btn-discard').addEventListener('click', () => {
  const hasContent = toInput.value || subjectIn.value || editor.textContent.trim();
  if (hasContent && !confirm('Discard this message?')) return;
  window.electronAPI.closeCompose();
});

/* ── Status helper ───────────────────────────────────────────────────────── */
function setStatus(msg, type = '') {
  statusMsg.textContent = msg;
  statusMsg.className = type;
}

/* ── Kick off ────────────────────────────────────────────────────────────── */
init();
