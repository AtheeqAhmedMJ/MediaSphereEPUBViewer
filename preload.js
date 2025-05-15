const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

contextBridge.exposeInMainWorld('electronAPI', {
  openEpubDialog: () => ipcRenderer.invoke('open-epub-dialog'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  getTempDirectory: () => ipcRenderer.invoke('get-temp-directory'),
  pathJoin: (...args) => path.join(...args),
  getDirname: () => __dirname,
  fileExists: (path) => {
    try {
      return fs.existsSync(path);
    } catch {
      return false;
    }
  }
});
