const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onOpenFile: (callback) => ipcRenderer.on('open-file', (_event, fileContent) => callback(fileContent)),
  // The actual fetch + API key live in main.js; this just relays the passage
  // query and returns the result, so the key never enters the renderer.
  fetchESV: (query) => ipcRenderer.invoke('fetch-esv-passage', query),
});
