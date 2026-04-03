import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { ReactRenderer, type Editor as TiptapEditor } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { LinkEditor } from "./LinkEditor";

interface UseLinkPopoverOptions {
  closeBlockMathPopover: () => void;
  editorRef: MutableRefObject<TiptapEditor | null>;
}

export function useLinkPopover({
  closeBlockMathPopover,
  editorRef,
}: UseLinkPopoverOptions) {
  const linkPopupRef = useRef<TippyInstance | null>(null);

  const closeLinkPopover = useCallback(() => {
    if (linkPopupRef.current) {
      linkPopupRef.current.destroy();
      linkPopupRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      closeLinkPopover();
    };
  }, [closeLinkPopover]);

  const handleAddLink = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    closeBlockMathPopover();
    closeLinkPopover();

    const existingUrl = editor.getAttributes("link").href || "";
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;

    const virtualElement = {
      getBoundingClientRect: () => {
        if (hasSelection) {
          const startPos = editor.view.domAtPos(from);
          const endPos = editor.view.domAtPos(to);

          if (startPos && endPos) {
            try {
              const range = document.createRange();
              range.setStart(startPos.node, startPos.offset);
              range.setEnd(endPos.node, endPos.offset);
              return range.getBoundingClientRect();
            } catch (error) {
              console.error("Range creation failed:", error);
            }
          }
        }

        const coords = editor.view.coordsAtPos(from);
        return {
          width: 2,
          height: 20,
          top: coords.top,
          left: coords.left,
          right: coords.right,
          bottom: coords.bottom,
          x: coords.left,
          y: coords.top,
          toJSON: () => ({}),
        } as DOMRect;
      },
    };

    const component = new ReactRenderer(LinkEditor, {
      props: {
        initialUrl: existingUrl,
        initialText: hasSelection || existingUrl ? undefined : "",
        onSubmit: (url: string, text?: string) => {
          if (url.trim()) {
            if (text !== undefined) {
              if (text.trim()) {
                editor
                  .chain()
                  .focus()
                  .insertContent({
                    type: "text",
                    text: text.trim(),
                    marks: [{ type: "link", attrs: { href: url.trim() } }],
                  })
                  .run();
              }
            } else {
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: url.trim() })
                .run();
            }
          } else {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
          }
          closeLinkPopover();
        },
        onRemove: () => {
          editor.chain().focus().extendMarkRange("link").unsetLink().run();
          closeLinkPopover();
        },
        onCancel: () => {
          editor.commands.focus();
          closeLinkPopover();
        },
      },
      editor,
    });

    linkPopupRef.current = tippy(document.body, {
      getReferenceClientRect: () =>
        virtualElement.getBoundingClientRect() as DOMRect,
      appendTo: () => document.body,
      content: component.element,
      showOnCreate: true,
      interactive: true,
      trigger: "manual",
      placement: "bottom-start",
      offset: [0, 8],
      onDestroy: () => {
        component.destroy();
      },
    });
  }, [closeBlockMathPopover, closeLinkPopover, editorRef]);

  return {
    closeLinkPopover,
    handleAddLink,
  };
}
