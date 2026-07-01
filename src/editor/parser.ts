import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { Node as PMNode, Mark as PMMark } from 'prosemirror-model';
import { schema } from './schema';

export function parseMarkdown(markdown: string): PMNode {
  // Parse markdown to MDAST AST
  const processor = unified().use(remarkParse).use(remarkGfm);
  const mdastRoot = processor.parse(markdown) as any;

  // Transform MDAST to ProseMirror Node
  const pmDoc = mdastToProseMirror(mdastRoot);
  return pmDoc;
}

function mdastToProseMirror(root: any): PMNode {
  const blocks: PMNode[] = [];

  if (root.children) {
    for (const child of root.children) {
      const pmNode = parseBlock(child);
      if (pmNode) {
        blocks.push(pmNode);
      }
    }
  }

  // Ensure there's at least one paragraph block in the document
  if (blocks.length === 0) {
    blocks.push(schema.node('paragraph'));
  }

  return schema.node('doc', null, blocks);
}

function parseBlock(node: any, options: { isFirstRow?: boolean } = {}): PMNode | null {
  switch (node.type) {
    case 'paragraph':
      return schema.node('paragraph', null, parseInlineContent(node.children));

    case 'heading':
      return schema.node('heading', { level: node.depth }, parseInlineContent(node.children));

    case 'blockquote': {
      const children: PMNode[] = [];
      for (const child of node.children) {
        const pmChild = parseBlock(child);
        if (pmChild) children.push(pmChild);
      }
      if (children.length === 0) children.push(schema.node('paragraph'));
      return schema.node('blockquote', null, children);
    }

    case 'list': {
      const type = node.ordered ? 'ordered_list' : 'bullet_list';
      const attrs = node.ordered ? { order: node.start || 1 } : null;
      const children: PMNode[] = [];
      for (const child of node.children) {
        const pmChild = parseBlock(child);
        if (pmChild) children.push(pmChild);
      }
      return schema.node(type, attrs, children);
    }

    case 'listItem': {
      const children: PMNode[] = [];
      for (const child of node.children) {
        const pmChild = parseBlock(child);
        if (pmChild) children.push(pmChild);
      }
      if (children.length === 0) children.push(schema.node('paragraph'));
      // MDAST represents task list items with a checked attribute (true | false | null)
      return schema.node('list_item', { checked: node.checked !== undefined ? node.checked : null }, children);
    }

    case 'code':
      return schema.node(
        'code_block',
        { params: node.lang || '' },
        node.value ? [schema.text(node.value)] : []
      );

    case 'thematicBreak':
      return schema.node('horizontal_rule');

    case 'table': {
      const rows: PMNode[] = [];
      if (node.children) {
        for (let i = 0; i < node.children.length; i++) {
          const rowNode = parseBlock(node.children[i], { isFirstRow: i === 0 });
          if (rowNode) rows.push(rowNode);
        }
      }
      return schema.node('table', null, rows);
    }

    case 'tableRow': {
      const cells: PMNode[] = [];
      if (node.children) {
        for (const cell of node.children) {
          const cellNode = parseBlock(cell, { isFirstRow: options.isFirstRow });
          if (cellNode) cells.push(cellNode);
        }
      }
      return schema.node('table_row', null, cells);
    }

    case 'tableCell': {
      // In MDAST tableCell only contains inline children.
      // But in ProseMirror, table cells must contain block children (e.g. paragraphs).
      const cellContent = parseInlineContent(node.children || []);
      const pNode = schema.node('paragraph', null, cellContent);
      const cellType = options.isFirstRow ? 'table_header' : 'table_cell';
      return schema.node(cellType, null, [pNode]);
    }

    default:
      console.warn('Unhandled block node type:', node.type);
      return null;
  }
}

function parseInlineContent(children: any[]): PMNode[] {
  const result: PMNode[] = [];
  
  function walk(node: any, activeMarks: PMMark[]) {
    switch (node.type) {
      case 'text':
        if (node.value) {
          result.push(schema.text(node.value, activeMarks));
        }
        break;

      case 'emphasis': {
        const mark = schema.mark('em');
        if (node.children) {
          for (const child of node.children) {
            walk(child, addMark(activeMarks, mark));
          }
        }
        break;
      }

      case 'strong': {
        const mark = schema.mark('strong');
        if (node.children) {
          for (const child of node.children) {
            walk(child, addMark(activeMarks, mark));
          }
        }
        break;
      }

      case 'delete': {
        const mark = schema.mark('strike');
        if (node.children) {
          for (const child of node.children) {
            walk(child, addMark(activeMarks, mark));
          }
        }
        break;
      }

      case 'inlineCode': {
        const mark = schema.mark('code');
        if (node.value) {
          result.push(schema.text(node.value, addMark(activeMarks, mark)));
        }
        break;
      }

      case 'link': {
        const mark = schema.mark('link', { href: node.url, title: node.title || null });
        if (node.children) {
          for (const child of node.children) {
            walk(child, addMark(activeMarks, mark));
          }
        }
        break;
      }

      case 'image': {
        const imgNode = schema.node('image', {
          src: node.url,
          alt: node.alt || null,
          title: node.title || null,
        });
        result.push(imgNode);
        break;
      }

      case 'break':
        result.push(schema.node('hard_break'));
        break;

      default:
        // Handle generic/nested inline containers
        if (node.children) {
          for (const child of node.children) {
            walk(child, activeMarks);
          }
        }
    }
  }

  for (const child of children) {
    walk(child, []);
  }

  return result;
}

function addMark(marks: PMMark[], newMark: PMMark): PMMark[] {
  // If mark is already active (by type), replace it or keep it (typically just keep/add)
  if (marks.some((m) => m.type === newMark.type)) {
    return marks;
  }
  return [...marks, newMark];
}
