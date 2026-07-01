import { Selection, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { history } from 'prosemirror-history';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { InputRule, inputRules, wrappingInputRule, textblockTypeInputRule } from 'prosemirror-inputrules';
import { schema } from './schema';
import { parseMarkdown } from './parser';
import { createHighlighter, type Highlighter } from 'shiki';

// --- Placeholder Plugin ---
export function placeholderPlugin(text = 'Type / to choose blocks or start writing...') {
  return new Plugin({
    props: {
      decorations(state) {
        const doc = state.doc;
        if (doc.childCount === 1 && doc.firstChild?.type === schema.nodes.paragraph && doc.firstChild.content.size === 0) {
          const dec = Decoration.node(0, doc.firstChild.nodeSize, {
            class: 'empty-node',
            'data-placeholder': text,
          });
          return DecorationSet.create(doc, [dec]);
        }
        return DecorationSet.empty;
      },
    },
  });
}

// --- Clipboard & Drag-Drop Plugin ---
export const clipboardPlugin = new Plugin({
  props: {
    handlePaste(view, event) {
      const files = event.clipboardData?.files;
      if (files && files.length > 0) {
        for (const file of Array.from(files)) {
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = async () => {
              const arrayBuffer = reader.result as ArrayBuffer;
              const ext = file.name.split('.').pop() || 'png';
              const fileName = `img_${Date.now()}.${ext}`;
              try {
                const localUrl = await window.electronAPI.saveAsset(fileName, arrayBuffer);
                const { state, dispatch } = view;
                const node = schema.nodes.image.create({ src: localUrl, alt: file.name });
                dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
              } catch (err) {
                console.error('Failed to save pasted asset:', err);
              }
            };
            reader.readAsArrayBuffer(file);
          }
        }
        return true;
      }

      const text = event.clipboardData?.getData('text/plain');
      if (text) {
        const { state, dispatch } = view;
        const { $from, $to } = state.selection;
        const isUrl = /^(https?:\/\/[^\s]+)$/.test(text.trim());
        if (isUrl && !$from.parent.type.spec.code && $from.pos !== $to.pos) {
          const tr = state.tr.addMark($from.pos, $to.pos, schema.marks.link.create({ href: text.trim() }));
          dispatch(tr);
          return true;
        }

        try {
          // Parse pasted text as Markdown
          const parsedDoc = parseMarkdown(text);
          const fragment = parsedDoc.content;
          const newTr = state.tr.replaceSelection({
            content: fragment,
            openStart: 0,
            openEnd: 0,
          } as any);
          dispatch(newTr.scrollIntoView());
          return true;
        } catch (err) {
          console.error('Failed to parse pasted markdown:', err);
        }
      }
      return false;
    },

    handleDrop(view, event) {
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        event.preventDefault();
        for (const file of Array.from(files)) {
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = async () => {
              const arrayBuffer = reader.result as ArrayBuffer;
              const ext = file.name.split('.').pop() || 'png';
              const fileName = `img_${Date.now()}.${ext}`;
              try {
                const localUrl = await window.electronAPI.saveAsset(fileName, arrayBuffer);
                const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                if (coordinates) {
                  const { state, dispatch } = view;
                  const node = schema.nodes.image.create({ src: localUrl, alt: file.name });
                  dispatch(state.tr.insert(coordinates.pos, node).scrollIntoView());
                }
              } catch (err) {
                console.error('Failed to save dropped asset:', err);
              }
            };
            reader.readAsArrayBuffer(file);
          } else if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
            const reader = new FileReader();
            reader.onload = () => {
              const content = reader.result as string;
              window.dispatchEvent(new CustomEvent('file-dropped', {
                detail: { content, filePath: (file as any).path || file.name }
              }));
            };
            reader.readAsText(file);
          }
        }
        return true;
      }
      return false;
    },

    handleClickOn(view, _pos, node, nodePos, event, _direct) {
      const target = event.target as HTMLElement;
      // Handle task list checkbox click
      if (target.tagName === 'INPUT' && target.getAttribute('type') === 'checkbox') {
        if (node.type === schema.nodes.list_item && node.attrs.checked !== null) {
          const { state, dispatch } = view;
          const tr = state.tr.setNodeMarkup(nodePos, undefined, {
            ...node.attrs,
            checked: !node.attrs.checked,
          });
          dispatch(tr);
          return true;
        }
      }
      return false;
    },
  },
});

// --- Shiki Syntax Highlighting Plugin ---
const highlightPluginKey = new PluginKey('shiki-highlight');
let shikiHighlighter: Highlighter | null = null;
const loadedLanguages = new Set<string>(['javascript', 'typescript', 'css', 'html', 'json', 'markdown']);

async function getShiki(): Promise<Highlighter> {
  if (!shikiHighlighter) {
    shikiHighlighter = await createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: Array.from(loadedLanguages),
    });
  }
  return shikiHighlighter;
}

export function createHighlightPlugin() {
  let decorations = DecorationSet.empty;
  let isHighlighting = false;
  let cachedDocText = '';

  const runHighlight = async (view: EditorView) => {
    if (isHighlighting) return;
    const doc = view.state.doc;
    const docText = doc.textContent;
    if (docText === cachedDocText && decorations !== DecorationSet.empty) return;

    isHighlighting = true;
    try {
      const highlighter = await getShiki();
      const decos: Decoration[] = [];

      doc.descendants((node, pos) => {
        if (node.type === schema.nodes.code_block) {
          const lang = node.attrs.params || 'javascript';
          const codeText = node.textContent;
          
          // Check if theme is dark
          const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark-theme');
          const theme = isDark ? 'github-dark' : 'github-light';

          try {
            // Lazy load languages if missing
            if (lang && !highlighter.getLoadedLanguages().includes(lang)) {
              highlighter.loadLanguage(lang as any).then(() => {
                // Force state refresh
                view.dispatch(view.state.tr);
              }).catch(console.error);
            }

            const tokens = highlighter.codeToTokens(codeText, {
              lang: highlighter.getLoadedLanguages().includes(lang) ? lang : 'text',
              theme,
            });

            let currentOffset = pos + 1; // start inside code_block node
            for (const line of tokens.tokens) {
              for (const token of line) {
                const tokenLen = token.content.length;
                if (token.color) {
                  decos.push(
                    Decoration.inline(currentOffset, currentOffset + tokenLen, {
                      style: `color: ${token.color};`,
                    })
                  );
                }
                currentOffset += tokenLen;
              }
              currentOffset += 1; // newline character
            }
          } catch (err) {
            console.error('Error tokenizing code block:', err);
          }
        }
      });

      decorations = DecorationSet.create(doc, decos);
      cachedDocText = docText;
      view.dispatch(view.state.tr);
    } catch (err) {
      console.error('Highlight failed:', err);
    } finally {
      isHighlighting = false;
    }
  };

  return new Plugin({
    key: highlightPluginKey,
    state: {
      init() {
        return DecorationSet.empty;
      },
      apply(tr, _value) {
        // Keep decorations in sync with document changes
        decorations = decorations.map(tr.mapping, tr.doc);
        return decorations;
      },
    },
    props: {
      decorations(state) {
        return highlightPluginKey.getState(state) || DecorationSet.empty;
      },
    },
    view(editorView) {
      runHighlight(editorView);
      return {
        update(view) {
          runHighlight(view);
        },
      };
    },
  });
}

// --- Input Rules Plugin ---

function markInputRule(regexp: RegExp, markType: any, getAttrs?: any) {
  return new InputRule(regexp, (state, match, start, end) => {
    const attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs;
    const tr = state.tr;
    if (match[1]) {
      const textStart = start + match[0].indexOf(match[1]);
      const textEnd = textStart + match[1].length;
      tr.addMark(textStart, textEnd, markType.create(attrs));
      tr.delete(textEnd, end);
      tr.delete(start, textStart);
      tr.removeStoredMark(markType); // stop mark from continuing
    }
    return tr;
  });
}

const headingRule = textblockTypeInputRule(/^#{1,6}\s$/, schema.nodes.heading, (match) => ({
  level: match[0].trim().length,
}));

const blockquoteRule = wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote);

const bulletListRule = wrappingInputRule(/^\s*([-*+])\s$/, schema.nodes.bullet_list);

const orderedListRule = wrappingInputRule(
  /^\s*(\d+)\.\s$/,
  schema.nodes.ordered_list,
  (match) => ({ order: +match[1] }),
  (match, node) => node.childCount + node.attrs.order === +match[1]
);

const horizontalRuleRule = new InputRule(/^(?:---|___|\*\*\*)$/, (state, _match, start, end) => {
  return state.tr.replaceWith(start, end, schema.nodes.horizontal_rule.create());
});

const codeBlockRule = new InputRule(/^```(\w*)$/, (state, match, start, end) => {
  const lang = match[1] || '';
  const $start = state.doc.resolve(start);
  if ($start.parent.type !== schema.nodes.paragraph) return null;
  return state.tr.setBlockType(start, end, schema.nodes.code_block, { params: lang });
});

const taskListRule = new InputRule(/^\[([ xX]?)]\s$/, (state, match, start, end) => {
  const $start = state.doc.resolve(start);
  if ($start.parent.type !== schema.nodes.paragraph) return null;
  if ($start.parentOffset > 0) return null;

  const checked = match[1].toLowerCase() === 'x';
  const tr = state.tr;
  tr.delete(start, end);

  const $from = tr.selection.$from;
  const paragraphPos = $from.before();
  const paragraphNode = tr.doc.nodeAt(paragraphPos);
  if (!paragraphNode) return null;

  const listItem = schema.nodes.list_item.create({ checked }, paragraphNode);
  const bulletList = schema.nodes.bullet_list.create(null, listItem);

  tr.replaceWith(paragraphPos, paragraphPos + paragraphNode.nodeSize, bulletList);
  const newCursorPos = paragraphPos + 3;
  tr.setSelection(Selection.near(tr.doc.resolve(newCursorPos)));

  return tr;
});

// Mark rules
const boldRule = markInputRule(/\*\*([^*]+)\*\*$/, schema.marks.strong);
const italicRule = markInputRule(/(?:^|[^\*])\*([^*]+)\*$/, schema.marks.em);
const italicUnderscoreRule = markInputRule(/(?:^|[^_])_([^_]+)_$/, schema.marks.em);
const strikeRule = markInputRule(/~~([^~]+)~~$/, schema.marks.strike);
const inlineCodeRule = markInputRule(/`([^`]+)`$/, schema.marks.code);

export const customInputRules = inputRules({
  rules: [
    headingRule,
    blockquoteRule,
    bulletListRule,
    orderedListRule,
    horizontalRuleRule,
    codeBlockRule,
    taskListRule,
    boldRule,
    italicRule,
    italicUnderscoreRule,
    strikeRule,
    inlineCodeRule,
  ],
});

// --- Active Markers Plugin ---
function getMarkRange($pos: any, type: any) {
  const parent = $pos.parent;
  const startPos = $pos.start();
  const parentOffset = $pos.parentOffset;

  let currentOffset = 0;
  let targetChildIndex = -1;

  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const endOffset = currentOffset + child.nodeSize;
    if (parentOffset >= currentOffset && parentOffset <= endOffset) {
      targetChildIndex = i;
      break;
    }
    currentOffset = endOffset;
  }

  if (targetChildIndex === -1) return null;

  const targetChild = parent.child(targetChildIndex);
  if (!type.isInSet(targetChild.marks)) return null;

  // contiguously walk left
  let fromOffset = currentOffset;
  let leftIndex = targetChildIndex - 1;
  while (leftIndex >= 0) {
    const leftChild = parent.child(leftIndex);
    if (type.isInSet(leftChild.marks)) {
      fromOffset -= leftChild.nodeSize;
      leftIndex--;
    } else {
      break;
    }
  }

  // contiguously walk right
  let toOffset = currentOffset + targetChild.nodeSize;
  let rightIndex = targetChildIndex + 1;
  while (rightIndex < parent.childCount) {
    const rightChild = parent.child(rightIndex);
    if (type.isInSet(rightChild.marks)) {
      toOffset += rightChild.nodeSize;
      rightIndex++;
    } else {
      break;
    }
  }

  return {
    from: startPos + fromOffset,
    to: startPos + toOffset,
  };
}

export const activeMarkersPlugin = new Plugin({
  key: new PluginKey('active-markers'),
  state: {
    init() {
      return DecorationSet.empty;
    },
    apply(_tr, _value, _oldState, newState) {
      const { selection } = newState;
      if (!selection.empty) {
        return DecorationSet.empty;
      }

      const { $from } = selection;
      const marks = newState.storedMarks || $from.marks();
      if (marks.length === 0) {
        return DecorationSet.empty;
      }

      const decos: Decoration[] = [];

      for (const mark of marks) {
        const type = mark.type;
        const range = getMarkRange($from, type);
        if (range) {
          const { from, to } = range;
          let startMarker = '';
          let endMarker = '';

          if (type.name === 'strong') {
            startMarker = '**';
            endMarker = '**';
          } else if (type.name === 'em') {
            startMarker = '*';
            endMarker = '*';
          } else if (type.name === 'strike') {
            startMarker = '~~';
            endMarker = '~~';
          } else if (type.name === 'code') {
            startMarker = '`';
            endMarker = '`';
          } else if (type.name === 'link') {
            startMarker = '[';
            endMarker = `](${mark.attrs.href})`;
          }

          if (startMarker) {
            decos.push(
              Decoration.widget(from, () => {
                const span = document.createElement('span');
                span.className = 'inline-marker start';
                span.textContent = startMarker;
                return span;
              }, { side: -1 })
            );
          }
          if (endMarker) {
            decos.push(
              Decoration.widget(to, () => {
                const span = document.createElement('span');
                span.className = 'inline-marker end';
                span.textContent = endMarker;
                return span;
              }, { side: 1 })
            );
          }
        }
      }

      return DecorationSet.create(newState.doc, decos);
    },
  },
  props: {
    decorations(state) {
      return this.getState(state) || DecorationSet.empty;
    },
  },
});

// --- Core Plugins List ---
export function getCorePlugins() {
  return [
    history(),
    customInputRules,
    clipboardPlugin,
    createHighlightPlugin(),
    placeholderPlugin(),
    activeMarkersPlugin,
    dropCursor({ color: '#40a9ff', width: 2 }),
    gapCursor(),
  ];
}
