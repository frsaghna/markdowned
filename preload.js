const { contextBridge, ipcRenderer } = require('electron');
const { marked } = require('marked');
const hljs = require('highlight.js');

// Forward console logs/errors to the main process
const originalLog = console.log;
console.log = (...args) => {
  ipcRenderer.send('renderer-log', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
  originalLog.apply(console, args);
};

const originalError = console.error;
console.error = (...args) => {
  ipcRenderer.send('renderer-error', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
  originalError.apply(console, args);
};

// Custom marked renderer to highlight code blocks during parsing
const renderer = new marked.Renderer();

// Marked v15.0+ code block renderer
renderer.code = function({ text, lang }) {
  if (lang && lang.toLowerCase().trim() === 'mermaid') {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    return `<div class="mermaid">${escaped}</div>`;
  }
  const language = (lang && hljs.getLanguage(lang)) ? lang : 'plaintext';
  try {
    const highlighted = hljs.highlight(text, { language }).value;
    return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
  } catch (err) {
    return `<pre><code class="hljs">${text}</code></pre>`;
  }
};

marked.use({ renderer });

contextBridge.exposeInMainWorld('electronAPI', {
  // Parsing markdown to HTML (runs in preload, clean and dependency-ready)
  parseMarkdown: (markdownText) => {
    return marked.parse(markdownText);
  },

  // Methods invoked by the renderer
  openFile: () => ipcRenderer.invoke('file-dialog:open'),
  saveFile: (filePath, content) => ipcRenderer.invoke('file:save', { filePath, content }),
  saveFileAs: (content) => ipcRenderer.invoke('file-dialog:save-as', content),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  selectFolder: () => ipcRenderer.invoke('folder-dialog:open'),
  readFolder: (folderPath) => ipcRenderer.invoke('folder:read', folderPath),
  exportHTML: (defaultFileName, htmlContent) => ipcRenderer.invoke('export:html', { defaultFileName, htmlContent }),
  exportPDF: (defaultFileName, htmlContent) => ipcRenderer.invoke('export:pdf', { defaultFileName, htmlContent }),
  saveAsset: (fileName, data) => ipcRenderer.invoke('file:saveAsset', fileName, data),

  // Subscriptions to menu/system messages
  onNewFile: (callback) => ipcRenderer.on('menu:new-file', () => callback()),
  onOpenFile: (callback) => ipcRenderer.on('file:opened', (event, data) => callback(data)),
  onOpenFolder: (callback) => ipcRenderer.on('folder:opened', (event, data) => callback(data)),
  onSaveRequest: (callback) => ipcRenderer.on('menu:save', () => callback()),
  onSaveAsRequest: (callback) => ipcRenderer.on('menu:save-as', () => callback()),
  onExportHTMLRequest: (callback) => ipcRenderer.on('menu:export-html', () => callback()),
  onExportPDFRequest: (callback) => ipcRenderer.on('menu:export-pdf', () => callback()),
  onFormat: (callback) => ipcRenderer.on('menu:format', (event, action) => callback(action)),
  onToggleSidebar: (callback) => ipcRenderer.on('menu:toggle-sidebar', () => callback()),
  onSetMode: (callback) => ipcRenderer.on('menu:set-mode', (event, mode) => callback(mode)),
  onToggleFocus: (callback) => ipcRenderer.on('menu:toggle-focus', (event, checked) => callback(checked)),
  onToggleTypewriter: (callback) => ipcRenderer.on('menu:toggle-typewriter', (event, checked) => callback(checked)),
  onSetTheme: (callback) => ipcRenderer.on('menu:set-theme', (event, theme) => callback(theme))
});
