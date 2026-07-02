# Markdowned ✍️

A beautiful, high-performance, minimalist Markdown editor built with Electron, CodeMirror, and ProseMirror.

![Logo](https://raw.githubusercontent.com/frsaghna/markdowned/master/assets/logo.png) *(Note: Replace with actual logo URL if available)*

## Features

- 🔄 **Four Editing Modes:**
  - **Write:** Standard plain-text Markdown editor with syntax highlighting.
  - **Live:** Next-generation WYSIWYG editor powered by ProseMirror.
  - **Split:** Side-by-side editing and live HTML preview.
  - **Preview:** Direct HTML rendering mode for reading documents.
- 🧜‍♀️ **Interactive Mermaid Diagrams:** Render diagrams dynamically in Live Mode; click any diagram to immediately edit its raw source code, then click away to re-render.
- 🎨 **Gorgeous Curated Themes:** Select from GitHub Light/Dark, Dracula, One Dark, Sepia, Gothic, Vue, Newsprint, and Achromatic Light/Dark.
- 📋 **Integrated Clipboard Actions:**
  - Fast-click copy buttons on all code blocks with toast notifications.
  - Contextual "Copy as Markdown" and "Copy as HTML" options.
  - Automatic drag-and-drop/paste image saving to local project assets.
- 🧭 **Smart Outline Navigation:** Click sidebar outline headings to auto-scroll with smooth native animations across all editor and preview modes.
- 📂 **Workspace Sidebar:** Easily browse local files and folder structures.

## Tech Stack

- **Framework:** Electron (with isolated context preload scripts)
- **Editors:** CodeMirror 6 (Write/Split Modes), ProseMirror (Live Mode)
- **Syntax Highlighting:** Shiki (Editor), Highlight.js (Preview)
- **Markdown Parsing:** marked, turndown
- **Diagrams:** Mermaid.js
- **Build Tool:** esbuild

## Getting Started

### Prerequisites

Ensure you have Node.js and npm installed.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/frsaghna/markdowned.git
   cd markdowned
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Start the application:
```bash
npm start
```

### Building the Assets

If you modify source code in the `src/` directory, rebuild the renderer bundle:
```bash
npm run build
```
*(or run `npx esbuild src/renderer.js --bundle --outfile=renderer.js`)*

## License

[MIT License](LICENSE)
