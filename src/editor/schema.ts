import { Schema, type NodeSpec, type MarkSpec, type DOMOutputSpec } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';

const pDOM: DOMOutputSpec = ['p', 0];
const blockquoteDOM: DOMOutputSpec = ['blockquote', 0];
const hrDOM: DOMOutputSpec = ['hr'];

export const nodes: { [name: string]: NodeSpec } = {
  doc: {
    content: 'block+',
  },

  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM() { return pDOM; },
  },

  blockquote: {
    content: 'block+',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'blockquote' }],
    toDOM() { return blockquoteDOM; },
  },

  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM() { return hrDOM; },
  },

  heading: {
    attrs: { level: { default: 1 } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [
      { tag: 'h1', attrs: { level: 1 } },
      { tag: 'h2', attrs: { level: 2 } },
      { tag: 'h3', attrs: { level: 3 } },
      { tag: 'h4', attrs: { level: 4 } },
      { tag: 'h5', attrs: { level: 5 } },
      { tag: 'h6', attrs: { level: 6 } },
    ],
    toDOM(node) { return ['h' + node.attrs.level, 0]; },
  },

  code_block: {
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    attrs: { params: { default: '' } },
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (node) => {
          if (typeof node === 'string') return null;
          const dom = node as HTMLElement;
          const code = dom.querySelector('code');
          const cls = code ? code.className : dom.className;
          const match = /language-([^\s]+)/.exec(cls);
          return { params: match ? match[1] : '' };
        },
      },
    ],
    toDOM(node) {
      return ['pre', node.attrs.params ? { 'data-language': node.attrs.params } : {}, ['code', 0]];
    },
  },

  text: {
    group: 'inline',
  },

  image: {
    inline: true,
    attrs: {
      src: {},
      alt: { default: null },
      title: { default: null },
    },
    group: 'inline',
    draggable: true,
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs(dom) {
          if (typeof dom === 'string') return null;
          const htmlDom = dom as HTMLImageElement;
          return {
            src: htmlDom.getAttribute('src'),
            title: htmlDom.getAttribute('title'),
            alt: htmlDom.getAttribute('alt'),
          };
        },
      },
    ],
    toDOM(node) {
      const { src, alt, title } = node.attrs;
      return ['img', { src, alt, title }];
    },
  },

  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM() { return ['br']; },
  },

  bullet_list: {
    content: 'list_item+',
    group: 'block',
    parseDOM: [{ tag: 'ul' }],
    toDOM() { return ['ul', 0]; },
  },

  ordered_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { order: { default: 1 } },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs(dom) {
          if (typeof dom === 'string') return null;
          const htmlDom = dom as HTMLOListElement;
          return { order: htmlDom.hasAttribute('start') ? +htmlDom.getAttribute('start')! : 1 };
        },
      },
    ],
    toDOM(node) {
      return node.attrs.order === 1 ? ['ol', 0] : ['ol', { start: node.attrs.order }, 0];
    },
  },

  list_item: {
    content: 'block+',
    defining: true,
    attrs: {
      checked: { default: null }, // null means normal list item, boolean means task list item
    },
    parseDOM: [
      {
        tag: 'li',
        getAttrs(dom) {
          if (typeof dom === 'string') return null;
          const htmlDom = dom as HTMLLIElement;
          const checkbox = htmlDom.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
          if (checkbox) {
            return { checked: checkbox.checked };
          }
          if (htmlDom.classList.contains('task-list-item')) {
            return { checked: htmlDom.getAttribute('data-checked') === 'true' };
          }
          return { checked: null };
        },
      },
    ],
    toDOM(node) {
      const { checked } = node.attrs;
      if (checked !== null) {
        return [
          'li',
          {
            class: 'task-list-item' + (checked ? ' checked' : ''),
            'data-checked': String(checked),
          },
          // We render the checkbox container and the text.
          // In ProseMirror, the checkbox should be a non-editable span or button,
          // so clicking it triggers an IPC/state update instead of being a standard browser contenteditable checkbox.
          [
            'span',
            {
              class: 'task-list-checkbox-wrapper',
              contenteditable: 'false',
            },
            [
              'input',
              {
                type: 'checkbox',
                ...(checked ? { checked: 'true' } : {}),
              },
            ],
          ],
          ['div', { class: 'task-list-content' }, 0],
        ];
      }
      return ['li', 0];
    },
  },
};

// Integrate table nodes from prosemirror-tables
const tables = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {
    background: {
      default: null,
      getFromDOM(dom) {
        return (dom as HTMLElement).style.backgroundColor || null;
      },
      setDOMAttr(value, attrs) {
        if (value) attrs.style = (attrs.style || '') + `background-color: ${value};`;
      },
    },
  },
});

export const marks: { [name: string]: MarkSpec } = {
  strong: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b', getAttrs: (value) => (value as HTMLElement).style.fontWeight !== 'normal' && null },
      { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[7-9]00)$/.test(value as string) && null },
    ],
    toDOM() { return ['strong', 0]; },
  },

  em: {
    parseDOM: [
      { tag: 'i' },
      { tag: 'em' },
      { style: 'font-style=italic' },
    ],
    toDOM() { return ['em', 0]; },
  },

  strike: {
    parseDOM: [
      { tag: 's' },
      { tag: 'del' },
      { tag: 'strike' },
      { style: 'text-decoration=line-through' },
    ],
    toDOM() { return ['s', 0]; },
  },

  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM() { return ['code', 0]; },
  },

  link: {
    attrs: {
      href: {},
      title: { default: null },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs(dom) {
          if (typeof dom === 'string') return null;
          const htmlDom = dom as HTMLAnchorElement;
          return { href: htmlDom.getAttribute('href'), title: htmlDom.getAttribute('title') };
        },
      },
    ],
    toDOM(node) {
      const { href, title } = node.attrs;
      return ['a', { href, title }, 0];
    },
  },
};

export const schema = new Schema({
  nodes: {
    ...nodes,
    table: tables.table,
    table_row: tables.table_row,
    table_cell: tables.table_cell,
    table_header: tables.table_header,
  },
  marks,
});
