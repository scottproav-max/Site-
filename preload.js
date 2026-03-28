const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Account management
  getAccounts: () => ipcRenderer.invoke('accounts:get'),
  saveAccounts: (accounts) => ipcRenderer.invoke('accounts:save', accounts),
  deleteAccount: (index) => ipcRenderer.invoke('accounts:delete', index),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // Mail operations
  fetchMail: (opts) => ipcRenderer.invoke('mail:fetch', opts),
  listFolders: (account) => ipcRenderer.invoke('mail:folders', account),
  sendMail: (opts) => ipcRenderer.invoke('mail:send', opts),
  markRead: (opts) => ipcRenderer.invoke('mail:markRead', opts),
  deleteMail: (opts) => ipcRenderer.invoke('mail:delete', opts),

  // Compose window
  openCompose: (data) => ipcRenderer.send('compose:open', data || {}),
  closeCompose: () => ipcRenderer.send('compose:close'),

  // External links
  openExternal: (url) => ipcRenderer.send('open:external', url),

  // Listen for main-process events
  on: (channel, callback) => {
    const allowed = [
      'compose:new', 'compose:init',
      'mail:refresh', 'nav:settings', 'nav:addAccount',
    ];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args));
    }
  },

  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },
});
