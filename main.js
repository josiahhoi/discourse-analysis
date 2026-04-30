const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let pendingFilePath = null; // file path received before window was ready

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Discourse Analysis',
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on('did-finish-load', () => {
    // Send any file that was passed via command line or double-click
    if (pendingFilePath) {
      sendFileToRenderer(pendingFilePath);
      pendingFilePath = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
}

function sendFileToRenderer(filePath) {
  if (!mainWindow || !filePath) return;
  try {
    if (!filePath.endsWith('.json')) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    mainWindow.webContents.send('open-file', content);
  } catch (err) {
    console.error('Could not read file:', err);
  }
}

// macOS: file opened via double-click or "Open With" while app is running
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && mainWindow.webContents) {
    sendFileToRenderer(filePath);
  } else {
    pendingFilePath = filePath;
  }
});

// Windows/Linux: file path passed as command-line argument
const fileArg = process.argv.find((arg) => arg.endsWith('.json') && !arg.startsWith('-'));
if (fileArg) {
  pendingFilePath = path.resolve(fileArg);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
