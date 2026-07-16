const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onOpenFile: (callback) => ipcRenderer.on('open-file', (_event, fileContent) => callback(fileContent)),
  // The actual fetches + API keys live in main.js; these just relay the
  // passage query and return the result, so the keys never enter the renderer.
  fetchESV: (query) => ipcRenderer.invoke('fetch-esv-passage', query),
  fetchNASB: (passageId) => ipcRenderer.invoke('fetch-nasb-passage', passageId),
});
