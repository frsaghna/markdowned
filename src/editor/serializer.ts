import { Node as PMNode } from 'prosemirror-model';

export function serializeMarkdown(doc: PMNode): string {
  return serializeBlocks(doc);
}

function serializeBlocks(parent: PMNode, listIndentLevel = 0): string {
  let result = '';
  let blockIndex = 0;

  parent.forEach((node) => {
    const isLast = blockIndex === parent.childCount - 1;

    switch (node.type.name) {
      case 'paragraph': {
        const inlineStr = serializeInlineContent(node);
        result += inlineStr + (isLast ? '' : '\n\n');
        break;
      }

      case 'heading': {
        const headingStr = '#'.repeat(node.attrs.level) + ' ' + serializeInlineContent(node);
        result += headingStr + (isLast ? '' : '\n\n');
        break;
      }

      case 'blockquote': {
        const contentStr = serializeBlocks(node, listIndentLevel);
        const quotedStr = contentStr
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n');
        result += quotedStr + (isLast ? '' : '\n\n');
        break;
      }

      case 'bullet_list':
      case 'ordered_list': {
        const isOrdered = node.type.name === 'ordered_list';
        let listStr = '';
        let itemIndex = 0;

        node.forEach((item) => {
          const startNo = isOrdered ? (node.attrs.order || 1) + itemIndex : null;
          const prefix = startNo !== null ? `${startNo}. ` : '- ';
          
          let itemContent = '';
          const checked = item.attrs.checked;
          
          // Serialize item block contents
          let blockStr = serializeBlocks(item, listIndentLevel + 1);
          
          // Prepend checkbox if it's a task list item
          if (checked !== null) {
            const checkPrefix = checked ? '[x] ' : '[ ] ';
            blockStr = checkPrefix + blockStr;
          }

          // Indent items appropriately
          const lines = blockStr.split('\n');
          itemContent = lines[0];
          
          const indentSpace = ' '.repeat(prefix.length);
          for (let l = 1; l < lines.length; l++) {
            itemContent += '\n' + indentSpace + lines[l];
          }

          listStr += prefix + itemContent + (itemIndex === node.childCount - 1 ? '' : '\n');
          itemIndex++;
        });

        result += listStr + (isLast ? '' : '\n\n');
        break;
      }

      case 'code_block': {
        let codeText = '';
        node.forEach((textNode) => {
          codeText += textNode.text || '';
        });
        const lang = node.attrs.params || '';
        result += `\`\`\`${lang}\n${codeText}\n\`\`\`` + (isLast ? '' : '\n\n');
        break;
      }

      case 'horizontal_rule': {
        result += '---' + (isLast ? '' : '\n\n');
        break;
      }

      case 'table': {
        let tableStr = '';
        let rowCount = node.childCount;
        for (let r = 0; r < rowCount; r++) {
          const row = node.child(r);
          let rowCells: string[] = [];
          for (let c = 0; c < row.childCount; c++) {
            const cell = row.child(c);
            // Table cell is a block container, we serialize its block content as a single line
            const cellContent = serializeInlineContent(cell);
            // Escape any pipes in table cell content
            rowCells.push(cellContent.replace(/\|/g, '\\|'));
          }
          tableStr += `| ${rowCells.join(' | ')} |\n`;

          // Header separator row
          if (r === 0) {
            let separators: string[] = [];
            for (let c = 0; c < row.childCount; c++) {
              separators.push('---');
            }
            tableStr += `| ${separators.join(' | ')} |\n`;
          }
        }
        result += tableStr + (isLast ? '' : '\n');
        break;
      }

      default:
        console.warn('Unhandled block in serialization:', node.type.name);
        break;
    }
    blockIndex++;
  });

  return result;
}

function serializeInlineContent(parent: PMNode): string {
  let result = '';
  
  parent.forEach((node) => {
    if (node.type.name === 'image') {
      const { src, alt, title } = node.attrs;
      const titleAttr = title ? ` "${title}"` : '';
      result += `![${alt || ''}](${src}${titleAttr})`;
    } else if (node.type.name === 'hard_break') {
      result += '\n';
    } else if (node.isText) {
      let text = node.text || '';
      
      // Sort marks to ensure consistent nesting order:
      // link > strike > strong > em > code
      const sortedMarks = [...node.marks].sort((a, b) => {
        const order = ['link', 'strike', 'strong', 'em', 'code'];
        return order.indexOf(a.type.name) - order.indexOf(b.type.name);
      });

      for (const mark of sortedMarks.reverse()) {
        if (mark.type.name === 'code') {
          text = `\`${text}\``;
        } else if (mark.type.name === 'em') {
          text = `*${text}*`;
        } else if (mark.type.name === 'strong') {
          text = `**${text}**`;
        } else if (mark.type.name === 'strike') {
          text = `~~${text}~~`;
        } else if (mark.type.name === 'link') {
          const { href, title } = mark.attrs;
          const titleAttr = title ? ` "${title}"` : '';
          text = `[${text}](${href}${titleAttr})`;
        }
      }
      result += text;
    } else {
      // If it contains child blocks (e.g. table cells containing paragraphs), serialize recursively
      result += serializeInlineContent(node);
    }
  });

  return result;
}
