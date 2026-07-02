const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Markdowned',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    backgroundColor: '#1e1e1e',
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Hide the native menu bar on Windows and Linux
  if (process.platform !== 'darwin') {
    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMenuBarVisibility(false);
  }

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle Super/Win key shortcuts (Super+C, Super+V, Super+X, Super+A, Super+Z, Super+Y)
  // for custom global scripts on Windows/Linux.
  if (process.platform !== 'darwin') {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'rawKeyDown' || input.type === 'keyDown') {
        const isSuper = input.meta;
        const key = input.key.toLowerCase();
        
        if (isSuper) {
          if (key === 'c') {
            mainWindow.webContents.copy();
            event.preventDefault();
          } else if (key === 'v') {
            mainWindow.webContents.paste();
            event.preventDefault();
          } else if (key === 'x') {
            mainWindow.webContents.cut();
            event.preventDefault();
          } else if (key === 'a') {
            mainWindow.webContents.selectAll();
            event.preventDefault();
          } else if (key === 'z') {
            mainWindow.webContents.undo();
            event.preventDefault();
          } else if (key === 'y') {
            mainWindow.webContents.redo();
            event.preventDefault();
          }
        }
      }
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create Application Menu
  createApplicationMenu();
}

function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu:new-file')
        },
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: () => triggerOpenFile()
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => triggerOpenFolder()
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu:save')
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('menu:save-as')
        },
        { type: 'separator' },
        {
          label: 'Export to HTML...',
          click: () => mainWindow.webContents.send('menu:export-html')
        },
        {
          label: 'Export to PDF...',
          click: () => mainWindow.webContents.send('menu:export-pdf')
        },
        { type: 'separator' },
        { role: isMac ? 'close' : 'quit' }
      ]
    },
    ...(isMac ? [{
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    }] : []),
    {
      label: 'Format',
      submenu: [
        {
          label: 'Bold',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow.webContents.send('menu:format', 'bold')
        },
        {
          label: 'Italic',
          accelerator: 'CmdOrCtrl+I',
          click: () => mainWindow.webContents.send('menu:format', 'italic')
        },
        {
          label: 'Inline Code',
          accelerator: 'CmdOrCtrl+`',
          click: () => mainWindow.webContents.send('menu:format', 'code')
        },
        {
          label: 'Link',
          accelerator: 'CmdOrCtrl+K',
          click: () => mainWindow.webContents.send('menu:format', 'link')
        },
        { type: 'separator' },
        {
          label: 'Heading 1',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow.webContents.send('menu:format', 'h1')
        },
        {
          label: 'Heading 2',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow.webContents.send('menu:format', 'h2')
        },
        {
          label: 'Heading 3',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow.webContents.send('menu:format', 'h3')
        },
        { type: 'separator' },
        {
          label: 'Unordered List',
          accelerator: 'CmdOrCtrl+L',
          click: () => mainWindow.webContents.send('menu:format', 'ul')
        },
        {
          label: 'Ordered List',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => mainWindow.webContents.send('menu:format', 'ol')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+\\',
          click: () => mainWindow.webContents.send('menu:toggle-sidebar')
        },
        {
          label: 'Mode: Write',
          accelerator: 'CmdOrCtrl+Alt+1',
          click: () => mainWindow.webContents.send('menu:set-mode', 'write')
        },
        {
          label: 'Mode: Live',
          accelerator: 'CmdOrCtrl+Alt+2',
          click: () => mainWindow.webContents.send('menu:set-mode', 'live')
        },
        {
          label: 'Mode: Split',
          accelerator: 'CmdOrCtrl+Alt+3',
          click: () => mainWindow.webContents.send('menu:set-mode', 'split')
        },
        {
          label: 'Mode: Preview',
          accelerator: 'CmdOrCtrl+Alt+4',
          click: () => mainWindow.webContents.send('menu:set-mode', 'preview')
        },
        { type: 'separator' },
        {
          label: 'Focus Mode',
          accelerator: 'CmdOrCtrl+Alt+F',
          type: 'checkbox',
          click: (menuItem) => mainWindow.webContents.send('menu:toggle-focus', menuItem.checked)
        },
        {
          label: 'Typewriter Mode',
          accelerator: 'CmdOrCtrl+Alt+T',
          type: 'checkbox',
          click: (menuItem) => mainWindow.webContents.send('menu:toggle-typewriter', menuItem.checked)
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Theme',
      submenu: [
        {
          label: 'Github (Light)',
          click: () => mainWindow.webContents.send('menu:set-theme', 'light')
        },
        {
          label: 'Night (Dark)',
          click: () => mainWindow.webContents.send('menu:set-theme', 'dark')
        },
        {
          label: 'Sepia (Vintage)',
          click: () => mainWindow.webContents.send('menu:set-theme', 'sepia')
        },
        {
          label: 'Gothic (Neo-Dark)',
          click: () => mainWindow.webContents.send('menu:set-theme', 'gothic')
        },
        {
          label: 'Newsprint (Classic Light)',
          click: () => mainWindow.webContents.send('menu:set-theme', 'newsprint')
        },
        {
          label: 'Vue (Developer Light)',
          click: () => mainWindow.webContents.send('menu:set-theme', 'vue')
        },
        {
          label: 'Dracula (Developer Dark)',
          click: () => mainWindow.webContents.send('menu:set-theme', 'dracula')
        },
        {
          label: 'One Dark (Developer Dark)',
          click: () => mainWindow.webContents.send('menu:set-theme', 'onedark')
        },
        {
          label: 'Achromatic Light',
          click: () => mainWindow.webContents.send('menu:set-theme', 'achromatic-light')
        },
        {
          label: 'Achromatic Dark',
          click: () => mainWindow.webContents.send('menu:set-theme', 'achromatic-dark')
        }
      ]
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'windowMenu' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Markdown Guide',
          click: async () => {
            await shell.openExternal('https://www.markdownguide.org/basic-syntax/');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Open File Action Helper
function triggerOpenFile() {
  dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown Files', extensions: ['md', 'markdown', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      openFilePath(result.filePaths[0]);
    }
  }).catch(err => {
    console.error('Error opening file dialog:', err);
  });
}

// Open Folder Action Helper
function triggerOpenFolder() {
  dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      openFolderPath(result.filePaths[0]);
    }
  }).catch(err => {
    console.error('Error opening folder dialog:', err);
  });
}

function openFilePath(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    mainWindow.webContents.send('file:opened', {
      filePath,
      content,
      fileName: path.basename(filePath)
    });
  } catch (err) {
    dialog.showErrorBox('Error Reading File', `Could not read file ${filePath}:\n${err.message}`);
  }
}

function openFolderPath(folderPath) {
  try {
    const files = getMarkdownFilesRecursive(folderPath);
    mainWindow.webContents.send('folder:opened', {
      folderPath,
      folderName: path.basename(folderPath),
      files
    });
  } catch (err) {
    dialog.showErrorBox('Error Reading Folder', `Could not read folder ${folderPath}:\n${err.message}`);
  }
}

// Recursive helper to find markdown/text files in a directory (up to 3 levels deep for speed)
function getMarkdownFilesRecursive(dirPath, currentDepth = 0) {
  if (currentDepth > 3) return [];
  let results = [];
  try {
    const list = fs.readdirSync(dirPath, { withFileTypes: true });
    
    // Sort directories first, then files
    list.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of list) {
      // Ignore hidden files and node_modules
      if (item.name.startsWith('.') || item.name === 'node_modules') continue;

      const fullPath = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        const subFiles = getMarkdownFilesRecursive(fullPath, currentDepth + 1);
        if (subFiles.length > 0 || currentDepth < 2) {
          results.push({
            name: item.name,
            path: fullPath,
            isDirectory: true,
            children: subFiles
          });
        }
      } else {
        const ext = path.extname(item.name).toLowerCase();
        if (['.md', '.markdown', '.txt'].includes(ext)) {
          results.push({
            name: item.name,
            path: fullPath,
            isDirectory: false
          });
        }
      }
    }
  } catch (e) {
    console.error('Error scanning folder:', dirPath, e);
  }
  return results;
}

ipcMain.on('renderer-log', (event, arg) => {
  console.log('[RENDERER]', arg);
});

ipcMain.on('renderer-error', (event, arg) => {
  console.error('[RENDERER ERROR]', arg);
});

// IPC Handlers
ipcMain.handle('file-dialog:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown Files', extensions: ['md', 'markdown', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  return {
    filePath,
    content,
    fileName: path.basename(filePath)
  };
});

ipcMain.handle('file-dialog:save-as', async (event, content) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Markdown File',
    defaultPath: 'untitled.md',
    filters: [
      { name: 'Markdown Files', extensions: ['md', 'markdown'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  const filePath = result.filePath;
  fs.writeFileSync(filePath, content, 'utf-8');
  return {
    filePath,
    fileName: path.basename(filePath)
  };
});

ipcMain.handle('file:save', async (event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('file:read', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content, fileName: path.basename(filePath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('folder-dialog:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const folderPath = result.filePaths[0];
  const files = getMarkdownFilesRecursive(folderPath);
  return {
    folderPath,
    folderName: path.basename(folderPath),
    files
  };
});

ipcMain.handle('folder:read', async (event, folderPath) => {
  try {
    const files = getMarkdownFilesRecursive(folderPath);
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export:html', async (event, { defaultFileName, htmlContent }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export to HTML',
    defaultPath: defaultFileName || 'export.html',
    filters: [
      { name: 'HTML Files', extensions: ['html', 'htm'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  try {
    fs.writeFileSync(result.filePath, htmlContent, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export:pdf', async (event, { defaultFileName, htmlContent }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export to PDF',
    defaultPath: defaultFileName || 'export.pdf',
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  const pdfPath = result.filePath;

  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false
    }
  });

  const tempHtmlPath = path.join(app.getPath('temp'), `print_${Date.now()}.html`);
  fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8');

  return new Promise((resolve) => {
    printWindow.loadFile(tempHtmlPath);

    printWindow.webContents.once('did-finish-load', async () => {
      try {
        const data = await printWindow.webContents.printToPDF({
          printBackground: true,
          margins: {
            top: 1,
            bottom: 1,
            left: 1,
            right: 1
          },
          pageSize: 'A4'
        });
        fs.writeFileSync(pdfPath, data);
        printWindow.destroy();
        fs.unlinkSync(tempHtmlPath);
        resolve({ success: true, filePath: pdfPath });
      } catch (err) {
        printWindow.destroy();
        try { fs.unlinkSync(tempHtmlPath); } catch (_) {}
        resolve({ success: false, error: err.message });
      }
    });
  });
});

ipcMain.handle('file:saveAsset', async (_, fileName, dataBuffer) => {
  const assetsDir = path.join(app.getPath('userData'), 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  const destPath = path.join(assetsDir, fileName);
  await fs.promises.writeFile(destPath, Buffer.from(dataBuffer));
  return `file://${destPath}`;
});

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
