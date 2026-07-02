import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, syntaxTree } from '@codemirror/language';
import { GFM, Table, TaskList, Strikethrough } from '@lezer/markdown';
import { javascriptLanguage, typescriptLanguage, jsxLanguage, tsxLanguage } from '@codemirror/lang-javascript';
import { htmlLanguage } from '@codemirror/lang-html';
import { cssLanguage } from '@codemirror/lang-css';
import TurndownService from 'turndown';
import mermaid from 'mermaid';

function isThemeDark(theme) {
  return ['dark', 'gothic', 'dracula', 'onedark', 'achromatic-dark'].includes(theme);
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `custom-toast toast-${type}`;
  toast.innerHTML = `<span class="toast-message">${message}</span>`;
  document.body.appendChild(toast);
  
  // Trigger layout to run CSS transitions
  toast.offsetHeight;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }, 2500);
}

import { Slice } from 'prosemirror-model';

var activeMermaidNodeViews = [];

function isCursorInsideNode(getPos, node, view) {
  const pos = getPos();
  if (pos === undefined) return false;
  const { from, to } = view.state.selection;
  const nodeFrom = pos;
  const nodeTo = pos + node.nodeSize;
  return (from >= nodeFrom && from <= nodeTo) || (to >= nodeFrom && to <= nodeTo);
}

class MermaidNodeView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    
    this.dom = document.createElement('div');
    this.dom.className = 'prosemirror-mermaid-container';
    
    this.editorEl = document.createElement('pre');
    this.editorEl.className = 'prosemirror-mermaid-editor';
    
    this.contentDOM = document.createElement('code');
    this.contentDOM.className = 'language-mermaid';
    this.editorEl.appendChild(this.contentDOM);
    
    this.renderEl = document.createElement('div');
    this.renderEl.className = 'prosemirror-mermaid-render';
    this.renderEl.contentEditable = 'false';
    
    this.dom.appendChild(this.editorEl);
    this.dom.appendChild(this.renderEl);
    
    activeMermaidNodeViews.push(this);
    
    this.isEditing = true;
    this.isRendering = false;
    this.checkSelection();

    // Toggle back to edit mode and place typing cursor inside when clicked
    this.renderEl.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const pos = this.getPos();
      if (pos === undefined) return;
      
      this.isEditing = true;
      this.editorEl.style.display = 'block';
      this.renderEl.style.display = 'none';
      
      this.view.focus();
      
      const { state, dispatch } = this.view;
      const tr = state.tr.setSelection(TextSelection.create(state.doc, pos + 1));
      dispatch(tr);
    });
  }
  
  checkSelection() {
    const isFocused = this.view.hasFocus();
    const editing = isFocused && isCursorInsideNode(this.getPos, this.node, this.view);
    
    if (editing !== this.isEditing) {
      this.isEditing = editing;
      if (editing) {
        this.editorEl.style.display = 'block';
        this.renderEl.style.display = 'none';
      } else {
        this.editorEl.style.display = 'none';
        this.renderEl.style.display = 'block';
        this.renderDiagram();
      }
    } else if (!editing && this.renderEl.innerHTML === '' && !this.isRendering) {
      this.renderDiagram();
    }
  }
  
  async renderDiagram() {
    if (this.isRendering) return;
    this.isRendering = true;
    
    const text = this.node.textContent.trim();
    if (!text) {
      this.renderEl.innerHTML = '<div class="mermaid-placeholder">Empty Mermaid Diagram</div>';
      this.isRendering = false;
      return;
    }
    
    const uniqueId = `mermaid-live-${Math.random().toString(36).substr(2, 9)}`;
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: isThemeDark(currentTheme) ? 'dark' : 'default',
      });
      const { svg } = await mermaid.render(uniqueId, text);
      this.renderEl.innerHTML = svg;
    } catch (err) {
      console.error("Mermaid live render error:", err);
      this.renderEl.innerHTML = `<div class="mermaid-error">⚠️ Mermaid Syntax Error</div>`;
      const badSvg = document.getElementById(uniqueId);
      if (badSvg) badSvg.remove();
    } finally {
      this.isRendering = false;
    }
  }
  
  update(node) {
    if (node.type !== this.node.type) return false;
    const textChanged = node.textContent !== this.node.textContent;
    this.node = node;
    
    if (!this.isEditing && textChanged) {
      this.renderDiagram();
    }
    return true;
  }
  
  ignoreMutation(mutation) {
    return true;
  }
  
  destroy() {
    activeMermaidNodeViews = activeMermaidNodeViews.filter(nv => nv !== this);
  }
}

// ProseMirror Imports for WYSIWYG Live Mode
import { EditorState as PMEditorState, TextSelection } from 'prosemirror-state';
import { EditorView as PMEditorView } from 'prosemirror-view';
import { keymap as pmKeymap } from 'prosemirror-keymap';
import { tableEditing, columnResizing } from 'prosemirror-tables';
import { parseMarkdown } from './editor/parser';
import { serializeMarkdown } from './editor/serializer';
import { getCorePlugins } from './editor/plugins';
import { buildKeymap } from './editor/keymap';
import {
  toggleBold,
  toggleItalic,
  toggleStrike,
  toggleInlineCode,
  toggleCodeBlock,
  toggleQuote,
  toggleBulletList,
  toggleOrderedList,
  toggleTaskList,
  insertImage,
  insertTable,
  insertHorizontalRule,
  toggleLink,
  toggleHeading
} from './editor/commands';


function getCodeLanguage(info) {
  const name = info.toLowerCase().trim();
  if (name === 'js' || name === 'javascript') return javascriptLanguage;
  if (name === 'ts' || name === 'typescript') return typescriptLanguage;
  if (name === 'jsx') return jsxLanguage;
  if (name === 'tsx') return tsxLanguage;
  if (name === 'html') return htmlLanguage;
  if (name === 'css') return cssLanguage;
  return null;
}
var cmView = null;
var pmView = null;
var currentFilePath = null;
var currentFileName = "Untitled.md";
var isUnsaved = false;
var originalContent = "";
var currentMode = "split";
var currentTheme = "dark";
var isFocusMode = false;
var isTypewriterMode = false;
var typewriterTimeout = null;
var currentFolderPath = null;
var autoSaveTimeout = null;
var filenameDisplay = document.getElementById("current-filename");
var filepathDisplay = document.getElementById("filepath-display");
var saveIndicator = document.getElementById("save-indicator");
var wordCountLabel = document.getElementById("word-count");
var charCountLabel = document.getElementById("char-count");
var readTimeLabel = document.getElementById("read-time");
var btnModeWrite = document.getElementById("mode-write");
var btnModeLive = document.getElementById("mode-live");
var btnModeSplit = document.getElementById("mode-split");
var btnModePreview = document.getElementById("mode-preview");
var sidebar = document.getElementById("sidebar");
var fileTree = document.getElementById("file-tree");
var outlineTree = document.getElementById("outline-tree");
var recentList = document.getElementById("recent-list");
var btnNewFile = document.getElementById("btn-new-file");
var btnOpenFolder = document.getElementById("btn-open-folder");
var btnOpenFolderPrompt = document.getElementById("btn-open-folder-prompt");
var btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
var tabFiles = document.getElementById("tab-files");
var tabOutline = document.getElementById("tab-outline");
var tabRecent = document.getElementById("tab-recent");
var panelFiles = document.getElementById("panel-files");
var panelOutline = document.getElementById("panel-outline");
var panelRecent = document.getElementById("panel-recent");
var sidebarEmpty = document.getElementById("sidebar-empty");
var outlineEmpty = document.getElementById("outline-empty");
var recentEmpty = document.getElementById("recent-empty");
var tbBold = document.getElementById("tb-bold");
var tbItalic = document.getElementById("tb-italic");
var tbCode = document.getElementById("tb-code");
var tbLink = document.getElementById("tb-link");
var tbH1 = document.getElementById("tb-h1");
var tbH2 = document.getElementById("tb-h2");
var tbH3 = document.getElementById("tb-h3");
var tbUl = document.getElementById("tb-ul");
var tbOl = document.getElementById("tb-ol");
var tbQuote = document.getElementById("tb-quote");
var tbTable = document.getElementById("tb-table");
var sidebarResizeHandle = document.getElementById("sidebar-resize-handle");
var paneDivider = document.getElementById("pane-divider");
var editorFrame = document.getElementById("editor-frame");
var preview = document.getElementById("preview");
var previewFrame = document.getElementById("preview-frame");
var contentContainer = document.getElementById("content-container");
var editorScrollContainer = document.getElementById("editor-scroll-container");
var liveEditorScrollContainer = document.getElementById("live-editor-scroll-container");
var previewScrollContainer = document.getElementById("preview-scroll-container");
var focusIndicator = document.getElementById("focus-indicator");
var typewriterIndicator = document.getElementById("typewriter-indicator");
var btnToggleToolbar = document.getElementById("btn-toggle-toolbar");
var collapsibleToolbar = document.getElementById("collapsible-toolbar");
var bubbleToolbar = document.getElementById("bubble-toolbar");
var btnAppMenu = document.getElementById("btn-app-menu");
var btnCommandPalette = document.getElementById("btn-command-palette");
var customMenuDropdown = document.getElementById("custom-menu-dropdown");
var commandPaletteModal = document.getElementById("command-palette-modal");
var commandPaletteInput = document.getElementById("command-palette-input");
var commandPaletteResults = document.getElementById("command-palette-results");
var isToolbarExpanded = false;
var ListMarkWidget = class extends WidgetType {
  constructor(isOrdered, text) {
    super();
    this.isOrdered = isOrdered;
    this.text = text;
  }
  eq(other) {
    return other.isOrdered === this.isOrdered && other.text === this.text;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = this.isOrdered ? "cm-list-number-widget" : "cm-list-bullet-widget";
    span.textContent = this.isOrdered ? this.text : "\u2022";
    return span;
  }
};
var HRWidget = class extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-hr-widget";
    return hr;
  }
};
var ImageWidget = class extends WidgetType {
  constructor(src, alt) {
    super();
    this.src = src;
    this.alt = alt;
  }
  eq(other) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM() {
    const container = document.createElement("div");
    container.className = "cm-image-widget-container";
    const img = document.createElement("img");
    img.className = "cm-image-widget";
    img.src = this.src;
    img.alt = this.alt || "image";
    const caption = document.createElement("div");
    caption.className = "cm-image-caption";
    caption.textContent = this.alt || "Image";
    container.appendChild(img);
    container.appendChild(caption);
    return container;
  }
};
var TableWidget = class extends WidgetType {
  constructor(tableText) {
    super();
    this.tableText = tableText;
  }
  eq(other) {
    return other.tableText === this.tableText;
  }
  toDOM() {
    const table = document.createElement("table");
    table.className = "cm-table-widget";
    const lines = this.tableText.trim().split("\n");
    if (lines.length < 2) return table;
    const parseCells = (rowText) => {
      let cells = rowText.split("|").map((s) => s.trim());
      if (rowText.trim().startsWith("|")) cells.shift();
      if (rowText.trim().endsWith("|")) cells.pop();
      return cells;
    };
    const headers = parseCells(lines[0]);
    const alignments = parseCells(lines[1]).map((col) => {
      if (col.startsWith(":") && col.endsWith(":")) return "center";
      if (col.endsWith(":")) return "right";
      return "left";
    });
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headers.forEach((h, i2) => {
      const th = document.createElement("th");
      th.textContent = h;
      th.style.textAlign = alignments[i2] || "left";
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (let l = 2; l < lines.length; l++) {
      const cells = parseCells(lines[l]);
      const tr = document.createElement("tr");
      cells.forEach((c, i2) => {
        const td = document.createElement("td");
        td.textContent = c;
        td.style.textAlign = alignments[i2] || "left";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  }
};
var CheckboxWidget = class extends WidgetType {
  constructor(checked, pos) {
    super();
    this.checked = checked;
    this.pos = pos;
  }
  eq(other) {
    return other.checked === this.checked && other.pos === this.pos;
  }
  toDOM(view) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "cm-task-checkbox";
    input.checked = this.checked;
    input.addEventListener("change", () => {
      const charToPut = input.checked ? "x" : " ";
      view.dispatch({
        changes: { from: this.pos + 1, to: this.pos + 2, insert: charToPut }
      });
    });
    return input;
  }
};
function isCursorInside(from, to, selection) {
  return selection.ranges.some((r) => r.from <= to && r.to >= from);
}
var liveDecorationPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.buildDecorations(view);
  }
  update(update) {
    this.decorations = this.buildDecorations(update.view);
  }
  buildDecorations(view) {
    if (currentMode !== "live") {
      return Decoration.none;
    }
    const builder = new RangeSetBuilder();
    const { state } = view;
    const selection = state.selection;
    const hideDeco = Decoration.replace({});
    for (const { from, to } of view.visibleRanges) {
      syntaxTree(state).iterate({
        from,
        to,
        enter: (node) => {
          const type = node.name;
          const isCursorIn = isCursorInside(node.from, node.to, selection);

          if (type.startsWith("ATXHeading")) {
            const level = parseInt(type.replace("ATXHeading", ""));
            const line = state.doc.lineAt(node.from);
            try {
              builder.add(line.from, line.from, Decoration.line({ class: `cm-heading-line cm-h${level}-line` }));
            } catch (e) {}
            if (!isCursorIn) {
              let cursor = node.cursor();
              if (cursor.firstChild()) {
                do {
                  if (cursor.name === "HeaderMark") {
                    const endHide = Math.min(node.to, cursor.to + 1);
                    try {
                      builder.add(cursor.from, endHide, hideDeco);
                    } catch (e) {}
                  }
                } while (cursor.nextSibling());
              }
            }
          }

          if (type === "StrongEmphasis") {
            try {
              builder.add(node.from, node.to, Decoration.mark({ class: "cm-bold" }));
            } catch (e) {}
            if (!isCursorIn) {
              let cursor = node.cursor();
              if (cursor.firstChild()) {
                do {
                  if (cursor.name === "EmphasisMark") {
                    try {
                      builder.add(cursor.from, cursor.to, hideDeco);
                    } catch (e) {}
                  }
                } while (cursor.nextSibling());
              }
            }
          }

          if (type === "Emphasis") {
            try {
              builder.add(node.from, node.to, Decoration.mark({ class: "cm-italic" }));
            } catch (e) {}
            if (!isCursorIn) {
              let cursor = node.cursor();
              if (cursor.firstChild()) {
                do {
                  if (cursor.name === "EmphasisMark") {
                    try {
                      builder.add(cursor.from, cursor.to, hideDeco);
                    } catch (e) {}
                  }
                } while (cursor.nextSibling());
              }
            }
          }

          if (type === "Strikethrough") {
            try {
              builder.add(node.from, node.to, Decoration.mark({ class: "cm-strikethrough" }));
            } catch (e) {}
            if (!isCursorIn) {
              let cursor = node.cursor();
              if (cursor.firstChild()) {
                do {
                  if (cursor.name === "StrikethroughMark") {
                    try {
                      builder.add(cursor.from, cursor.to, hideDeco);
                    } catch (e) {}
                  }
                } while (cursor.nextSibling());
              }
            }
          }

          if (type === "InlineCode") {
            try {
              builder.add(node.from, node.to, Decoration.mark({ class: "cm-inline-code" }));
            } catch (e) {}
            if (!isCursorIn) {
              let cursor = node.cursor();
              if (cursor.firstChild()) {
                do {
                  if (cursor.name === "CodeMark") {
                    try {
                      builder.add(cursor.from, cursor.to, hideDeco);
                    } catch (e) {}
                  }
                } while (cursor.nextSibling());
              }
            }
          }

          if (type === "Blockquote") {
            const startLine = state.doc.lineAt(node.from).number;
            const endLine = state.doc.lineAt(node.to).number;
            for (let l = startLine; l <= endLine; l++) {
              const line = state.doc.line(l);
              try {
                builder.add(line.from, line.from, Decoration.line({ class: "cm-blockquote-line" }));
              } catch (e) {}
            }
            if (!isCursorIn) {
              let cursor = node.cursor();
              if (cursor.firstChild()) {
                do {
                  if (cursor.name === "QuoteMark") {
                    const line = state.doc.lineAt(cursor.from);
                    const endHide = Math.min(line.to, cursor.to + 1);
                    try {
                      builder.add(cursor.from, endHide, hideDeco);
                    } catch (e) {}
                  }
                } while (cursor.nextSibling());
              }
            }
          }

          if (type === "HorizontalRule") {
            if (!isCursorIn) {
              try {
                builder.add(node.from, node.to, hideDeco);
                builder.add(node.to, node.to, Decoration.widget({
                  widget: new HRWidget(),
                  side: 1
                }));
              } catch (e) {}
              return false;
            }
          }

          if (type === "ListItem") {
            const line = state.doc.lineAt(node.from);
            let depth = 0;
            let parent = node.parent;
            while (parent) {
              if (parent.name === "BulletList" || parent.name === "OrderedList") {
                depth++;
              }
              parent = parent.parent;
            }
            try {
              builder.add(line.from, line.from, Decoration.line({ class: `cm-list-item-line cm-list-depth-${depth}` }));
            } catch (e) {}
          }

          if (type === "ListMark") {
            let hasTaskChild = false;
            let parent = node.parent;
            if (parent) {
              let cursor = parent.cursor();
              if (cursor.firstChild()) {
                do {
                  if (cursor.name === "Task") {
                    hasTaskChild = true;
                    break;
                  }
                } while (cursor.nextSibling());
              }
            }
            if (!isCursorIn) {
              try {
                builder.add(node.from, node.to, hideDeco);
                if (!hasTaskChild) {
                  const markText = state.doc.sliceString(node.from, node.to);
                  const isOrdered = /\d+/.test(markText);
                  builder.add(node.to, node.to, Decoration.widget({
                    widget: new ListMarkWidget(isOrdered, markText),
                    side: 1
                  }));
                }
              } catch (e) {}
            }
          }

          if (type === "TaskMarker") {
            const markerText = state.doc.sliceString(node.from, node.to);
            const checked = markerText.toLowerCase().includes("x");
            if (!isCursorIn) {
              try {
                builder.add(node.from, node.to, hideDeco);
                builder.add(node.to, node.to, Decoration.widget({
                  widget: new CheckboxWidget(checked, node.from),
                  side: 1
                }));
              } catch (e) {}
            }
          }

          if (type === "FencedCode") {
            const firstLine = state.doc.lineAt(node.from);
            const lastLine = state.doc.lineAt(node.to);
            for (let l = firstLine.number; l <= lastLine.number; l++) {
              const line = state.doc.line(l);
              try {
                builder.add(line.from, line.from, Decoration.line({ class: "cm-code-block-line" }));
              } catch (e) {}
            }
            if (!isCursorIn) {
              try {
                builder.add(firstLine.from, Math.min(state.doc.length, firstLine.to + 1), hideDeco);
                const lastStart = Math.max(firstLine.to + 1, lastLine.from - 1);
                if (lastStart < lastLine.to) {
                  builder.add(lastStart, lastLine.to, hideDeco);
                }
              } catch (e) {}
            }
          }

          if (type === "Link") {
            let openingMark = null;
            let closingMarkStart = -1;
            let cursor = node.cursor();
            if (cursor.firstChild()) {
              do {
                if (cursor.name === "LinkMark") {
                  const text = state.doc.sliceString(cursor.from, cursor.to);
                  if (text === "[") {
                    openingMark = { from: cursor.from, to: cursor.to };
                  } else if (text === "]") {
                    closingMarkStart = cursor.from;
                  }
                }
              } while (cursor.nextSibling());
            }
            if (openingMark && closingMarkStart !== -1) {
              try {
                builder.add(openingMark.to, closingMarkStart, Decoration.mark({ class: "cm-link" }));
              } catch (e) {}
              if (!isCursorIn) {
                try {
                  builder.add(openingMark.from, openingMark.to, hideDeco);
                  builder.add(closingMarkStart, node.to, hideDeco);
                } catch (e) {}
              }
            }
          }

          if (type === "Image") {
            let altText = "";
            let srcUrl = "";
            let cursor = node.cursor();
            if (cursor.firstChild()) {
              do {
                if (cursor.name === "LinkTitle") {
                  altText = state.doc.sliceString(cursor.from, cursor.to);
                } else if (cursor.name === "URL") {
                  srcUrl = state.doc.sliceString(cursor.from, cursor.to);
                }
              } while (cursor.nextSibling());
            }
            if (!isCursorIn) {
              try {
                builder.add(node.from, node.to, hideDeco);
                builder.add(node.to, node.to, Decoration.widget({
                  widget: new ImageWidget(srcUrl, altText),
                  side: 1
                }));
              } catch (e) {}
              return false;
            }
          }

          if (type === "Table") {
            if (!isCursorIn) {
              try {
                builder.add(node.from, node.to, hideDeco);
                builder.add(node.to, node.to, Decoration.widget({
                  widget: new TableWidget(state.doc.sliceString(node.from, node.to)),
                  side: 1
                }));
              } catch (e) {}
              return false;
            }
          }
        }
      });
    }
    return builder.finish();
  }
}, {
  decorations: (v) => v.decorations
});
var cmTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--text-main)",
    fontSize: "15px"
  },
  ".cm-content": {
    caretColor: "var(--text-main)",
    padding: "0",
    lineHeight: "1.8"
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--accent)"
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--accent-light) !important"
  },
  ".cm-gutters": {
    display: "none"
    // Typora has no line numbers
  }
});
var smartKeys = keymap.of([
  {
    key: "Enter",
    run: (view) => {
      const { state } = view;
      const { from, to } = state.selection.main;
      if (from !== to) return false;
      const line = state.doc.lineAt(from);
      const textBeforeCursor = line.text.substring(0, from - line.from);
      const ulPattern = /^([\s]*)([-*])\s(.*)$/;
      const taskPattern = /^([\s]*)([-*])\s\[([ xX])\]\s(.*)$/;
      const olPattern = /^([\s]*)(\d+)\.\s(.*)$/;
      let match;
      if (match = line.text.match(taskPattern)) {
        const indent = match[1];
        const marker = match[2];
        const taskContent = match[4];
        if (taskContent.trim() === "") {
          view.dispatch({
            changes: { from: line.from, to: line.to, insert: "" }
          });
        } else {
          const insertText = "\n" + indent + marker + " [ ] ";
          view.dispatch({
            changes: { from, to, insert: insertText },
            selection: { anchor: from + insertText.length }
          });
        }
        return true;
      } else if (match = line.text.match(ulPattern)) {
        const indent = match[1];
        const marker = match[2];
        const content2 = match[3];
        if (content2.trim() === "") {
          view.dispatch({
            changes: { from: line.from, to: line.to, insert: "" }
          });
        } else {
          const insertText = "\n" + indent + marker + " ";
          view.dispatch({
            changes: { from, to, insert: insertText },
            selection: { anchor: from + insertText.length }
          });
        }
        return true;
      } else if (match = line.text.match(olPattern)) {
        const indent = match[1];
        const num = parseInt(match[2]);
        const content2 = match[3];
        if (content2.trim() === "") {
          view.dispatch({
            changes: { from: line.from, to: line.to, insert: "" }
          });
        } else {
          const nextNum = num + 1;
          const insertText = "\n" + indent + nextNum + ". ";
          view.dispatch({
            changes: { from, to, insert: insertText },
            selection: { anchor: from + insertText.length }
          });
        }
        return true;
      }
      return false;
    }
  },
  {
    key: "Tab",
    run: (view) => {
      const { state } = view;
      const { from, to } = state.selection.main;
      if (from !== to) return false;
      const line = state.doc.lineAt(from);
      const isList2 = /^[\s]*([-*]|\d+\.)/.test(line.text);
      if (isList2) {
        view.dispatch({
          changes: { from: line.from, to: line.from, insert: "    " },
          selection: { anchor: from + 4 }
        });
        return true;
      }
      view.dispatch({
        changes: { from, to, insert: "    " },
        selection: { anchor: from + 4 }
      });
      return true;
    }
  },
  {
    key: "Shift-Tab",
    run: (view) => {
      const { state } = view;
      const { from } = state.selection.main;
      const line = state.doc.lineAt(from);
      let spacesToRemove = 0;
      if (line.text.startsWith("    ")) spacesToRemove = 4;
      else if (line.text.startsWith("  ")) spacesToRemove = 2;
      else if (line.text.startsWith(" ")) spacesToRemove = 1;
      if (spacesToRemove > 0) {
        view.dispatch({
          changes: { from: line.from, to: line.from + spacesToRemove, insert: "" },
          selection: { anchor: Math.max(line.from, from - spacesToRemove) }
        });
        return true;
      }
      return false;
    }
  }
]);
var cmAutoClose = EditorView.domEventHandlers({
  keydown: (event, view) => {
    const start = view.state.selection.main.from;
    const end = view.state.selection.main.to;
    const docLength = view.state.doc.length;
    const closePairs = {
      "(": ")",
      "[": "]",
      "{": "}",
      '"': '"',
      "'": "'",
      "`": "`",
      "*": "*"
    };
    const closingChars = [")", "]", "}", '"', "'", "`", "*"];
    if (closingChars.includes(event.key) && start === end && start < docLength) {
      const charAhead = view.state.doc.sliceString(start, start + 1);
      if (charAhead === event.key) {
        event.preventDefault();
        view.dispatch({ selection: { anchor: start + 1 } });
        return true;
      }
    }
    if (closePairs[event.key] !== void 0) {
      event.preventDefault();
      const closeChar = closePairs[event.key];
      if (start !== end) {
        const selection = view.state.doc.sliceString(start, end);
        const insertText = event.key + selection + closeChar;
        view.dispatch({
          changes: { from: start, to: end, insert: insertText },
          selection: { anchor: start + 1, head: end + 1 }
        });
      } else {
        const insertText = event.key + closeChar;
        view.dispatch({
          changes: { from: start, to: start, insert: insertText },
          selection: { anchor: start + 1 }
        });
      }
      return true;
    }
    if (event.key === "Backspace" && start === end && start > 0 && start < docLength) {
      const charBefore = view.state.doc.sliceString(start - 1, start);
      const charAfter = view.state.doc.sliceString(start, start + 1);
      if (closePairs[charBefore] === charAfter) {
        event.preventDefault();
        view.dispatch({
          changes: { from: start - 1, to: start + 1, insert: "" },
          selection: { anchor: start - 1 }
        });
        return true;
      }
    }
    return false;
  }
});
var cmPasteHandler = EditorView.domEventHandlers({
  paste: (event, view) => {
    const files = event.clipboardData?.files;
    if (files && files.length > 0) {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          event.preventDefault();
          showToast("Pasting image...", "success");
          
          const reader = new FileReader();
          reader.onload = async () => {
            const arrayBuffer = reader.result;
            const ext = file.name ? file.name.split('.').pop() : 'png';
            const fileName = `img_${Date.now()}.${ext}`;
            try {
              const localUrl = await window.electronAPI.saveAsset(fileName, arrayBuffer);
              const markdownImage = `![${file.name || 'image'}](${localUrl})\n`;
              const { from, to } = view.state.selection.main;
              view.dispatch({
                changes: { from, to, insert: markdownImage },
                selection: { anchor: from + markdownImage.length }
              });
              showToast("Image pasted successfully!", "success");
            } catch (err) {
              console.error('Failed to save pasted asset:', err);
              showToast("Failed to paste image", "error");
            }
          };
          reader.readAsArrayBuffer(file);
        }
      }
      return true;
    }

    const html2 = event.clipboardData.getData("text/html");
    const plainText = event.clipboardData.getData("text/plain");
    if (html2) {
      const turndownService = new TurndownService();
      const markdownText = turndownService.turndown(html2);
      if (markdownText && markdownText.trim() !== plainText.trim()) {
        event.preventDefault();
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: markdownText },
          selection: { anchor: from + markdownText.length }
        });
        return true;
      }
    }
    return false;
  }
});
var cmClickLinkHandler = EditorView.domEventHandlers({
  click: (event, view) => {
    if (event.ctrlKey || event.metaKey) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos !== null) {
        const tree = syntaxTree(view.state);
        let node = tree.resolveInner(pos, -1);
        while (node) {
          if (node.name === "Link") {
            let cursor = node.cursor();
            if (cursor.firstChild()) {
              do {
                if (cursor.name === "URL") {
                  const url = view.state.doc.sliceString(cursor.from, cursor.to);
                  window.open(url, "_blank");
                  event.preventDefault();
                  return true;
                }
              } while (cursor.nextSibling());
            }
            break;
          }
          node = node.parent;
        }
      }
    }
    return false;
  }
});
function createEditor(initialContent) {
  const startState = EditorState.create({
    doc: initialContent,
    extensions: [
      markdown({
        extensions: [GFM, Table, TaskList, Strikethrough],
        codeLanguages: getCodeLanguage
      }),
      history(),
      cmTheme,
      liveDecorationPlugin,
      smartKeys,
      cmAutoClose,
      cmPasteHandler,
      cmClickLinkHandler,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      syntaxHighlighting(defaultHighlightStyle),
      EditorView.updateListener.of((update) => {
        try {
          if (update.docChanged) {
            onEditorContentChange();
          }
          if (update.selectionSet) {
            onEditorSelectionChange();
          }
        } catch (err) {
          logDebug("Error in CodeMirror updateListener: " + err.stack);
        }
      })
    ]
  });
  const mountPoint = document.getElementById("editor");
  mountPoint.innerHTML = "";
  cmView = new EditorView({
    state: startState,
    parent: mountPoint
  });
  cmView.focus();
}

function executePMCommand(cmd) {
  if (!pmView) return;
  pmView.focus();
  cmd(pmView.state, pmView.dispatch);
}

function createLiveEditor(initialContent) {
  const mountPoint = document.getElementById("live-editor");
  mountPoint.innerHTML = "";

  const initialDoc = parseMarkdown(initialContent);

  const state = PMEditorState.create({
    doc: initialDoc,
    plugins: [
      ...getCorePlugins(),
      pmKeymap(buildKeymap()),
      columnResizing({}),
      tableEditing(),
    ],
  });

  pmView = new PMEditorView(mountPoint, {
    state,
    nodeViews: {
      code_block(node, view, getPos) {
        if (node.attrs.params === 'mermaid') {
          return new MermaidNodeView(node, view, getPos);
        }
        return null;
      }
    },
    dispatchTransaction(transaction) {
      try {
        const newState = pmView.state.apply(transaction);
        pmView.updateState(newState);

        if (transaction.docChanged) {
          onLiveEditorContentChange();
        }
        
        if ((transaction.docChanged || transaction.selectionSet) && isTypewriterMode) {
          centerActiveLine();
        }

        // Check if selection moved inside/outside of Mermaid blocks
        activeMermaidNodeViews.forEach(nv => nv.checkSelection());
      } catch (err) {
        logDebug("Error in dispatchTransaction: " + err.stack);
      }
    },
  });
  pmView.focus();
}

function onLiveEditorContentChange() {
  const newMarkdown = serializeMarkdown(pmView.state.doc);
  
  if (cmView) {
    cmView.dispatch({
      changes: { from: 0, to: cmView.state.doc.length, insert: newMarkdown }
    });
  }
  
  updatePreview();
  checkUnsaved();
  updateStats();
  buildOutline();
  triggerAutoSave();
}

function onEditorContentChange() {
  try {
    updatePreview();
    checkUnsaved();
    updateStats();
    buildOutline();
    triggerAutoSave();
    if (isTypewriterMode) {
      centerActiveLine();
    }
  } catch (err) {
    logDebug("Error in onEditorContentChange: " + err.stack);
  }
}
function onEditorSelectionChange() {
  try {
    if (isTypewriterMode) {
      centerActiveLine();
    }
  } catch (err) {
    logDebug("Error in onEditorSelectionChange: " + err.stack);
  }
}
function init() {
  loadSettings();
  
  mermaid.initialize({
    startOnLoad: false,
    theme: isThemeDark(currentTheme) ? 'dark' : 'default',
  });

  setupEventListeners();

  updateModeUI();
  updateThemeUI();
  renderRecentList();
  
  if (isToolbarExpanded) {
    collapsibleToolbar.classList.add("expanded");
    collapsibleToolbar.classList.remove("collapsed");
    btnToggleToolbar.classList.add("active");
  } else {
    collapsibleToolbar.classList.add("collapsed");
    collapsibleToolbar.classList.remove("expanded");
    btnToggleToolbar.classList.remove("active");
  }
  
  const welcomeText = `# Welcome to Markdowned ✍️\u270D\uFE0F

A premium, distraction-free Markdown editor and viewer.

## Features at a Glance
- **Four View Modes**: Write (plain), Live (WYSIWYG-like), Split (live sync), and Preview (reading).
- **Ten Gorgeous Themes**: Github Light, Night Dark, Sepia Vintage, Gothic Neo-Dark, Newsprint, Vue, Dracula, One Dark, Achromatic Light, and Achromatic Dark.
- **Enhanced Writing Comfort**:
- *Typewriter Mode*: Centers the active line vertically.
- *Focus Mode*: Hides toolbars and side panels.
- *Smart Enter*: Continues ordered lists, bullet lists, and checklist items automatically.
- *Smart Formatting*: Auto-closes brackets \`()\`, braces \`{}\`, code blocks, and markdown markers.
- **Sidebar Integration**:
- Browse workspace folders directly.
- Interactive Outline mapping headings (H1-H6).
- Recents list of files.
- **Rich Exports**: Save as clean HTML or export beautifully styled to PDF.

### Markdown Cheat Sheet

#### 1. Formatting
**Bold text** or *Italic text* or \`inline code\`.

> This is a beautiful blockquote for highlights or callouts.

#### 2. Lists
- Unordered lists
- Task lists
- [x] Check this box
- [ ] Unchecked box
- Ordered lists:
1. First item
2. Second item

#### 3. Tables
| Syntax      | Description | Test Text   |
| :---        |    :----:   |          ---: |
| Align Left  | Centered    | Align Right |
| Hello       | Awesome     | Editor      |

#### 4. Code Highlight
\`\`\`javascript
function calculateWords(text) {
return text.trim().split(/\\s+/).filter(w => w.length > 0).length;
}
console.log(calculateWords("Hello world from Markdowned!"));
\`\`\`

#### 5. Diagrams (Mermaid)
\`\`\`mermaid
graph TD
    Start --> Edit[Write Markdown]
    Edit --> Preview[Live Preview & Diagrams]
    Preview --> Export[Export HTML or PDF]
\`\`\`
`;
  originalContent = welcomeText;
  createEditor(welcomeText);
  updatePreview();
  buildOutline();
  updateStats();
  if (currentMode === "live") {
    createLiveEditor(welcomeText);
  }
}
function loadSettings() {
  const storedTheme = localStorage.getItem("theme");
  if (storedTheme) currentTheme = storedTheme;
  const storedMode = localStorage.getItem("mode");
  if (storedMode) currentMode = storedMode;
  const storedFocus = localStorage.getItem("focusMode");
  if (storedFocus) isFocusMode = storedFocus === "true";
  const storedTypewriter = localStorage.getItem("typewriterMode");
  if (storedTypewriter) {
    isTypewriterMode = storedTypewriter === "true";
    if (isTypewriterMode) {
      document.body.classList.add("typewriter-active");
      typewriterIndicator.classList.remove("hide");
    } else {
      document.body.classList.remove("typewriter-active");
      typewriterIndicator.classList.add("hide");
    }
  }
  const storedFolder = localStorage.getItem("folderPath");
  if (storedFolder) {
    currentFolderPath = storedFolder;
    readWorkspaceFolder(storedFolder);
  }
  const storedSidebarWidth = localStorage.getItem("sidebarWidth");
  if (storedSidebarWidth) {
    sidebar.style.width = storedSidebarWidth;
    document.documentElement.style.setProperty("--sidebar-width", storedSidebarWidth);
  }
  const storedToolbar = localStorage.getItem("toolbarExpanded");
  if (storedToolbar) {
    isToolbarExpanded = storedToolbar === "true";
  } else {
    isToolbarExpanded = false;
  }
}
function setupEventListeners() {
  btnModeWrite.addEventListener("click", () => setMode("write"));
  btnModeLive.addEventListener("click", () => setMode("live"));
  btnModeSplit.addEventListener("click", () => setMode("split"));
  btnModePreview.addEventListener("click", () => setMode("preview"));
  tabFiles.addEventListener("click", () => switchSidebarTab("files"));
  tabOutline.addEventListener("click", () => switchSidebarTab("outline"));
  tabRecent.addEventListener("click", () => switchSidebarTab("recent"));
  btnNewFile.addEventListener("click", createNewFile);
  btnOpenFolder.addEventListener("click", selectWorkspaceFolder);
  btnOpenFolderPrompt.addEventListener("click", selectWorkspaceFolder);
  btnToggleSidebar.addEventListener("click", toggleSidebar);
  
  btnToggleToolbar.addEventListener("click", toggleToolbar);
  
  document.addEventListener("selectionchange", handleSelectionChange);
  editorScrollContainer.addEventListener("scroll", handleSelectionChange);
  if (liveEditorScrollContainer) {
    liveEditorScrollContainer.addEventListener("scroll", handleSelectionChange);
  }
  window.addEventListener("resize", handleSelectionChange);
  
  const bubbleButtons = bubbleToolbar.querySelectorAll(".bubble-btn");
  bubbleButtons.forEach(btn => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-action");
      formatMarkdown(action);
      setTimeout(handleSelectionChange, 50);
    });
  });
  
  // App Menu and Command Palette Click Handlers
  if (btnAppMenu) {
    btnAppMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCustomMenu();
    });
  }
  if (btnCommandPalette) {
    btnCommandPalette.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCommandPalette();
    });
  }

  document.addEventListener("click", (e) => {
    if (btnAppMenu && !btnAppMenu.contains(e.target) && !customMenuDropdown.contains(e.target)) {
      hideCustomMenu();
    }
    if (e.target === commandPaletteModal) {
      hideCommandPalette();
    }
  });

  if (commandPaletteInput) {
    commandPaletteInput.addEventListener('input', (e) => {
      activePaletteIndex = 0;
      filterCommands(e.target.value);
    });

    commandPaletteInput.addEventListener('keydown', (e) => {
      const itemsToShow = filteredCommands.slice(0, 15);
      const count = itemsToShow.length;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (count > 0) {
          activePaletteIndex = (activePaletteIndex + 1) % count;
          renderPaletteResults();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (count > 0) {
          activePaletteIndex = (activePaletteIndex - 1 + count) % count;
          renderPaletteResults();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (count > 0 && activePaletteIndex < count) {
          const cmd = itemsToShow[activePaletteIndex];
          handleMenuAction(cmd.action, cmd.value);
          hideCommandPalette();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideCommandPalette();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      toggleToolbar();
    }
    
    // Command Palette (Ctrl+Shift+P)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      toggleCommandPalette();
    }
    
    // Custom Menu (Alt+M)
    if (e.altKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      toggleCustomMenu();
    }
    
    // Escape key
    if (e.key === 'Escape') {
      if (commandPaletteModal && !commandPaletteModal.classList.contains('hidden')) {
        hideCommandPalette();
      } else if (customMenuDropdown && customMenuDropdown.classList.contains('show')) {
        hideCustomMenu();
      } else if (isFocusMode) {
        toggleFocusMode(false);
      }
    }
  });

  tbBold.addEventListener("click", () => formatMarkdown("bold"));
  tbItalic.addEventListener("click", () => formatMarkdown("italic"));
  tbCode.addEventListener("click", () => formatMarkdown("code"));
  tbLink.addEventListener("click", () => formatMarkdown("link"));
  tbH1.addEventListener("click", () => formatMarkdown("h1"));
  tbH2.addEventListener("click", () => formatMarkdown("h2"));
  tbH3.addEventListener("click", () => formatMarkdown("h3"));
  tbUl.addEventListener("click", () => formatMarkdown("ul"));
  tbOl.addEventListener("click", () => formatMarkdown("ol"));
  tbQuote.addEventListener("click", () => formatMarkdown("quote"));
  tbTable.addEventListener("click", () => formatMarkdown("table"));
  let isSidebarResizing = false;
  sidebarResizeHandle.addEventListener("mousedown", (e) => {
    isSidebarResizing = true;
    document.body.style.cursor = "col-resize";
    sidebarResizeHandle.classList.add("resizing");
    e.preventDefault();
  });
  let isDividerResizing = false;
  paneDivider.addEventListener("mousedown", (e) => {
    isDividerResizing = true;
    document.body.style.cursor = "col-resize";
    paneDivider.classList.add("resizing");
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (isSidebarResizing) {
      const newWidth = e.clientX;
      if (newWidth > 180 && newWidth < 500) {
        sidebar.classList.remove("hidden");
        sidebar.style.width = `${newWidth}px`;
        document.documentElement.style.setProperty("--sidebar-width", `${newWidth}px`);
      } else if (newWidth <= 120) {
        sidebar.classList.add("hidden");
      }
    }
    if (isDividerResizing) {
      const containerRect = contentContainer.getBoundingClientRect();
      const relativeX = e.clientX - containerRect.left;
      const percentage = relativeX / containerRect.width * 100;
      if (percentage > 15 && percentage < 85) {
        editorFrame.style.flex = `0 0 ${percentage}%`;
        previewFrame.style.flex = `0 0 ${100 - percentage}%`;
      }
    }
  });
  document.addEventListener("mouseup", () => {
    if (isSidebarResizing) {
      isSidebarResizing = false;
      document.body.style.cursor = "";
      sidebarResizeHandle.classList.remove("resizing");
      if (!sidebar.classList.contains("hidden")) {
        localStorage.setItem("sidebarWidth", sidebar.style.width);
      }
    }
    if (isDividerResizing) {
      isDividerResizing = false;
      document.body.style.cursor = "";
      paneDivider.classList.remove("resizing");
    }
  });
  paneDivider.addEventListener("dblclick", () => {
    editorFrame.style.flex = "1";
    previewFrame.style.flex = "1";
  });
  sidebarResizeHandle.addEventListener("dblclick", () => {
    sidebar.classList.remove("hidden");
    sidebar.style.width = "250px";
    document.documentElement.style.setProperty("--sidebar-width", "250px");
    localStorage.setItem("sidebarWidth", "250px");
  });
  let isEditorHovered = false;
  let isPreviewHovered = false;
  editorScrollContainer.addEventListener("mouseenter", () => {
    isEditorHovered = true;
    isPreviewHovered = false;
  });
  previewScrollContainer.addEventListener("mouseenter", () => {
    isPreviewHovered = true;
    isEditorHovered = false;
  });
  editorScrollContainer.addEventListener("scroll", () => {
    if (isEditorHovered && currentMode === "split") {
      const pct = editorScrollContainer.scrollTop / (editorScrollContainer.scrollHeight - editorScrollContainer.clientHeight);
      previewScrollContainer.scrollTop = pct * (previewScrollContainer.scrollHeight - previewScrollContainer.clientHeight);
    }
  });
  previewScrollContainer.addEventListener("scroll", () => {
    if (isPreviewHovered && currentMode === "split") {
      const pct = previewScrollContainer.scrollTop / (previewScrollContainer.scrollHeight - previewScrollContainer.clientHeight);
      editorScrollContainer.scrollTop = pct * (editorScrollContainer.scrollHeight - editorScrollContainer.clientHeight);
    }
  });
  window.electronAPI.onNewFile(createNewFile);
  window.electronAPI.onOpenFile((data2) => openFilePayload(data2));
  window.electronAPI.onOpenFolder((data2) => openFolderPayload(data2));
  window.electronAPI.onSaveRequest(saveFile);
  window.electronAPI.onSaveAsRequest(saveFileAs);
  window.electronAPI.onExportHTMLRequest(exportHTML);
  window.electronAPI.onExportPDFRequest(exportPDF);
  window.electronAPI.onFormat((action) => formatMarkdown(action));
  window.electronAPI.onToggleSidebar(toggleSidebar);
  window.electronAPI.onSetMode((mode) => setMode(mode));
  window.electronAPI.onToggleFocus((checked) => toggleFocusMode(checked));
  window.electronAPI.onToggleTypewriter((checked) => toggleTypewriterMode(checked));
  window.electronAPI.onSetTheme((theme2) => setTheme(theme2));
}
function getEditorContent() {
  if (currentMode === "live") {
    return pmView ? serializeMarkdown(pmView.state.doc) : "";
  } else {
    return cmView ? cmView.state.doc.toString() : "";
  }
}

var parseDebounceTimer;
function updatePreview() {
  clearTimeout(parseDebounceTimer);
  parseDebounceTimer = setTimeout(async () => {
    const rawMarkdown = getEditorContent();
    const html2 = await window.electronAPI.parseMarkdown(rawMarkdown);
    preview.innerHTML = html2;
    bindTaskCheckboxes();

    // Render Mermaid diagrams
    const mermaidDivs = preview.querySelectorAll(".mermaid");
    if (mermaidDivs.length > 0) {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: isThemeDark(currentTheme) ? 'dark' : 'default',
        });
        await mermaid.run({
          nodes: Array.from(mermaidDivs)
        });
      } catch (err) {
        console.error("Error rendering Mermaid diagram:", err);
      }
    }

    // Add Copy buttons to code blocks
    const preBlocks = preview.querySelectorAll('pre');
    preBlocks.forEach((pre) => {
      if (pre.classList.contains('mermaid') || pre.querySelector('.code-copy-btn')) {
        return;
      }
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'code-copy-btn';
      copyBtn.title = 'Copy code';
      copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      `;
      
      pre.style.position = 'relative';
      
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const codeElement = pre.querySelector('code');
        const textToCopy = codeElement ? codeElement.innerText : pre.innerText;
        
        try {
          await navigator.clipboard.writeText(textToCopy);
          copyBtn.classList.add('copied');
          copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #4caf50;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          `;
          
          setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = `
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            `;
          }, 1500);
        } catch (err) {
          console.error("Failed to copy code block:", err);
        }
      });
      
      pre.appendChild(copyBtn);
    });
  }, 50);
}
function bindTaskCheckboxes() {
  const checkboxes = preview.querySelectorAll(".task-list-item-checkbox");
  checkboxes.forEach((cb, index) => {
    cb.removeAttribute("disabled");
    cb.addEventListener("change", () => {
      toggleTaskCheckboxInMarkdown(index, cb.checked);
    });
  });
}
function toggleTaskCheckboxInMarkdown(index, isChecked) {
  let text = getEditorContent();
  let checkboxCount = 0;
  const taskRegex = /^([\s]*[-*]\s)\[([ xX])\]/gm;
  let match;
  while ((match = taskRegex.exec(text)) !== null) {
    if (checkboxCount === index) {
      const matchIndex = match.index;
      const bracketIndex = matchIndex + match[1].length;
      const charToPut = isChecked ? "x" : " ";
      if (cmView) {
        cmView.dispatch({
          changes: { from: bracketIndex + 1, to: bracketIndex + 2, insert: charToPut }
        });
      }
      break;
    }
    checkboxCount++;
  }
}
function checkUnsaved() {
  const currentContent = getEditorContent();
  isUnsaved = currentContent !== originalContent;
  if (isUnsaved) {
    saveIndicator.classList.add("unsaved");
  } else {
    saveIndicator.classList.remove("unsaved");
  }
}
function triggerAutoSave() {
  if (!currentFilePath) return;
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(() => {
    if (isUnsaved) {
      saveFileSilent();
    }
  }, 2e3);
}
async function saveFileSilent() {
  if (!currentFilePath) return;
  const content2 = getEditorContent();
  const result = await window.electronAPI.saveFile(currentFilePath, content2);
  if (result.success) {
    originalContent = content2;
    checkUnsaved();
  }
}
async function saveFile() {
  const content2 = getEditorContent();
  if (currentFilePath) {
    const result = await window.electronAPI.saveFile(currentFilePath, content2);
    if (result.success) {
      originalContent = content2;
      checkUnsaved();
    } else {
      alert(`Error saving file: ${result.error}`);
    }
  } else {
    saveFileAs();
  }
}
async function saveFileAs() {
  const content2 = getEditorContent();
  const result = await window.electronAPI.saveFileAs(content2);
  if (result) {
    currentFilePath = result.filePath;
    currentFileName = result.fileName;
    originalContent = content2;
    filenameDisplay.textContent = currentFileName;
    filepathDisplay.textContent = currentFilePath;
    checkUnsaved();
    addToRecent(currentFilePath);
    if (currentFolderPath) {
      readWorkspaceFolder(currentFolderPath);
    }
  }
}
async function createNewFile() {
  if (isUnsaved) {
    const confirm = window.confirm("You have unsaved changes. Do you want to create a new file anyway?");
    if (!confirm) return;
  }
  currentFilePath = null;
  currentFileName = "Untitled.md";
  originalContent = "";
  createEditor("");
  filenameDisplay.textContent = currentFileName;
  filepathDisplay.textContent = "New File";
  checkUnsaved();
  updatePreview();
  buildOutline();
  updateStats();
  document.querySelectorAll(".tree-node-file").forEach((el) => el.classList.remove("active"));
  if (currentMode === "live") {
    createLiveEditor("");
  }
}
async function loadFile(filePath) {
  if (isUnsaved) {
    const confirm = window.confirm("You have unsaved changes. Save changes before opening another file?");
    if (confirm) {
      await saveFile();
    }
  }
  const result = await window.electronAPI.readFile(filePath);
  if (result.success) {
    currentFilePath = filePath;
    currentFileName = result.fileName;
    originalContent = result.content;
    createEditor(result.content);
    filenameDisplay.textContent = currentFileName;
    filepathDisplay.textContent = currentFilePath;
    checkUnsaved();
    updatePreview();
    buildOutline();
    updateStats();
    addToRecent(filePath);
    highlightActiveFileInTree(filePath);
    if (currentMode === "live") {
      createLiveEditor(result.content);
    }
  } else {
    alert(`Could not load file: ${result.error}`);
  }
}
function openFilePayload(data2) {
  currentFilePath = data2.filePath;
  currentFileName = data2.fileName;
  originalContent = data2.content;
  createEditor(data2.content);
  filenameDisplay.textContent = currentFileName;
  filepathDisplay.textContent = currentFilePath;
  checkUnsaved();
  updatePreview();
  buildOutline();
  updateStats();
  addToRecent(currentFilePath);
  highlightActiveFileInTree(currentFilePath);
  if (currentMode === "live") {
    createLiveEditor(data2.content);
  }
}
function highlightActiveFileInTree(filePath) {
  document.querySelectorAll(".tree-node-file").forEach((node) => {
    node.classList.remove("active");
  });
  const nodes = document.querySelectorAll(".tree-node-file");
  for (let node of nodes) {
    if (node.getAttribute("data-path") === filePath) {
      node.classList.add("active");
      let parent = node.parentElement.parentElement;
      while (parent && parent.classList.contains("folder-children")) {
        parent.classList.remove("collapsed");
        const arrow = parent.previousElementSibling.querySelector(".tree-arrow");
        if (arrow) {
          arrow.classList.add("expanded");
          arrow.innerHTML = "\u25BE";
        }
        parent = parent.parentElement.parentElement;
      }
      break;
    }
  }
}
async function selectWorkspaceFolder() {
  const data2 = await window.electronAPI.selectFolder();
  if (data2) {
    openFolderPayload(data2);
  }
}
function openFolderPayload(data2) {
  currentFolderPath = data2.folderPath;
  localStorage.setItem("folderPath", currentFolderPath);
  sidebarEmpty.style.display = "none";
  fileTree.style.display = "flex";
  renderFolderTree(data2.files, fileTree);
  if (currentFilePath) {
    highlightActiveFileInTree(currentFilePath);
  }
}
async function readWorkspaceFolder(folderPath) {
  const result = await window.electronAPI.readFolder(folderPath);
  if (result.success) {
    sidebarEmpty.style.display = "none";
    fileTree.style.display = "flex";
    renderFolderTree(result.files, fileTree);
    if (currentFilePath) {
      highlightActiveFileInTree(currentFilePath);
    }
  } else {
    sidebarEmpty.style.display = "flex";
    fileTree.style.display = "none";
    localStorage.removeItem("folderPath");
  }
}
function renderFolderTree(files, container, depth = 0) {
  container.innerHTML = "";
  if (!files || files.length === 0) return;
  files.forEach((file) => {
    const node = document.createElement("div");
    node.className = "tree-node-wrapper";
    const item = document.createElement("div");
    item.className = "tree-node";
    item.setAttribute("data-path", file.path);
    if (currentFilePath === file.path) {
      item.classList.add("active");
    }
    for (let i2 = 0; i2 < depth; i2++) {
      const indent = document.createElement("div");
      indent.className = "tree-indent";
      item.appendChild(indent);
    }
    if (file.isDirectory) {
      item.classList.add("tree-node-folder");
      const arrow = document.createElement("span");
      arrow.className = "tree-arrow";
      arrow.innerHTML = "\u25B8";
      item.appendChild(arrow);
      const folderIcon = document.createElement("span");
      folderIcon.className = "tree-icon";
      folderIcon.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
      </svg>
    `;
      item.appendChild(folderIcon);
      const name2 = document.createElement("span");
      name2.className = "tree-name";
      name2.textContent = file.name;
      item.appendChild(name2);
      const childrenContainer = document.createElement("div");
      childrenContainer.className = "folder-children collapsed";
      const folderId = `folder-collapsed-${file.path}`;
      const isCollapsed = localStorage.getItem(folderId) !== "false";
      if (!isCollapsed) {
        childrenContainer.classList.remove("collapsed");
        arrow.classList.add("expanded");
        arrow.innerHTML = "\u25BE";
      }
      item.addEventListener("click", () => {
        const collapsed = childrenContainer.classList.toggle("collapsed");
        arrow.classList.toggle("expanded", !collapsed);
        arrow.innerHTML = collapsed ? "\u25B8" : "\u25BE";
        localStorage.setItem(folderId, String(collapsed));
      });
      node.appendChild(item);
      renderFolderTree(file.children, childrenContainer, depth + 1);
      node.appendChild(childrenContainer);
    } else {
      item.classList.add("tree-node-file");
      const spacer = document.createElement("span");
      spacer.className = "tree-indent";
      item.appendChild(spacer);
      const fileIcon = document.createElement("span");
      fileIcon.className = "tree-icon";
      fileIcon.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
      </svg>
    `;
      item.appendChild(fileIcon);
      const name2 = document.createElement("span");
      name2.className = "tree-name";
      name2.textContent = file.name;
      item.appendChild(name2);
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        loadFile(file.path);
      });
      node.appendChild(item);
    }
    container.appendChild(node);
  });
}
function addToRecent(filePath) {
  let recents = JSON.parse(localStorage.getItem("recentFiles") || "[]");
  recents = recents.filter((f) => f !== filePath);
  recents.unshift(filePath);
  recents = recents.slice(0, 10);
  localStorage.setItem("recentFiles", JSON.stringify(recents));
  renderRecentList();
}
function renderRecentList() {
  recentList.innerHTML = "";
  const recents = JSON.parse(localStorage.getItem("recentFiles") || "[]");
  if (recents.length === 0) {
    recentEmpty.style.display = "flex";
    recentList.style.display = "none";
    return;
  }
  recentEmpty.style.display = "none";
  recentList.style.display = "flex";
  recents.forEach((path) => {
    const item = document.createElement("div");
    item.className = "tree-node tree-node-file";
    item.setAttribute("data-path", path);
    const name2 = path.split(/[/\\]/).pop();
    item.innerHTML = `
    <span class="tree-indent"></span>
    <span class="tree-icon">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
      </svg>
    </span>
    <span class="tree-name" title="${path}">${name2}</span>
  `;
    item.addEventListener("click", () => {
      loadFile(path);
    });
    recentList.appendChild(item);
  });
}
function buildOutline() {
  outlineTree.innerHTML = "";
  const text = getEditorContent();
  const lines = text.split("\n");
  const headingPattern = /^(#{1,6})\s+(.+)$/;
  let headings = [];
  let charIndex = 0;
  for (let i2 = 0; i2 < lines.length; i2++) {
    const line = lines[i2];
    const match = line.match(headingPattern);
    if (match) {
      const level = match[1].length;
      const textVal = match[2];
      headings.push({
        level,
        text: textVal,
        lineIndex: i2,
        charIndex
      });
    }
    charIndex += line.length + 1;
  }
  if (headings.length === 0) {
    outlineEmpty.style.display = "flex";
    outlineTree.style.display = "none";
  } else {
    outlineEmpty.style.display = "none";
    outlineTree.style.display = "flex";
    headings.forEach((heading2) => {
      const el = document.createElement("a");
      el.className = `outline-node outline-h${heading2.level}`;
      el.textContent = heading2.text;
      el.href = "#";
      el.addEventListener("click", (e) => {
        e.preventDefault();
        
        const headingIndex = headings.indexOf(heading2);
        
        if (currentMode === "write" || currentMode === "split") {
          if (cmView) {
            cmView.focus();
            cmView.dispatch({
              selection: { anchor: heading2.charIndex },
              scrollIntoView: true
            });
            if (isTypewriterMode) {
              setTimeout(centerActiveLine, 100);
            }
          }
        } else if (currentMode === "live") {
          if (pmView) {
            pmView.focus();
            let currentHeadingCount = 0;
            let foundPos = -1;
            pmView.state.doc.descendants((node, pos) => {
              if (node.type.name === 'heading') {
                if (currentHeadingCount === headingIndex) {
                  foundPos = pos;
                  return false;
                }
                currentHeadingCount++;
              }
            });
            
            if (foundPos !== -1) {
              const tr = pmView.state.tr.setSelection(TextSelection.create(pmView.state.doc, foundPos + 1));
              tr.scrollIntoView();
              pmView.dispatch(tr);
              if (isTypewriterMode) {
                setTimeout(centerActiveLine, 100);
              }
            }
          }
        } else if (currentMode === "preview") {
          if (previewScrollContainer) {
            const previewHeadings = preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
            if (previewHeadings.length > headingIndex) {
              const targetHeadingEl = previewHeadings[headingIndex];
              const rect = targetHeadingEl.getBoundingClientRect();
              const containerRect = previewScrollContainer.getBoundingClientRect();
              const relativeTop = rect.top - containerRect.top + previewScrollContainer.scrollTop;
              previewScrollContainer.scrollTo({
                top: relativeTop - 20,
                behavior: 'smooth'
              });
            }
          }
        }
      });
      outlineTree.appendChild(el);
    });
  }
}
function switchSidebarTab(tab) {
  tabFiles.classList.remove("active");
  tabOutline.classList.remove("active");
  tabRecent.classList.remove("active");
  panelFiles.classList.remove("active");
  panelOutline.classList.remove("active");
  panelRecent.classList.remove("active");
  if (tab === "files") {
    tabFiles.classList.add("active");
    panelFiles.classList.add("active");
  } else if (tab === "outline") {
    tabOutline.classList.add("active");
    panelOutline.classList.add("active");
    buildOutline();
  } else if (tab === "recent") {
    tabRecent.classList.add("active");
    panelRecent.classList.add("active");
    renderRecentList();
  }
}
function toggleSidebar() {
  const isHidden = sidebar.classList.toggle("hidden");
  if (isHidden) {
    sidebar.style.width = "0px";
  } else {
    const cachedWidth = localStorage.getItem("sidebarWidth") || "250px";
    sidebar.style.width = cachedWidth;
    document.documentElement.style.setProperty("--sidebar-width", cachedWidth);
  }
}
function setMode(mode) {
  currentMode = mode;
  localStorage.setItem("mode", mode);
  updateModeUI();
}
function updateModeUI() {
  document.body.classList.remove("mode-write", "mode-live", "mode-split", "mode-preview");
  btnModeWrite.classList.remove("active");
  btnModeLive.classList.remove("active");
  btnModeSplit.classList.remove("active");
  btnModePreview.classList.remove("active");

  if (currentMode === "live") {
    document.body.classList.add("mode-live");
    btnModeLive.classList.add("active");
    if (cmView) {
      const content = cmView.state.doc.toString();
      createLiveEditor(content);
    }
  } else {
    if (pmView) {
      const serialized = serializeMarkdown(pmView.state.doc);
      if (cmView) {
        cmView.dispatch({
          changes: { from: 0, to: cmView.state.doc.length, insert: serialized }
        });
      }
      pmView.destroy();
      pmView = null;
    }

    if (currentMode === "write") {
      document.body.classList.add("mode-write");
      btnModeWrite.classList.add("active");
    } else if (currentMode === "split") {
      document.body.classList.add("mode-split");
      btnModeSplit.classList.add("active");
      editorFrame.style.flex = "1";
      previewFrame.style.flex = "1";
    } else if (currentMode === "preview") {
      document.body.classList.add("mode-preview");
      btnModePreview.classList.add("active");
    }
  }

  if (cmView) {
    cmView.dispatch({
      effects: []
    });
  }
  updatePreview();
}
function setTheme(theme2) {
  currentTheme = theme2;
  localStorage.setItem("theme", theme2);
  updateThemeUI();
  
  // Re-render active live diagrams to match the new theme
  activeMermaidNodeViews.forEach(nv => {
    if (!nv.isEditing) {
      nv.renderDiagram();
    }
  });

  // Force ProseMirror to update its decorators for the new theme
  if (typeof pmView !== 'undefined' && pmView) {
    pmView.dispatch(pmView.state.tr);
  }
}
function updateThemeUI() {
  document.body.classList.remove(
    "theme-light",
    "theme-dark",
    "theme-sepia",
    "theme-gothic",
    "theme-newsprint",
    "theme-vue",
    "theme-dracula",
    "theme-onedark",
    "theme-achromatic-light",
    "theme-achromatic-dark"
  );
  document.body.classList.add(`theme-${currentTheme}`);
}
function toggleToolbar() {
  isToolbarExpanded = !isToolbarExpanded;
  localStorage.setItem("toolbarExpanded", String(isToolbarExpanded));
  if (isToolbarExpanded) {
    collapsibleToolbar.classList.add("expanded");
    collapsibleToolbar.classList.remove("collapsed");
    btnToggleToolbar.classList.add("active");
  } else {
    collapsibleToolbar.classList.add("collapsed");
    collapsibleToolbar.classList.remove("expanded");
    btnToggleToolbar.classList.remove("active");
  }
}
function handleSelectionChange() {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0 && selection.toString().trim().length > 0) {
    const range = selection.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer;
    
    const editorNode = document.getElementById("editor");
    const liveEditorNode = document.getElementById("live-editor");
    
    const isCM = editorNode && editorNode.contains(commonAncestor);
    const isPM = liveEditorNode && liveEditorNode.contains(commonAncestor);
    
    if ((isCM && currentMode !== "live") || (isPM && currentMode === "live")) {
      const rect = range.getBoundingClientRect();
      
      bubbleToolbar.classList.add("show");
      
      const bubbleWidth = bubbleToolbar.offsetWidth || 320;
      const bubbleHeight = bubbleToolbar.offsetHeight || 38;
      
      let topPos = rect.top - bubbleHeight - 10;
      let leftPos = rect.left + rect.width / 2 - bubbleWidth / 2;
      
      if (topPos < 10) {
        topPos = rect.bottom + 10;
      }
      if (leftPos < 10) {
        leftPos = 10;
      }
      if (leftPos + bubbleWidth > window.innerWidth - 10) {
        leftPos = window.innerWidth - bubbleWidth - 10;
      }
      
      bubbleToolbar.style.top = `${topPos}px`;
      bubbleToolbar.style.left = `${leftPos}px`;
      return;
    }
  }
  
  bubbleToolbar.classList.remove("show");
}
function toggleFocusMode(checked) {
  isFocusMode = checked !== void 0 ? checked : !isFocusMode;
  localStorage.setItem("focusMode", String(isFocusMode));
  if (isFocusMode) {
    document.body.classList.add("focus-active");
    focusIndicator.classList.remove("hide");
  } else {
    document.body.classList.remove("focus-active");
    focusIndicator.classList.add("hide");
  }
}
let debugLogs = [];
function logDebug(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}`;
  debugLogs.push(logLine);
  if (window.electronAPI && window.electronAPI.saveFile) {
    window.electronAPI.saveFile('/home/kimmi/Projects/markdowned/debug_log.txt', debugLogs.join('\n'));
  }
}

function toggleTypewriterMode(checked) {
  isTypewriterMode = checked !== void 0 ? checked : !isTypewriterMode;
  logDebug("toggleTypewriterMode called, isTypewriterMode = " + isTypewriterMode);
  localStorage.setItem("typewriterMode", String(isTypewriterMode));
  if (isTypewriterMode) {
    document.body.classList.add("typewriter-active");
    typewriterIndicator.classList.remove("hide");
    centerActiveLine();
  } else {
    document.body.classList.remove("typewriter-active");
    typewriterIndicator.classList.add("hide");
  }
}
function centerActiveLine() {
  logDebug("centerActiveLine called, isTypewriterMode = " + isTypewriterMode + ", mode = " + currentMode);
  if (typewriterTimeout) {
    clearTimeout(typewriterTimeout);
  }
  typewriterTimeout = setTimeout(() => {
    typewriterTimeout = null;
    try {
      let coords = null;
      let scrollContainer = null;
      
      if (currentMode === "live") {
        if (!pmView) {
          logDebug("pmView is null!");
          return;
        }
        const { from } = pmView.state.selection;
        coords = pmView.coordsAtPos(from);
        scrollContainer = liveEditorScrollContainer;
      } else {
        if (!cmView) {
          logDebug("cmView is null!");
          return;
        }
        const head = cmView.state.selection.main.head;
        coords = cmView.coordsAtPos(head);
        scrollContainer = editorScrollContainer;
      }
      
      logDebug("coords = " + JSON.stringify(coords) + ", scrollContainer = " + (scrollContainer ? scrollContainer.id : null));
      if (!coords || !scrollContainer) return;
      
      const containerRect = scrollContainer.getBoundingClientRect();
      const relativeCursorY = coords.top - containerRect.top;
      const scrollOffset = relativeCursorY - (containerRect.height / 2);
      
      logDebug("relativeCursorY = " + relativeCursorY + ", scrollOffset = " + scrollOffset + ", scrollTop before = " + scrollContainer.scrollTop);
      scrollContainer.scrollTop += scrollOffset;
      logDebug("scrollTop after = " + scrollContainer.scrollTop);
    } catch (e) {
      logDebug("Typewriter centering error: " + e.message);
    }
  }, 15);
}
function formatMarkdown(type) {
  if (currentMode === "live") {
    if (!pmView) return;
    switch (type) {
      case "bold":
        executePMCommand(toggleBold);
        break;
      case "italic":
        executePMCommand(toggleItalic);
        break;
      case "code":
        executePMCommand(toggleInlineCode);
        break;
      case "link":
        const url = prompt("Enter link URL:", "https://");
        if (url) {
          executePMCommand(toggleLink(url));
        }
        break;
      case "h1":
        executePMCommand(toggleHeading(1));
        break;
      case "h2":
        executePMCommand(toggleHeading(2));
        break;
      case "h3":
        executePMCommand(toggleHeading(3));
        break;
      case "ul":
        executePMCommand(toggleBulletList());
        break;
      case "ol":
        executePMCommand(toggleOrderedList());
        break;
      case "quote":
        executePMCommand(toggleQuote);
        break;
      case "table":
        executePMCommand(insertTable(3, 3));
        break;
    }
  } else {
    if (!cmView) return;
    const { state } = cmView;
  const { from, to } = state.selection.main;
  const selectedText = state.doc.sliceString(from, to);
  let formatted = "";
  let cursorOffset = 0;
  let selectLength = 0;
  switch (type) {
    case "bold":
      formatted = `**${selectedText || "strong text"}**`;
      cursorOffset = 2;
      selectLength = selectedText ? selectedText.length : 11;
      break;
    case "italic":
      formatted = `*${selectedText || "italic text"}*`;
      cursorOffset = 1;
      selectLength = selectedText ? selectedText.length : 11;
      break;
    case "code":
      formatted = `\`${selectedText || "code"}\``;
      cursorOffset = 1;
      selectLength = selectedText ? selectedText.length : 4;
      break;
    case "link":
      formatted = `[${selectedText || "link text"}](https://example.com)`;
      cursorOffset = 1;
      selectLength = selectedText ? selectedText.length : 9;
      break;
    case "h1":
      formatted = `
# ${selectedText || "Heading 1"}
`;
      cursorOffset = 3;
      selectLength = selectedText ? selectedText.length : 9;
      break;
    case "h2":
      formatted = `
## ${selectedText || "Heading 2"}
`;
      cursorOffset = 4;
      selectLength = selectedText ? selectedText.length : 9;
      break;
    case "h3":
      formatted = `
### ${selectedText || "Heading 3"}
`;
      cursorOffset = 5;
      selectLength = selectedText ? selectedText.length : 9;
      break;
    case "ul":
      formatted = `
- ${selectedText || "List item"}
`;
      cursorOffset = 3;
      selectLength = selectedText ? selectedText.length : 9;
      break;
    case "ol":
      formatted = `
1. ${selectedText || "List item"}
`;
      cursorOffset = 4;
      selectLength = selectedText ? selectedText.length : 9;
      break;
    case "quote":
      formatted = `
> ${selectedText || "Blockquote"}
`;
      cursorOffset = 3;
      selectLength = selectedText ? selectedText.length : 10;
      break;
    case "table":
      formatted = `
| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |
`;
      cursorOffset = 1;
      selectLength = formatted.length - 1;
      break;
  }
  cmView.dispatch({
    changes: { from, to, insert: formatted },
    selection: { anchor: from + cursorOffset, head: from + cursorOffset + selectLength }
  });
  cmView.focus();
  onEditorContentChange();
  }
}
function updateStats() {
  const text = cmView ? cmView.state.doc.toString() : "";
  const chars = text.length;
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  const readTime = Math.ceil(words / 200) || 0;
  charCountLabel.textContent = `${chars} char${chars !== 1 ? "s" : ""}`;
  wordCountLabel.textContent = `${words} word${words !== 1 ? "s" : ""}`;
  readTimeLabel.textContent = `${readTime} min read`;
}
async function exportHTML() {
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${currentFileName.replace(".md", "")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    line-height: 1.6;
    max-width: 800px;
    margin: 40px auto;
    padding: 0 20px;
    color: #24292f;
    background-color: #ffffff;
  }
  pre {
    background-color: #f6f8fa;
    padding: 16px;
    border-radius: 6px;
    overflow: auto;
    border: 1px solid #d0d7de;
  }
  code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 85%;
    background-color: rgba(175,184,193,0.2);
    padding: 0.2em 0.4em;
    border-radius: 6px;
  }
  pre code {
    background-color: transparent;
    padding: 0;
  }
  blockquote {
    border-left: 4px solid #0969da;
    padding: 8px 16px;
    margin: 0;
    color: #57606a;
    background-color: #f6f8fa;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 16px;
  }
  th, td {
    border: 1px solid #d0d7de;
    padding: 6px 13px;
  }
  tr:nth-child(2n) {
    background-color: #f6f8fa;
  }
</style>
</head>
<body>
<article class="markdown-body">
  ${preview.innerHTML}
</article>
</body>
</html>`;
  const defaultName = currentFileName.replace(".md", ".html");
  const result = await window.electronAPI.exportHTML(defaultName, htmlContent);
  if (result && result.success) {
    alert(`HTML exported successfully to:
${result.filePath}`);
  }
}
async function exportPDF() {
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    line-height: 1.6;
    padding: 40px;
    color: #24292f;
    background-color: #ffffff;
    font-size: 14px;
  }
  h1, h2, h3 {
    page-break-after: avoid;
  }
  pre {
    background-color: #f6f8fa;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid #d0d7de;
    font-size: 12px;
    page-break-inside: avoid;
  }
  code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 85%;
    background-color: rgba(175,184,193,0.2);
    padding: 0.2em 0.4em;
    border-radius: 4px;
  }
  pre code {
    background-color: transparent;
    padding: 0;
  }
  blockquote {
    border-left: 4px solid #0969da;
    padding: 8px 16px;
    margin: 0;
    color: #57606a;
    background-color: #f6f8fa;
    page-break-inside: avoid;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 16px;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #d0d7de;
    padding: 6px 13px;
  }
  tr:nth-child(2n) {
    background-color: #f6f8fa;
  }
  img {
    max-width: 100%;
    height: auto;
    page-break-inside: avoid;
  }
</style>
</head>
<body>
<article>
  ${preview.innerHTML}
</article>
</body>
</html>`;
  const defaultName = currentFileName.replace(".md", ".pdf");
  const result = await window.electronAPI.exportPDF(defaultName, htmlContent);
  if (result && result.success) {
    alert(`PDF exported successfully to:
${result.filePath}`);
  } else if (result && !result.success) {
    alert(`Error exporting PDF: ${result.error}`);
  }
}
async function copyMarkdownToClipboard() {
  const content = getEditorContent();
  try {
    await navigator.clipboard.writeText(content);
    showToast("Markdown copied to clipboard!", "success");
  } catch (err) {
    console.error("Failed to copy markdown:", err);
    showToast("Failed to copy to clipboard", "error");
  }
}
async function copyHTMLToClipboard() {
  const rawMarkdown = getEditorContent();
  try {
    const htmlContent = await window.electronAPI.parseMarkdown(rawMarkdown);
    await navigator.clipboard.writeText(htmlContent);
    showToast("HTML copied to clipboard!", "success");
  } catch (err) {
    console.error("Failed to copy HTML:", err);
    showToast("Failed to copy HTML to clipboard", "error");
  }
}

init();

// Custom Menu and Command Palette Implementation

const menuData = [
  {
    label: 'File',
    submenu: [
      { label: 'New File', accelerator: 'Ctrl+N', action: 'new-file' },
      { label: 'Open File...', accelerator: 'Ctrl+O', action: 'open-file' },
      { label: 'Open Folder...', accelerator: 'Ctrl+Shift+O', action: 'open-folder' },
      { type: 'separator' },
      { label: 'Save', accelerator: 'Ctrl+S', action: 'save' },
      { label: 'Save As...', accelerator: 'Ctrl+Shift+S', action: 'save-as' },
      { type: 'separator' },
      { label: 'Export to HTML...', action: 'export-html' },
      { label: 'Export to PDF...', action: 'export-pdf' }
    ]
  },
  {
    label: 'Edit',
    submenu: [
      { label: 'Undo', accelerator: 'Ctrl+Z', action: 'undo' },
      { label: 'Redo', accelerator: 'Ctrl+Y', action: 'redo' },
      { type: 'separator' },
      { label: 'Cut', accelerator: 'Ctrl+X', action: 'cut' },
      { label: 'Copy', accelerator: 'Ctrl+C', action: 'copy' },
      { label: 'Paste', accelerator: 'Ctrl+V', action: 'paste' },
      { type: 'separator' },
      { label: 'Select All', accelerator: 'Ctrl+A', action: 'select-all' },
      { type: 'separator' },
      { label: 'Copy as Markdown', action: 'copy-markdown' },
      { label: 'Copy as HTML', action: 'copy-html' }
    ]
  },
  {
    label: 'Format',
    submenu: [
      { label: 'Bold', accelerator: 'Ctrl+B', action: 'format-bold' },
      { label: 'Italic', accelerator: 'Ctrl+I', action: 'format-italic' },
      { label: 'Inline Code', accelerator: 'Ctrl+`', action: 'format-code' },
      { label: 'Link', accelerator: 'Ctrl+K', action: 'format-link' },
      { type: 'separator' },
      { label: 'Heading 1', accelerator: 'Ctrl+1', action: 'format-h1' },
      { label: 'Heading 2', accelerator: 'Ctrl+2', action: 'format-h2' },
      { label: 'Heading 3', accelerator: 'Ctrl+3', action: 'format-h3' },
      { type: 'separator' },
      { label: 'Unordered List', accelerator: 'Ctrl+L', action: 'format-ul' },
      { label: 'Ordered List', accelerator: 'Ctrl+Shift+L', action: 'format-ol' }
    ]
  },
  {
    label: 'View',
    submenu: [
      { label: 'Toggle Sidebar', accelerator: 'Ctrl+\\', action: 'toggle-sidebar' },
      { type: 'separator' },
      { label: 'Mode: Write', accelerator: 'Ctrl+Alt+1', action: 'mode-write' },
      { label: 'Mode: Live', accelerator: 'Ctrl+Alt+2', action: 'mode-live' },
      { label: 'Mode: Split', accelerator: 'Ctrl+Alt+3', action: 'mode-split' },
      { label: 'Mode: Preview', accelerator: 'Ctrl+Alt+4', action: 'mode-preview' },
      { type: 'separator' },
      { label: 'Focus Mode', accelerator: 'Ctrl+Alt+F', action: 'toggle-focus', type: 'checkbox', getChecked: () => isFocusMode },
      { label: 'Typewriter Mode', accelerator: 'Ctrl+Alt+T', action: 'toggle-typewriter', type: 'checkbox', getChecked: () => isTypewriterMode }
    ]
  },
  {
    label: 'Theme',
    submenu: [
      { label: 'Github (Light)', action: 'theme-light', type: 'radio', value: 'light', getChecked: () => currentTheme === 'light' },
      { label: 'Night (Dark)', action: 'theme-dark', type: 'radio', value: 'dark', getChecked: () => currentTheme === 'dark' },
      { label: 'Sepia (Vintage)', action: 'theme-sepia', type: 'radio', value: 'sepia', getChecked: () => currentTheme === 'sepia' },
      { label: 'Gothic (Neo-Dark)', action: 'theme-gothic', type: 'radio', value: 'gothic', getChecked: () => currentTheme === 'gothic' },
      { label: 'Newsprint (Classic Light)', action: 'theme-newsprint', type: 'radio', value: 'newsprint', getChecked: () => currentTheme === 'newsprint' },
      { label: 'Vue (Developer Light)', action: 'theme-vue', type: 'radio', value: 'vue', getChecked: () => currentTheme === 'vue' },
      { label: 'Dracula (Developer Dark)', action: 'theme-dracula', type: 'radio', value: 'dracula', getChecked: () => currentTheme === 'dracula' },
      { label: 'One Dark (Developer Dark)', action: 'theme-onedark', type: 'radio', value: 'onedark', getChecked: () => currentTheme === 'onedark' },
      { label: 'Achromatic Light', action: 'theme-achromatic-light', type: 'radio', value: 'achromatic-light', getChecked: () => currentTheme === 'achromatic-light' },
      { label: 'Achromatic Dark', action: 'theme-achromatic-dark', type: 'radio', value: 'achromatic-dark', getChecked: () => currentTheme === 'achromatic-dark' }
    ]
  },
  {
    label: 'Help',
    submenu: [
      { label: 'Markdown Guide', action: 'open-help-guide' }
    ]
  }
];

const commandPaletteData = [
  { name: 'File: New File', action: 'new-file', kbd: 'Ctrl+N', category: 'File' },
  { name: 'File: Open File...', action: 'open-file', kbd: 'Ctrl+O', category: 'File' },
  { name: 'File: Open Folder...', action: 'open-folder', kbd: 'Ctrl+Shift+O', category: 'File' },
  { name: 'File: Save Current File', action: 'save', kbd: 'Ctrl+S', category: 'File' },
  { name: 'File: Save As...', action: 'save-as', kbd: 'Ctrl+Shift+S', category: 'File' },
  { name: 'File: Export to HTML...', action: 'export-html', category: 'File' },
  { name: 'File: Export to PDF...', action: 'export-pdf', category: 'File' },
  
  { name: 'Edit: Undo', action: 'undo', kbd: 'Ctrl+Z', category: 'Edit' },
  { name: 'Edit: Redo', action: 'redo', kbd: 'Ctrl+Y', category: 'Edit' },
  { name: 'Edit: Cut Selection', action: 'cut', kbd: 'Ctrl+X', category: 'Edit' },
  { name: 'Edit: Copy Selection', action: 'copy', kbd: 'Ctrl+C', category: 'Edit' },
  { name: 'Edit: Paste Clipboard', action: 'paste', kbd: 'Ctrl+V', category: 'Edit' },
  { name: 'Edit: Select All Text', action: 'select-all', kbd: 'Ctrl+A', category: 'Edit' },
  { name: 'Edit: Copy Entire Document as Markdown', action: 'copy-markdown', category: 'Edit' },
  { name: 'Edit: Copy Entire Document as HTML', action: 'copy-html', category: 'Edit' },
  
  { name: 'Format: Toggle Bold Text', action: 'format-bold', kbd: 'Ctrl+B', category: 'Format' },
  { name: 'Format: Toggle Italic Text', action: 'format-italic', kbd: 'Ctrl+I', category: 'Format' },
  { name: 'Format: Toggle Inline Code', action: 'format-code', kbd: 'Ctrl+`', category: 'Format' },
  { name: 'Format: Toggle Link', action: 'format-link', kbd: 'Ctrl+K', category: 'Format' },
  { name: 'Format: Apply Heading 1', action: 'format-h1', kbd: 'Ctrl+1', category: 'Format' },
  { name: 'Format: Apply Heading 2', action: 'format-h2', kbd: 'Ctrl+2', category: 'Format' },
  { name: 'Format: Apply Heading 3', action: 'format-h3', kbd: 'Ctrl+3', category: 'Format' },
  { name: 'Format: Toggle Unordered List', action: 'format-ul', kbd: 'Ctrl+L', category: 'Format' },
  { name: 'Format: Toggle Ordered List', action: 'format-ol', kbd: 'Ctrl+Shift+L', category: 'Format' },
  
  { name: 'View: Toggle Sidebar Panel', action: 'toggle-sidebar', kbd: 'Ctrl+\\', category: 'View' },
  { name: 'View: Set Mode: Write (Editor Only)', action: 'mode-write', kbd: 'Ctrl+Alt+1', category: 'View' },
  { name: 'View: Set Mode: Live (WYSIWYG)', action: 'mode-live', kbd: 'Ctrl+Alt+2', category: 'View' },
  { name: 'View: Set Mode: Split (Editor + Preview)', action: 'mode-split', kbd: 'Ctrl+Alt+3', category: 'View' },
  { name: 'View: Set Mode: Preview (HTML Only)', action: 'mode-preview', kbd: 'Ctrl+Alt+4', category: 'View' },
  { name: 'View: Toggle Focus Mode', action: 'toggle-focus', kbd: 'Ctrl+Alt+F', category: 'View' },
  { name: 'View: Toggle Typewriter Scrolling', action: 'toggle-typewriter', kbd: 'Ctrl+Alt+T', category: 'View' },
  
  { name: 'Theme: Set Github Theme (Light)', action: 'theme-light', category: 'Theme', value: 'light' },
  { name: 'Theme: Set Night Theme (Dark)', action: 'theme-dark', category: 'Theme', value: 'dark' },
  { name: 'Theme: Set Sepia Theme (Vintage)', action: 'theme-sepia', category: 'Theme', value: 'sepia' },
  { name: 'Theme: Set Gothic Theme (Neo-Dark)', action: 'theme-gothic', category: 'Theme', value: 'gothic' },
  { name: 'Theme: Set Newsprint Theme (Classic Light)', action: 'theme-newsprint', category: 'Theme', value: 'newsprint' },
  { name: 'Theme: Set Vue Theme (Developer Light)', action: 'theme-vue', category: 'Theme', value: 'vue' },
  { name: 'Theme: Set Dracula Theme (Developer Dark)', action: 'theme-dracula', category: 'Theme', value: 'dracula' },
  { name: 'Theme: Set One Dark Theme (Developer Dark)', action: 'theme-onedark', category: 'Theme', value: 'onedark' },
  { name: 'Theme: Set Achromatic Theme (Light)', action: 'theme-achromatic-light', category: 'Theme', value: 'achromatic-light' },
  { name: 'Theme: Set Achromatic Theme (Dark)', action: 'theme-achromatic-dark', category: 'Theme', value: 'achromatic-dark' },
  
  { name: 'Help: Open Markdown Reference Guide', action: 'open-help-guide', category: 'Help' }
];

let activePaletteIndex = 0;
let filteredCommands = [];

function toggleCustomMenu() {
  if (!customMenuDropdown) return;
  const isShow = customMenuDropdown.classList.contains('show');
  if (isShow) {
    hideCustomMenu();
  } else {
    renderCustomMenu();
    customMenuDropdown.classList.add('show');
    if (btnAppMenu) btnAppMenu.classList.add('active');
  }
}

function hideCustomMenu() {
  if (customMenuDropdown) {
    customMenuDropdown.classList.remove('show');
  }
  if (btnAppMenu) {
    btnAppMenu.classList.remove('active');
  }
}

function renderCustomMenu() {
  if (!customMenuDropdown) return;
  customMenuDropdown.innerHTML = '';
  
  menuData.forEach(menu => {
    const menuItem = document.createElement('div');
    menuItem.className = 'custom-menu-item has-submenu';
    
    const labelContainer = document.createElement('div');
    labelContainer.className = 'menu-label-container';
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'menu-icon';
    iconSpan.innerHTML = getMenuCategoryIcon(menu.label);
    labelContainer.appendChild(iconSpan);
    
    const labelSpan = document.createElement('span');
    labelSpan.className = 'menu-text';
    labelSpan.textContent = menu.label;
    labelContainer.appendChild(labelSpan);
    
    menuItem.appendChild(labelContainer);
    
    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'menu-arrow';
    arrowSpan.textContent = '▶';
    menuItem.appendChild(arrowSpan);
    
    const submenuDropdown = document.createElement('div');
    submenuDropdown.className = 'submenu-dropdown';
    
    menu.submenu.forEach(sub => {
      if (sub.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'menu-separator';
        submenuDropdown.appendChild(sep);
      } else {
        const subItem = document.createElement('div');
        subItem.className = 'custom-menu-item';
        
        const subLabelContainer = document.createElement('div');
        subLabelContainer.className = 'menu-label-container';
        
        if (sub.type === 'checkbox' || sub.type === 'radio') {
          const checkIcon = document.createElement('span');
          checkIcon.className = 'menu-check-icon';
          subItem.appendChild(checkIcon);
          
          if (sub.type === 'checkbox') subItem.classList.add('checkbox-item');
          if (sub.type === 'radio') subItem.classList.add('radio-item');
          
          if (sub.getChecked && sub.getChecked()) {
            subItem.classList.add('checked');
          }
        }
        
        const subText = document.createElement('span');
        subText.className = 'menu-text';
        subText.textContent = sub.label;
        subLabelContainer.appendChild(subText);
        subItem.appendChild(subLabelContainer);
        
        if (sub.accelerator) {
          const accel = document.createElement('span');
          accel.className = 'menu-accelerator';
          accel.textContent = sub.accelerator;
          subItem.appendChild(accel);
        }
        
        subItem.addEventListener('click', (e) => {
          e.stopPropagation();
          handleMenuAction(sub.action, sub.value);
          hideCustomMenu();
        });
        
        submenuDropdown.appendChild(subItem);
      }
    });
    
    menuItem.appendChild(submenuDropdown);
    customMenuDropdown.appendChild(menuItem);
  });
}

function getMenuCategoryIcon(category) {
  switch (category) {
    case 'File':
      return `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;
    case 'Edit':
      return `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;
    case 'Format':
      return `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M11.64 5.92L6.14 18h2.32l1.12-2.73h5.71L16.4 18h2.32l-5.46-12.08H11.64zm-1.32 7.37l2.14-5.23 2.14 5.23h-4.28zM4 20h16v2H4v-2z"/></svg>`;
    case 'View':
      return `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
    case 'Theme':
      return `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>`;
    case 'Help':
      return `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm1.07-7.75l-.9.92C12.45 11.9 12 12.5 12 14h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/></svg>`;
    default:
      return '';
  }
}

function toggleCommandPalette() {
  if (!commandPaletteModal) return;
  const isHidden = commandPaletteModal.classList.contains('hidden');
  if (isHidden) {
    commandPaletteModal.classList.remove('hidden');
    if (commandPaletteInput) {
      commandPaletteInput.value = '';
      commandPaletteInput.focus();
    }
    activePaletteIndex = 0;
    filterCommands('');
    document.body.style.overflow = 'hidden';
  } else {
    hideCommandPalette();
  }
}

function hideCommandPalette() {
  if (commandPaletteModal) {
    commandPaletteModal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function filterCommands(query) {
  const cleanQuery = query.toLowerCase().trim();
  if (cleanQuery === '') {
    filteredCommands = [...commandPaletteData];
  } else {
    filteredCommands = commandPaletteData.filter(cmd => 
      cmd.name.toLowerCase().includes(cleanQuery) || 
      cmd.category.toLowerCase().includes(cleanQuery)
    );
  }
  renderPaletteResults();
}

function renderPaletteResults() {
  if (!commandPaletteResults) return;
  commandPaletteResults.innerHTML = '';
  
  if (filteredCommands.length === 0) {
    const noResult = document.createElement('div');
    noResult.className = 'command-palette-item';
    noResult.style.justifyContent = 'center';
    noResult.style.color = 'var(--text-muted)';
    noResult.textContent = 'No commands found';
    commandPaletteResults.appendChild(noResult);
    return;
  }
  
  const itemsToShow = filteredCommands.slice(0, 15);
  
  itemsToShow.forEach((cmd, idx) => {
    const item = document.createElement('div');
    item.className = 'command-palette-item';
    if (idx === activePaletteIndex) {
      item.classList.add('active');
    }
    
    const leftSide = document.createElement('div');
    leftSide.className = 'command-palette-item-left';
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'command-palette-item-icon';
    iconSpan.innerHTML = getMenuCategoryIcon(cmd.category);
    leftSide.appendChild(iconSpan);
    
    const textSpan = document.createElement('span');
    textSpan.className = 'command-palette-item-text';
    textSpan.textContent = cmd.name;
    leftSide.appendChild(textSpan);
    
    item.appendChild(leftSide);
    
    if (cmd.kbd) {
      const kbd = document.createElement('kbd');
      kbd.className = 'command-palette-item-kbd';
      kbd.textContent = cmd.kbd;
      item.appendChild(kbd);
    }
    
    item.addEventListener('click', () => {
      handleMenuAction(cmd.action, cmd.value);
      hideCommandPalette();
    });
    
    commandPaletteResults.appendChild(item);
  });
  
  const activeItemEl = commandPaletteResults.children[activePaletteIndex];
  if (activeItemEl) {
    activeItemEl.scrollIntoView({ block: 'nearest' });
  }
}

async function selectOpenFile() {
  const data = await window.electronAPI.openFile();
  if (data) {
    openFilePayload(data);
  }
}

function handleMenuAction(action, value) {
  switch (action) {
    case 'new-file':
      createNewFile();
      break;
    case 'open-file':
      selectOpenFile();
      break;
    case 'open-folder':
      selectWorkspaceFolder();
      break;
    case 'save':
      saveFile();
      break;
    case 'save-as':
      saveFileAs();
      break;
    case 'export-html':
      exportHTML();
      break;
    case 'export-pdf':
      exportPDF();
      break;
    case 'undo':
    case 'redo':
    case 'cut':
    case 'copy':
    case 'paste':
    case 'select-all':
      executeEditAction(action);
      break;
    case 'copy-markdown':
      copyMarkdownToClipboard();
      break;
    case 'copy-html':
      copyHTMLToClipboard();
      break;
    case 'format-bold':
      formatMarkdown('bold');
      break;
    case 'format-italic':
      formatMarkdown('italic');
      break;
    case 'format-code':
      formatMarkdown('code');
      break;
    case 'format-link':
      formatMarkdown('link');
      break;
    case 'format-h1':
      formatMarkdown('h1');
      break;
    case 'format-h2':
      formatMarkdown('h2');
      break;
    case 'format-h3':
      formatMarkdown('h3');
      break;
    case 'format-ul':
      formatMarkdown('ul');
      break;
    case 'format-ol':
      formatMarkdown('ol');
      break;
    case 'toggle-sidebar':
      toggleSidebar();
      break;
    case 'mode-write':
      setMode('write');
      break;
    case 'mode-live':
      setMode('live');
      break;
    case 'mode-split':
      setMode('split');
      break;
    case 'mode-preview':
      setMode('preview');
      break;
    case 'toggle-focus':
      toggleFocusMode();
      break;
    case 'toggle-typewriter':
      toggleTypewriterMode();
      break;
    case 'open-help-guide':
      window.open('https://www.markdownguide.org/basic-syntax/', '_blank');
      break;
    default:
      if (action && action.startsWith('theme-')) {
        setTheme(value);
      }
      break;
  }
}

function executeEditAction(action) {
  if (currentMode === "live") {
    if (pmView) pmView.focus();
  } else {
    if (cmView) cmView.focus();
  }
  
  if (action === 'undo') {
    document.execCommand('undo');
  } else if (action === 'redo') {
    document.execCommand('redo');
  } else if (action === 'cut') {
    document.execCommand('cut');
  } else if (action === 'copy') {
    document.execCommand('copy');
  } else if (action === 'paste') {
    document.execCommand('paste');
  } else if (action === 'select-all') {
    document.execCommand('selectAll');
  }
}


