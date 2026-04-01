import { Extension, type Editor } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection, type EditorState } from "@tiptap/pm/state";

const LIST_NODE_NAMES = new Set(["bulletList", "orderedList", "taskList"]);

type JoinDirection = "backward" | "forward";

type AdjacentListSeparator = {
  joinPos: number;
  mergedNode: ProseMirrorNode | null;
  replaceFrom: number;
  replaceTo: number;
};

function isListNode(node: ProseMirrorNode): boolean {
  return LIST_NODE_NAMES.has(node.type.name);
}

function isEmptyParagraphNode(node: ProseMirrorNode): boolean {
  return node.type.name === "paragraph" && node.content.size === 0;
}

function canMergeLists(
  firstNode: ProseMirrorNode,
  secondNode: ProseMirrorNode,
): boolean {
  return isListNode(firstNode) && firstNode.sameMarkup(secondNode);
}

function findAdjacentListSeparator(
  state: EditorState,
): AdjacentListSeparator | null {
  const { selection } = state;

  if (!selection.empty) {
    return null;
  }

  const { $anchor } = selection;
  const paragraphDepth = $anchor.depth;
  const paragraphNode = $anchor.parent;

  if (!isEmptyParagraphNode(paragraphNode) || paragraphDepth === 0) {
    return null;
  }

  const parentDepth = paragraphDepth - 1;
  const parentNode = $anchor.node(parentDepth);
  const separatorIndex = $anchor.index(parentDepth);

  if (separatorIndex > 0 && separatorIndex < parentNode.childCount - 1) {
    const previousList = parentNode.child(separatorIndex - 1);
    const nextList = parentNode.child(separatorIndex + 1);

    if (canMergeLists(previousList, nextList)) {
      const separatorFrom = $anchor.before(paragraphDepth);
      const separatorTo = $anchor.after(paragraphDepth);
      const previousListPos = separatorFrom - previousList.nodeSize;
      const nextListPos = separatorTo;
      const mergedNode = previousList.type.create(
        previousList.attrs,
        previousList.content.append(nextList.content),
      );

      if (
        parentNode.canReplace(
          separatorIndex - 1,
          separatorIndex + 2,
          Fragment.from(mergedNode),
        )
      ) {
        return {
          joinPos: previousListPos + 1 + previousList.content.size,
          mergedNode,
          replaceFrom: previousListPos,
          replaceTo: nextListPos + nextList.nodeSize,
        };
      }
    }
  }

  if (
    parentNode.type.name === "listItem" &&
    separatorIndex > 0 &&
    separatorIndex === parentNode.childCount - 1 &&
    parentDepth > 0
  ) {
    const listDepth = parentDepth - 1;
    const listNode = $anchor.node(listDepth);
    const listItemIndex = $anchor.index(listDepth);

    if (
      isListNode(listNode) &&
      listItemIndex < listNode.childCount - 1 &&
      listNode.child(listItemIndex + 1).type.name === parentNode.type.name
    ) {
      const separatorFrom = $anchor.before(paragraphDepth);
      const separatorTo = $anchor.after(paragraphDepth);

      return {
        joinPos: separatorFrom,
        mergedNode: null,
        replaceFrom: separatorFrom,
        replaceTo: separatorTo,
      };
    }
  }

  return null;
}

export function joinAdjacentListsAroundSeparator(
  editor: Editor,
  direction: JoinDirection,
): boolean {
  const separator = findAdjacentListSeparator(editor.state);

  if (!separator) {
    return false;
  }

  const {
    joinPos,
    mergedNode,
    replaceFrom,
    replaceTo,
  } = separator;
  const transaction = editor.state.tr;
  const bias = direction === "backward" ? -1 : 1;

  if (mergedNode) {
    transaction.replaceWith(replaceFrom, replaceTo, mergedNode);
  } else {
    transaction.delete(replaceFrom, replaceTo);
  }

  transaction.setSelection(Selection.near(transaction.doc.resolve(joinPos), bias));
  transaction.scrollIntoView();
  editor.view.dispatch(transaction);

  return true;
}

export const AdjacentListNormalizer = Extension.create({
  name: "adjacentListNormalizer",

  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        joinAdjacentListsAroundSeparator(this.editor, "backward"),
      Delete: () => joinAdjacentListsAroundSeparator(this.editor, "forward"),
    };
  },
});
