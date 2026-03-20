const { app, BrowserWindow, ipcMain, Menu, nativeTheme, dialog, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();
let mainWindow;
let composeWindow = null;

// ── Window creation ──────────────────────────────────────────────────────────

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createComposeWindow(data = {}) {
  if (composeWindow) { composeWindow.focus(); return; }

  composeWindow = new BrowserWindow({
    width: 700,
    height: 540,
    minWidth: 560,
    minHeight: 420,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#1e1e1e',
    parent: mainWindow,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  composeWindow.loadFile(path.join(__dirname, 'renderer', 'compose.html'));
  composeWindow.webContents.once('did-finish-load', () => {
    composeWindow.webContents.send('compose:init', data);
  });
  composeWindow.on('closed', () => { composeWindow = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createMainWindow();
  buildMenu();

  nativeTheme.themeSource = 'dark';

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: account management ──────────────────────────────────────────────────

ipcMain.handle('accounts:get', () => store.get('accounts', []));

ipcMain.handle('accounts:save', (_, accounts) => {
  store.set('accounts', accounts);
  return true;
});

ipcMain.handle('accounts:delete', (_, index) => {
  const accounts = store.get('accounts', []);
  accounts.splice(index, 1);
  store.set('accounts', accounts);
  return true;
});

// ── IPC: settings ────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', () => store.get('settings', { theme: 'dark', fontSize: 14 }));

ipcMain.handle('settings:save', (_, settings) => {
  store.set('settings', settings);
  return true;
});

// ── IPC: IMAP – fetch emails ─────────────────────────────────────────────────

ipcMain.handle('mail:fetch', async (_, { account, folder, limit }) => {
  const Imap = require('imap');
  const { simpleParser } = require('mailparser');

  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: account.imapHost,
      port: account.imapPort || 993,
      tls: account.imapTls !== false,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000,
    });

    const messages = [];

    imap.once('ready', () => {
      imap.openBox(folder || 'INBOX', false, (err, box) => {
        if (err) { imap.end(); return reject(err); }

        const total = box.messages.total;
        if (total === 0) { imap.end(); return resolve([]); }

        const fetchLimit = Math.min(limit || 50, total);
        const start = Math.max(1, total - fetchLimit + 1);
        const range = `${start}:${total}`;

        const fetch = imap.seq.fetch(range, {
          bodies: ['HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID)', 'TEXT'],
          struct: true,
        });

        fetch.on('message', (msg) => {
          const parts = {};
          let attrs = {};

          msg.on('attributes', (a) => { attrs = a; });
          msg.on('body', (stream, info) => {
            let buffer = '';
            stream.on('data', (chunk) => { buffer += chunk.toString('utf8'); });
            stream.once('end', () => { parts[info.which] = buffer; });
          });

          msg.once('end', async () => {
            try {
              const headerKey = 'HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID)';
              const raw = (parts[headerKey] || '') + '\r\n\r\n' + (parts['TEXT'] || '');
              const parsed = await simpleParser(raw);
              messages.push({
                uid: attrs.uid,
                seqno: attrs['#'],
                flags: attrs.flags || [],
                date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
                from: parsed.from ? parsed.from.text : '',
                to: parsed.to ? parsed.to.text : '',
                cc: parsed.cc ? parsed.cc.text : '',
                subject: parsed.subject || '(no subject)',
                text: parsed.text || '',
                html: parsed.html || '',
                messageId: parsed.messageId || '',
              });
            } catch (e) { /* skip malformed */ }
          });
        });

        fetch.once('error', (e) => { imap.end(); reject(e); });
        fetch.once('end', () => { imap.end(); });
      });
    });

    imap.once('error', reject);
    imap.once('end', () => resolve(messages.reverse()));
    imap.connect();
  });
});

// ── IPC: IMAP – list folders ─────────────────────────────────────────────────

ipcMain.handle('mail:folders', async (_, account) => {
  const Imap = require('imap');

  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: account.imapHost,
      port: account.imapPort || 993,
      tls: account.imapTls !== false,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000,
    });

    imap.once('ready', () => {
      imap.getBoxes((err, boxes) => {
        imap.end();
        if (err) return reject(err);

        const folders = [];
        const walk = (tree, prefix) => {
          for (const [name, box] of Object.entries(tree)) {
            const fullName = prefix ? `${prefix}${box.delimiter}${name}` : name;
            folders.push(fullName);
            if (box.children) walk(box.children, fullName);
          }
        };
        walk(boxes, '');
        resolve(folders);
      });
    });

    imap.once('error', reject);
    imap.connect();
  });
});

// ── IPC: SMTP – send email ───────────────────────────────────────────────────

ipcMain.handle('mail:send', async (_, { account, message }) => {
  const nodemailer = require('nodemailer');

  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort || 587,
    secure: account.smtpTls === true,
    auth: { user: account.email, pass: account.password },
    tls: { rejectUnauthorized: false },
  });

  await transporter.sendMail({
    from: `${account.name} <${account.email}>`,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: message.replyTo,
    inReplyTo: message.inReplyTo,
    references: message.references,
  });

  return { success: true };
});

// ── IPC: IMAP – mark as read ─────────────────────────────────────────────────

ipcMain.handle('mail:markRead', async (_, { account, folder, uid }) => {
  const Imap = require('imap');

  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: account.imapHost,
      port: account.imapPort || 993,
      tls: account.imapTls !== false,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      imap.openBox(folder || 'INBOX', false, (err) => {
        if (err) { imap.end(); return reject(err); }
        imap.addFlags(uid, ['\\Seen'], (e) => {
          imap.end();
          if (e) return reject(e);
          resolve(true);
        });
      });
    });

    imap.once('error', reject);
    imap.connect();
  });
});

// ── IPC: IMAP – delete / trash ───────────────────────────────────────────────

ipcMain.handle('mail:delete', async (_, { account, folder, uid }) => {
  const Imap = require('imap');

  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.email,
      password: account.password,
      host: account.imapHost,
      port: account.imapPort || 993,
      tls: account.imapTls !== false,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      imap.openBox(folder || 'INBOX', false, (err) => {
        if (err) { imap.end(); return reject(err); }
        imap.addFlags(uid, ['\\Deleted'], (e) => {
          if (e) { imap.end(); return reject(e); }
          imap.expunge((ex) => {
            imap.end();
            if (ex) return reject(ex);
            resolve(true);
          });
        });
      });
    });

    imap.once('error', reject);
    imap.connect();
  });
});

// ── IPC: open compose window ─────────────────────────────────────────────────

ipcMain.on('compose:open', (_, data) => createComposeWindow(data));
ipcMain.on('compose:close', () => { if (composeWindow) composeWindow.close(); });

// ── IPC: open link in browser ────────────────────────────────────────────────

ipcMain.on('open:external', (_, url) => shell.openExternal(url));

// ── Menu ─────────────────────────────────────────────────────────────────────

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('nav:settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Message', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('compose:new') },
        { type: 'separator' },
        { label: 'Add Account…', click: () => mainWindow?.webContents.send('nav:addAccount') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Refresh', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.send('mail:refresh') },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
