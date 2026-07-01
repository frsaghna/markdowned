import type { Command } from 'prosemirror-state';
import { toggleMark, setBlockType, wrapIn } from 'prosemirror-commands';
import { wrapInList } from 'prosemirror-schema-list';
import { schema } from './schema';

// Marks
export const toggleBold = toggleMark(schema.marks.strong);
export const toggleItalic = toggleMark(schema.marks.em);
export const toggleStrike = toggleMark(schema.marks.strike);
export const toggleInlineCode = toggleMark(schema.marks.code);

export function toggleLink(href: string, title: string | null = null): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection;
    const hasMark = state.doc.rangeHasMark($from.pos, $to.pos, schema.marks.link);
    if (hasMark) {
      return toggleMark(schema.marks.link)(state, dispatch);
    }
    return toggleMark(schema.marks.link, { href, title })(state, dispatch);
  };
}

// Blocks
export function toggleHeading(level: number): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const node = $from.parent;
    if (node.type === schema.nodes.heading && node.attrs.level === level) {
      return setBlockType(schema.nodes.paragraph)(state, dispatch);
    }
    return setBlockType(schema.nodes.heading, { level })(state, dispatch);
  };
}

export const toggleQuote = wrapIn(schema.nodes.blockquote);

export function toggleBulletList(): Command {
  return wrapInList(schema.nodes.bullet_list);
}

export function toggleOrderedList(): Command {
  return wrapInList(schema.nodes.ordered_list);
}

export const toggleTaskList: Command = (state, dispatch) => {
  const { $from } = state.selection;
  
  // Find list_item parent
  let depth = $from.depth;
  let listItemPos = -1;
  while (depth > 0) {
    if ($from.node(depth).type === schema.nodes.list_item) {
      listItemPos = $from.before(depth);
      break;
    }
    depth--;
  }

  if (listItemPos === -1) {
    // If not in a list item, wrap in bullet list first, with checked attribute set to false
    return wrapInList(schema.nodes.bullet_list, { checked: false })(state, dispatch);
  }

  if (dispatch) {
    const tr = state.tr;
    const listItemNode = state.doc.nodeAt(listItemPos);
    if (listItemNode && listItemNode.type === schema.nodes.list_item) {
      const isTask = listItemNode.attrs.checked !== null;
      tr.setNodeMarkup(listItemPos, undefined, {
        ...listItemNode.attrs,
        checked: isTask ? null : false,
      });
      dispatch(tr);
      return true;
    }
  }
  return true;
};

export const toggleCodeBlock: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const parent = $from.parent;
  if (parent.type === schema.nodes.code_block) {
    return setBlockType(schema.nodes.paragraph)(state, dispatch);
  } else {
    return setBlockType(schema.nodes.code_block)(state, dispatch);
  }
};

// Insertions
export function insertImage(src: string, alt = '', title = ''): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const node = schema.nodes.image.create({ src, alt, title });
      dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
    }
    return true;
  };
}

export function insertTable(rowsCount = 3, colsCount = 3): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const rowNodes = [];
      for (let r = 0; r < rowsCount; r++) {
        const cells = [];
        for (let c = 0; c < colsCount; c++) {
          const cellType = r === 0 ? schema.nodes.table_header : schema.nodes.table_cell;
          // createAndFill automatically creates a paragraph inside the cell
          cells.push(cellType.createAndFill()!);
        }
        rowNodes.push(schema.nodes.table_row.create(null, cells));
      }
      const tableNode = schema.nodes.table.create(null, rowNodes);
      dispatch(state.tr.replaceSelectionWith(tableNode).scrollIntoView());
    }
    return true;
  };
}

export const insertHorizontalRule: Command = (state, dispatch) => {
  if (dispatch) {
    const node = schema.nodes.horizontal_rule.create();
    dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
  }
  return true;
};
