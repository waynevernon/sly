import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { tags as t } from "@lezer/highlight";
import { cn } from "../../lib/utils";
import type { TextDirection } from "../../types/note";

export interface MarkdownSourceEditorHandle {
  focus: () => void;
  getLineHeight: () => number;
  getSelectionStart: () => number;
  setSelectionStart: (pos: number) => void;
}

interface MarkdownSourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  wordWrap: boolean;
  syntaxHighlightingEnabled: boolean;
  textDirection: TextDirection;
  className?: string;
}

const externalValueAnnotation = Annotation.define<boolean>();

const sourceHighlightStyle = HighlightStyle.define([
  {
    tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4],
    color: "var(--color-syntax-keyword)",
    fontWeight: "700",
  },
  {
    tag: [t.keyword, t.controlKeyword, t.operatorKeyword],
    color: "var(--color-syntax-keyword)",
  },
  {
    tag: [t.string, t.special(t.string), t.url],
    color: "var(--color-syntax-string)",
  },
  {
    tag: [t.number, t.integer, t.float, t.bool, t.null],
    color: "var(--color-syntax-number)",
  },
  {
    tag: [t.comment, t.quote],
    color: "var(--color-syntax-comment)",
    fontStyle: "italic",
  },
  {
    tag: [t.function(t.variableName), t.labelName],
    color: "var(--color-syntax-function)",
  },
  {
    tag: [t.variableName, t.name],
    color: "var(--color-syntax-variable)",
  },
  {
    tag: [t.typeName, t.className, t.atom],
    color: "var(--color-syntax-type)",
  },
  {
    tag: [t.operator, t.punctuation, t.separator, t.brace, t.paren, t.squareBracket],
    color: "var(--color-syntax-operator)",
  },
  {
    tag: [t.attributeName, t.propertyName],
    color: "var(--color-syntax-attr)",
  },
  {
    tag: t.link,
    color: "var(--color-accent)",
    textDecoration: "underline",
  },
  { tag: t.monospace, color: "var(--color-code)" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
]);

const sourceEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--color-text)",
    height: "auto",
    fontFamily: "var(--font-mono)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  "&.cm-source-nowrap": {
    minWidth: "100%",
    width: "max-content",
  },
  ".cm-scroller": {
    overflow: "visible",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--editor-base-font-size)",
    lineHeight: "var(--editor-line-height)",
    minHeight: "100%",
  },
  ".cm-content": {
    minHeight: "100%",
    caretColor: "var(--color-text)",
    padding: "0",
  },
  "&.cm-source-nowrap .cm-content": {
    minWidth: "100%",
    width: "max-content",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--color-text-muted)",
    marginRight: "1rem",
    paddingRight: "0.25rem",
  },
  "&.cm-source-nowrap .cm-gutters": {
    backgroundColor: "var(--color-bg)",
    position: "sticky",
    left: "0",
    zIndex: "2",
  },
  ".cm-gutter": {
    backgroundColor: "transparent",
  },
  "&.cm-source-nowrap .cm-gutter": {
    backgroundColor: "var(--color-bg)",
  },
  ".cm-gutterElement": {
    padding: "0",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--color-text)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--color-text)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--color-selection)",
  },
});

function clampPosition(pos: number, length: number) {
  return Math.max(0, Math.min(pos, length));
}

function sourceWrapExtensions(wordWrap: boolean) {
  return [
    wordWrap ? EditorView.lineWrapping : [],
    EditorView.editorAttributes.of({
      class: wordWrap ? "cm-source-wrap" : "cm-source-nowrap",
    }),
  ];
}

export const MarkdownSourceEditor = forwardRef<
  MarkdownSourceEditorHandle,
  MarkdownSourceEditorProps
>(function MarkdownSourceEditor(
  {
    value,
    onChange,
    wordWrap,
    syntaxHighlightingEnabled,
    textDirection,
    className,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);
  const initialWordWrapRef = useRef(wordWrap);
  const initialSyntaxHighlightingRef = useRef(syntaxHighlightingEnabled);
  onChangeRef.current = onChange;

  const wrapCompartment = useMemo(() => new Compartment(), []);
  const syntaxCompartment = useMemo(() => new Compartment(), []);

  useImperativeHandle(ref, () => ({
    focus() {
      viewRef.current?.focus();
    },
    getLineHeight() {
      const view = viewRef.current;
      if (!view) return 20;
      return (
        view.defaultLineHeight ||
        Number.parseFloat(getComputedStyle(view.contentDOM).lineHeight) ||
        20
      );
    },
    getSelectionStart() {
      return viewRef.current?.state.selection.main.from ?? 0;
    },
    setSelectionStart(pos: number) {
      const view = viewRef.current;
      if (!view) return;
      const anchor = clampPosition(pos, view.state.doc.length);
      view.dispatch({
        selection: { anchor },
      });
    },
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          sourceEditorTheme,
          lineNumbers(),
          drawSelection(),
          history(),
          EditorState.tabSize.of(2),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown(),
          wrapCompartment.of(sourceWrapExtensions(initialWordWrapRef.current)),
          syntaxCompartment.of(
            initialSyntaxHighlightingRef.current
              ? syntaxHighlighting(sourceHighlightStyle)
              : [],
          ),
          EditorView.contentAttributes.of({
            spellcheck: "false",
            autocorrect: "off",
            autocapitalize: "off",
            translate: "no",
          }),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((tr) =>
                tr.annotation(externalValueAnnotation),
              )
            ) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: host,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [syntaxCompartment, wrapCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue === value) return;

    view.dispatch({
      changes: { from: 0, to: currentValue.length, insert: value },
      annotations: externalValueAnnotation.of(true),
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: wrapCompartment.reconfigure(sourceWrapExtensions(wordWrap)),
    });
  }, [wordWrap, wrapCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: syntaxCompartment.reconfigure(
        syntaxHighlightingEnabled
          ? syntaxHighlighting(sourceHighlightStyle)
          : [],
      ),
    });
  }, [syntaxCompartment, syntaxHighlightingEnabled]);

  return (
    <div
      ref={hostRef}
      className={cn("h-full", className)}
      dir={textDirection}
    />
  );
});
