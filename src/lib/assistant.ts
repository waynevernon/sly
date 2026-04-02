import type { Editor as TiptapEditor } from "@tiptap/react";
import type { AssistantScope } from "../types/assistant";
import {
  extractMarkdownHeadingRanges,
  extractOutlineItems,
  findActiveOutlineFromSelection,
} from "../components/layout/rightPanelOutline";
import { plainTextFromMarkdown } from "./plainText";

export interface AssistantDocumentContext {
  requestedScope: AssistantScope;
  effectiveScope: AssistantScope | "note";
  scopeLabel: string;
  lineLabel: string;
  startLine: number;
  endLine: number;
  snapshotHash: string;
  fullMarkdown: string;
  numberedContent: string;
  notice?: string;
}

export interface AssistantSelectionSnapshot {
  from: number;
  to: number;
}

export function hasMeaningfulAssistantSelection(
  editor: TiptapEditor | null,
  selection?: AssistantSelectionSnapshot | null,
): boolean {
  if (!editor) {
    return false;
  }

  const from = selection?.from ?? editor.state.selection.from;
  const to = selection?.to ?? editor.state.selection.to;
  const empty = selection ? from === to : editor.state.selection.empty;
  if (empty) {
    return false;
  }

  return editor.state.doc.textBetween(from, to, "\n\n", "\n").trim().length > 0;
}

export function getAutoAssistantScope(
  editor: TiptapEditor | null,
  selection?: AssistantSelectionSnapshot | null,
): AssistantScope {
  return hasMeaningfulAssistantSelection(editor, selection) ? "selection" : "note";
}

export function isProposalRangeWithinScope(
  proposalStartLine: number,
  proposalEndLine: number,
  scopeStartLine: number,
  scopeEndLine: number,
): boolean {
  return (
    proposalStartLine >= scopeStartLine &&
    proposalEndLine <= scopeEndLine &&
    proposalEndLine >= proposalStartLine
  );
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function serializeEditorMarkdown(
  editor: TiptapEditor | null,
  fallback: string,
): string {
  if (!editor) {
    return normalizeLineEndings(fallback);
  }

  const manager = editor.storage.markdown?.manager;
  if (manager) {
    return normalizeLineEndings(
      manager.serialize(editor.getJSON()).replace(/&nbsp;|&#160;/g, " "),
    );
  }

  return normalizeLineEndings(editor.getText());
}

function formatLineLabel(startLine: number, endLine: number): string {
  return startLine === endLine
    ? `Line ${startLine}`
    : `Lines ${startLine}-${endLine}`;
}

function formatNumberedLines(lines: string[], startLine: number): string {
  const width = String(startLine + Math.max(lines.length - 1, 0)).length;
  return lines
    .map((line, index) => `${String(startLine + index).padStart(width, " ")} | ${line}`)
    .join("\n");
}

function serializeSelectionMarkdown(editor: TiptapEditor | null): string | null {
  if (!editor) {
    return null;
  }

  const manager = editor.storage?.markdown?.manager;
  const selection = editor.state.selection as {
    content?: () => { content?: { toJSON?: () => unknown } };
  };
  if (!manager || typeof selection.content !== "function") {
    return null;
  }

  const selectionJson = selection.content().content?.toJSON?.();
  if (!Array.isArray(selectionJson) || selectionJson.length === 0) {
    return null;
  }

  const serialized = normalizeLineEndings(
    manager.serialize(selectionJson as never).replace(/&nbsp;|&#160;/g, " "),
  ).trim();
  return serialized || null;
}

function serializeSelectionMarkdownFromRange(
  editor: TiptapEditor | null,
  selection: AssistantSelectionSnapshot | null | undefined,
): string | null {
  if (!editor || !selection || selection.from === selection.to) {
    return null;
  }

  const manager = editor.storage?.markdown?.manager;
  if (!manager) {
    return null;
  }

  const selectionJson = editor.state.doc
    .slice(selection.from, selection.to, true)
    .content.toJSON();
  if (!Array.isArray(selectionJson) || selectionJson.length === 0) {
    return null;
  }

  const serialized = normalizeLineEndings(
    manager.serialize(selectionJson as never).replace(/&nbsp;|&#160;/g, " "),
  ).trim();
  return serialized || null;
}

function findUniqueSubstringRange(
  markdown: string,
  startLine: number,
  endLine: number,
  needle: string,
): { startLine: number; endLine: number } | null {
  if (!needle) {
    return null;
  }

  const lines = markdown.split("\n");
  const area = lines.slice(startLine - 1, endLine).join("\n");
  const matchIndexes: number[] = [];

  let searchFrom = 0;
  while (searchFrom <= area.length) {
    const matchIndex = area.indexOf(needle, searchFrom);
    if (matchIndex === -1) {
      break;
    }
    matchIndexes.push(matchIndex);
    searchFrom = matchIndex + 1;
  }

  if (matchIndexes.length !== 1) {
    return null;
  }

  const prefix = area.slice(0, matchIndexes[0]);
  const matched = area.slice(matchIndexes[0], matchIndexes[0] + needle.length);
  const resolvedStartLine = startLine + prefix.split("\n").length - 1;
  const resolvedEndLine =
    resolvedStartLine + matched.split("\n").length - 1;

  return {
    startLine: resolvedStartLine,
    endLine: resolvedEndLine,
  };
}

function findUniquePlainTextRange(
  lines: string[],
  selectedText: string,
  startLine: number,
  endLine: number,
): { startLine: number; endLine: number } | null {
  const exactMatches: Array<{ startLine: number; endLine: number }> = [];
  const containsMatches: Array<{ startLine: number; endLine: number }> = [];

  for (let start = startLine - 1; start < endLine; start += 1) {
    const maxEnd = Math.min(endLine - 1, start + 80);
    for (let end = start; end <= maxEnd; end += 1) {
      const windowText = normalizeSearchText(
        plainTextFromMarkdown(lines.slice(start, end + 1).join("\n")),
      );
      if (!windowText) {
        continue;
      }
      if (windowText === selectedText) {
        exactMatches.push({
          startLine: start + 1,
          endLine: end + 1,
        });
        break;
      }
      if (windowText.includes(selectedText)) {
        containsMatches.push({
          startLine: start + 1,
          endLine: end + 1,
        });
        break;
      }
    }
  }

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    return null;
  }

  return containsMatches.length === 1 ? containsMatches[0] : null;
}

function resolveSectionRange(
  markdown: string,
  editor: TiptapEditor | null,
  selection?: AssistantSelectionSnapshot | null,
): Omit<AssistantDocumentContext, "requestedScope" | "snapshotHash" | "fullMarkdown" | "numberedContent"> {
  const lines = markdown.split("\n");
  const outlineItems = editor ? extractOutlineItems(editor.state.doc) : [];
  const markdownHeadings = extractMarkdownHeadingRanges(markdown);

  if (!editor || outlineItems.length === 0 || markdownHeadings.length === 0) {
    return {
      effectiveScope: "note",
      scopeLabel: "Whole note",
      lineLabel: formatLineLabel(1, Math.max(lines.length, 1)),
      startLine: 1,
      endLine: Math.max(lines.length, 1),
    };
  }

  const activeOutline = findActiveOutlineFromSelection(
    outlineItems,
    selection?.from ?? editor.state.selection.from,
  );
  const activeIndex = activeOutline
    ? outlineItems.findIndex((item) => item.id === activeOutline.id)
    : -1;
  const activeHeading = activeIndex >= 0 ? markdownHeadings[activeIndex] : null;

  if (!activeHeading) {
    return {
      effectiveScope: "note",
      scopeLabel: "Whole note",
      lineLabel: formatLineLabel(1, Math.max(lines.length, 1)),
      startLine: 1,
      endLine: Math.max(lines.length, 1),
    };
  }

  return {
    effectiveScope: "section",
    scopeLabel: `Section: ${activeHeading.text}`,
    lineLabel: formatLineLabel(activeHeading.startLine, activeHeading.endLine),
    startLine: activeHeading.startLine,
    endLine: activeHeading.endLine,
  };
}

function resolveSelectionRange(
  markdown: string,
  editor: TiptapEditor | null,
  preferredRange?: { startLine: number; endLine: number },
  selection?: AssistantSelectionSnapshot | null,
): { startLine: number; endLine: number } | null {
  if (!editor) {
    return null;
  }

  const from = selection?.from ?? editor.state.selection.from;
  const to = selection?.to ?? editor.state.selection.to;
  if (from === to) {
    return null;
  }

  const selectedText = normalizeSearchText(
    editor.state.doc.textBetween(from, to, "\n\n", "\n"),
  );
  if (!selectedText) {
    return null;
  }

  const lines = markdown.split("\n");
  const selectedMarkdown = selection
    ? serializeSelectionMarkdownFromRange(editor, selection)
    : serializeSelectionMarkdown(editor);
  const searchAreas = [
    preferredRange
      ? {
          startLine: preferredRange.startLine,
          endLine: preferredRange.endLine,
        }
      : null,
    {
      startLine: 1,
      endLine: lines.length,
    },
  ].filter(
    (
      value,
    ): value is {
      startLine: number;
      endLine: number;
    } => value !== null,
  );

  const attemptedAreas = new Set<string>();
  for (const area of searchAreas) {
    const areaKey = `${area.startLine}:${area.endLine}`;
    if (attemptedAreas.has(areaKey)) {
      continue;
    }
    attemptedAreas.add(areaKey);

    if (selectedMarkdown) {
      const exactMarkdownMatch =
        findUniqueSubstringRange(markdown, area.startLine, area.endLine, selectedMarkdown) ??
        findUniqueSubstringRange(
          markdown,
          area.startLine,
          area.endLine,
          selectedMarkdown.trim(),
        );
      if (exactMarkdownMatch) {
        return exactMarkdownMatch;
      }
    }

    const plainTextMatch = findUniquePlainTextRange(
      lines,
      selectedText,
      area.startLine,
      area.endLine,
    );
    if (plainTextMatch) {
      return plainTextMatch;
    }
  }

  return null;
}

export function buildAssistantDocumentContext(
  markdown: string,
  editor: TiptapEditor | null,
  requestedScope: AssistantScope,
  selection?: AssistantSelectionSnapshot | null,
): AssistantDocumentContext {
  const canonicalMarkdown = normalizeLineEndings(markdown);
  const fullLines = canonicalMarkdown.split("\n");
  const snapshotHash = hashText(canonicalMarkdown);
  const sectionContext = resolveSectionRange(canonicalMarkdown, editor, selection);

  let effectiveScope: AssistantDocumentContext["effectiveScope"] = "note";
  let scopeLabel = "Whole note";
  let startLine = 1;
  let endLine = Math.max(fullLines.length, 1);
  let notice: string | undefined;

  if (requestedScope === "selection") {
    const selectionRange = resolveSelectionRange(canonicalMarkdown, editor, {
      startLine: sectionContext.startLine,
      endLine: sectionContext.endLine,
    }, selection);
    if (selectionRange) {
      effectiveScope = "selection";
      scopeLabel = "Selection";
      startLine = selectionRange.startLine;
      endLine = selectionRange.endLine;
    } else {
      effectiveScope = sectionContext.effectiveScope;
      scopeLabel = sectionContext.scopeLabel;
      startLine = sectionContext.startLine;
      endLine = sectionContext.endLine;
      notice =
        "Selection could not be mapped to a unique line range, so Sly sent the current section instead.";
    }
  } else if (requestedScope === "section") {
    effectiveScope = sectionContext.effectiveScope;
    scopeLabel = sectionContext.scopeLabel;
    startLine = sectionContext.startLine;
    endLine = sectionContext.endLine;
  }

  const scopedLines = fullLines.slice(startLine - 1, endLine);
  return {
    requestedScope,
    effectiveScope,
    scopeLabel,
    lineLabel: formatLineLabel(startLine, endLine),
    startLine,
    endLine,
    snapshotHash,
    fullMarkdown: canonicalMarkdown,
    numberedContent: formatNumberedLines(scopedLines, startLine),
    notice,
  };
}

export function applyLineReplacement(
  markdown: string,
  startLine: number,
  endLine: number,
  replacement: string,
): string {
  const normalizedMarkdown = normalizeLineEndings(markdown);
  const lines = normalizedMarkdown.split("\n");
  const replacementLines = normalizeLineEndings(replacement).split("\n");
  lines.splice(startLine - 1, endLine - startLine + 1, ...replacementLines);
  return lines.join("\n");
}
