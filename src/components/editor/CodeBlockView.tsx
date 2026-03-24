import { useCallback, useState } from "react";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { SUPPORTED_LANGUAGES } from "./lowlight";
import { MermaidRenderer } from "./MermaidRenderer";
import { ChevronDownIcon, PencilIcon, EyeIcon } from "../icons";

const btnClass = "code-block-toolbar-btn ui-focus-ring text-xs";

export function CodeBlockView({ node, updateAttributes }: ReactNodeViewProps) {
  const language: string = node.attrs.language || "";
  const isMermaid = language === "mermaid";
  const [showSource, setShowSource] = useState(!node.textContent.trim());
  const codeContent = node.textContent;

  const handleLanguageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateAttributes({ language: e.target.value });
    },
    [updateAttributes],
  );

  const toolbar = (
    <div className="code-block-language-selector" contentEditable={false}>
      {isMermaid && (
        <button
          contentEditable={false}
          onClick={() => setShowSource(!showSource)}
          className={btnClass}
          type="button"
        >
          {showSource ? (
            <>
              <EyeIcon className="w-3.5 h-3.5 stroke-[1.7]" />
              Preview
            </>
          ) : (
            <>
              <PencilIcon className="w-3.5 h-3.5 stroke-[1.7]" />
              Edit
            </>
          )}
        </button>
      )}
      <div className="relative flex items-center h-6">
        <select
          value={language}
          onChange={handleLanguageChange}
          className="code-block-language-select ui-focus-ring text-xs"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="w-3.25 h-3.25 stroke-[1.7] absolute right-1.25 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" />
      </div>
    </div>
  );

  if (isMermaid && !showSource) {
    return (
      <NodeViewWrapper className="code-block-wrapper mermaid-wrapper" as="div">
        {toolbar}
        <div
          contentEditable={false}
          className="mermaid-preview my-1 rounded-[var(--ui-radius-lg)] border border-border bg-bg-secondary p-4"
        >
          <MermaidRenderer code={codeContent} />
        </div>
        {/* Hidden but present for TipTap content tracking */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            overflow: "hidden",
            height: 0,
            opacity: 0,
          }}
        >
          <pre>
            {/* @ts-expect-error - "code" is a valid intrinsic element for NodeViewContent */}
            <NodeViewContent as="code" />
          </pre>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="code-block-wrapper" as="div">
      {toolbar}
      <pre>
        {/* @ts-expect-error - "code" is a valid intrinsic element for NodeViewContent */}
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
