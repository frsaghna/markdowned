import type { Command } from 'prosemirror-state';
import { undo, redo } from 'prosemirror-history';
import { sinkListItem, liftListItem, splitListItem } from 'prosemirror-schema-list';
import {
  chainCommands,
  newlineInCode,
  createParagraphNear,
  liftEmptyBlock,
  splitBlock,
  deleteSelection,
  joinBackward,
  selectNodeBackward,
} from 'prosemirror-commands';
import { schema } from './schema';
import { toggleBold, toggleItalic, toggleInlineCode } from './commands';

// Smart Enter handler for lists and task lists
const handleEnterKey: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  if (!$from.sameParent($to)) return false;

  // Find list_item parent
  let depth = $from.depth;
  let listItemNode = null;
  let listItemPos = -1;
  while (depth > 0) {
    const node = $from.node(depth);
    if (node.type === schema.nodes.list_item) {
      listItemNode = node;
      listItemPos = $from.before(depth);
      break;
    }
    depth--;
  }

  if (listItemNode && listItemPos !== -1) {
    // If the list item is empty, lift it (exit list)
    const isEmpty = listItemNode.content.size === 2 && listItemNode.firstChild?.content.size === 0;
    if (isEmpty) {
      return liftListItem(schema.nodes.list_item)(state, dispatch);
    }

    // If it's a checklist item, split and preserve checkbox state as false
    const checked = listItemNode.attrs.checked;
    if (checked !== null) {
      return splitListItem(schema.nodes.list_item, { checked: false })(state, dispatch);
    }
  }

  return false;
};

// Smart Backspace handler for headings, lists, blockquotes
const handleBackspaceKey: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  if ($from.pos !== $to.pos) return false;
  if ($from.parentOffset > 0) return false; // only handle at beginning of block

  const parent = $from.parent;

  // 1. If in a heading, convert to paragraph
  if (parent.type === schema.nodes.heading) {
    if (dispatch) {
      dispatch(state.tr.setBlockType($from.before(), $from.after(), schema.nodes.paragraph));
    }
    return true;
  }

  // 2. If in a blockquote, lift it out
  if (parent.type === schema.nodes.paragraph && $from.depth > 1) {
    const grandParent = $from.node($from.depth - 1);
    if (grandParent.type === schema.nodes.blockquote) {
      if (dispatch) {
        const tr = state.tr.lift(state.selection.$from.blockRange()!, $from.depth - 1);
        dispatch(tr);
      }
      return true;
    }
  }

  // 3. If in a list item, lift it out (de-indent or convert to paragraph)
  let depth = $from.depth;
  let inListItem = false;
  while (depth > 0) {
    if ($from.node(depth).type === schema.nodes.list_item) {
      inListItem = true;
      break;
    }
    depth--;
  }
  if (inListItem) {
    return liftListItem(schema.nodes.list_item)(state, dispatch);
  }

  return false;
};

export function buildKeymap() {
  const keys: { [key: string]: Command } = {
    // History
    'Mod-z': undo,
    'Mod-y': redo,
    'Shift-Mod-z': redo,

    // Marks
    'Mod-b': toggleBold,
    'Mod-i': toggleItalic,
    'Mod-`': toggleInlineCode,
    'Mod-e': toggleInlineCode,

    // Lists Indentation
    'Tab': sinkListItem(schema.nodes.list_item),
    'Shift-Tab': liftListItem(schema.nodes.list_item),

    // Enter & Backspace
    'Enter': chainCommands(
      handleEnterKey,
      splitListItem(schema.nodes.list_item),
      newlineInCode,
      createParagraphNear,
      liftEmptyBlock,
      splitBlock
    ),
    'Backspace': chainCommands(
      deleteSelection,
      handleBackspaceKey,
      joinBackward,
      selectNodeBackward
    ),
  };

  return keys;
}
